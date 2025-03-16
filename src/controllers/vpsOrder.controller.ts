import { Request, Response } from "express";
import { VPSOrderService } from "../services/vps-order.service";
import {logger} from "../utils/logger";
import { VPSOrder } from "../models/vps-order.model";
interface UserWithId {
    id: string;
    role:string;
    [key: string]: any;

  }
export class VPSOrderController{
    static async createOrder (req: Request , res: Response){
        try{
            const order = await VPSOrderService.createOrder({
                userId: (req.user! as UserWithId).id,
                name: req.body.name,
                planName: req.body.planName,
                configuration: req.body.configuration,
                billingCycle: req.body.billingCycle,
                adminPassword: req.body.adminPassword
            });

            res.status(201).json({
                status:'success',
                data: order
            });
        } catch(error){
            logger.error('Order creation error:' , error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message: 'Order Creation Failed'
            })

        }
    }


    static async getUserOrders(req: Request , res: Response){
        try{
            const orders = await VPSOrderService.getUserOrders((req.user! as UserWithId).id);

            res.status(200).json({
                status: 'success',
                data: orders,
                count: orders.length
            })
        } catch (error ){
            logger.error('Orders retrieval error:' , error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve orders'
            })
        }
    }

    static async getUserOrderById(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;
            const userId = (req.user! as UserWithId).id;
           
            // Find the specific order for this user
            const order = await VPSOrder.findOne({
                orderId: orderId,
                userId: userId
            });
    
            if (!order) {
                res.status(404).json({
                    status: 'error',
                    message: 'Order not found'
                });
                return;
            }
    
            res.status(200).json({
                status: 'success',
                data: order
            });
        } catch (error) {
            logger.error('Order retrieval error:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve order'
            });
        }
    }
}