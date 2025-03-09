import axios from 'axios'
import crypto from 'crypto';

export interface CryptoPayment{
    amount: number;
    currency: string;
    order_id: string;
    url_success:string;
    url_failed: string;
}


export class CryptoClient{
    private apiKey: string;
    private merchantId: string;

    constructor(){

        this.apiKey = process.env.CRYPTOMUS_API_KEY || '';
        this.merchantId = process.env.CRYPTOMUS_MECHANT_ID || '';

    }

    private genSignature(params: Record<string , any>): string{

        const signString = Buffer.from(
            JSON.stringify(params)
        ).toString('base64');

        return crypto
              .createHmac('sha256' , this.apiKey)
              .update(signString)
              .digest('hex');
    }

    async createPayment(params: CryptoPayment){

        const requestParams = {
            ... params,
            merchant_id: this.merchantId,
        };

        const signature = this.genSignature(requestParams);

        try{
            const response = await axios.post(
                'https://cryptomus.com/api/v1/payment',
                requestParams,
                {

                    headers: {
                        'Signature': signature,
                        'Content-Type': 'application/json'
                    }

                }
            );

            return response.data;
        } catch(error) {
            console.error('Cryptomus Payment Creation Error:' , error);
            throw error;
        }
    }


    verifyWebhook(signature: string , body: any): boolean{
        const genSign = this.genSignature(body);
        return genSign === signature;
    }
}