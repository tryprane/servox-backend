import { Request , Response  } from "express";
import { VpsService } from "../services/vps.service";
import {logger} from "../utils/logger"

interface UserWithId {
    id: string;
    role:string;
    [key: string]: any;

  }

export class VPSController {
    static async getVPSPlans(req: Request , res: Response): Promise<void>{
        try {

            const plans = await VpsService.getVpsPlans();
            res.status(200).json({
                status: 'success',
                data: {plans}
            })

        } catch (error) {

            logger.error('Fetching Error' , error);

            res.status(400).json({
                status: 'error',
               message: error instanceof Error ? error.message : 'Fectching Failed'
            })


            
        }
    }

    static async deletePlan(req: Request , res: Response): Promise<void>{
        try {
            if((req.user! as UserWithId).role !== 'admin'){
                res.status(403).json({
                       status: 'error',
                       message:'Access Denied'
                   });   
                   return 
               }
               const {id} = req.params;
               const plan = await VpsService.deletePlan(id);
               res.status(200).json({
                status: 'success',
                data: plan
               })
        } catch (error) {
            logger.error('Deleting Error' , error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message : 'Deleting Failed'
            })
        }
    }

    static async postVpsPlan (req: Request , res : Response) : Promise<void> {

        try {

            if((req.user! as UserWithId).role !== 'admin'){
                res.status(403).json({
                       status: 'error',
                       message:'Access Denied'
                   });   
                   return 
               }
            const plan = await VpsService.postPlan(req.body);
            res.status(200).json({
                status: 'success',
                data: plan
            })
        } catch (error) {

            logger.error("Posting Plan is Failed" , error);
            res.status(400).json({
                status: 'error' ,
                message: 'Posting a plan is failed'
            });
            
        }
    }
}