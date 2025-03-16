import mongoose , { Document , Schema} from "mongoose";
import bcrypt from 'bcryptjs';
import { generateReferralCode } from '../utils/referral';

interface IReferralEarning{

    amount: number;
    fromUser: Schema.Types.ObjectId;
    purchaseAmount: number;
    earnedAt: Date;
}


export interface IUser extends Document {

    email : string;
    password : string;
    firstName: string;
    lastName: string;
    referralCode: string;
    googleId?: string;
    referredBy?:Schema.Types.ObjectId;
    referralCount: number;
    referralEarning: IReferralEarning[];
    totalReferralEarning: number;
    role: 'user' | 'admin';
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    comparePassword(candidatePassword : string): Promise <boolean>;

}

const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8,
        select: false
    },
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    referralCode: {
        type: String,
        unique: true,
        
    },
    googleId: {
        type: String,
        sparse: true,
        unique: true
    },

    referredBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    referralCount: {
        type: Number,
        default: 0
    },
    referralEarnings: [{
        amount: Number,
        fromUser: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        purchaseAmount: Number,
        earnedAt: {
            type: Date,
            default: Date.now
        }
    }],
    totalReferralEarnings: {
        type: Number,
        default: 0
    },


    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});
userSchema.pre('save', async function(next) {
    // Skip if referral code already exists
    if (this.referralCode) {
        return next();
    }
    
    // Generate a unique referral code
    this.referralCode = await generateReferralCode();
    next();
});
userSchema.pre('save', function(next) {
    if (this.isModified('referralEarnings')) {
        this.totalReferralEarnings = this.referralEarnings.reduce(
            (sum, earning) => sum + (earning.amount || 0), 
            0
        );
    }
    next();
});


userSchema.pre('save' , async function(next){
    if(!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password , 12);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword , this.password);
}


export const User = mongoose.model<IUser>('User' , userSchema);