import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export class ContaboAPI {
    private static BASE_URL = 'https://api.contabo.com/v1';
    private static cachedClient: AxiosInstance | null = null;
    private static tokenExpiryTime: number = 0;
    private static tokenRefreshInProgress: boolean = false;
    private static tokenRefreshPromise: Promise<AxiosInstance> | null = null;
    
    static async getAuthenticatedClient(): Promise<AxiosInstance> {
        const currentTime = Date.now();
        
        // If we have a cached client and the token is not expired, return it
        if (this.cachedClient && currentTime < this.tokenExpiryTime) {
            return this.cachedClient;
        }
        
        // If a token refresh is already in progress, wait for it to complete
        if (this.tokenRefreshInProgress && this.tokenRefreshPromise) {
            return this.tokenRefreshPromise;
        }
        
        // Start a new token refresh
        this.tokenRefreshInProgress = true;
        this.tokenRefreshPromise = this.createAuthenticatedClient();
        
        try {
            const client = await this.tokenRefreshPromise;
            this.cachedClient = client;
            return client;
        } finally {
            this.tokenRefreshInProgress = false;
            this.tokenRefreshPromise = null;
        }
    }
    
    private static async createAuthenticatedClient(): Promise<AxiosInstance> {
        const tokenData = await this.getAuthToken();
        
        // Calculate token expiry time (subtract 5 minutes as a safety margin)
        this.tokenExpiryTime = Date.now() + (tokenData.expiresIn * 1000) - (5 * 60 * 1000);
        
        return axios.create({
            baseURL: this.BASE_URL,
            headers: {
                'Authorization': `Bearer ${tokenData.accessToken}`,
                'Content-Type': 'application/json',
                'x-request-id': uuidv4()
            }
        });
    }
    
    private static async getAuthToken(): Promise<{ accessToken: string, expiresIn: number }> {
        try {
            const formData = new URLSearchParams({
                'grant_type': 'password',
                'client_id': process.env.CONTABO_CLIENT_ID!,
                'client_secret': process.env.CONTABO_CLIENT_SECRET!,
                'username': process.env.CONTABO_API_USER!,
                'password': process.env.CONTABO_API_PASSWORD!
            });
            
            const response = await axios.post(
                'https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token',
                formData.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            
            return {
                accessToken: response.data.access_token,
                expiresIn: response.data.expires_in
            };
        } catch (error: unknown) {
            if (axios.isAxiosError(error) && error.response) {
                console.error('Contabo authentication error details:', 
                    JSON.stringify(error.response.data, null, 2));
                throw new Error(`Contabo authentication failed: ${
                    error.response.data?.error_description || error.message}`);
            } else {
                console.error('Contabo authentication error:', error);
                throw new Error('Contabo authentication failed: Unknown error');
            }
        }
    }
    
    // Helper method to generate a new request ID for each API call
    static generateRequestId(): string {
        return uuidv4();
    }
}