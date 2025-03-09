import { Router } from 'express';
import { ReferralController } from '../controllers/referral.controller';
import { protect } from '../middleware/auth.middleware';

const refRouter = Router();

refRouter.post('/validate', ReferralController.validateReferralCode);
refRouter.get('/stats', protect, ReferralController.getRefferralStats);

export default refRouter;