import mongoose, { Document, Schema, Model } from 'mongoose';
import crypto from 'crypto';

export interface IResetToken extends Document {
    userId: Schema.Types.ObjectId;
    token: string;
    expiresAt: Date;
    isUsed: boolean;
}

// Create an interface for the ResetToken model that includes static methods
interface IResetTokenModel extends Model<IResetToken> {
    generatePasswordResetToken(userId: Schema.Types.ObjectId): Promise<string>;
}

const resetTokenSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    isUsed: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Add TTL index to automatically remove expired tokens
resetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Define the static method on the schema
resetTokenSchema.statics.generatePasswordResetToken = async function(userId: Schema.Types.ObjectId): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration to 1 hour from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
    
    // Remove any existing tokens for this user
    await this.deleteMany({ userId });
    
    // Create new token
    await this.create({
        userId,
        token,
        expiresAt
    });
    
    return token;
};

// Create and export the model with the correct interface
export const ResetToken = mongoose.model<IResetToken, IResetTokenModel>('ResetToken', resetTokenSchema);