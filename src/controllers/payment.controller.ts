import { Request, Response } from "express";
import { PaymentService } from "../services/payment.service";
import { logger } from "../utils/logger";

export class PaymentController{
    static async initiatePayment(req: Request , res: Response){
        try{

            const { orderId, amount} = req.body;
            const payment = await PaymentService.initiatePayment(
                orderId,
                req.user!.id,
                amount
            );

            res.status(201).json({
                status: 'success',
                data: {
                    paymentUrl:payment.paymentUrl,
                    paymentId: payment.id
                }
            })
        } catch (error ){
            logger.error('Payment Initaition Error:' ,error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message: 'Payment Initaition Error'
            })
        }
    }

    static async handleWebhook(req:Request , res: Response){
        try{
            const signature = req.get('Signature') || '';
            const payload = req.body;

            await PaymentService.handleWebhook(payload, signature);
        } catch (error){
            logger.error('Webhook handling error' , error);
            res.status(400).json({
                status: 'error',
                message: 'Webhook Handeling Error'
            })
        }
    }
}