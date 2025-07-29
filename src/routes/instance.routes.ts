import express from 'express';
import { VPSInstanceController } from '../controllers/instance.controller';
import { protect } from '../middleware/auth.middleware';

const instanceRouter = express.Router();

// All routes require authentication
instanceRouter.use(protect);

// Get all instances for the authenticated user
instanceRouter.get('/instances', VPSInstanceController.getInstances);

// Get specific instance details
instanceRouter.get('/instances/:id', VPSInstanceController.getInstance);

instanceRouter.post('/instances/create', VPSInstanceController.createVPSInstance);

// Update instance status (start/stop/restart)
instanceRouter.post('/instances/:id/:action', VPSInstanceController.updateInstanceStatus);

// Create new instance


export default instanceRouter;