import { Router } from "express";
import { adminController } from "../controllers/admin.controller";
import { VPSController } from "../controllers/vps.controller";
import { AuthController } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";



const adminRouter = Router();

adminRouter.patch('/orders/:orderId/deployment', protect, adminController.updateDeploymentDetails);
adminRouter.get('/orders/paid', protect, adminController.getPaidOrders);
adminRouter.get('/orders/created', protect, adminController.getCreatedOrders);
adminRouter.get('/orders/deployed', protect, adminController.getDeployedOrders);

export default adminRouter;