import { User } from '../models/user.model';
import { ResetToken } from '../models/reset-token.model';
import { EmailService } from './email.service';
import { redisClient } from '../config/redis.config';
import { AppError } from '../utils/appError';
import { logger } from '../utils/logger';
import { Schema } from 'mongoose';

export class PasswordResetService {
    static async requestPasswordReset(email: string): Promise<void> {
        const user = await User.findOne({ email });

        if (!user) {
            // For security reasons, don't reveal that the email doesn't exist
            // Just return as if the process completed successfully
            logger.info(`Password reset requested for non-existent email: ${email}`);
            return;
        }

        try {
            // Generate password reset token - ensure userId is treated as ObjectId
            const resetToken = await ResetToken.generatePasswordResetToken(
                user._id as unknown as Schema.Types.ObjectId
            );
            
            // Send password reset email
            await EmailService.sendPasswordResetEmail(user.email, resetToken);
            
            logger.info(`Password reset request processed for user: ${user._id}`);
        } catch (error) {
            logger.error(`Error processing password reset request: ${error}`);
            throw new AppError('Failed to process password reset request', 500);
        }
    }

    static async resetPassword(token: string, newPassword: string): Promise<void> {
        // Find the reset token
        const resetToken = await ResetToken.findOne({
            token,
            isUsed: false,
            expiresAt: { $gt: new Date() }
        });

        if (!resetToken) {
            throw new AppError('Invalid or expired reset token', 400);
        }

        // Find the user
        const user = await User.findById(resetToken.userId).select('+password');

        if (!user) {
            throw new AppError('User not found', 404);
        }

        try {
            // Update password
            user.password = newPassword;
            await user.save();

            // Mark token as used
            resetToken.isUsed = true;
            await resetToken.save();

            // Invalidate all sessions for this user for security
            await redisClient.del(`session:${user.id}`);
            
            logger.info(`Password reset successful for user: ${user._id}`);
        } catch (error) {
            logger.error(`Error resetting password: ${error}`);
            throw new AppError('Failed to reset password', 500);
        }
    }
}