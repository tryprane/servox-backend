import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { protect } from '../middleware/auth.middleware';

const paymentRouter = Router();

paymentRouter.post('/initiate', protect, PaymentController.initiatePayment);
paymentRouter.post('/webhook', PaymentController.handleWebhook);

export default paymentRouter;