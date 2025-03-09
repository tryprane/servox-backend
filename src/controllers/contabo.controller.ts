import { Request, Response } from 'express';
import { ContaboVPSService } from '../services/contabo.service';
import { catchAsync } from '../utils/catchAsync';

export class ContaboVPSController {
    static performAction = catchAsync(async (req: Request, res: Response) => {
        const { instanceId } = req.params;
        const { action } = req.body;

        if (!['start', 'stop', 'restart'].includes(action)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid action. Must be start, stop, or restart.'
            });
        }

        await ContaboVPSService.performVPSAction(instanceId, action);

        res.status(200).json({
            status: 'success',
            message: `VPS ${action} action initiated`
        });
    });

    static getUsage = catchAsync(async (req: Request, res: Response) => {
        const { instanceId } = req.params;
        const usage = await ContaboVPSService.getVPSUsage(instanceId);

        res.status(200).json({
            status: 'success',
            data: { usage }
        });
    });
}