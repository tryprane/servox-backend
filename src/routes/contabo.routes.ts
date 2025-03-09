import { Router } from 'express';
import { ContaboVPSController } from '../controllers/contabo.controller';
import { protect } from '../middleware/auth.middleware';
const actionRouter = Router();

actionRouter.post('/:instanceId/action', protect, ContaboVPSController.performAction);
actionRouter.get('/:instanceId/usage', protect, ContaboVPSController.getUsage);

export default actionRouter;