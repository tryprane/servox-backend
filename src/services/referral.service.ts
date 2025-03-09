import { User , IUser} from "../models/user.model";
import { ReferralTransaction } from "../models/referral-transaction.model";

import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";
import { Schema } from "mongoose";

export class ReferralService{
    private static COMMISSION_RATE = 0.10;


    static async validateReferralCode(referralCode: string): Promise<IUser>{

        const referrer = await User.findOne({referralCode});

        if(!referrer){

            throw new AppError('Invalid referral code' , 400);
        }

        return referrer;
    }




    static async processNewUserReferral(userId: string , referralCode: string):Promise<void>{

        const [user, referrer] = await Promise.all([
            User.findById(userId),
            User.findOne({
                referralCode
            })
        ]);

        if(!user || !referrer) {

            throw new AppError('Invalid User or referral code' , 400);
        }

        user.referredBy = referrer._id as Schema.Types.ObjectId;
        await user.save();

        await User.findByIdAndUpdate(referrer._id, {
            $inc: {referralCount: 1}
        })

        logger.info(`New referral processed: ${referrer.email} referred ${user.email}`);


    }

    static async processReferralCommission(userId: string , purchaseAmount: number):Promise<void>{

        const user = await User.findById(userId).populate('referredBy');
        if (!user || !user.referredBy) return;

        const commissionAmount = this.calculateCommission(purchaseAmount);

        const transaction = await ReferralTransaction.create({
            referrer: user.referredBy,
            referred: user._id,
            purchaseAmount,
            commissionAmount,
            status: 'pending'
        })


        try{
            await User.findByIdAndUpdate(user.referredBy, {
                $push:{
                    referralEarning:{
                        amount: commissionAmount,
                        fromUser: user._id,
                        purchaseAmount
                    }
                },
                inc: {totalReferralEarning: commissionAmount}
            });

            transaction.status = 'completed';
            transaction.processedAt = new Date();
            await transaction.save();

            logger.info(`Referral commission processed: ${commissionAmount} for user ${user.referredBy}`);

           
        } catch(error) {
               transaction.status = 'failed';
               await transaction.save();
               
               logger.error('Failed to process referral commission:' , error);
               throw new AppError('Failed to process referral commsion ' , 500)
            }
    }

    static calculateCommission(amount: number): number {
        return amount * this.COMMISSION_RATE;
    }


    static async getReferralStats(userId: string){
        const user = await User.findById(userId);

        if(!user) {
            throw new AppError('User not Found', 400);
        }

        const referrals = await User.find({referredBy: userId})
        .select('name email createdAt')
        .sort({ createdAt: -1 });

        const transaction = await ReferralTransaction.find({
            referrer: userId,
            status: 'completed'
        }).sort({crearedAt: -1});

        return {
            referraCode : user.referralCode,
            referralCoun: user.referralCount,
            totalEarning: user.totalReferralEarning,
            availableCommission:user.totalReferralEarning,

            referral: referrals.map(r => ({

              name: r.firstName,
              email: r.email,
              joinedAt: r.createdAt,
              status: "active"
            })),

            recentTransaction: transaction.map(t => ({
                amout: t.commissionAmount,
                purchaseAmount: t.purchaseAmount,
                date: t.processedAt
            }))
        }
    }


}  