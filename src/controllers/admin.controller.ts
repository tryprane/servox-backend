import { adminService } from "../services/admin.service";
import { Request, Response } from "express";
import { logger } from "../utils/logger";

interface UserWithId {
    id: string;
    role:string;
    [key: string]: any;

  }

export class adminController {

    

    static async updateDeploymentDetails(req: Request, res: Response){
        try{
            if((req.user! as UserWithId).role !== 'admin'){
             res.status(403).json({
                    status: 'error',
                    message:'Access Denied'
                });   
                return 
            }

            const order = await adminService.updateDeploymentDetails(
                req.params.orderId,
                {
                    
                    ipAddress: req.body.ipAddress
                    
                }
            );
            res.status(200).json({
                status: 'success',
                data: order
            });
        } catch (error){
            logger.error('Deployment details update error: ', error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message: 'Update Failed'
            })
        }
    }

    static async getPaidOrders(req: Request , res: Response){
        try {

            if((req.user! as UserWithId).role !== 'admin'){
                 res.status(403).json({
                    status: 'error',
                    message:'Access Denied'
                });
                
                return
            }

            const order = await adminService.ordersPaid();
            res.status(200).json({
                status: 'success',
                data: order
            });
            
        } catch (error) {
            logger.error('Fetching issue' , error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message: 'Fetching Issue'
            })
        }
    }

    static async getCreatedOrders(req: Request , res: Response){
        try {

            if((req.user! as UserWithId).role !== 'admin'){
                 res.status(403).json({
                    status: 'error',
                    message:'Access Denied'
                });
                return
            }

            const order = await adminService.recentlyCreated();
            res.status(200).json({
                status: 'success',
                data: order
            });
            
        } catch (error) {
            logger.error('Fetching issue' , error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message: 'Fetching Issue'
            })
        }
    }

    static async getDeployedOrders(req: Request , res: Response){
        try {

            if((req.user! as UserWithId).role !== 'admin'){
                 res.status(403).json({
                    status: 'error',
                    message:'Access Denied'
                });
                return
            }

            const order = await adminService.recentlyDeployed();
            res.status(200).json({
                status: 'success',
                data: order
            });
            
        } catch (error) {
            logger.error('Fetching issue' , error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message: 'Fetching Issue'
            })
        }
    }

}