import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User, IUser } from '../models/user.model';
import { AuthService } from './auth.service';
import { redisClient } from '../config/redis.config';
import { logger } from '../utils/logger';

export class GoogleAuthService {
    static initialize(): void {
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            callbackURL: process.env.GOOGLE_CALLBACK_URL || '',
            passReqToCallback: true
        }, async (req, accessToken, refreshToken, profile, done) => {
            try {
                // Find existing user or create new one
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
            
            // Store session in Redis
            await redisClient.setex(
                `session:${existingUser.id}`,
                86400 * 7,
                JSON.stringify({ id: existingUser.id, role: existingUser.role })
            );
            
            // Create a plain object with the data Passport expects
            const userObject = {
                id: existingUser.id,
                email: existingUser.email,
                firstName: existingUser.firstName,
                lastName: existingUser.lastName,
                role: existingUser.role,
                token: token
            };
            
            return userObject;
        }
                
                // Create new user
                const newUser = await User.create({
                    email: profile.emails?.[0]?.value,
                    firstName: profile.name?.givenName || profile.displayName.split(' ')[0],
                    lastName: profile.name?.familyName || profile.displayName.split(' ').slice(1).join(' '),
                    // Generate a random password as Google login won't use passwords
                    password: Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12),
                    // Process referral if it exists in the session
                    referralCode: req.session?.referralCode
                });
                
                // Process referral if available
                if (req.session?.referralCode) {
                    await AuthService.processReferral(newUser.id, req.session.referralCode);
                    // Clear referral code from session
                    delete req.session.referralCode;
                }
                
                const token = AuthService.generateToken(newUser.id);
                
                // Store session in Redis
                await redisClient.setex(
                    `session:${newUser.id}`,
                    86400 * 7,
                    JSON.stringify({ id: newUser.id, role: newUser.role })
                );
                
                const userObject = {
                    id: newUser.id,
                    email: newUser.email,
                    firstName: newUser.firstName,
                    lastName: newUser.lastName,
                    role: newUser.role,
                    token: token
                };
                
                return userObject;
            } catch (error) {
                logger.error('Google authentication error:', error);
                return done(error as Error, false);
            }
        }));
        
        // Serialize user to session
        passport.serializeUser((user, done) => {
            done(null, user);
        });
        
        // Deserialize user from session
        passport.deserializeUser((obj, done) => {
            done(null, obj as Express.User);
        });
    }
}