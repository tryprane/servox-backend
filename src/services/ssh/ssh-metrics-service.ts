// src/services/ssh-metrics-service.ts
import { NodeSSH } from 'node-ssh';
import { VPSOrder } from '../../models/vps-order.model';
import { InstanceMetrics } from '../../models/instance-metrics.model';
import { logger } from '../../utils/logger';
import { redisClient } from '../../config/redis.config';
import { connectionPool, SSHConnection } from './ssh-connection-pool';

/**
 * SSH Metrics Service
 * Collects system metrics from remote servers via SSH
 */
export class SSHMetricsService {
  // Cache TTL
  private static METRICS_CACHE_TTL = 300; // 5 minutes
  private static METRICS_COLLECTION_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static metricsInterval: NodeJS.Timeout | null = null;
  
  /**
   * Check if SSH is available for a server
   * @param ip The server IP address
   * @param password The server password
   */
  static async checkSSHAvailability(ip: string, password: string , instanceId :string): Promise<boolean> {
    const cacheKey = `ssh:available:${ip}`;
    
    // Check cache first
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return cached === 'true';
      }
    } catch (error) {
      logger.error('Redis error when checking SSH availability cache:', error);
    }
    
    try {
      // Try to get an existing connection from the pool
      let ssh: SSHConnection | null = null;
      
      // First check if we can find an existing connection
      const mappedInstanceId = connectionPool.findInstanceIdByIp(ip, password);
      if (mappedInstanceId) {
        ssh = await connectionPool.getMetricsConnection(ip, password, mappedInstanceId);
      } else {
        ssh = await connectionPool.getMetricsConnection(ip, password);
      }
      
      // If no existing connection, create a new one
      if (!ssh) {
        ssh = new NodeSSH() as SSHConnection;
        
        await ssh.connect({
          host: ip,
          port:22,
          username: 'root',
          password: password,
          timeout: 10000, // 5 second timeout for faster feedback
          keepaliveInterval: 30000, // Send keepalive every 10 seconds
        });
        
        // Create a temporary instance ID
        const tempInstanceId = `temp-metrics-${instanceId}`;
        
        // Add to connection pool for future reuse
        connectionPool.addConnection({
          instanceId: instanceId,
          ipAddress: ip,
          password,
          connection: ssh,
          connectionType: 'metrics',
        });
      }
      
      // Run a simple command to test connection
      const result = await ssh.execCommand('echo "SSH connection successful"', {
        cwd: '/',
        execOptions: { 

         }
      });
      
      const isAvailable = result.stdout.includes('successful');
      
      // Cache the result for 5 minutes
      try {
        await redisClient.setex(cacheKey, 300, isAvailable ? 'true' : 'false');
      } catch (error) {
        logger.error('Redis error when caching SSH availability:', error);
      }
      
      return isAvailable;
    } catch (error) {
      logger.warn(`SSH not available for server ${ip}:`, error);
      
      // Cache the negative result for 1 minute (shorter time for negative results)
      try {
        await redisClient.setex(cacheKey, 60, 'false');
      } catch (redisError) {
        logger.error('Redis error when caching SSH availability:', redisError);
      }
      
      return false;
    }
  }
  
  /**
   * Get cached metrics if available
   * @param instanceId The instance ID
   */
  private static async getCachedMetrics(instanceId: string): Promise<any | null> {
    const cacheKey = `metrics:${instanceId}`;
    
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.error('Redis error when getting cached metrics:', error);
    }
    
    return null;
  }
  
  /**
   * Cache metrics result
   * @param instanceId The instance ID
   * @param metrics The metrics to cache
   */
  private static async cacheMetrics(instanceId: string, metrics: any): Promise<void> {
    const cacheKey = `metrics:${instanceId}`;
    
    try {
      await redisClient.setex(cacheKey, this.METRICS_CACHE_TTL, JSON.stringify(metrics));
    } catch (error) {
      logger.error('Redis error when caching metrics:', error);
    }
  }
  
  /**
   * Get VPS usage metrics using SSH
   * @param ip The server IP address
   * @param password The server password
   * @param instanceId The instance ID
   */
  static async getVPSUsage(ip: string, password: string, instanceId: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: {
      inbound: number;
      outbound: number;
    };
    isEstimated?: boolean;
  }> {
    // Check cache first
    const cachedMetrics = await this.getCachedMetrics(instanceId);
    if (cachedMetrics) {
      return cachedMetrics;
    }
    
    try {
      // Try to get an existing connection from the pool
      let ssh: SSHConnection | null = null;
      
      // First check if we can find an existing connection
      const mappedInstanceId = connectionPool.findInstanceIdByIp(ip, password);
      if (mappedInstanceId) {
        ssh = await connectionPool.getMetricsConnection(ip, password, mappedInstanceId);
      } else {
        ssh = await connectionPool.getMetricsConnection(ip, password);
      }
      
      // If no existing connection, create a new one
      if (!ssh) {
        ssh = new NodeSSH() as SSHConnection;
        
        await ssh.connect({
          host: ip,
          username: 'root',
          password: password,
          timeout: 10000, // 10 second timeout
          keepaliveInterval: 10000, // Send keepalive every 10 seconds
        });
        
        // Create a temporary instance ID if we don't have a real one
        const tempInstanceId = `temp-metrics-${ip.replace(/\./g, '-')}-${Date.now()}`;
        
        // Add to connection pool
        connectionPool.addConnection({
          instanceId: tempInstanceId,
          ipAddress: ip,
          password,
          connection: ssh,
          connectionType: 'metrics',
        });
      }
      
      // Run all commands in parallel for better performance
      const [cpuResult, memoryResult, diskResult, networkResult, prevNetworkResult] = await Promise.all([
        // CPU usage using mpstat which gives more accurate measurements
        ssh.execCommand("command -v mpstat >/dev/null 2>&1 && { mpstat 1 1 | tail -n 1 | awk '{print 100-$NF}'; } || { cat /proc/loadavg | awk '{print $1}' && nproc; }"),
        
        // Memory usage
        ssh.execCommand("free -m | grep 'Mem:' | awk '{print $3, $2}'"),
        
        // Disk usage
        ssh.execCommand("df -k / | tail -n 1 | awk '{print $3, $2}'"),
        
        // Current network stats
        ssh.execCommand("cat /proc/net/dev | grep -v lo | awk '{if(NR>2) {print $2, $10}}'"),
        
        // Get previous network stats from file if it exists
        ssh.execCommand("cat /tmp/prev_network_stats 2>/dev/null || echo ''")
      ]);
      
      // Process CPU usage
      let cpuUsage: number;
      if (cpuResult.stdout.includes('\n')) {
        // Fallback to loadavg method
        const [loadAvg, numCores] = cpuResult.stdout.trim().split('\n');
        cpuUsage = Math.min(parseFloat(loadAvg) / parseInt(numCores) * 100, 100);
      } else {
        // Direct mpstat output
        cpuUsage = parseFloat(cpuResult.stdout.trim());
      }
      
      // Process memory usage
      const [usedMem, totalMem] = memoryResult.stdout.trim().split(' ').map(Number);
      const memoryUsage = (usedMem / totalMem) * 100;
      
      // Process disk usage
      const [usedDisk, totalDisk] = diskResult.stdout.trim().split(' ').map(Number);
      const diskUsage = (usedDisk / totalDisk) * 100;
      
      // Process network stats
      const networkLines = networkResult.stdout.trim().split('\n');
      let currentInbound = 0;
      let currentOutbound = 0;
      
      networkLines.forEach(line => {
        const [inbound, outbound] = line.split(' ').map(Number);
        currentInbound += inbound;
        currentOutbound += outbound;
      });
      
      // Store current network stats for next time
      await ssh.execCommand(`echo "${currentInbound} ${currentOutbound}" > /tmp/prev_network_stats`);
      
      // Calculate network usage delta if we have previous stats
      let inboundRate = 0;
      let outboundRate = 0;
      
      if (prevNetworkResult.stdout.trim()) {
        const [prevInbound, prevOutbound] = prevNetworkResult.stdout.trim().split(' ').map(Number);
        inboundRate = Math.max(0, currentInbound - prevInbound) / (1024 * 1024); // in MB
        outboundRate = Math.max(0, currentOutbound - prevOutbound) / (1024 * 1024); // in MB
      }
      
      const result = {
        cpu: parseFloat(cpuUsage.toFixed(2)),
        memory: parseFloat(memoryUsage.toFixed(2)),
        disk: parseFloat(diskUsage.toFixed(2)),
        network: {
          inbound: parseFloat(inboundRate.toFixed(2)),
          outbound: parseFloat(outboundRate.toFixed(2))
        }
      };
      
      // Cache the result
      await this.cacheMetrics(instanceId, result);
      
      return result;
    } catch (error) {
      logger.error(`Failed to get VPS usage for ${ip}:`, error);
      
      // Return default values in case of error
      return {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: {
          inbound: 0,
          outbound: 0
        },
        isEstimated: true
      };
    }
  }
  
  /**
   * Start the metrics collection service
   */
  static startMetricsService() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    // Collect metrics for all instances every 5 minutes
    this.metricsInterval = setInterval(async () => {
      try {
        // Get all deployed instances
        const deployedOrders = await VPSOrder.find({ 
          status: 'deployed',
          'deployment.ipAddress': { $exists: true },
          'deployment.adminPassword': { $exists: true }
        }).select('+deployment.adminPassword');
        
        // Process each instance
        for (const order of deployedOrders) {
          // Start metrics collection in the background
          if (order.deployment?.ipAddress && order.deployment?.adminPassword) {
            this.fetchAndStoreMetricsAsync(
              order.orderId,
              order.userId,
              order.deployment.ipAddress,
              order.deployment.adminPassword,
              order.plan.specs.bandwidth
            ).catch(error => {
              logger.error(`Background metrics collection error for ${order.orderId}:`, error);
            });
          }
        }
      } catch (error) {
        logger.error('Error in metrics collection job:', error);
      }
    }, this.METRICS_COLLECTION_INTERVAL);
    
    logger.info('VPS Metrics collection service started');
  }
  
  /**
   * Fetch metrics for a single instance and store in database
   * @param instanceId The instance ID
   * @param userId The user ID
   * @param ipAddress The server IP address
   * @param adminPassword The server password
   * @param bandwidth The bandwidth limit in TB
   */
  static async fetchAndStoreMetricsAsync(
    instanceId: string, 
    userId: string, 
    ipAddress: string,
    adminPassword: string,
    bandwidth: number
  ): Promise<void> {
    // Skip if IP or password are missing
    if (!ipAddress || !adminPassword) {
      logger.warn(`Cannot fetch metrics for ${instanceId}: Missing IP or password`);
      return;
    }
    
    // If there's already a fetch in progress for this instance, return
    if (connectionPool.isMetricsFetchPending(instanceId)) {
      return;
    }
    
    // Create a promise for this fetch and store it in the Map
    const fetchPromise = (async () => {
      try {
        // Check if we have recent metrics in the database (less than 4 minutes old)
        const recentMetrics = await InstanceMetrics.findOne({
          instanceId,
          timestamp: { $gt: new Date(Date.now() - 4 * 60 * 1000) }
        });
        
        if (recentMetrics) {
          logger.debug(`Using recent metrics for ${instanceId}`);
          return;
        }
        
        // First check if SSH is available with a short timeout
        const sshAvailable = await this.checkSSHAvailability(ipAddress, adminPassword , instanceId);
        if (!sshAvailable) {
          // If SSH isn't available, try to use cached metrics or fallback
          await this.storeFallbackMetrics(instanceId, userId);
          return;
        }
      
        // Fetch metrics using SSH
        const usage = await this.getVPSUsage(ipAddress, adminPassword, instanceId);
        
        // Convert bandwidth from TB to MB (1 TB = 1,048,576 MB)
        const bandwidthInMB = bandwidth * 1048576;
        
        // Calculate bandwidth usage percentage (use outbound as the primary metric)
        // Note: this is now based on current rate rather than cumulative usage
        // In a production app, you'd need to sum this up over time
        const bandwidthUsagePercentage = 
          usage.isEstimated 
            ? 0 // Don't estimate bandwidth if we couldn't get metrics
            : Math.min(100, (usage.network.outbound / (bandwidthInMB / 30 / 24 / 60)) * 100);
        
        // Use findOneAndUpdate with upsert to avoid race conditions
        await InstanceMetrics.findOneAndUpdate(
          { instanceId },
          {
            $set: {
              userId,
              cpuUsage: usage.cpu,
              ramUsage: usage.memory,
              storageUsage: usage.disk,
              bandwidthUsage: parseFloat(bandwidthUsagePercentage.toFixed(2)),
              timestamp: new Date()
            }
          },
          { 
            upsert: true, 
            new: true 
          }
        );
        
        logger.info(`Updated metrics for instance ${instanceId}`);
      } catch (error) {
        logger.error(`Error fetching metrics for ${instanceId}:`, error);
        // Try to store fallback metrics
        await this.storeFallbackMetrics(instanceId, userId);
      } finally {
        // Clean up the pendingMetricsFetches map when done
        connectionPool.clearMetricsFetchPending(instanceId);
      }
    })();
    
    // Store the promise in the Map
    connectionPool.setMetricsFetchPending(instanceId, fetchPromise);
    
    // Wait for completion (but don't block the caller)
    await fetchPromise;
  }
  
  /**
   * Store fallback metrics when SSH is not available
   * @param instanceId The instance ID
   * @param userId The user ID
   */
  private static async storeFallbackMetrics(instanceId: string, userId: string): Promise<void> {
    try {
      // Get previous metrics
      const previousMetrics = await InstanceMetrics.findOne({ instanceId })
        .sort({ timestamp: -1 });
      
      if (!previousMetrics) {
        // If no previous metrics, create an empty record
        await InstanceMetrics.create({
          instanceId,
          userId,
          cpuUsage: 0,
          ramUsage: 0,
          storageUsage: 0,
          bandwidthUsage: 0,
          timestamp: new Date()
        });
        return;
      }
      
      // Update timestamp but keep the same values
      await InstanceMetrics.create({
        instanceId,
        userId,
        cpuUsage: previousMetrics.cpuUsage,
        ramUsage: previousMetrics.ramUsage,
        storageUsage: previousMetrics.storageUsage,
        bandwidthUsage: previousMetrics.bandwidthUsage,
        timestamp: new Date()
      });
      
      logger.info(`Stored fallback metrics for instance ${instanceId}`);
    } catch (error) {
      logger.error(`Error storing fallback metrics for ${instanceId}:`, error);
    }
  }
  
  /**
   * Get instance metrics with fallback mechanisms
   * @param instanceId The instance ID
   */
  static async getInstanceMetrics(instanceId: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: {
      inbound: number;
      outbound: number;
    };
    updated: Date;
  }> {
    try {
      // Try to get cached metrics first
      const cachedMetrics = await this.getCachedMetrics(instanceId);
      if (cachedMetrics) {
        return {
          ...cachedMetrics,
          updated: new Date()
        };
      }
      
      // Try to get metrics from database
      const metrics = await InstanceMetrics.findOne({ instanceId })
        .sort({ timestamp: -1 });
      
      if (metrics) {
        return {
          cpu: metrics.cpuUsage,
          memory: metrics.ramUsage,
          disk: metrics.storageUsage,
          network: {
            inbound: 0, // We don't store this in the database
            outbound: metrics.bandwidthUsage
          },
          updated: metrics.timestamp
        };
      }
      
      // No metrics available
      return {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: {
          inbound: 0,
          outbound: 0
        },
        updated: new Date()
      };
    } catch (error) {
      logger.error(`Error getting instance metrics for ${instanceId}:`, error);
      
      // Return default values in case of error
      return {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: {
          inbound: 0,
          outbound: 0
        },
        updated: new Date()
      };
    }
  }
  
  /**
   * Refresh metrics for an instance
   * @param instanceId The instance ID
   */
  static async refreshMetrics(instanceId: string): Promise<boolean> {
    try {
      const order = await VPSOrder.findOne({ 
        orderId: instanceId,
        status: 'deployed' 
      }).select('+deployment.adminPassword');
      
      if (!order || !order.deployment?.ipAddress || !order.deployment?.adminPassword) {
        logger.warn(`Cannot refresh metrics for ${instanceId}: Missing deployment details`);
        return false;
      }
      
      // Immediately try to update metrics
      await this.fetchAndStoreMetricsAsync(
        order.orderId,
        order.userId,
        order.deployment.ipAddress,
        order.deployment.adminPassword,
        order.plan.specs.bandwidth
      );
      
      return true;
    } catch (error) {
      logger.error(`Failed to refresh metrics for ${instanceId}:`, error);
      return false;
    }
  }
  
  /**
   * Stop the metrics collection service
   */
  static stopMetricsService() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      logger.info('VPS Metrics collection service stopped');
    }
  }
}