import { Request, Response } from "express";
import { VPSOrderService } from "../services/vps-order.service";
import {logger} from "../utils/logger";


export class VPSOrderController{
    static async createOrder (req: Request , res: Response){
        try{
            const order = await VPSOrderService.createOrder({
                userId: req.user!.id,
                planName: req.body.planName,
                configuration: req.body.configuration,
                billingCycle: req.body.billingCycle
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
            const orders = await VPSOrderService.getUserOrders(req.user!.id);

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
}