import { Router } from 'express';
import { VPSOrderController } from '../controllers/vpsOrder.controller';
import { protect } from '../middleware/auth.middleware';

const vpsRouter = Router();

vpsRouter.post('/create', protect, VPSOrderController.createOrder);
vpsRouter.get('/fetch', protect, VPSOrderController.getUserOrders);

export default vpsRouter;