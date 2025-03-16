import { Request, Response } from "express";
import { PaymentService } from "../services/payment.service";
import { logger } from "../utils/logger";
interface UserWithId {
    id: string;
    role:string;
    [key: string]: any;

  }

export class PaymentController{
    static async initiatePayment(req: Request , res: Response){
        try{

            const { orderId, amount} = req.body;
            const payment = await PaymentService.initiatePayment(
                orderId,
                (req.user! as UserWithId).id,
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

    static async handleWebhook(req: Request, res: Response) {
        try {
            const payload = req.body;
            // Check for signature in headers (as a fallback)
   
            
            await PaymentService.handleWebhook(payload);
            
            // Return a 200 OK response
            res.status(200).json({
                status: 'success',
                message: 'Webhook processed successfully'
            });
        } catch (error) {
            logger.error('Webhook handling error', error);
            res.status(400).json({
                status: 'error',
                message: 'Webhook Handling Error'
            });
        }
    
}
}