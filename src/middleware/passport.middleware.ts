import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Request } from 'express';
import { GoogleAuthController } from '../controllers/google.controller';
import { logger } from '../utils/logger';

/**
 * Configure Passport with Google Strategy
 */
export const configurePassport = (): void => {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '',
        passReqToCallback: true
    }, async (req: Request, accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
            // Process user profile to create or retrieve user
            const result = await GoogleAuthController.processGoogleProfile(profile, accessToken, req);

            if (!result || typeof result.user.id !== 'string') {
                return done(new Error('Invalid user data format'), false);
            }
            return done(null, result);
        } catch (error) {
            logger.error('Google authentication error:', error);
            return done(error as Error, false);
        }
    }));
    
    // Serialize user to session
    passport.serializeUser((user: any, done) => {
        // Make sure the user object has the expected structure
        const serializedUser = {
          id: user.user?.id || user.id,
          role: user.user?.role || user.role
        };
        done(null, serializedUser);
      });
    // Deserialize user from session
    passport.deserializeUser((obj, done) => {
        done(null, obj as Express.User);
    });
};