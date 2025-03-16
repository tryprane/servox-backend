import { VPSOrder } from "../models/vps-order.model";
import { Payment, IPayment } from "../models/payment.model";
import { CryptoClient } from "../config/cryptomus.config";
import { logger } from "../utils/logger";

export class PaymentService{

    private static cryptoClient = new CryptoClient();

    static async initiatePayment(
        orderId: string,
        userId: string,
        amount: number
    ): Promise<IPayment>{
        try{
            // Check if order exists
            const order = await VPSOrder.findOne({
                orderId,
                userId
            });
    
            if(!order){
                throw new Error('Order not found');
            }
            
            // Validate price
            const price: number = order?.amount;
            if(amount != price){
                throw new Error('Price Mismatched');
            }
    
            // Check if there's already a pending payment for this order
            const existingPayment = await Payment.findOne({
                orderId,
                status: 'pending'
            });
    
            // If pending payment exists, return it without creating a new one
            if(existingPayment) {
                logger.info(`Using existing pending payment for order: ${orderId}`);
                return existingPayment;
            }
    
            // If no pending payment exists, create a new one
            const paymentResponse = await this.cryptoClient.createPayment({
                amount: amount,
                currency: 'USD',
                order_id: orderId,
                url_callback:`${process.env.FRONTEND_URL}/api/payments/webhook`,
                url_success: `${process.env.FRONTEND_URL}/dashboard/order-vps/payment/success?orderId=${orderId}`,
                url_failed: `${process.env.FRONTEND_URL}/dashboard/order-vps/payment/failed?orderId=${orderId}`
            });
    
            const payment = await Payment.create({
                orderId,
                userId,
                amount,
                cryptomusPaymentId: paymentResponse.result.uuid,
                status: 'pending',
                paymentUrl: paymentResponse.result.url,
                additionalDetails: paymentResponse
            });
    
            return payment;
        } catch(error){
            logger.error('Payment Initiation Error:' , error);
            throw error;
        }
    }

    static async handleWebhook(payload: any) {
        try {
            // Verify webhook signature
            if (!this.cryptoClient.verifyWebhook( payload)) {
                throw new Error('Invalid webhook signature');
            }

            const { order_id, status, amount } = payload;

            // Find the corresponding payment
            const payment = await Payment.findOne({ orderId: order_id });

            if (!payment) {
                logger.warn(`No payment found for order: ${order_id}`);
                return null;
            }

            // Update payment status
            switch (status) {
                case 'paid':
                    payment.status = 'completed';
                    await this.completeOrder(payment.orderId);
                    break;
                case 'cancel':
                    payment.status = 'cancelled';
                    break;
                case 'expired':
                    payment.status = 'failed';
                    break;
                default:
                    logger.warn(`Unhandled payment status: ${status}`);
            }

            await payment.save();
            return payment;
        } catch (error) {
            logger.error('Webhook handling error:', error);
            throw error;
        }
    }

    private static async completeOrder(orderId: string) {
        const order = await VPSOrder.findOne({ orderId });
        if (order) {
            order.status = 'processing';
            await order.save();
            // You could trigger additional provisioning logic here
        }
    }
}