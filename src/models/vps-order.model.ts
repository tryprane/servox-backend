import mongoose, { Document, Schema } from "mongoose";
import { IVPSPlan } from "./vpsPlan.model";

export interface IVPSOrder extends Document {
  orderId: string;
  userId: string;
  plan: {
    planId: string;
    name: string;
    specs: {
      cpu: number;
      ram: number;
      storage: number;
      bandwidth: number;
    };

    price: {
      monthly: number;
      annually: number;
    };
  };

  configuration: {
    operatingSystem: {
      name: string;
      version: string;
    };
    datacenter?: string;
    additionalIPs?: number;
  };

  status: "pending" | "processing" | "deployed" | "failed" | "cancelled";

  deployment?: {
    hostname?: string;
    ipAddress?: string | undefined;
    adminPassword?: string;
    deployedAt?: Date;
  };

  billingCycle: 'monthly' | 'annually';
    
  // Additional Metadata
  notes?: string;
  amount:number;
  renewalDate?: Date;
  createdAt: Date;
  updatedAt: Date;

  updateDeploymentDetails(
    this: IVPSOrder, 
    details: { 
        hostname?: string, 
        ipAddress?: string, 
        adminPassword?: string 
    }
): void;
}


const vpsOrderSchema = new Schema ({
    orderId: {
        type: String,
        required: true,
        unique: true,
        default: () => {
            return `VPS-${Date.now().toString(36).toUpperCase()}`
        }
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true

    },
    plan: {
        planId: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        specs: {
            cpu: { 
                type: Number, 
                required: true 
            },
            ram: { 
                type: Number, 
                required: true 
            },
            storage: { 
                type: Number, 
                required: true 
            },
            bandwidth: { 
                type: Number, 
                required: true 
            }
        },
        price: {
            monthly: {
                type: Number,
                required: true
            },
            annually: {
                type: Number,
                required: true
            }
        }
    },
    configuration: {
        operatingSystem: {
            name: {
                type: String,
                required: true,
                enum: [
                    'Ubuntu',
                    'CentOS',
                    'Debian',
                    'Windows Server',
                    'AlmaLinux'
                ]
            },

            version: {
                type: String,
                required: true
            }
        },

        dataCenter: {
            type: String,
            enum: [
                'US-East',
                'US-West',
                'EU-Central',
                'EU-West',
                'Asia-Pacific'
            ]
        },
        additionalIPs: {
            type: Number,
            default: 0,
            max: 5
        }
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'deployed', 'failed', 'cancelled'],
        default: 'pending'
    },
    deployment: {
        hostname: {
            type: String,
            unique: true,
            sparse: true
        },
        ipAddress: {
            type: String,
            unique: true,
            sparse: true
        },
        adminPassword: {
            type: String
        },
        deployedAt: Date
    },
    billingCycle: {
        type: String,
        enum: ['monthly' , 'annually'],
        default: 'monthly'
    },
    notes: String,
    amount: {

        type: Number,
        required: true,
        default: 0

    },
    renewalDate: {
        type:Date
    }
} , {
    timestamps: true
}
);


vpsOrderSchema.pre('save' , function(next){
    if(this.isNew){
        const renewalMonths = this.billingCycle === 'monthly' ? 1 : 12;
        this.renewalDate = new Date(Date.now() + renewalMonths * 30 * 24 * 60 *60 * 1000);
    }

    next();
})


vpsOrderSchema.methods.updateDeploymentDetails = function(
    this: IVPSOrder,
    details: {
        hostname?: string,
        ipAddress?: string,
        adminPassword?: string
    }
){
    if(details.hostname) this.deployment!.hostname = details.hostname;
    if(details.ipAddress) this.deployment!.ipAddress = details.ipAddress;
    if(details.adminPassword) this.deployment!.adminPassword = details.adminPassword;

    this.deployment!.deployedAt = new Date();
    this.status = 'deployed';
}


export const VPSOrder = mongoose.model<IVPSOrder>('VPSOrder' , vpsOrderSchema);