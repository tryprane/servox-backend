import { VPSOrder } from '../models/vps-order.model';
import { InstanceMetrics } from '../models/instance-metrics.model';
import { ContaboVPSService } from './contabo.service';
import { logger } from '../utils/logger';

export class OverviewService {
    static async getDashboardStats(userId: string) {
        try {
            // Get all orders for the user
            const orders = await VPSOrder.find({ userId })
                .sort({ createdAt: -1 })
                .limit(10);
    
            // Calculate instances statistics
            const totalInstances = await VPSOrder.countDocuments({ 
                userId, 
                status: { $in: ['deployed', 'processing', 'pending'] } 
            });
            const activeInstances = await VPSOrder.countDocuments({ 
                userId, 
                status: 'deployed' 
            });
            const pendingOrders = await VPSOrder.countDocuments({ 
                userId, 
                status: 'pending' 
            });
    
            // Calculate total spent
            const totalSpent = await VPSOrder.aggregate([
                { $match: { userId, status: 'deployed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
    
            // Get latest resource usage for active instances
            const resourceUsage = await InstanceMetrics.findOne({ userId })
                .sort({ timestamp: -1 });
    
            // Format recent orders
            const recentOrders = orders.map(order => ({
                id: order.orderId,
                instanceName: order.deployment?.hostname || 'Unnamed Instance',
                plan: order.plan.name,
                status: order.status,
                // Now createdAt should be properly typed
                createdAt: order.createdAt
            }));
    
            return {
                totalInstances,
                activeInstances,
                pendingOrders,
                totalSpent: totalSpent[0]?.total || 0,
                cpuUsage: resourceUsage?.cpuUsage || 0,
                ramUsage: resourceUsage?.ramUsage || 0,
                storageUsage: resourceUsage?.storageUsage || 0,
                
                recentOrders
            };
        } catch (error) {
            logger.error('Error fetching dashboard stats:', error);
            throw error;
        }
    }

    static async updateInstanceMetrics(userId: string, instanceId: string) {
        try {
            const usage = await ContaboVPSService.getVPSUsage(instanceId);
            
            await InstanceMetrics.create({
                instanceId,
                userId,
                cpuUsage: usage.cpu,
                ramUsage: usage.memory,
                storageUsage: usage.disk,
                
            });
        } catch (error) {
            logger.error(`Error updating instance metrics for ${instanceId}:`, error);
            throw error;
        }
    }
}
