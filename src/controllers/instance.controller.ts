import { Request, Response } from 'express';
import { VPSInstanceService } from '../services/instance.service';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/appError';
import { ContaboVPSService } from '../services/contabo.service';
import { logger } from '../utils/logger';

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

  static async createVPSInstance(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const { 
        displayName, 
        productId, 
        imageId, 
        region, 
        period, 
        sshKeys, 
        rootPassword, 
        userData, 
        defaultUser, 
        license,
        addOns,
        applicationId
      } = req.body;
      
      // Check for required fields according to the API documentation
      if (!productId) {
        res.status(400).json({
          success: false,
          message: 'Missing required parameter: productId',
          requiredFields: ['productId']
        });
        return;
      }
      
      // Optional field validation
      if (period && (typeof period !== 'number' || ![1, 3, 6, 12].includes(period))) {
        res.status(400).json({
          success: false,
          message: 'Period must be one of: 1, 3, 6, or 12 months'
        });
        return;
      }
      
      if (displayName && typeof displayName === 'string' && displayName.length > 255) {
        res.status(400).json({
          success: false,
          message: 'displayName must be 255 characters or less'
        });
        return;
      }
      
      if (defaultUser && !['root', 'admin', 'administrator'].includes(defaultUser)) {
        res.status(400).json({
          success: false,
          message: 'defaultUser must be one of: root, admin, or administrator'
        });
        return;
      }
      
      if (sshKeys && !Array.isArray(sshKeys)) {
        res.status(400).json({
          success: false,
          message: 'sshKeys must be an array of numbers'
        });
        return;
      }
      
      // Call the service to create VPS instance
      const result = await ContaboVPSService.createVPSInstance({
        displayName,
        productId,
        imageId,
        region,
        period,
        sshKeys,
        rootPassword,
        userData,
        defaultUser: defaultUser as 'root' | 'admin' | 'administrator',
        license,
        addOns,
        applicationId
      });
      
      // Return success response with instanceId
      res.status(201).json({
        success: true,
        message: 'VPS instance created successfully',
        data: result
      });
      
    } catch (error) {
      logger.error('Error in createVPSInstance controller:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create VPS instance'
      });
    }
  }
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