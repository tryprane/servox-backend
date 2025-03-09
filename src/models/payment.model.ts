// src/models/payment.model.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IPayment extends Document {
    orderId: string;
    userId: string;
    amount: number;
    currency: string;
    paymentMethod: 'crypto';
    cryptomusPaymentId?: string;
    status: 'pending' | 'completed' | 'failed' | 'cancelled';
    paymentUrl?: string;
    additionalDetails?: any;
}

const paymentSchema = new Schema({
    orderId: {
        type: String,
        required: true,
        ref: 'VPSOrder'
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD'
    },
    paymentMethod: {
        type: String,
        enum: ['crypto'],
        default: 'crypto'
    },
    cryptomusPaymentId: String,
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },
    paymentUrl: String,
    additionalDetails: Schema.Types.Mixed
}, { 
    timestamps: true 
});

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
