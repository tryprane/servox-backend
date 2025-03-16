

// src/services/ssh-terminal-service.ts
import { NodeSSH } from 'node-ssh';
import { VPSOrder } from '../../models/vps-order.model';
import jwt from 'jsonwebtoken';
import { logger } from '../../utils/logger';
import { connectionPool, SSHConnection } from './ssh-connection-pool';

// Interface for SSH connection params stored in auth tokens
interface SSHConnectionParams {
  instanceId: string;
  userId: string;
}

/**
 * SSH Terminal Service
 * Manages SSH terminal connections for interactive access to VPS instances
 */
export class SSHTerminalService {
  // Store connections that are being used for terminal access
  private static activeTerminalConnections = new Map<string, SSHConnection>();
  
  /**
   * Create an authentication token for SSH terminal access
   * @param userId The user ID
   * @param instanceId The instance ID
   */
  static async createAuthToken(userId: string, instanceId: string): Promise<string> {
    // Verify that the user owns this instance
    const order = await VPSOrder.findOne({
      orderId: instanceId,
      userId,
      status: 'deployed'
    });
    
    if (!order) {
      throw new Error('Instance not found or not deployed');
    }
    
    // Create a short-lived token (expires in 1 hour)
    const token = jwt.sign(
      { userId, instanceId } as SSHConnectionParams,
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '1h' }
    );
    
    return token;
  }
  
  /**
   * Verify an authentication token
   * @param token The authentication token
   */
  static async verifyAuthToken(token: string): Promise<SSHConnectionParams> {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fallback-secret'
      ) as SSHConnectionParams;
      
      return decoded;
    } catch (error) {
      logger.error('SSH auth token verification failed:', error);
      throw new Error('Invalid or expired token');
    }
  }
  
  /**
   * Connect to a server via SSH for terminal access
   * @param instanceId The instance ID
   * @param userId The user ID
   * @param onData Data callback function
   * @param onError Error callback function
   * @param onEnd End callback function
   */
  static async connectToInstance(
    instanceId: string,
    userId: string,
    onData: (data: Buffer) => void,
    onError: (error: Error) => void,
    onEnd: () => void
  ): Promise<SSHConnection> {
    try {
      // Generate a unique client ID for this connection
      const clientId = `${userId}:${instanceId}:${Date.now()}`;
      const eventEmitter = connectionPool.getEventEmitter();
      
      // First get the server details
      const order = await VPSOrder.findOne({
        orderId: instanceId,
        userId,
        status: 'deployed'
      }).select('+deployment.adminPassword'); // Include the password field
      
      if (!order || !order.deployment) {
        throw new Error('Instance not found or not deployed');
      }
      
      const { hostname, ipAddress, adminPassword } = order.deployment;
      
      if (!ipAddress || !adminPassword) {
        throw new Error('Instance connection details incomplete');
      }
      
      // Check if we already have an active terminal connection for this instance
      if (this.activeTerminalConnections.has(instanceId)) {
        const conn = this.activeTerminalConnections.get(instanceId)!;

        conn.isReused = true;
        
        // Make sure the connection is still valid and has a data stream
        if (conn.dataStream) {
          logger.info(`Reusing active terminal connection for instance ${instanceId}`);
          
          // Add the data handler for this client
          connectionPool.addDataHandler(instanceId, onData);
          
          // Setup cleanup when this client disconnects
          eventEmitter.once(`disconnect:${clientId}`, () => {
            connectionPool.removeDataHandler(instanceId, onData);
            connectionPool.removeUser(instanceId, userId);
          });
          
          // Send a refresh signal to ensure terminal is ready
          setTimeout(() => {
            try {
              if (conn.dataStream) {
                onData(Buffer.from("\r\n")); // Send a newline to refresh the terminal display
              }
            } catch (error) {
              logger.error(`Error sending initial refresh: ${error}`);
            }
          }, 200);
          
          return conn;
        } else {
          // If the data stream is no longer available, remove this connection from active terminals
          this.activeTerminalConnections.delete(instanceId);
        }
      }
      
      // Try to get an existing connection from the pool
      let conn = await connectionPool.getTerminalConnection(instanceId, userId, onData);
      
      // Check if we have a connection but it has no data stream (likely a metrics connection)
      if (conn && !conn.dataStream) {
        logger.info(`Found connection for ${instanceId} without data stream, upgrading to terminal`);
        
        try {
          // Setup a shell session for the existing connection
          const shellStream = await conn.requestShell();
          conn.dataStream = shellStream;
          
          // Update connection type
          conn.connectionType = 'both';
          
          // Register the data handler
          connectionPool.addDataHandler(instanceId, onData);
          
          // Set up shell stream events - this is critical to fixing the issue
          shellStream.on('data', (data: Buffer) => {
            // Try to directly send to our specific handler first for responsiveness
            try {
              onData(data);
            } catch (error) {
              logger.error(`Error in direct data handler: ${error}`);
            }
            
            // Also send to other registered handlers (if any)
            const handlers = connectionPool.getDataHandlers(instanceId);
            if (handlers) {
              for (const handler of handlers) {
                // Skip if it's the same handler we already called
                if (handler !== onData) {
                  try {
                    handler(data);
                  } catch (error) {
                    logger.error(`Error in data handler: ${error}`);
                  }
                }
              }
            }
          });
          
          shellStream.on('close', () => {
            logger.info(`SSH shell closed for instance ${instanceId}`);
            // Remove from active terminal connections
            this.activeTerminalConnections.delete(instanceId);
          });
          
          shellStream.on('error', (err: Error) => {
            logger.error(`SSH stream error for instance ${instanceId}:`, err);
            onError(err);
          });
          
          // Add to active terminal connections
          this.activeTerminalConnections.set(instanceId, conn);
          
          // Send initial newline to ensure terminal initializes properly
          setTimeout(() => {
            try {
              if (conn!.dataStream) {
                onData(Buffer.from("\r\n")); // Send a newline to refresh the terminal display
              }
            } catch (error) {
              logger.error(`Error sending initial refresh: ${error}`);
            }
          }, 200);
          
          logger.info(`Successfully upgraded metrics connection to terminal for ${instanceId}`);
        } catch (error) {
          logger.error(`Failed to upgrade metrics connection to terminal: ${error}`);
          // If we failed to upgrade, treat as if there's no connection
          conn = null;
        }
      } else if (conn && conn.dataStream) {
        // If we already have a valid terminal connection, add it to active terminals
        this.activeTerminalConnections.set(instanceId, conn);
        
        // Send a refresh signal to ensure terminal is ready
        setTimeout(() => {
          try {
            if (conn!.dataStream) {
              onData(Buffer.from("\r\n")); // Send a newline to refresh the terminal display
            }
          } catch (error) {
            logger.error(`Error sending initial refresh: ${error}`);
          }
        }, 200);
      }
      
      // If we have a valid terminal connection at this point, use it
      if (conn && conn.dataStream) {
        // If we have a reused connection, send the cached welcome message
        if (conn.isReused && !conn.welcomeBannerSent && conn.cachedWelcomeMessage) {
          setTimeout(() => {
            try {
              onData(Buffer.from(conn!.cachedWelcomeMessage || ''));
              conn!.welcomeBannerSent = true;
            } catch (error) {
              logger.error(`Error sending welcome banner: ${error}`);
            }
          }, 500); // Wait a short time to ensure client is ready
        }
        
        // Setup cleanup when this client disconnects
        eventEmitter.once(`disconnect:${clientId}`, () => {
          connectionPool.removeDataHandler(instanceId, onData);
          connectionPool.removeUser(instanceId, userId);
        });
        
        return conn;
      }
      
      // If we get here, we need to create a new connection
      logger.info(`Creating new SSH connection for instance ${instanceId}`);
      
      // Create a new SSH connection
      const ssh = new NodeSSH() as SSHConnection;
      
      // Connect to the server using node-ssh
      await ssh.connect({
        host: ipAddress,
        port: 22,
        username: 'root', // Or another default username based on your OS template
        password: adminPassword,
        keepaliveInterval: 10000, // 10 seconds
        readyTimeout: 30000, // 30 seconds
      });

      logger.info(`SSH connection established for instance ${instanceId}`);
      
      // Mark as not reused since we just created it
      ssh.isReused = false;
      
      // Initialize the data handler
      connectionPool.addDataHandler(instanceId, onData);
      
      // Start a shell session
      const shellStream = await ssh.requestShell();
      ssh.dataStream = shellStream;
      
      // Add the connection to the pool and active terminals
      connectionPool.addConnection({
        instanceId,
        userId,
        ipAddress,
        password: adminPassword,
        connection: ssh,
        connectionType: 'terminal',
      });
      
      // Add to active terminal connections
      this.activeTerminalConnections.set(instanceId, ssh);
      
      // Forward data from SSH directly to our handler first, then to others
      shellStream.on('data', (data: Buffer) => {
        // Try to directly send to our specific handler first for responsiveness
        try {
          onData(data);
        } catch (error) {
          logger.error(`Error in direct data handler: ${error}`);
        }
        
        // Also send to other registered handlers (if any)
        const handlers = connectionPool.getDataHandlers(instanceId);
        if (handlers) {
          for (const handler of handlers) {
            // Skip if it's the same handler we already called
            if (handler !== onData) {
              try {
                handler(data);
              } catch (error) {
                logger.error(`Error in pooled data handler: ${error}`);
              }
            }
          }
        }
      });
      
      shellStream.on('close', () => {
        logger.info(`SSH shell closed for instance ${instanceId}`);
        // Remove from active terminal connections
        this.activeTerminalConnections.delete(instanceId);
        // Only dispose if it's not being used for metrics
        if (ssh.connectionType === 'terminal') {
          ssh.dispose();
        }
      });
      
      shellStream.on('error', (err: Error) => {
        logger.error(`SSH stream error for instance ${instanceId}:`, err);
        onError(err);
      });
      
      // Handle SSH client errors
      ssh.connection?.on('error', (err: Error) => {
        logger.error(`SSH connection error for instance ${instanceId}:`, err);
        onError(err);
      });
      
      // Handle SSH client close
      ssh.connection?.on('end', () => {
        logger.info(`SSH connection ended for instance ${instanceId}`);
        
        // Remove from active terminal connections
        this.activeTerminalConnections.delete(instanceId);
        
        // Notify the client
        onEnd();
      });
      
      // Setup cleanup when this client disconnects
      eventEmitter.once(`disconnect:${clientId}`, () => {
        connectionPool.removeDataHandler(instanceId, onData);
        connectionPool.removeUser(instanceId, userId);
      });
      
      return ssh;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to connect to instance ${instanceId}: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Send data to an SSH terminal
   * @param instanceId The instance ID
   * @param data The data to send
   */
  static async sendData(instanceId: string, data: string): Promise<boolean> {
    try {
      // First check if we have an active terminal connection
      if (this.activeTerminalConnections.has(instanceId)) {
        const conn = this.activeTerminalConnections.get(instanceId)!;
        
        if (conn.dataStream) {
          // Use the direct connection for better performance and reliability
          conn.dataStream.write(data);
          return true;
        } else {
          // If the data stream is no longer available, remove from active terminals
          this.activeTerminalConnections.delete(instanceId);
        }
      }
      
      // Fallback to getting the connection from the pool
      const conn = await connectionPool.getTerminalConnection(instanceId);
      
      if (!conn) {
        logger.warn(`No connection found for instance ${instanceId} when sending data`);
        return false;
      }
      
      // If we have a connection but no data stream, try to set up a shell session
      if (!conn.dataStream) {
        logger.warn(`No data stream available for instance ${instanceId}`);
        return false;
      }
      
      // Send the data
      logger.debug(`Sending data to instance ${instanceId}: ${data.length} bytes`);
      conn.dataStream.write(data);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error sending data to instance ${instanceId}: ${errorMessage}`);
      return false;
    }
  }
  
  /**
   * Resize an SSH terminal
   * @param instanceId The instance ID
   * @param cols Number of columns
   * @param rows Number of rows
   */
  static async resizeTerminal(instanceId: string, cols: number, rows: number): Promise<boolean> {
    try {
      // First check if we have an active terminal connection
      if (this.activeTerminalConnections.has(instanceId)) {
        const conn = this.activeTerminalConnections.get(instanceId)!;
        
        if (conn.dataStream && conn.dataStream.setWindow) {
          // Use the direct connection for better performance
          conn.dataStream.setWindow(rows, cols, 0, 0);
          return true;
        }
      }
      
      // Fallback to getting the connection from the pool
      const conn = await connectionPool.getTerminalConnection(instanceId);
      
      if (!conn) {
        logger.warn(`No connection found for instance ${instanceId} when resizing terminal`);
        return false;
      }
      
      // If we have a connection but no data stream, cannot resize
      if (!conn.dataStream) {
        logger.warn(`No data stream found for instance ${instanceId} when resizing terminal`);
        return false;
      }
      
      // Resize the terminal
      if (conn.dataStream.setWindow) {
        conn.dataStream.setWindow(rows, cols, 0, 0);
        return true;
      } else {
        // Alternative approach using SIGWINCH signal
        logger.warn(`Terminal resize not fully supported for instance ${instanceId}`);
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error resizing terminal for instance ${instanceId}: ${errorMessage}`);
      return false;
    }
  }
  
  /**
   * Disconnect a client from an SSH terminal
   * @param userId The user ID
   * @param instanceId The instance ID
   */
  static disconnectClient(userId: string, instanceId: string): void {
    // Generate the client ID
    const clientId = `${userId}:${instanceId}:${Date.now()}`;
    
    // Emit the disconnect event
    connectionPool.getEventEmitter().emit(`disconnect:${clientId}`);
  }
  
  /**
   * Get debug information about terminal connections
   */
  static getDebugInfo(): {
    activeTerminals: string[];
    connectionPoolStatus: any;
  } {
    return {
      activeTerminals: Array.from(this.activeTerminalConnections.keys()),
      connectionPoolStatus: connectionPool.dumpConnectionStatus()
    };
  }
}