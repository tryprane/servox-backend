

import { Request, Response } from 'express';
import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { SSHService } from '../services/terminal.service';
import {SSHTerminalService} from '../services/ssh/ssh-terminal-service'
import { logger } from '../utils/logger';

interface WebSocketMessage {
  type: string;
  token?: string;
  content?: string;
  cols?: number;
  rows?: number;
}

interface UserWithId {
  id: string;
  [key: string]: any;
}

export class TerminalController {
  // Track active connections per user/instance
  private static activeConnections = new Map<string, Set<WebSocket>>();

  // HTTP route to create authentication token for terminal access
  static async createTerminalAuthToken(req: Request, res: Response): Promise<void> {
    try {
      const { instanceId } = req.body as { instanceId: string };
      
      if (!instanceId) {
        res.status(400).json({ 
          success: false, 
          message: 'Instance ID is required' 
        });
        return;
      }
      
      // The user will be available on req.user due to the 'protect' middleware
      if (!req.user || !(req.user as UserWithId).id) {
        res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        });
        return;
      }
      
      // Generate terminal-specific token
      const terminalToken = await SSHTerminalService.createAuthToken(
        (req.user as UserWithId).id, 
        instanceId
      );
      
      res.status(200).json({ 
        success: true, 
        token: terminalToken
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error generating terminal auth token: ${errorMessage}`);
      
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate authentication token'
      });
    }
  }

  // Handle WebSocket connections for terminal access
  static async handleWebSocketConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    // Get a unique connection identifier for logging
    const connectionId = `${req.socket.remoteAddress}:${Date.now()}`;
    logger.info(`New WebSocket connection request ${connectionId} for terminal`);
    
    let authenticatedUserId: string | null = null;
    let connectedInstanceId: string | null = null;
    let connectionKey: string | null = null;
    let isConnectionRegistered = false;
    
    // Function to send a message to the client
    const sendMessage = (type: string, data: any = {}) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type,
          ...data
        }));
      }
    };
    
    // Handle messages from the client
    ws.on('message', async (message: WebSocket.Data) => {
      try {
        // Parse the incoming message
        const data = JSON.parse(message.toString()) as WebSocketMessage;
        
        if (data.type === 'auth' && data.token) {
          // Verify the auth token
          try {
            const { userId, instanceId } = await SSHTerminalService.verifyAuthToken(data.token);
            
            authenticatedUserId = userId;
            connectedInstanceId = instanceId;
            connectionKey = `${userId}:${instanceId}`;
            
            // Check for existing connections for this user/instance
            if (this.activeConnections.has(connectionKey)) {
              const existingConnections = this.activeConnections.get(connectionKey)!;
              
              logger.info(`User ${userId} already has ${existingConnections.size} connections to instance ${instanceId}`);
              
              // Limit connections per user/instance (adjustable limit)
              if (existingConnections.size >= 3) {
                logger.warn(`Too many connections for ${connectionKey}, limiting to 3`);
                sendMessage('error', { message: 'Too many active connections for this instance' });
                ws.close();
                return;
              }
              
              // Register this connection
              existingConnections.add(ws);
            } else {
              // Create a new entry for this user/instance pair
              this.activeConnections.set(connectionKey, new Set([ws]));
            }
            
            isConnectionRegistered = true;
            logger.info(`Connection ${connectionId} authenticated for user ${userId}, instance ${instanceId}`);
            
            // Send successful auth response immediately after verification
            sendMessage('auth_success');
            
            // Establish SSH connection - will reuse existing one if available
            const sshConnection = await SSHTerminalService.connectToInstance(
              instanceId,
              userId,
              // On data received from SSH
              (sshData) => {
                sendMessage('data', { content: sshData.toString() });
              },
              // On SSH error
              (error) => {
                sendMessage('error', { message: error.message });
                ws.close();
              },
              // On SSH end
              () => {
                sendMessage('disconnected', { message: 'SSH connection closed' });
                ws.close();
              }
            );
            
            // Determine if this is a reused connection
            const isReused = sshConnection?.isReused || false;
            
            // Send VPS connection success message with reuse status
            sendMessage('vps_connected', { isReused });
            
            // For reused connections, explicitly generate and send a welcome banner
            if (isReused) {
              // Give the terminal a moment to be ready
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  // Generate a fresh welcome banner with current timestamp
                  const welcomeBanner = 
`

███████ ███████ ██████  ██    ██  ██████  ██   ██ 
██      ██      ██   ██ ██    ██ ██    ██  ██ ██  
███████ █████   ██████  ██    ██ ██    ██   ███   
     ██ ██      ██   ██  ██  ██  ██    ██  ██ ██  
███████ ███████ ██   ██   ████    ██████  ██   ██ 
                        
Welcome to your Servox VPS`;
                  
                  // Send the welcome banner as a series of lines
                  const lines = welcomeBanner.split('\n');
                  for (const line of lines) {
                    sendMessage('data', { content: line + '\r\n' });
                  }
                  sendMessage('data', { content: 'root@servox-vps:~# ' });
                }
              }, 1000); // Longer delay to ensure terminal is fully ready
            }
            
            logger.info(`SSH connection ${isReused ? 'reused' : 'established'} for instance ${instanceId}`);
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`SSH authentication failed: ${errorMessage}`);
            sendMessage('auth_failed', { 
              message: error instanceof Error ? error.message : 'Authentication failed' 
            });
            ws.close();
          }
        } else if (data.type === 'data' && data.content && authenticatedUserId && connectedInstanceId) {
          // Send data to SSH connection
          await SSHTerminalService.sendData(connectedInstanceId, data.content);
        } else if (data.type === 'resize' && authenticatedUserId && connectedInstanceId) {
          // Resize the terminal
          await SSHTerminalService.resizeTerminal(
            connectedInstanceId, 
            data.cols || 80, 
            data.rows || 24
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error processing WebSocket message: ${errorMessage}`);
        sendMessage('error', { message: 'Failed to process message' });
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      logger.info(`Terminal WebSocket ${connectionId} disconnected`);
      
      // Cleanup connection tracking
      if (connectionKey && isConnectionRegistered) {
        const connections = this.activeConnections.get(connectionKey);
        if (connections) {
          connections.delete(ws);
          logger.info(`Removed connection ${connectionId} from tracking. Remaining: ${connections.size}`);
          
          // Clean up the entry if no more connections for this user/instance
          if (connections.size === 0) {
            this.activeConnections.delete(connectionKey);
            logger.info(`No more connections for ${connectionKey}, removed from tracking`);
          }
        }
      }
      
      if (connectedInstanceId && authenticatedUserId) {
        // Notify the service that this client has disconnected
        SSHTerminalService.disconnectClient(authenticatedUserId, connectedInstanceId);
      }
    });
    
    // Handle WebSocket errors
    ws.on('error', (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Terminal WebSocket ${connectionId} error: ${errorMessage}`);
    });
  }
}