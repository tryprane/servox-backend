import express from 'express';

import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

export const configureExpress = (app: express.Application): void => {

    app.use(helmet());
    app.use(cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true
    }));

    app.use(mongoSanitize());

    const limiter = rateLimit({
        windowMs: 15 *60 *1000,
        max: 100,
        message: 'TOO Many request from a particular ip'            
    });

    app.use('/api' , limiter);

    app.use(compression());
    app.use(express.json({
        limit: '10kb'
    }));
    app.use(express.urlencoded({
        extended: true,
        limit: '10kb'
    }));

    if (process.env.NODE_ENV === 'development') {
        app.use(morgan('dev'));
    }

}