import mongoose , {Document , Schema} from "mongoose";


export interface IReferralTransaction{

    referrer: Schema.Types.ObjectId;
    referred: Schema.Types.ObjectId;
    purchaseAmount: number;
    commissionAmount: number;
    status: 'pending' | 'completed' | 'failed';
    processedAt?: Date;
}

const referralTransactionSchema = new Schema({
    referrer: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referred: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    purchaseAmount: {
        type: Number,
        required: true
    },
    commissionAmount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    processedAt: {
        type: Date
    }
}, {
    timestamps: true
});

export const ReferralTransaction = mongoose.model<IReferralTransaction>('ReferralTransaction', referralTransactionSchema);

