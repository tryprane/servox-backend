import { Request, Response } from 'express';
import { VPSInstanceService } from '../services/instance.service';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/appError';

interface UserWithId {
  id: string;
  role:string;
  [key: string]: any;

}

export class VPSInstanceController {
  static getInstances = catchAsync(async (req: Request, res: Response) => {
    if (!(req.user! as UserWithId).id) {
      throw new AppError('User not authenticated', 401);
    }
    
    const instances = await VPSInstanceService.getUserInstances((req.user! as UserWithId).id);
    res.json(instances);
  });

  static getInstance = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const instance = await VPSInstanceService.getInstance(id);
    res.json(instance);
  });

  static updateInstanceStatus = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { action } = req.params;
    
    if (!['start', 'stop', 'restart'].includes(action)) {
      throw new AppError('Invalid action. Must be start, stop, or restart', 400);
    }

    const success = await VPSInstanceService.updateInstanceStatus(
      id, 
      action as 'start' | 'stop' | 'restart'
    );

    if (success) {
      const updatedInstance = await VPSInstanceService.getInstance(id);
      res.json(updatedInstance);
    } else {
      throw new AppError('Failed to update instance status', 500);
    }
  });

 
}