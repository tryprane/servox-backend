import { error } from "winston";
import { IUser, User } from "../models/user.model";
import { VPSOrder , IVPSOrder } from "../models/vps-order.model";
import { ContaboVPSService } from "./contabo.service";
import { ReferralService } from "./referral.service";


export class adminService {
    static async updateDeploymentDetails(
        orderId: string,
        details: {
           
            ipAddress?:string
          
        }
    ): Promise<IVPSOrder | null> {

        const order = await VPSOrder.findOne({orderId});



        if(!order) {
            throw new Error('Order not found');
        }

        const userId = order.userId;
        const amount = order.amount;

        await ReferralService.processReferralCommission(userId , amount);



        order.updateDeploymentDetails(details);
        await order.save();


        await ContaboVPSService.customizeNewInstance(
            order.deployment?.hostname,
            order.deployment?.ipAddress || '',
            order.deployment?.adminPassword || '',
            {
                hostname: order.deployment?.hostname || '',
                brandName: 'Servox',
                userId: order.userId
            }
        );
        return order;

    } 

    static async recentlyDeployed(): Promise<IVPSOrder[] | null> {
        const recentlyDeployed = await VPSOrder.find({status:'deployed'})
                        .sort({createdAt: -1})
                        .limit(10);

        if(!recentlyDeployed){
            throw new Error('NO Created Order')
        }                

        return  recentlyDeployed;               
    }


    static async ordersPaid(): Promise<IVPSOrder[] | null> {
        const ordersPaid = await VPSOrder.find({status:'processing'});

        if(!ordersPaid){
            throw new Error('NO Created Order')
        }                

        return  ordersPaid;               
    }

    static async getAllUser():Promise<IUser[] | null>{
        try {
            const user = await User.find();
            if(!user) {
                throw new Error('User Not Found');
            }
            return user;
        } catch (error) {
            throw new Error('Error fetching users');
        }
    }

    static async deletUser(userId:string):Promise<boolean>{

        try {
            const user = await User.findByIdAndDelete(userId);
            if(!user) {
                throw new Error('User Not Found');
                
            }   

        return true            
        } catch (error) {
            return false;
        }
    }

    static async recentlyCreated(): Promise<IVPSOrder[] | null> {
        const recentlyCreated = await VPSOrder.find({status:'pending'})
                        .sort({createdAt: -1})
                        .limit(10);

        if(!recentlyCreated){
            throw new Error('NO Created Order')
        }                

        return  recentlyCreated;               
    }

}