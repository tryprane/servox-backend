import { Request, Response , NextFunction } from "express";
import jwt from 'jsonwebtoken';
import {redisClient} from '../config/redis.config';
import {logger} from '../utils/logger';

interface JwtPayload{
    id:string;
}


declare global {
    namespace Express {
        interface Request{
            user?:{
                id: string;
                role: string;
            };
        }
    }
}

export const protect = async (req: Request , res: Response, next : NextFunction):Promise<void> => {

try {

    const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            console.log('Chud Gaye');
        }else{
            console.log(JWT_SECRET)
        }

    const token = req.headers.authorization?.replace('Bearer ' , '');
    console.log(token);
    if(!token){
        res.status(401).json({message: 'Please authenticate'});
        return;
    }

    const decoded = jwt.verify(token , process.env.JWT_SECRET!) as JwtPayload;

    const userSession = await redisClient.get(`session:${decoded.id}`);
    if (!userSession) {
        res.status(401).json({ message: 'Session Expired' });
        return;
    }

    req.user = JSON.parse(userSession);
    next();
} catch (error) {

    logger.error('Authentication error: ' , error);
    res.status(401).json({message: 'Please authenticate'});
    
}
}