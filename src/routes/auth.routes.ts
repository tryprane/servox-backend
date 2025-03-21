import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";
import passport from 'passport';
import { GoogleAuthController } from '../controllers/google.controller';
import { storeReferralCode } from '../middleware/referral.middleware';

const router = Router();

router.use('/google', storeReferralCode);

// Route to initiate Google authentication
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
}));

// Callback route after Google authentication
router.get('/google/callback',
    passport.authenticate('google', { 
        session: false,
        failureRedirect: '/login' 
    }),
    GoogleAuthController.handleGoogleCallback
);

router.post('/register' , AuthController.register);
router.post('/login' , AuthController.login);
router.post('/admin/register', AuthController.adminRegister);
router.post('/logout' , protect , AuthController.logout);
router.get('/me', protect, AuthController.getCurrentUser);

export default router;