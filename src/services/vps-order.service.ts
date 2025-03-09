import { VPSOrder , IVPSOrder} from "../models/vps-order.model";
import { VPSPlan ,IVPSPlan } from "../models/vpsPlan.model";
import { logger } from "../utils/logger";


export class VPSOrderService{

    static async createOrder(data:{
        userId: string;
        planName: string;
        configuration: IVPSOrder['configuration'];
        billingCycle?: 'monthly' | 'annually';
    }):Promise<IVPSOrder> {

        try {

            const plan = await VPSPlan.findOne({name: data.planName});
            if(!plan) {
                throw new Error('Invalid Plan Selected');
            }
            const amount=  this.fetchAmount(plan , data.billingCycle as string);

            const orderData: Partial<IVPSOrder> = {
                userId: data.userId,
                plan: {
                    planId: plan.name,
                    name: plan.name,
                    specs: plan.specs,
                    price: plan.price
                },
                configuration: data.configuration,
                billingCycle: data.billingCycle || 'monthly',
                amount: amount,
                status:'pending'
            }

            const order = await VPSOrder.create(orderData);
            logger.info(`VPS Order created: ${order.orderId}`);
            return order;
            
        } catch (error) {
            logger.error('VPS Order creation error:' , error);
            throw error;
        }
    }

    static async getUserOrders(userId:string): Promise<IVPSOrder[]>{
        return VPSOrder.find({userId});
    }


    static fetchAmount(plan: IVPSPlan , billingCycle: any): number {

        const price = billingCycle === 'monthly' ? plan.price.monthly : plan.price.annually;
        const amount = price * 1.18; 

        return amount
    }


    
}

