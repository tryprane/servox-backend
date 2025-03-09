
// import { ContaboVPSService } from './contabo.service';
// import { VPSOrder, IVPSOrder } from '../models/vps-order.model';
// import { InstanceMetrics } from '../models/instance-metrics.model';
// import { logger } from '../utils/logger';
// import { SSHMetricsService } from './ssh.service';
// import { mergeConfig } from 'axios';

// interface VPSInstanceDetails {
//   id: string;
//   name: string;
//   status: 'running' | 'stopped' | 'error';
//   plan: string;
//   ip: string;
//   ipv6?: string;
//   cpu: string;
//   ram: string;
//   storage: string;
//   bandwidth: string;
//   uptime: string;
//   lastRestart: string;
//   cpuUsage?: number;  // Optional
//   ramUsage?: number;  // Optional
//   storageUsage?:number;
//   bandwidthUsage?:number;
//   isLoadingMetrics?: boolean; // Flag to indicate metrics loading state
//   password?: string;
//   osVersion?: string;
//   datacenter?: string;
// }

// export class VPSInstanceService {
//   static async getUserInstances(userId: string): Promise<VPSInstanceDetails[]> {
//     try {
//       const orders = await VPSOrder.find({
//         userId,
//         status: 'deployed'
//       });

//       // Get latest metrics from DB for each instance
//       const instanceDetailsPromises = orders.map(async (order) => {
//         const metrics = await InstanceMetrics.findOne({ 
//           instanceId: order.orderId 
//         }).sort({ timestamp: -1 });

//         let instanceStatus: "running" | "stopped" | "error" = "running";
//         if (metrics && metrics.status) {
//           instanceStatus = metrics.status as "running" | "stopped" | "error";
//         }
        
//         // Create instance details with available data
//         const instanceDetails: VPSInstanceDetails = {
//           id: order.orderId,
//           name: order.deployment?.hostname || 'Unnamed Instance',
//           status: instanceStatus,
//           plan: order.plan.name,
//           ip: order.deployment?.ipAddress || '',
//           cpu: `${order.plan.specs.cpu} Cores`,
//           ram: `${order.plan.specs.ram} GB`,
//           storage: `${order.plan.specs.storage} GB`,
//           bandwidth: `${order.plan.specs.bandwidth} TB`,
//           uptime: '0',
//           lastRestart: new Date(order.deployment?.deployedAt || '').toISOString(),
//           password: order.deployment?.adminPassword,
//           osVersion: order.configuration.operatingSystem.version,
//           datacenter: order.configuration.datacenter
//         };

//         // If we have metrics in DB, use them
//         if (metrics) { // If metrics are less than 5 minutes old
//           instanceDetails.cpuUsage = metrics.cpuUsage;
//           instanceDetails.ramUsage = metrics.ramUsage;
//           instanceDetails.storageUsage = metrics.storageUsage
//       instanceDetails.bandwidthUsage = metrics.bandwidthUsage
//           instanceDetails.isLoadingMetrics = false;
//         } else {
//           // If no metrics yet or metrics are old, set loading flag
//           instanceDetails.isLoadingMetrics = true;
          
//           // Fetch metrics asynchronously - don't await here
//           this.fetchAndStoreMetricsAsync(
//             order.orderId, 
//             userId, 
//             order.deployment?.ipAddress || '',
//             order.deployment?.adminPassword || '',
//             order.plan.specs.bandwidth
//           );
//         }

//         return instanceDetails;
//       });

//       return Promise.all(instanceDetailsPromises);
//     } catch (error) {
//       logger.error('Error fetching VPS instances:', error);
//       throw error;
//     }
//   }

//   static async getInstance(instanceId: string): Promise<VPSInstanceDetails> {
//     const order = await VPSOrder.findOne({ orderId: instanceId });
//     if (!order) {
//       throw new Error('Instance not found');
//     }

//     // Get latest metrics from DB
//     const metrics = await InstanceMetrics.findOne({ instanceId })
//       .sort({ timestamp: -1 });

//     let instanceStatus: "running" | "stopped" | "error" = "running";
//       if (metrics && metrics.status) {
//         instanceStatus = metrics.status as "running" | "stopped" | "error";
//       }  
    
//     // Create instance details with available data
//     const instanceDetails: VPSInstanceDetails = {
//       id: order.orderId,
//       name: order.deployment?.hostname || 'Unnamed Instance',
//       status: instanceStatus,
//       plan: order.plan.name,
//       ip: order.deployment?.ipAddress || '',
//       cpu: `${order.plan.specs.cpu} Cores`,
//       ram: `${order.plan.specs.ram} GB`,
//       storage: `${order.plan.specs.storage} GB`,
//       bandwidth: `${order.plan.specs.bandwidth} TB`,
//       uptime: '0',
//       lastRestart: new Date(order.deployment?.deployedAt || '').toISOString(),
//       password: order.deployment?.adminPassword,
//       osVersion: order.configuration.operatingSystem.version,
//       datacenter: order.configuration.datacenter
//     };
//     logger.info(instanceDetails)

//     // If we have metrics in DB that are less than 5 minutes old, use them
//     if (metrics  && metrics.timestamp > new Date(Date.now() - 300000)) {
//       instanceDetails.cpuUsage = metrics.cpuUsage;
//       instanceDetails.ramUsage = metrics.ramUsage;
//       instanceDetails.storageUsage = metrics.storageUsage
//       instanceDetails.bandwidthUsage = metrics.bandwidthUsage
//       instanceDetails.isLoadingMetrics = false;
//     } else {
//       // If no metrics yet or metrics are old, set loading flag
//       instanceDetails.isLoadingMetrics = true;
      
//       // Fetch metrics asynchronously - don't await here
//       this.fetchAndStoreMetricsAsync(
//         instanceId, 
//         order.userId, 
//         order.deployment?.ipAddress || '',
//         order.deployment?.adminPassword || '',
//         order.plan.specs.bandwidth
//       );
//     }

//     return instanceDetails;
//   }

//   // New method to fetch and store metrics in the background via SSH
//   private static async fetchAndStoreMetricsAsync(
//     instanceId: string, 
//     userId: string, 
//     ipAddress: string,
//     adminPassword: string,
//     bandwidth: number // Bandwidth allocation in TB
//   ): Promise<void> {
//     // Skip if IP or password are missing
//     if (!ipAddress || !adminPassword) {
//       logger.warn(`Cannot fetch metrics for ${instanceId}: Missing IP or password`);
//       return;
//     }
  
//     try {
//       // First check if SSH is available
//       const sshAvailable = await SSHMetricsService.checkSSHAvailability(ipAddress, adminPassword);
//       if (!sshAvailable) {
//         logger.warn(`SSH not available for ${instanceId} at ${ipAddress}`);
//         return;
//       }
  
//       // Fetch metrics using SSH
//       const usage = await SSHMetricsService.getVPSUsage(ipAddress, adminPassword);
      
//       // Convert bandwidth from TB to MB (1 TB = 1,048,576 MB)
//       const bandwidthInMB = bandwidth * 1048576;
      
//       // Calculate bandwidth usage percentage
//       // We use outbound traffic as a percentage of total allocated bandwidth
//       const bandwidthUsagePercentage = (usage.network.outbound / bandwidthInMB) * 100;
      
//       // Find existing metrics document or create a new one
//       const existingMetrics = await InstanceMetrics.findOne({ instanceId });
      
//       if (existingMetrics) {
//         // Update existing metrics
//         existingMetrics.cpuUsage = usage.cpu;
//         existingMetrics.ramUsage = usage.memory;
//         existingMetrics.storageUsage = usage.disk;
//         existingMetrics.bandwidthUsage = parseFloat(bandwidthUsagePercentage.toFixed(2)); // Store as percentage with 2 decimal places
//         existingMetrics.timestamp = new Date();
        
//         await existingMetrics.save();
//         logger.info(`Updated existing metrics for instance ${instanceId}`);
//       } else {
//         // Create new metrics document if none exists
//         await InstanceMetrics.create({
//           instanceId,
//           userId,
//           cpuUsage: usage.cpu,
//           ramUsage: usage.memory,
//           storageUsage: usage.disk,
//           bandwidthUsage: parseFloat(bandwidthUsagePercentage.toFixed(2)), // Store as percentage with 2 decimal places
//           timestamp: new Date()
//         });
        
//         logger.info(`Created new metrics for instance ${instanceId}`);
//       }
//     } catch (error) {
//       logger.error(`Error fetching metrics for ${instanceId}:`, error);
//     }
//   }

//   static async updateInstanceStatus(
//     instanceId: string, 
//     action: 'start' | 'stop' | 'restart'
//   ): Promise<boolean> {
//     try {
//       await ContaboVPSService.performVPSAction(instanceId, action);
      
//       // Determine the new status based on the action
//       let newStatus: 'running' | 'stopped' | 'error';
//       switch(action) {
//         case 'start':
//           newStatus = 'running';
//           break;
//         case 'stop':
//           newStatus = 'stopped';
//           break;
//         case 'restart':
//           newStatus = 'running';
//           break;
//         default:
//           newStatus = 'running';
//       }
      
//       // Find the existing metrics document
//       const existingMetrics = await InstanceMetrics.findOne({ instanceId }).sort({ timestamp: -1 });
      
//       if (existingMetrics) {
//         // Update the existing metrics
//         existingMetrics.status = newStatus;
//         // Save the changes to the database
//         await existingMetrics.save();
        
//         logger.info(`Instance ${instanceId} status updated to ${newStatus}`);
//       } else {
//         // If no metrics exist yet, create a new entry with basic info
//         const order = await VPSOrder.findOne({ orderId: instanceId });
//         if (!order) {
//           throw new Error('Instance not found');
//         }
        
//         await InstanceMetrics.create({
//           instanceId,
//           userId: order.userId,
//           cpuUsage: 0, // Default values since we don't have actual usage data
//           ramUsage: 0,
//           storageUsage: 0,
//           bandwidthUsage: 0,
//           status: newStatus
//         });
        
//         logger.info(`Created new metrics entry for instance ${instanceId} with status ${newStatus}`);
//       }
      
//       return true;
//     } catch (error) {
//       logger.error(`Failed to ${action} instance ${instanceId}:`, error);
//       return false;
//     }
//   }
// }

import { ContaboVPSService } from './contabo.service';
import { VPSOrder, IVPSOrder } from '../models/vps-order.model';
import { InstanceMetrics } from '../models/instance-metrics.model';
import { logger } from '../utils/logger';
import { SSHMetricsService } from './ssh.service';

// Track in-progress metrics fetches to prevent duplicate requests
const pendingMetricsFetches = new Map<string, Promise<void>>();

interface VPSInstanceDetails {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  plan: string;
  ip: string;
  ipv6?: string;
  cpu: string;
  ram: string;
  storage: string;
  bandwidth: string;
  uptime: string;
  lastRestart: string;
  cpuUsage?: number;
  ramUsage?: number;
  storageUsage?: number;
  bandwidthUsage?: number;
  isLoadingMetrics?: boolean;
  password?: string;
  osVersion?: string;
  datacenter?: string;
}

export class VPSInstanceService {
  static async getUserInstances(userId: string): Promise<VPSInstanceDetails[]> {
    try {
      const orders = await VPSOrder.find({
        userId,
        status: 'deployed'
      });

      // Get latest metrics from DB for each instance
      const instanceDetailsPromises = orders.map(async (order) => {
        const metrics = await InstanceMetrics.findOne({ 
          instanceId: order.orderId 
        }).sort({ timestamp: -1 });

        let instanceStatus: "running" | "stopped" | "error" = "running";
        if (metrics && metrics.status) {
          instanceStatus = metrics.status as "running" | "stopped" | "error";
        }
        
        // Create instance details with available data
        const instanceDetails: VPSInstanceDetails = {
          id: order.orderId,
          name: order.deployment?.hostname || 'Unnamed Instance',
          status: instanceStatus,
          plan: order.plan.name,
          ip: order.deployment?.ipAddress || '',
          cpu: `${order.plan.specs.cpu} Cores`,
          ram: `${order.plan.specs.ram} GB`,
          storage: `${order.plan.specs.storage} GB`,
          bandwidth: `${order.plan.specs.bandwidth} TB`,
          uptime: '0',
          lastRestart: new Date(order.deployment?.deployedAt || '').toISOString(),
          password: order.deployment?.adminPassword,
          osVersion: order.configuration.operatingSystem.version,
          datacenter: order.configuration.datacenter
        };

        // Check if metrics are recent (less than 5 minutes old)
       

        if (metrics) {
          // Use existing recent metrics
          instanceDetails.cpuUsage = metrics.cpuUsage;
          instanceDetails.ramUsage = metrics.ramUsage;
          instanceDetails.storageUsage = metrics.storageUsage;
          instanceDetails.bandwidthUsage = metrics.bandwidthUsage;
          instanceDetails.isLoadingMetrics = false;
        } else {
          // Metrics are missing or outdated
          instanceDetails.isLoadingMetrics = true;
          
          // Only fetch if there's not already a fetch in progress
          if (!pendingMetricsFetches.has(order.orderId)) {
            this.fetchAndStoreMetricsAsync(
              order.orderId, 
              userId, 
              order.deployment?.ipAddress || '',
              order.deployment?.adminPassword || '',
              order.plan.specs.bandwidth
            );
          }
        }

        return instanceDetails;
      });

      return Promise.all(instanceDetailsPromises);
    } catch (error) {
      logger.error('Error fetching VPS instances:', error);
      throw error;
    }
  }

  static async getInstance(instanceId: string): Promise<VPSInstanceDetails> {
    const order = await VPSOrder.findOne({ orderId: instanceId });
    if (!order) {
      throw new Error('Instance not found');
    }

    // Get latest metrics from DB
    const metrics = await InstanceMetrics.findOne({ instanceId })
      .sort({ timestamp: -1 });

    let instanceStatus: "running" | "stopped" | "error" = "running";
    if (metrics && metrics.status) {
      instanceStatus = metrics.status as "running" | "stopped" | "error";
    }  
    
    // Create instance details with available data
    const instanceDetails: VPSInstanceDetails = {
      id: order.orderId,
      name: order.deployment?.hostname || 'Unnamed Instance',
      status: instanceStatus,
      plan: order.plan.name,
      ip: order.deployment?.ipAddress || '',
      cpu: `${order.plan.specs.cpu} Cores`,
      ram: `${order.plan.specs.ram} GB`,
      storage: `${order.plan.specs.storage} GB`,
      bandwidth: `${order.plan.specs.bandwidth} TB`,
      uptime: '0',
      lastRestart: new Date(order.deployment?.deployedAt || '').toISOString(),
      password: order.deployment?.adminPassword,
      osVersion: order.configuration.operatingSystem.version,
      datacenter: order.configuration.datacenter
    };

    // Check if metrics are recent (less than 5 minutes old)
    if (metrics) {
      const metricsAreRecent = metrics.timestamp > new Date(Date.now() - 5 * 60 * 1000);
      
      if (metricsAreRecent || (metrics.status && metrics.status !== 'running')) {
        // Use existing metrics
        instanceDetails.cpuUsage = metrics.cpuUsage;
        instanceDetails.ramUsage = metrics.ramUsage;
        instanceDetails.storageUsage = metrics.storageUsage;
        instanceDetails.bandwidthUsage = metrics.bandwidthUsage;
        instanceDetails.isLoadingMetrics = false;
      } else {
      // Metrics are missing or outdated
      instanceDetails.isLoadingMetrics = true;
      
      // Only fetch if there's not already a fetch in progress
      if (!pendingMetricsFetches.has(instanceId)) {
        this.fetchAndStoreMetricsAsync(
          instanceId, 
          order.userId, 
          order.deployment?.ipAddress || '',
          order.deployment?.adminPassword || '',
          order.plan.specs.bandwidth
        );
      }
    }
  }

    return instanceDetails;
  }

  // New method to fetch and store metrics in the background via SSH
  private static async fetchAndStoreMetricsAsync(
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
    if (pendingMetricsFetches.has(instanceId)) {
      return;
    }
    
    // Create a promise for this fetch and store it in the Map
    const fetchPromise = (async () => {
      try {
        // First check if SSH is available
        const sshAvailable = await SSHMetricsService.checkSSHAvailability(ipAddress, adminPassword);
        if (!sshAvailable) {
          logger.warn(`SSH not available for ${instanceId} at ${ipAddress}`);
          return;
        }
      
        // Fetch metrics using SSH
        const usage = await SSHMetricsService.getVPSUsage(ipAddress, adminPassword);
        
        // Convert bandwidth from TB to MB (1 TB = 1,048,576 MB)
        const bandwidthInMB = bandwidth * 1048576;
        
        // Calculate bandwidth usage percentage
        const bandwidthUsagePercentage = (usage.network.outbound / bandwidthInMB) * 100;
        
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
            },
            $setOnInsert: {
              status: 'running' // Default status for new metrics
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
      } finally {
        // Clean up the pendingMetricsFetches map when done
        pendingMetricsFetches.delete(instanceId);
      }
    })();
    
    // Store the promise in the Map
    pendingMetricsFetches.set(instanceId, fetchPromise);
    
    // Wait for completion (but don't block the caller)
    await fetchPromise;
  }

  static async updateInstanceStatus(
    instanceId: string, 
    action: 'start' | 'stop' | 'restart'
  ): Promise<boolean> {
    try {
      await ContaboVPSService.performVPSAction(instanceId, action);
      
      // Determine the new status based on the action
      let newStatus: 'running' | 'stopped' | 'error';
      switch(action) {
        case 'start':
          newStatus = 'running';
          break;
        case 'stop':
          newStatus = 'stopped';
          break;
        case 'restart':
          newStatus = 'running';
          break;
        default:
          newStatus = 'running';
      }
      
      // Use findOneAndUpdate with upsert to avoid race conditions
      const order = await VPSOrder.findOne({ orderId: instanceId });
      if (!order) {
        throw new Error('Instance not found');
      }
      
      await InstanceMetrics.findOneAndUpdate(
        { instanceId },
        {
          $set: {
            status: newStatus,
            timestamp: new Date()
          },
          $setOnInsert: {
            userId: order.userId,
            cpuUsage: 0,
            ramUsage: 0,
            storageUsage: 0,
            bandwidthUsage: 0
          }
        },
        { 
          upsert: true, 
          new: true 
        }
      );
      
      logger.info(`Instance ${instanceId} status updated to ${newStatus}`);
      return true;
    } catch (error) {
      logger.error(`Failed to ${action} instance ${instanceId}:`, error);
      return false;
    }
  }
}