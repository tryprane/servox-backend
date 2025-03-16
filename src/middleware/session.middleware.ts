import session from 'express-session';
import { Express } from 'express';

/**
 * Configure express-session middleware
 */
export const configureSession = (app: Express): void => {
    app.use(session({
        secret: process.env.SESSION_SECRET || 'your-session-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    }));
};