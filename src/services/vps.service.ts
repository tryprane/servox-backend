import { IVPSPlan , VPSPlan } from "../models/vpsPlan.model";
import {redisClient} from '../config/redis.config';


interface vpsPlan{
    name: string;
    description: string;
    price: {
        monthly: number;
        annually: number;
    
    };
    specs: {
        cpu: number; // Number of CPU cores
        ram: number; // RAM in GB
        storage: number; // Storage in GB
        bandwidth: number; // Bandwidth in TB
    }
}

export class VpsService {

    static async postPlan(planData: vpsPlan): Promise<{plan: IVPSPlan; msg: string}> {

        const plan = await VPSPlan.create(planData);
        const msg = "Plan Creataed Successfully";
        await redisClient.del('vpsPlans');


        return {plan , msg}



    }



    static async getVpsPlans(): Promise<IVPSPlan[]> {
        const cacheKey = 'vpsPlans';
        
        try {
            // Check Redis cache first
            const cachedPlans = await redisClient.get(cacheKey);
            
            if (cachedPlans) {
                return JSON.parse(cachedPlans);
            }

            // Fetch from database if not in cache
            const plans = await VPSPlan.find();
            
            // Cache the plans for 24 hours
            await  redisClient.setex(cacheKey, 86400, JSON.stringify(plans));

            return plans;
        } catch (error) {
            // Log the error and rethrow
            console.error('Error fetching VPS plans:', error);
            throw error;
        }
    }
}