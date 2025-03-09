import { Request, Response } from "express";
import { ReferralService } from "../services/referral.service";
import { catchAsync } from "../utils/catchAsync";


export class ReferralController{

    static validateReferralCode = catchAsync(async (req: Request , res:Response) => {
        const {referraCode}= req.body;

        await ReferralService.validateReferralCode(referraCode);

        res.status(200).json({
            status: 'success',
            message: 'Valid Referral code'
        });
    });

    static getRefferralStats = catchAsync(async (req: Request , res: Response) => {

        try{
            const stats = await ReferralService.getReferralStats(req.user!.id);

            res.status(200).json({

                status: 'succes',
                data : stats
            })
        }catch(error){
            res.status(400).json({
                status: 'error',
                message: 'Error in getting stats'
            })
        }
    })
}