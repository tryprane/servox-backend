

// src/services/ssh-connection-pool.ts
// src/services/ssh-connection-pool.ts
import { NodeSSH } from 'node-ssh';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

// Extend NodeSSH with additional properties needed for our use case
export interface SSHConnection extends NodeSSH {
  dataStream?: any; // Shell session
  isReused?: boolean; // Flag to indicate if this is a reused connection
  welcomeBannerSent?: boolean; // Flag to track if welcome banner has been sent
  cachedWelcomeMessage?: string; // Cached welcome message to send
  lastUsed?: number; // Timestamp of last usage
  connectionType?: 'terminal' | 'metrics' | 'both'; // What the connection is being used for
  ipAddress?: string; // Store the IP address for reference
  password?: string; // Store the password for reference
  lastDataHandler?: (data: Buffer) => void; // Track the most recent data handler
}

// Connection metadata
interface ConnectionInfo {
  connection: SSHConnection;
  lastActive: number;
  users: Set<string>; // Track users connected to this instance
  welcomeMessage: string; // Store the welcome banner
  ipAddress: string; // IP address for this connection
  password: string; // Password for this connection
}

/**
 * Singleton SSH Connection Pool
 * Manages SSH connections for both terminal access and metrics collection
 */
class SSHConnectionPoolManager {
  // Store all connections by instanceId
  private connections = new Map<string, ConnectionInfo>();
  
  // Map from IP:password to instanceId for quick lookups
  private ipToInstanceMap = new Map<string, string>();
  
  // Store data handlers for terminal connections
  private dataHandlers = new Map<string, Set<(data: Buffer) => void>>();
  
  // Event emitter for disconnection events
  private eventEmitter = new EventEmitter();
  
  // Store metrics fetch promises to avoid duplicate requests
  private pendingMetricsFetches = new Map<string, Promise<any>>();
  
  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout;
  
  // Default welcome message as fallback
  private readonly defaultWelcomeMessage = `
                                                                    
...
 `;

  constructor() {
    // Cleanup inactive connections every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    
    // Set up a higher limit for event listeners to prevent memory leak warnings
    this.eventEmitter.setMaxListeners(100);
  }

  /**
   * Get the event emitter instance
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
  
  /**
   * Get a terminal connection from the pool
   * @param instanceId The instance ID
   * @param userId The user ID (can be empty for non-user operations)
   * @param onData Optional data callback for terminal connections
   */
  async getTerminalConnection(
    instanceId: string, 
    userId: string = '', 
    onData?: (data: Buffer) => void
  ): Promise<SSHConnection | null> {
    const now = Date.now();
    
    // Check if we already have an active connection to this instance
    if (this.connections.has(instanceId)) {
      const connectionInfo = this.connections.get(instanceId)!;
      
      // Update the last active timestamp
      connectionInfo.lastActive = now;
      connectionInfo.connection.lastUsed = now;
      
      // Add this user to the connection if provided
      if (userId) {
        connectionInfo.users.add(userId);
      }
      
      // Update connection type if it's metrics-only
      if (connectionInfo.connection.connectionType === 'metrics') {
        connectionInfo.connection.connectionType = 'both';
      } else {
        connectionInfo.connection.connectionType = 'terminal';
      }
      
      // Mark this connection as reused
      connectionInfo.connection.isReused = true;
      connectionInfo.connection.welcomeBannerSent = false; // Reset the flag for this client
      
      // Store the most recent data handler for direct access
      if (onData) {
        connectionInfo.connection.lastDataHandler = onData;
      }
      
      // If we have a data handler, attach it to the existing connection
      if (onData && connectionInfo.connection.dataStream) {
        // Add the data handler to the handlers list
        if (this.dataHandlers.has(instanceId)) {
          this.dataHandlers.get(instanceId)!.add(onData);
        } else {
          this.dataHandlers.set(instanceId, new Set([onData]));
        }
        
        // Store the welcome message to be sent later by the SSH service
        const welcomeMessage = connectionInfo.welcomeMessage || this.defaultWelcomeMessage;
        connectionInfo.connection.cachedWelcomeMessage = welcomeMessage;
      }
      
      logger.info(`Reusing SSH connection for instance ${instanceId} for terminal access`);
      return connectionInfo.connection;
    }
    
    // No existing connection
    return null;
  }
  
  /**
   * Get a connection for metrics collection
   * @param ip Server IP address
   * @param password Server password
   * @param instanceId Optional instance ID if known
   */
  async getMetricsConnection(
    ip: string, 
    password: string, 
    instanceId?: string
  ): Promise<SSHConnection | null> {
    const now = Date.now();
    const ipKey = `${ip}:${password}`;
    
    // If we know the instanceId, use it directly
    if (instanceId && this.connections.has(instanceId)) {
      const connectionInfo = this.connections.get(instanceId)!;
      
      // Update timestamps
      connectionInfo.lastActive = now;
      connectionInfo.connection.lastUsed = now;
      
      // Update connection type only if it's not already a 'both' type
      if (connectionInfo.connection.connectionType === 'terminal') {
        connectionInfo.connection.connectionType = 'both';
      } else {
        connectionInfo.connection.connectionType = 'metrics';
      }
      
      logger.debug(`Reusing SSH connection for instance ${instanceId} for metrics collection`);
      return connectionInfo.connection;
    }
    
    // Look up the instance ID from the IP
    if (!instanceId && this.ipToInstanceMap.has(ipKey)) {
      const mappedInstanceId = this.ipToInstanceMap.get(ipKey)!;
      if (this.connections.has(mappedInstanceId)) {
        const connectionInfo = this.connections.get(mappedInstanceId)!;
        
        // Update timestamps
        connectionInfo.lastActive = now;
        connectionInfo.connection.lastUsed = now;
        
        // Update connection type if needed
        if (connectionInfo.connection.connectionType === 'terminal') {
          connectionInfo.connection.connectionType = 'both';
        } else {
          connectionInfo.connection.connectionType = 'metrics';
        }
        
        logger.debug(`Reusing SSH connection for IP ${ip} via mapped instance ${mappedInstanceId}`);
        return connectionInfo.connection;
      }
    }
    
    // No existing connection
    return null;
  }
  
  /**
   * Update the instance ID for a connection
   * @param oldInstanceId Original instance ID
   * @param newInstanceId New instance ID
   */
  updateInstanceId(oldInstanceId: string, newInstanceId: string): boolean {
    if (!this.connections.has(oldInstanceId)) {
      return false;
    }
    
    const connectionInfo = this.connections.get(oldInstanceId)!;
    
    // Update the connections map
    this.connections.set(newInstanceId, connectionInfo);
    this.connections.delete(oldInstanceId);
    
    // Update the IP to instance map
    const ipKey = `${connectionInfo.ipAddress}:${connectionInfo.password}`;
    this.ipToInstanceMap.set(ipKey, newInstanceId);
    
    // Update data handlers
    if (this.dataHandlers.has(oldInstanceId)) {
      this.dataHandlers.set(newInstanceId, this.dataHandlers.get(oldInstanceId)!);
      this.dataHandlers.delete(oldInstanceId);
    }
    
    logger.info(`Updated instance ID mapping from ${oldInstanceId} to ${newInstanceId}`);
    return true;
  }
  
  /**
   * Add a new connection to the pool with unified approach
   * @param connectionParams Connection parameters
   */
  addConnection({
    instanceId,
    userId = '',
    ipAddress,
    password,
    connection,
    connectionType = 'both',
    welcomeMessage = '',
  }: {
    instanceId: string;
    userId?: string;
    ipAddress: string;
    password: string;
    connection: SSHConnection;
    connectionType?: 'terminal' | 'metrics' | 'both';
    welcomeMessage?: string;
  }): void {
    // Save IP and password in the connection for reference
    connection.ipAddress = ipAddress;
    connection.password = password;
    connection.connectionType = connectionType;
    connection.lastUsed = Date.now();
    
    // Store connection by instance ID
    this.connections.set(instanceId, {
      connection,
      lastActive: Date.now(),
      users: new Set(userId ? [userId] : []),
      welcomeMessage: welcomeMessage || this.defaultWelcomeMessage,
      ipAddress,
      password
    });
    
    // Map the IP:password to this instance ID for future lookups
    this.ipToInstanceMap.set(`${ipAddress}:${password}`, instanceId);
    
    logger.info(`Added ${connectionType} SSH connection to pool for instance ${instanceId} (${ipAddress})`);
  }
  
  /**
   * Remove a user from a connection
   * @param instanceId The instance ID
   * @param userId The user ID
   */
  removeUser(instanceId: string, userId: string): void {
    const connectionInfo = this.connections.get(instanceId);
    
    if (connectionInfo) {
      // Remove this user from the users set
      connectionInfo.users.delete(userId);
      
      // If no more users are connected, we may need to close or update the connection
      if (connectionInfo.users.size === 0) {
        // If this is a terminal-only connection, close after delay
        if (connectionInfo.connection.connectionType === 'terminal') {
          setTimeout(() => {
            // Check again if no users are connected
            if (this.connections.has(instanceId) && 
                this.connections.get(instanceId)!.users.size === 0) {
              
              logger.info(`Closing unused terminal SSH connection for instance ${instanceId}`);
              try {
                this.closeConnection(instanceId);
              } catch (error) {
                logger.error(`Error closing SSH connection: ${error}`);
              }
            }
          }, 30000); // 30 seconds delay
        } 
        // If it's a both-type connection, change type to metrics only
        else if (connectionInfo.connection.connectionType === 'both') {
          connectionInfo.connection.connectionType = 'metrics';
          logger.info(`Changed SSH connection for instance ${instanceId} to metrics-only`);
        }
      }
    }
  }
  
  /**
   * Close and remove a connection from the pool
   * @param instanceId The instance ID
   */
  private closeConnection(instanceId: string): void {
    const connectionInfo = this.connections.get(instanceId);
    if (!connectionInfo) return;
    
    try {
      connectionInfo.connection.dispose();
    } catch (error) {
      logger.error(`Error disposing SSH connection for ${instanceId}: ${error}`);
    }
    
    // Remove the instance from our maps
    this.connections.delete(instanceId);
    
    // Remove the IP mapping
    const ipKey = `${connectionInfo.ipAddress}:${connectionInfo.password}`;
    if (this.ipToInstanceMap.get(ipKey) === instanceId) {
      this.ipToInstanceMap.delete(ipKey);
    }
    
    // Clean up any associated data handlers
    this.dataHandlers.delete(instanceId);
  }
  
  /**
   * Add a data handler for a terminal connection
   * @param instanceId The instance ID
   * @param handler The data handler function
   */
  addDataHandler(instanceId: string, handler: (data: Buffer) => void): void {
    if (!this.dataHandlers.has(instanceId)) {
      this.dataHandlers.set(instanceId, new Set());
    }
    
    // Add the handler if it's not already in the set
    const handlers = this.dataHandlers.get(instanceId)!;
    if (!handlers.has(handler)) {
      handlers.add(handler);
      
      // Also update the lastDataHandler on the connection
      const connectionInfo = this.connections.get(instanceId);
      if (connectionInfo) {
        connectionInfo.connection.lastDataHandler = handler;
      }
    }
  }
  
  /**
   * Remove a data handler for a terminal connection
   * @param instanceId The instance ID
   * @param handler The data handler function
   */
  removeDataHandler(instanceId: string, handler: (data: Buffer) => void): void {
    if (this.dataHandlers.has(instanceId)) {
      this.dataHandlers.get(instanceId)!.delete(handler);
      // Clean up empty handler sets
      if (this.dataHandlers.get(instanceId)!.size === 0) {
        this.dataHandlers.delete(instanceId);
      }
    }
  }
  
  /**
   * Get all data handlers for a terminal connection
   * @param instanceId The instance ID
   */
  getDataHandlers(instanceId: string): Set<(data: Buffer) => void> | undefined {
    return this.dataHandlers.get(instanceId);
  }
  
  /**
   * Check if a metrics fetch is already pending for an instance
   * @param instanceId The instance ID
   */
  isMetricsFetchPending(instanceId: string): boolean {
    return this.pendingMetricsFetches.has(instanceId);
  }
  
  /**
   * Set a pending metrics fetch promise for an instance
   * @param instanceId The instance ID
   * @param promise The fetch promise
   */
  setMetricsFetchPending(instanceId: string, promise: Promise<any>): void {
    this.pendingMetricsFetches.set(instanceId, promise);
  }
  
  /**
   * Clear a pending metrics fetch for an instance
   * @param instanceId The instance ID
   */
  clearMetricsFetchPending(instanceId: string): void {
    this.pendingMetricsFetches.delete(instanceId);
  }
  
  /**
   * Find an instance ID by IP address and password
   * @param ip The IP address
   * @param password The password
   */
  findInstanceIdByIp(ip: string, password: string): string | null {
    const ipKey = `${ip}:${password}`;
    return this.ipToInstanceMap.get(ipKey) || null;
  }
  
  /**
   * Clean up inactive connections
   */
  private cleanup(): void {
    const now = Date.now();
    const terminalInactiveThreshold = 30 * 60 * 1000; // 30 minutes for terminal
    const metricsInactiveThreshold = 15 * 60 * 1000; // 15 minutes for metrics
    
    for (const [instanceId, info] of this.connections.entries()) {
      const connectionType = info.connection.connectionType || 'terminal';
      const threshold = 
        connectionType === 'metrics' ? metricsInactiveThreshold : terminalInactiveThreshold;
      
      // If the connection has been inactive for the threshold period
      if (now - info.lastActive > threshold) {
        // For terminal connections, only close if no users
        if (connectionType === 'terminal' && info.users.size > 0) {
          continue;
        }
        
        logger.info(`Closing inactive ${connectionType} SSH connection for instance ${instanceId}`);
        this.closeConnection(instanceId);
      }
    }
  }
  
  /**
   * Shutdown the connection pool
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);
    
    // Close all active connections
    for (const instanceId of this.connections.keys()) {
      logger.info(`Closing SSH connection for instance ${instanceId} during shutdown`);
      this.closeConnection(instanceId);
    }
    
    this.connections.clear();
    this.ipToInstanceMap.clear();
    this.dataHandlers.clear();
    this.pendingMetricsFetches.clear();
    logger.info('SSH connection pool shutdown complete');
  }

  /**
   * Dump connection pool status (for debugging)
   */
  dumpConnectionStatus(): {
    connections: Record<string, {
      type: string;
      ip: string;
      userCount: number;
      lastActive: string;
      hasDataStream: boolean;
    }>;
    ipMappings: Record<string, string>;
    dataHandlers: Record<string, number>;
  } {
    const connections: Record<string, any> = {};
    
    for (const [instanceId, info] of this.connections.entries()) {
      connections[instanceId] = {
        type: info.connection.connectionType || 'unknown',
        ip: info.ipAddress,
        userCount: info.users.size,
        lastActive: new Date(info.lastActive).toISOString(),
        hasDataStream: !!info.connection.dataStream
      };
    }
    
    const ipMappings: Record<string, string> = {};
    for (const [ipKey, instanceId] of this.ipToInstanceMap.entries()) {
      ipMappings[ipKey] = instanceId;
    }
    
    const dataHandlers: Record<string, number> = {};
    for (const [instanceId, handlers] of this.dataHandlers.entries()) {
      dataHandlers[instanceId] = handlers.size;
    }
    
    return { connections, ipMappings, dataHandlers };
  }
}

// Export a singleton instance
export const connectionPool = new SSHConnectionPoolManager();