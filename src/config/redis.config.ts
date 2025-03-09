import { Redis } from "ioredis";
import {logger } from '../utils/logger';
import { error } from "winston";
import dotenv from 'dotenv'

import path from 'path';

// Configure dotenv - Update the path to point to the root .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Remove this debug line after confirming it works
console.log('REDIS_HOST:', process.env.REDIS_HOST);

const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost' ,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3, 
    retryStrategy(times ) {
        const delay = Math.min(times * 50 , 2000);
        return delay;
    }
})

redisClient.on('error' , (error) => {
    logger.error('Redis connection error: ' , error);
});

redisClient.on('connect' , () => {
    logger.info('Redis Connected Succesfully');
});

export {redisClient};