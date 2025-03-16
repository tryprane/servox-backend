import express from 'express';
import passport from 'passport';
import { GoogleAuthController } from '../controllers/google.controller';
import { storeReferralCode } from '../middleware/referral.middleware';

const router = express.Router();

// Store referral code in session if provided
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

export default router;