import { VPSOrder } from "../models/vps-order.model";
import { Payment, IPayment } from "../models/payment.model";
import { CryptoClient } from "../config/cryptomus.config";
import { logger } from "../utils/logger";
import axios from "axios";

const PUSHOVER_USER_KEY = 'u5ob32jvrjfoqzqqmvev2v27ehkf3j'; // You'll get this from Pushover
const PUSHOVER_API_TOKEN = 'abte56yuhdcnq2s7e6ds1neuakeqy7';

interface PushoverNotificationParams {
    title: string;
    message: string;
    priority?: number;
    sound?: string;
    retry?: number;
    expire?: number;
}// You'll get this from Pushover

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
            if (!this.cryptoClient.verifyWebhook(payload)) {
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
                    
                    // Send Pushover notification for successful payment
                    await this.sendPushoverNotification({
                        title: 'Payment Received!',
                        message: `Order ${order_id} paid: ${amount}`,
                        priority: 1,
                        sound: 'cashregister', // This will make an alarm sound
                    });
                    break;
                    
                case 'cancel':
                    payment.status = 'cancelled';
                    
                    // Notification for cancelled payment
                    await this.sendPushoverNotification({
                        title: 'Payment Cancelled',
                        message: `Order ${order_id} was cancelled`,
                        priority: 0,
                        sound: 'classical',
                    });
                    break;
                    
                case 'expired':
                    payment.status = 'failed';
                    
                    // Notification for expired payment
                    await this.sendPushoverNotification({
                        title: 'Payment Expired',
                        message: `Order ${order_id} expired`,
                        priority: 0,
                        sound: 'falling',
                    });
                    break;
                    
                default:
                    logger.warn(`Unhandled payment status: ${status}`);
                    
                    // Notification for unhandled status
                    await this.sendPushoverNotification({
                        title: 'Payment Status Update',
                        message: `Order ${order_id} status: ${status}`,
                        priority: -1,
                    });
            }
    
            await payment.save();
            return payment;
        } catch (error) {
            logger.error('Webhook handling error:', error);
            
            // Send error notification
            await this.sendPushoverNotification({
                title: 'Webhook Error',
                message: `Error processing webhook`,
                priority: 2, // Emergency priority
                sound: 'siren', // Loud alarm sound
                retry: 30, // Retry every 30 seconds
                expire: 3600, // Keep trying for 1 hour
            });
            
            throw error;
        }
    }
    
    // Helper method to send Pushover notifications
    static async sendPushoverNotification(params: PushoverNotificationParams) {
        try {
            const notificationData: any = {
                token: PUSHOVER_API_TOKEN,
                user: PUSHOVER_USER_KEY,
                title: params.title,
                message: params.message,
                priority: params.priority || 0,
                sound: params.sound || 'pushover'
            };
            
            // Add retry and expire parameters for emergency priority
            if (params.priority === 2) {
                notificationData.retry = params.retry || 30;
                notificationData.expire = params.expire || 3600;
            }
            
            const response = await axios.post('https://api.pushover.net/1/messages.json', notificationData);
            logger.info(`Pushover notification sent: ${params.title}`);
            return response.data;
        } catch (error) {
            logger.error('Failed to send Pushover notification:', error);
            return null;
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