import express from 'express';
import { OverviewController } from '../controllers/overview.controller';
import { protect } from '../middleware/auth.middleware';

const overviewRouter = express.Router();

overviewRouter.use(protect); // Protect all overview routes

overviewRouter.get('/stats', OverviewController.getDashboardStats);

export default overviewRouter;