import { Request, Response, NextFunction } from 'express';
import { OverviewService } from '../services/overview.service';
import { AppError } from '../utils/appError';

interface UserWithId {
    id: string;
    role:string;
    [key: string]: any;

  }

export class OverviewController {
    static async getDashboardStats(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req.user! as UserWithId).id;
            if (!userId) {
                throw new AppError('User not authenticated', 401);
            }

            const stats = await OverviewService.getDashboardStats(userId);
            
            res.status(200).json({
                status: 'success',
                data: stats
            });
        } catch (error) {
            next(error);
        }
    }
}