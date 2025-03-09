import express from 'express';
import { body } from 'express-validator';
import { PasswordResetService } from '../services/passwordReset.service';
import { validateRequest } from '../middleware/validation.middleware';
import { catchAsync } from '../utils/catchAsync';

const resetRouter = express.Router();

// Request password reset
resetRouter.post(
    '/forgot-password',
    [
        body('email')
            .isEmail()
            .withMessage('Please provide a valid email address')
    ],
    validateRequest,
    catchAsync(async (req, res) => {
        const { email } = req.body;
        await PasswordResetService.requestPasswordReset(email);
        
        // Always return success even if email doesn't exist (for security)
        res.status(200).json({
            status: 'success',
            message: 'If that email exists in our system, a password reset link has been sent'
        });
    })
);

// Reset password
resetRouter.post(
    '/reset-password',
    [
        body('token')
            .notEmpty()
            .withMessage('Reset token is required'),
        body('password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters long')
            .matches(/\d/)
            .withMessage('Password must contain at least one number')
    ],
    validateRequest,
    catchAsync(async (req, res) => {
        const { token, password } = req.body;
        
        await PasswordResetService.resetPassword(token, password);
        
        res.status(200).json({
            status: 'success',
            message: 'Password has been reset successfully'
        });
    })
);

export default resetRouter;