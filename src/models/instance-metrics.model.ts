import mongoose, { Schema, Document } from 'mongoose';

export interface IInstanceMetrics extends Document {
    instanceId: string;
    userId: string;
    cpuUsage: number;
    ramUsage: number;
    storageUsage: number;
    bandwidthUsage: number;
    status?: 'running' | 'stopped' | 'error';
    timestamp: Date;
}

const instanceMetricsSchema = new Schema({
    instanceId: { type: String, required: true },
    userId: { type: String, required: true },
    cpuUsage: { type: Number, required: true },
    ramUsage: { type: Number, required: true },
    storageUsage: { type: Number, required: true },
    bandwidthUsage: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['running', 'stopped', 'error'],
        default: 'running'
    },
    timestamp: { type: Date, default: Date.now }
});

export const InstanceMetrics = mongoose.model<IInstanceMetrics>('InstanceMetrics', instanceMetricsSchema);