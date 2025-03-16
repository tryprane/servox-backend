import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { AuthService } from '../services/auth.service';
import { ReferralService } from '../services/referral.service';
import { logger } from '../utils/logger';
import {redisClient} from '../config/redis.config';

export class GoogleAuthController {
    /**
     * Handle successful Google authentication and redirect user
     */
    static async handleGoogleCallback(req: Request, res: Response): Promise<void> {
        try {
            // The user profile and token are attached by Passport
            if (!req.user) {
                throw new Error('Authentication failed - no user data');
            }
            
            // Now we know req.user has our token property
            const token = (req.user as any).token;
            
            if (!token) {
                throw new Error('Authentication failed - no token provided');
            }
            
            // Create JWT cookie for authentication
            res.cookie('auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // secure in production
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            console.log(token)
            logger.info(token)
            
            // Redirect to frontend dashboard or home page
            res.redirect(`${process.env.FRONTEND_URL}/login/auth-success?token=${token}`)
        } catch (error) {
            logger.error('Google callback handling error:', error);
            res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed` || '/login?error=authentication_failed');
        }
    }

    /**
     * Process user profile from Google to find or create a user
     */
    static async processGoogleProfile(profile: any, accessToken: string, req: Request): Promise<{ user: any, token: string }> {
        try {
            // Extract profile information
            const email = profile.emails?.[0]?.value;
            const firstName = profile.name?.givenName || profile.displayName.split(' ')[0];
            const lastName = profile.name?.familyName || profile.displayName.split(' ').slice(1).join(' ');
            const googleId = profile.id;
            
            // Find existing user
            const existingUser = await User.findOne({ email });
            
            if (existingUser) {
                // If user exists but googleId not saved, update it
                if (!existingUser.googleId) {
                    existingUser.googleId = googleId;
                    await existingUser.save();
                }
                
                // Generate auth token
                const token = AuthService.generateToken(existingUser.id);
                await redisClient.setex(`session:${existingUser.id}`,
                    86400*7,
                    JSON.stringify({id: existingUser.id, role: existingUser.role})
                );
            
                return { user: existingUser, token };
            }
            
            // Create new user if not found
            const newUser = await User.create({
                email,
                firstName,
                lastName,
                googleId,
                // Generate a random password as Google login won't use passwords
                password: Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12),
            });
            
            // Process referral if available
            if (req.session?.referralCode) {
                await ReferralService.processNewUserReferral(newUser.id, req.session.referralCode);
                // Clear referral code from session
                delete req.session.referralCode;
            }
            
            const token = AuthService.generateToken(newUser.id);

            await redisClient.setex(`session:${newUser.id}`,
                86400*7,
                JSON.stringify({id: newUser.id, role: newUser.role})
            );


            return { user: newUser, token };
        } catch (error) {
            logger.error('Google profile processing error:', error);
            throw error;
        }
    }
}