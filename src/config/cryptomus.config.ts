import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export interface CryptoPayment {
    amount: number;
    currency: string;
    order_id: string;
    url_callback?: string;
    url_success: string;
    url_failed: string;
}

export class CryptoClient {
    private apiKey: string;
    private merchantId: string;

    constructor() {
        // Check if environment variables are set
        this.apiKey = process.env.CRYPTOMUS_API_KEY || 'mWlVPgYKOM9DcWdJRd16HSyma8mqUl7UCEzSl9UK6lIDddY4rZXdDXTLqTTwuNUbQhU5dbKHXPweOMyGNQ0pk7whwlBL39NdyLBvpfF2yVgXhKQXd0xS0hR0sBoyhNzV';
        this.merchantId = process.env.CRYPTOMUS_MERCHANT_ID || 'e4032f10-9719-47bb-a8c4-4bd014d7fdee';
        
        if (!this.apiKey || !this.merchantId) {
            console.error('CRYPTOMUS_API_KEY or CRYPTOMUS_MERCHANT_ID is not set in environment variables');
        }
    }

    async createPayment(params: CryptoPayment) {
        try {
            // Convert amount to string if it's a number
            const payload = {
                ...params,
                amount: typeof params.amount === 'number' ? params.amount.toString() : params.amount
            };
            
            console.log("Payload:", JSON.stringify(payload));
            
            // Convert payload to JSON string
            const jsonPayload = JSON.stringify(payload);
            
            // Encode JSON as base64
            const base64Payload = Buffer.from(jsonPayload).toString('base64');
            
            // Generate signature using MD5 hash of (base64Payload + apiKey)
            const sign = crypto
                .createHash('md5')
                .update(base64Payload + this.apiKey)
                .digest('hex');
            
            console.log("Generated sign:", sign);
            
            // Make the API request
            const response = await axios.post(
                'https://api.cryptomus.com/v1/payment',
                payload,
                {
                    headers: {
                        'merchant': this.merchantId,
                        'sign': sign,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            return response.data;
        } catch (error) {
            console.error('Cryptomus Payment Creation Error:');
            if (axios.isAxiosError(error) && error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                console.error('Request headers:', error.config?.headers);
            }
            throw error;
        }
    }

    verifyWebhook(payload: any): boolean {
     
        // Extract the sign from the payload or use the header signature
        const payloadSignature = payload.sign || '';
        const signature = payloadSignature;
        
        if (!signature) {
            logger.warn('No signature found in payload or headers');
            return false;
        }
        
        // Create a copy of the payload without the sign
        const payloadWithoutSign = { ...payload };
        delete payloadWithoutSign.sign;
        
        // Convert to JSON string with pretty printing (2 space indentation)
        const jsonBody = JSON.stringify(payloadWithoutSign);
        
        // Encode as base64
        const base64Body = Buffer.from(jsonBody).toString('base64');
        
        // Calculate MD5 hash
        const calculatedSign = crypto
            .createHash('md5')
            .update(base64Body + this.apiKey)
            .digest('hex');
        
        // Compare the calculated signature with the received one
        const isValid = calculatedSign === signature;
        
        if (!isValid) {
            logger.warn('Signature verification failed', {
                calculated: calculatedSign,
                received: signature  // This should just be the signature string
            });
        }
        
        return isValid;
    }
}