import mongoose, { Schema, Document } from 'mongoose';

export interface IInstanceId extends Document {
    instanceId: string;
    contaboId: string;
    
    timestamp: Date;
}

const instanceIdSchema = new Schema({
    instanceId: { type: String, required: true },
    contaboId: { type: String, required: true },
    
    timestamp: { type: Date, default: Date.now }
});

export const InstanceId = mongoose.model<IInstanceId>('instanceId', instanceIdSchema);