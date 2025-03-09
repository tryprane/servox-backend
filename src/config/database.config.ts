import mongoose from 'mongoose';
import {logger} from '../utils/logger';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const connectDB = async() : Promise<void> => {

    try {

        const uri = process.env.MONGODB_URI;
        
        if (!uri) {
            throw new Error('MONGODB_URI is not defined in environment variables');
        }

        const conn = await mongoose.connect(uri , {
            maxPoolSize: 100,
            minPoolSize: 10,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,

        });

        logger.info(`MONGO DB connected : ${conn.connection.host}`);
        
    } catch (error) {
        logger.error('Mango DB error :' , error);
        process.exit(1)
    }
}