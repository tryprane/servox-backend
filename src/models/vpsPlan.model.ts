import mongoose , {Document , Schema} from "mongoose";
 


export interface IVPSPlan extends Document {

    name : string;
    description: string;
    price: {
        monthly: number;
        annually: number;

    }
    specs: {
        cpu : number;
        ram : number;
        storage: number;
        bandwidth: number;

    };

    features: string[];
    isPopular: boolean;

}

const vpsPlanSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true, // Ensure each plan has a unique name
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true, // Short description for the plan
        },
        price: {
            monthly: {
                type: Number,
                required: true, // Price for monthly billing
            },
            annually: {
                type: Number,
                required: true, // Price for annual billing
            },
        },
        specs: {
            cpu: { type: Number, required: true }, // Number of CPU cores
            ram: { type: Number, required: true }, // RAM in GB
            storage: { type: Number, required: true }, // Storage in GB
            bandwidth: { type: Number, required: true }, // Bandwidth in TB
        },
        features: {
            type: [String], // Array of feature strings
            required: false,
        },
        isPopular: {
            type: Boolean,
            default: false, // Default to not popular
        },
    },
    {
        timestamps: true, // Automatically add createdAt and updatedAt fields
    }
);

export const VPSPlan = mongoose.model<IVPSPlan>('VPSPlan', vpsPlanSchema);