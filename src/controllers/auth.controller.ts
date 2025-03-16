// import { Request, Response , NextFunction } from "express";
// import { AuthService } from "../services/auth.service";
// import {logger } from "../utils/logger";
// import { AppError } from '../utils/appError';
// import { catchAsync } from '../utils/catchAsync';

// export class AuthController {

//     static async register(req: Request , res: Response){
//         try {
//             const {user, token} = await AuthService.register(req.body);
//             res.status(201).json({
//                 status: 'success',
//                 data : {
//                     user,
//                     token
//                 }
//             })
//         } catch (error) {
//             logger.error('Registration Error' , error);
//             res.status(400).json({
//                 status: 'error',
//                 message: error instanceof Error ? error.message : 'Registration Failed'
//             })
//         }
//     }


//     static async adminRegister (req: Request , res :Response){

//         try{
//             const {admin , token} = await AuthService.adminRegister(req.body);
//             res.status(201).json({
//                 status: 'success' ,
//                 data:{
//                     admin,
//                     token
//                 }
//             })
//         } catch ( error){

//             logger.error('Admin Register Error' , error);
//             res.status(400).json({
//                 status: 'error',
//                 message: error instanceof Error ? error.message : 'Admin Registration Failed'
//             })

//         }
//     }

//     static async login(req: Request, res: Response) {
//         try {
//             const { email, password } = req.body;
//             const { user, token } = await AuthService.login(email, password);
//             res.status(200).json({
//                 status: 'success',
//                 data: {
//                     user,
//                     token
//                 }
//             });
//         } catch (error) {
//             logger.error('Login error:', error);
//             res.status(401).json({
//                 status: 'error',
//                 message: 'Invalid credentials'
//             });
//         }
//     }

//     static async logout(req: Request, res: Response): Promise<void> {
//         try {
//           // Safe access to req.user.id with null check
//           if (req.user && req.user.id) {
//             await AuthService.logout(req.user.id);
            
//             // Clear cookie if you're using one
//             res.clearCookie('auth_token');
            
//             res.status(200).json({
//               success: true,
//               message: 'Logged out successfully'
//             });
//           } else {
//             res.status(401).json({
//               success: false,
//               message: 'Not authenticated'
//             });
//           }
//         } catch (error) {
//           logger.error('Logout error:', error);
//           res.status(500).json({
//             success: false,
//             message: 'Error during logout',
//             error: error instanceof Error ? error.message : 'Unknown error'
//           });
//         }
//       }
//     static getCurrentUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
//         // The user ID is set by the authenticate middleware
//         const userId = req.user?.id;
        
//         if (!userId) {
//             return next(new AppError('Not authenticated', 401));
//         }
        
//         const user = await AuthService.getCurrentUser(userId);
        
//         if (!user) {
//             return next(new AppError('User not found', 404));
//         }
        
//         // Refresh the user's session to extend it
//         await AuthService.refreshSession(userId);
        
//         // Return user data without sensitive information
//         res.status(200).json({
//             id: user._id,
//             email: user.email,
//             firstName: user.firstName,
//             lastName: user.lastName,
//             role: user.role,
//             referralCode: user.referralCode,
//             referralCount: user.referralCount,
//             totalReferralEarning: user.totalReferralEarning,
//             isActive: user.isActive,
//             createdAt: user.createdAt
//         });
//     });


// }

import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { logger } from "../utils/logger";
import { AppError } from '../utils/appError';
import { catchAsync } from '../utils/catchAsync';

// Add interface for your user structure
interface UserWithId {
  id: string;
  [key: string]: any;
}

export class AuthController {

    static async register(req: Request, res: Response) {
        try {
            const {user, token} = await AuthService.register(req.body);
            res.status(201).json({
                status: 'success',
                data : {
                    user,
                    token
                }
            })
        } catch (error) {
            logger.error('Registration Error', error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message : 'Registration Failed'
            })
        }
    }

    static async adminRegister(req: Request, res: Response) {
        try {
            const {admin, token} = await AuthService.adminRegister(req.body);
            res.status(201).json({
                status: 'success',
                data: {
                    admin,
                    token
                }
            })
        } catch (error) {
            logger.error('Admin Register Error', error);
            res.status(400).json({
                status: 'error',
                message: error instanceof Error ? error.message : 'Admin Registration Failed'
            })
        }
    }

    static async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;
            const { user, token } = await AuthService.login(email, password);
            res.status(200).json({
                status: 'success',
                data: {
                    user,
                    token
                }
            });
        } catch (error) {
            logger.error('Login error:', error);
            res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }
    }

    static async logout(req: Request, res: Response): Promise<void> {
        try {
          // Use type assertion to access the id
          if (req.user && (req.user as UserWithId).id) {
            await AuthService.logout((req.user as UserWithId).id);
            
            // Clear cookie if you're using one
            res.clearCookie('auth_token');
            
            res.status(200).json({
              success: true,
              message: 'Logged out successfully'
            });
          } else {
            res.status(401).json({
              success: false,
              message: 'Not authenticated'
            });
          }
        } catch (error) {
          logger.error('Logout error:', error);
          res.status(500).json({
            success: false,
            message: 'Error during logout',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
    }
    
    static getCurrentUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        // Use type assertion for the user ID
        const userId = req.user ? (req.user as UserWithId).id : undefined;
        
        if (!userId) {
            return next(new AppError('Not authenticated', 401));
        }
        
        const user = await AuthService.getCurrentUser(userId);
        
        if (!user) {
            return next(new AppError('User not found', 404));
        }
        
        // Refresh the user's session to extend it
        await AuthService.refreshSession(userId);
        
        // Return user data without sensitive information
        res.status(200).json({
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            referralCode: user.referralCode,
            referralCount: user.referralCount,
            totalReferralEarning: user.totalReferralEarning,
            isActive: user.isActive,
            createdAt: user.createdAt
        });
    });
}