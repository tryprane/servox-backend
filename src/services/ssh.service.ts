import { NodeSSH } from 'node-ssh';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis.config';

export class SSHMetricsService {
  // Cache TTL (5 minutes)
  private static METRICS_CACHE_TTL = 300;
  
  // SSH connection pool to reuse connections
  private static connectionPool = new Map<string, {
    ssh: NodeSSH;
    lastUsed: number;
  }>();

  // Clean up inactive connections every 10 minutes
  static {
    setInterval(() => this.cleanupConnections(), 10 * 60 * 1000);
  }

  private static async getConnection(ip: string, password: string): Promise<NodeSSH> {
    const key = `${ip}:${password}`;
    const now = Date.now();
    
    // Check if we have a cached connection
    if (this.connectionPool.has(key)) {
      const conn = this.connectionPool.get(key)!;
      conn.lastUsed = now; // Update last used timestamp
      return conn.ssh;
    }
    
    // Create new connection
    const ssh = new NodeSSH();
    
    try {
      await ssh.connect({
        host: ip,
        username: 'root',
        password: password,
        timeout: 5000, // 5 second timeout for faster feedback
        keepaliveInterval: 10000, // Send keepalive every 10 seconds
      });
      
      // Store in pool
      this.connectionPool.set(key, { ssh, lastUsed: now });
      
      return ssh;
    } catch (error) {
      logger.error(`Failed to connect to server ${ip} via SSH:`, error);
      throw new Error('SSH connection failed');
    }
  }
  
  private static cleanupConnections(): void {
    const now = Date.now();
    const expireTime = 15 * 60 * 1000; // 15 minutes
    
    for (const [key, conn] of this.connectionPool.entries()) {
      if (now - conn.lastUsed > expireTime) {
        try {
          conn.ssh.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
        this.connectionPool.delete(key);
        logger.debug(`Closed inactive SSH connection for ${key}`);
      }
    }
  }

  /**
   * Get cached metrics if available
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
   * Check if SSH is available
   */
  static async checkSSHAvailability(ip: string, password: string): Promise<boolean> {
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
    
    let ssh: NodeSSH | null = null;
    
    try {
      ssh = await this.getConnection(ip, password);
      // Run a simple command with timeout
      const result = await ssh.execCommand('echo "SSH connection successful"', {
        cwd: '/',
        onStderr: (chunk) => logger.debug(`SSH stderr: ${chunk.toString('utf8')}`),
        execOptions: {
          // node-ssh doesn't support direct timeout for execCommand, we'll use a shorter command instead
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
    } finally {
      // We don't dispose as we're using connection pooling
    }
  }

  /**
   * Get VPS usage via SSH with improved accuracy
   */
  static async getVPSUsage(ip: string, password: string, instanceId: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: {
      inbound: number;
      outbound: number;
    }
  }> {
    // Check cache first
    const cachedMetrics = await this.getCachedMetrics(instanceId);
    if (cachedMetrics) {
      return cachedMetrics;
    }
    
    let ssh: NodeSSH | null = null;
    
    try {
      ssh = await this.getConnection(ip, password);
      
      // Execute all commands in parallel for better performance
      const [cpuResult, memoryResult, diskResult, networkResult, prevNetworkResult] = await Promise.all([
        // Use mpstat for more accurate CPU measurement if available
        ssh.execCommand("command -v mpstat >/dev/null 2>&1 && { mpstat 1 2 | tail -n 1 | awk '{print 100-$NF}'; } || { cat /proc/loadavg | awk '{print $1}' && nproc; }"),
        
        // Memory usage using free command
        ssh.execCommand("free -m | grep 'Mem:' | awk '{print $3, $2}'"),
        
        // Disk usage for root partition
        ssh.execCommand("df -k / | tail -n 1 | awk '{print $3, $2}'"),
        
        // Current network stats
        ssh.execCommand("cat /proc/net/dev | grep -v lo | awk '{if(NR>2) {print $2, $10}}'"),
        
        // Get previous network stats if available
        ssh.execCommand("cat /tmp/prev_network_stats 2>/dev/null || echo ''")
      ]);
      
      // Process CPU usage
      let cpuUsage: number;
      if (cpuResult.stdout.includes('\n')) {
        // Fallback to loadavg method
        const [loadAvg, numCores] = cpuResult.stdout.trim().split('\n');
        cpuUsage = Math.min(parseFloat(loadAvg) / parseInt(numCores) * 100, 100);
      } else {
        // mpstat output
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
        // Calculate rate in MB/s and ensure it's not negative (can happen on counter reset)
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
        }
      };
    }
    // We don't dispose as we're using connection pooling
  }

  /**
   * Clean up resources when service is stopping
   */
  static shutdown(): void {
    for (const [key, conn] of this.connectionPool.entries()) {
      try {
        conn.ssh.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
    }
    this.connectionPool.clear();
    logger.info('SSH metrics service connections closed');
  }
}