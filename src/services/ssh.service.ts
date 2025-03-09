import { NodeSSH } from 'node-ssh';
import { logger } from '../utils/logger';

export class SSHMetricsService {
  private static async createSSHConnection(ip: string, password: string): Promise<NodeSSH> {
    const ssh = new NodeSSH();
    
    try {
      await ssh.connect({
        host: ip,
        username: 'root',
        password: password,
        // For production, you might want to add these options:
        // readyTimeout: 5000,
        // keepaliveInterval: 1000,
      });
      
      return ssh;
    } catch (error) {
      logger.error(`Failed to connect to server ${ip} via SSH:`, error);
      throw new Error('SSH connection failed');
    }
  }

  static async getVPSUsage(ip: string, password: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: {
      inbound: number;
      outbound: number;
    }
  }> {
    let ssh: NodeSSH | null = null;
    
    try {
      ssh = await this.createSSHConnection(ip, password);
      
      // Get CPU usage - average load for the last minute divided by number of cores
      const cpuResult = await ssh.execCommand('cat /proc/loadavg | awk \'{print $1}\' && nproc');
      const [loadAvg, numCores] = cpuResult.stdout.trim().split('\n');
      const cpuUsage = Math.min(parseFloat(loadAvg) / parseInt(numCores) * 100, 100);
      
      // Get memory usage
      const memoryResult = await ssh.execCommand(
        'free -m | grep "Mem:" | awk \'{print $3, $2}\''
      );
      const [used, total] = memoryResult.stdout.trim().split(' ').map(Number);
      const memoryUsage = (used / total) * 100;
      
      // Get disk usage
      const diskResult = await ssh.execCommand(
        'df -h / | tail -n 1 | awk \'{print $5}\''
      );
      const diskUsage = parseInt(diskResult.stdout.trim().replace('%', ''));
      
      // Get network statistics
      // This command gets network stats since boot, so it's a cumulative value
      const networkResult = await ssh.execCommand(
        'cat /proc/net/dev | grep -v lo | awk \'{if(NR>2) {print $2, $10}}\''
      );
      
      const networkLines = networkResult.stdout.trim().split('\n');
      let totalInbound = 0;
      let totalOutbound = 0;
      
      networkLines.forEach(line => {
        const [inbound, outbound] = line.split(' ').map(Number);
        totalInbound += inbound;
        totalOutbound += outbound;
      });
      
      // Convert bytes to megabytes
      const inboundMB = totalInbound / (1024 * 1024);
      const outboundMB = totalOutbound / (1024 * 1024);
      
      return {
        cpu: parseFloat(cpuUsage.toFixed(2)),
        memory: parseFloat(memoryUsage.toFixed(2)),
        disk: diskUsage,
        network: {
          inbound: parseFloat(inboundMB.toFixed(2)),
          outbound: parseFloat(outboundMB.toFixed(2))
        }
      };
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
    } finally {
      // Always close the SSH connection
      if (ssh) {
        ssh.dispose();
      }
    }
  }

  // Add method to check if SSH is available
  static async checkSSHAvailability(ip: string, password: string): Promise<boolean> {
    let ssh: NodeSSH | null = null;
    
    try {
      ssh = await this.createSSHConnection(ip, password);
      // Run a simple command to verify SSH works
      const result = await ssh.execCommand('echo "SSH connection successful"');
      return result.stdout.includes('successful');
    } catch (error) {
      logger.warn(`SSH not available for server ${ip}:`, error);
      return false;
    } finally {
      if (ssh) {
        ssh.dispose();
      }
    }
  }
}