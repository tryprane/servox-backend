import jwt from 'jsonwebtoken';
import {User , IUser} from '../models/user.model';
import {redisClient} from '../config/redis.config';
import {logger} from '../utils/logger';
import { ReferralService } from './referral.service';



interface admin {
    email: string;
    password:string;
    firstName: string;
    lastName:string;
    role: string;
}

export class AuthService {
    static generateToken (userId: string):string{

        const JWT_SECRET = process.env.JWT_SECRET;
        
        if (!JWT_SECRET) {
            console.log('Chud Gaye');
        }
        return jwt.sign(
            { id: userId },
            process.env.JWT_SECRET || 'fallback-secret',
            {
                expiresIn: '7d' // 7 days in seconds
            }
        );
    }

    static async register(userData:{
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        referralCode?: string;  // This should be the referring user's code
    }): Promise<{user: IUser; token: string}> {
        
        // Remove referralCode from userData to prevent it from becoming the new user's code
        const { referralCode, ...userDataWithoutReferralCode } = userData;
        
        // Create user without setting the referral relationship yet
        const user = await User.create(userDataWithoutReferralCode);
        const token = this.generateToken(user.id);
    
        // Process the referral separately
        if(referralCode){
            await ReferralService.processNewUserReferral(user.id, referralCode);
        }
    
        // Rest of your code
        await redisClient.setex(`session:${user.id}`,
            86400*7,
            JSON.stringify({id: user.id, role: user.role})
        );
    
        return {user, token};
    }
    static async processReferral(userId: string, referralCode: string): Promise<void> {
        await ReferralService.processNewUserReferral(userId, referralCode);
    }

    static async adminRegister (adminData:admin): Promise<{admin: IUser; token: string}>{

        const admin = await User.create(adminData);
        const token  = this.generateToken(admin.id);

        await redisClient.setex(`session:${admin.id}`,
            86400*7,
            JSON.stringify({id: admin.id , role: admin.role})
        )

        return { admin , token};
    }


    static async login(email:string , password:string): Promise<{user: IUser; token : string}> {

        const user = await User.findOne({email}).select('+password');

        if(!user || !(await user.comparePassword(password))){
            throw new Error('Invalid Crendentials');
        }

        const token = this.generateToken(user.id);

        await redisClient.setex(`session:${user.id}`,
            86400 * 7,
            JSON.stringify({id: user.id , role: user.role})
        );

        return {user , token};
    }


    static async logout(userId: string): Promise<void>{
        await redisClient.del(`session:${userId}`);
    }

    static async getCurrentUser(userId: string): Promise<IUser | null> {
        try {
            // Check if session exists
            const sessionKey = `session:${userId}`;
            const session = await redisClient.get(sessionKey);
            
            if (!session) {
                return null;
            }
            
            // Find user in database
            const user = await User.findById(userId);
            
            if (!user) {
                await redisClient.del(sessionKey); // Clean up orphaned session
                return null;
            }
            
            return user;
        } catch (error) {
            logger.error('Error getting current user:', error);
            throw error;
        }
    }

    /**
     * Refresh the user's session
     * @param userId The ID of the user whose session to refresh
     * @returns True if successful, false otherwise
     */
    static async refreshSession(userId: string): Promise<boolean> {
        try {
            const sessionKey = `session:${userId}`;
            const session = await redisClient.get(sessionKey);
            
            if (!session) {
                return false;
            }
            
            // Extend session TTL for another 7 days
            await redisClient.expire(sessionKey, 86400 * 7);
            return true;
        } catch (error) {
            logger.error('Error refreshing session:', error);
            return false;
        }
    }

    /**
     * Verify if a token is valid without checking Redis
     * @param token JWT token to verify
     * @returns User ID if valid, null otherwise
     */
    static verifyToken(token: string): string | null {
        try {
            const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
            const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
            return decoded.id;
        } catch (error) {
            return null;
        }
    }
}