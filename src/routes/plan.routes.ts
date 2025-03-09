import { VPSController } from "../controllers/vps.controller";
import { Router } from "express";
import { protect } from "../middleware/auth.middleware";

const planRouter = Router();

planRouter.get('/plan' , VPSController.getVPSPlans);
planRouter.post('/post', protect, VPSController.postVpsPlan);

export default planRouter;