import { Request, Response, NextFunction } from 'express';
import { Session } from 'express-session';

// Extend the Express Session type to include our custom properties
declare module 'express-session' {
  interface SessionData {
    referralCode?: string;
  }
}

/**
 * Middleware to store referral code in session if provided in query params
 */
export const storeReferralCode = (req: Request, res: Response, next: NextFunction): void => {
    if (req.query.referralCode) {
        // Initialize the session if it doesn't exist
        // TypeScript knows req.session exists because it's created by the session middleware
        if (req.session) {
            req.session.referralCode = req.query.referralCode as string;
        }
    }
    next();
};