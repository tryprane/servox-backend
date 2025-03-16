

import { NodeSSH } from 'node-ssh';
import { VPSOrder } from '../models/vps-order.model';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

interface SSHConnectionParams {
  instanceId: string;
  userId: string;
}

interface SSHConnection extends NodeSSH {
  dataStream?: any; // Shell session
  isReused?: boolean; // Flag to indicate if this is a reused connection
  welcomeBannerSent?: boolean; // Flag to track if welcome banner has been sent
  cachedWelcomeMessage?: string; // Cached welcome message to send
}

// Create a connection pool to reuse SSH connections
class SSHConnectionPool {
  private connections = new Map<string, {
    connection: SSHConnection;
    lastActive: number;
    users: Set<string>; // Track users connected to this instance
    welcomeMessage: string; // Store the welcome banner
  }>();
  
  private cleanupInterval: NodeJS.Timeout;
  
  // Hardcoded welcome banner as fallback
  private readonly defaultWelcomeMessage = `
███████ ███████ ██████  ██    ██  ██████  ██   ██ 
██      ██      ██   ██ ██    ██ ██    ██  ██ ██  
███████ █████   ██████  ██    ██ ██    ██   ███   
     ██ ██      ██   ██  ██  ██  ██    ██  ██ ██  
███████ ███████ ██   ██   ████    ██████  ██   ██ 
                        
Welcome to your Servox VPS

root@servox-vps:~# `;
  
  constructor() {
    // Cleanup inactive connections every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
  
  async getConnection(instanceId: string, userId: string, 
    onData?: (data: Buffer) => void): Promise<SSHConnection> {
    
    const connectionKey = instanceId;
    const now = Date.now();
    
    // Check if we already have an active connection to this instance
    if (this.connections.has(connectionKey)) {
      const connectionInfo = this.connections.get(connectionKey)!;
      
      // Update the last active timestamp
      connectionInfo.lastActive = now;
      connectionInfo.users.add(userId);
      
      // Mark this connection as reused
      connectionInfo.connection.isReused = true;
      connectionInfo.connection.welcomeBannerSent = false; // Reset the flag for this client
      
      // If we have a data handler, attach it to the existing connection
      if (onData && connectionInfo.connection.dataStream) {
        connectionInfo.connection.dataStream.on('data', onData);
        
        // Store the welcome message to be sent later by the SSH service
        const welcomeMessage = connectionInfo.welcomeMessage || this.defaultWelcomeMessage;
        connectionInfo.connection.cachedWelcomeMessage = welcomeMessage;
      }
      
      logger.info(`Reusing SSH connection for instance ${instanceId}`);
      return connectionInfo.connection;
    }
    
    // We don't have an active connection, so create a new one
    // This will be implemented below in the SSHService class
    return null as any; // This will be replaced
  }
  
  addConnection(instanceId: string, userId: string, connection: SSHConnection, welcomeMessage: string = ''): void {
    const connectionKey = instanceId;
    
    this.connections.set(connectionKey, {
      connection,
      lastActive: Date.now(),
      users: new Set([userId]),
      welcomeMessage
    });
    
    logger.info(`Added SSH connection to pool for instance ${instanceId}`);
  }
  
  removeUser(instanceId: string, userId: string): void {
    const connectionKey = instanceId;
    const connectionInfo = this.connections.get(connectionKey);
    
    if (connectionInfo) {
      // Remove this user from the users set
      connectionInfo.users.delete(userId);
      
      // If no more users are connected, close the connection after a delay
      // This gives time for the user to reconnect if they're just refreshing
      if (connectionInfo.users.size === 0) {
        setTimeout(() => {
          // Check again if no users are connected
          if (this.connections.has(connectionKey) && 
              this.connections.get(connectionKey)!.users.size === 0) {
            
            logger.info(`Closing unused SSH connection for instance ${instanceId}`);
            try {
              connectionInfo.connection.dispose(); // node-ssh uses dispose() instead of end()
            } catch (error) {
              logger.error(`Error closing SSH connection: ${error}`);
            }
            
            this.connections.delete(connectionKey);
          }
        }, 30000); // 30 seconds delay
      }
    }
  }
  
  cleanup(): void {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [key, info] of this.connections.entries()) {
      // If the connection has been inactive for 30 minutes and has no users, close it
      if (now - info.lastActive > inactiveThreshold && info.users.size === 0) {
        logger.info(`Closing inactive SSH connection for instance ${key}`);
        try {
          info.connection.dispose(); // node-ssh uses dispose() instead of end()
        } catch (error) {
          logger.error(`Error closing SSH connection: ${error}`);
        }
        
        this.connections.delete(key);
      }
    }
  }
  
  shutdown(): void {
    clearInterval(this.cleanupInterval);
    
    // Close all active connections
    for (const [key, info] of this.connections.entries()) {
      logger.info(`Closing SSH connection for instance ${key} during shutdown`);
      try {
        info.connection.dispose(); // node-ssh uses dispose() instead of end()
      } catch (error) {
        logger.error(`Error closing SSH connection: ${error}`);
      }
    }
    
    this.connections.clear();
  }
}

export class SSHService {
  private static connectionPool = new SSHConnectionPool();
  private static dataHandlers = new Map<string, Set<(data: Buffer) => void>>();
  private static eventEmitter = new EventEmitter();
  private static welcomeMessages = new Map<string, string>(); // Store welcome messages per instance
  
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
      
      // Try to get an existing connection from the pool
      let conn = await this.connectionPool.getConnection(instanceId, userId);
      
      if (conn) {
        // We have an existing connection
        // Register this client's data handler
        if (!this.dataHandlers.has(instanceId)) {
          this.dataHandlers.set(instanceId, new Set());
        }
        this.dataHandlers.get(instanceId)!.add(onData);
        
        // Setup cleanup when this client disconnects
        this.eventEmitter.once(`disconnect:${clientId}`, () => {
          if (this.dataHandlers.has(instanceId)) {
            this.dataHandlers.get(instanceId)!.delete(onData);
          }
          this.connectionPool.removeUser(instanceId, userId);
        });
        
        return conn;
      }
      
      // No existing connection, create a new one
      // Find VPS instance details
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
      
      // Add the connection to the pool
      this.connectionPool.addConnection(
        instanceId, 
        userId, 
        ssh, 
        this.welcomeMessages.get(instanceId) || ''
      );
      
      // Initialize the data handlers set for this instance
      if (!this.dataHandlers.has(instanceId)) {
        this.dataHandlers.set(instanceId, new Set());
      }
      this.dataHandlers.get(instanceId)!.add(onData);
      
      // Start a shell session
      const shellStream = await ssh.requestShell();
      ssh.dataStream = shellStream;
            
      // Forward data from SSH to all connected clients
      shellStream.on('data', (data: Buffer) => {
        // Capture the welcome message for reuse
        // We'll capture approximately the first 1500 bytes as the welcome message
        // This should be enough for most server welcome banners
        if (!this.welcomeMessages.has(instanceId)) {
          this.welcomeMessages.set(instanceId, data.toString());
        } else if (this.welcomeMessages.get(instanceId)!.length < 1500) {
          const currentMessage = this.welcomeMessages.get(instanceId)!;
          this.welcomeMessages.set(instanceId, currentMessage + data.toString());
        }
        
        if (this.dataHandlers.has(instanceId)) {
          for (const handler of this.dataHandlers.get(instanceId)!) {
            try {
              handler(data);
            } catch (error) {
              logger.error(`Error in data handler: ${error}`);
            }
          }
        }
      });
      
      shellStream.on('close', () => {
        logger.info(`SSH shell closed for instance ${instanceId}`);
        
        // Clean up all handlers
        this.dataHandlers.delete(instanceId);
        
        // Dispose the connection
        ssh.dispose();
      });
      
      shellStream.on('error', (err: Error) => {
        logger.error(`SSH stream error for instance ${instanceId}:`, err);
        
        // Notify all clients of the error
        if (this.dataHandlers.has(instanceId)) {
          for (const handler of this.dataHandlers.get(instanceId)!) {
            try {
              onError(err);
            } catch (error) {
              logger.error(`Error in error handler: ${error}`);
            }
          }
        }
      });
      
      // Handle SSH client errors
      ssh.connection?.on('error', (err: Error) => {
        logger.error(`SSH connection error for instance ${instanceId}:`, err);
        
        // Notify all clients of the error
        if (this.dataHandlers.has(instanceId)) {
          for (const handler of this.dataHandlers.get(instanceId)!) {
            try {
              onError(err);
            } catch (error) {
              logger.error(`Error in error handler: ${error}`);
            }
          }
        }
        
        // Remove the connection from the pool
        this.connectionPool.removeUser(instanceId, userId);
      });
      
      // Handle SSH client close
      ssh.connection?.on('end', () => {
        logger.info(`SSH connection ended for instance ${instanceId}`);
        
        // Notify all clients of the end
        if (this.dataHandlers.has(instanceId)) {
          for (const handler of this.dataHandlers.get(instanceId)!) {
            try {
              onEnd();
            } catch (error) {
              logger.error(`Error in end handler: ${error}`);
            }
          }
        }
        
        // Clean up all handlers
        this.dataHandlers.delete(instanceId);
      });
      
      // Setup cleanup when this client disconnects
      this.eventEmitter.once(`disconnect:${clientId}`, () => {
        if (this.dataHandlers.has(instanceId)) {
          this.dataHandlers.get(instanceId)!.delete(onData);
        }
        this.connectionPool.removeUser(instanceId, userId);
      });
      
      return ssh;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to connect to instance ${instanceId}: ${errorMessage}`);
      throw error;
    }
  }
  
  static async sendData(instanceId: string, data: string): Promise<boolean> {
    // Find the connection in the pool
    try {
      const conn = await this.connectionPool.getConnection(instanceId, '');
      
      if (!conn || !conn.dataStream) {
        return false;
      }
      
      conn.dataStream.write(data);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error sending data to instance ${instanceId}: ${errorMessage}`);
      return false;
    }
  }
  
  static async resizeTerminal(instanceId: string, cols: number, rows: number): Promise<boolean> {
    // Find the connection in the pool
    try {
      const conn = await this.connectionPool.getConnection(instanceId, '');
      
      if (!conn || !conn.dataStream) {
        return false;
      }
      
      // node-ssh uses a different approach to resize terminals
      // This depends on the PTY support in node-ssh
      if (conn.dataStream.setWindow) {
        conn.dataStream.setWindow(rows, cols, 0, 0);
        return true;
      } else {
        // Alternative approach - send SIGWINCH signal or use pty.js setSize
        logger.warn(`Terminal resize not fully supported for instance ${instanceId}`);
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error resizing terminal for instance ${instanceId}: ${errorMessage}`);
      return false;
    }
  }
  
  static disconnectClient(userId: string, instanceId: string): void {
    // Generate the client ID
    const clientId = `${userId}:${instanceId}:${Date.now()}`;
    
    // Emit the disconnect event
    this.eventEmitter.emit(`disconnect:${clientId}`);
  }
  
  // This is called during server shutdown
  static shutdown(): void {
    this.connectionPool.shutdown();
  }
}