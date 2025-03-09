import { User } from '../models/user.model';

export async function generateReferralCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const codeLength = 8;
    let code = '';
    let isUnique = false;
    
    // Try up to 10 times to generate a unique code
    for (let attempts = 0; attempts < 10; attempts++) {
        // Generate a random code
        code = '';
        for (let i = 0; i < codeLength; i++) {
            const randomIndex = Math.floor(Math.random() * chars.length);
            code += chars[randomIndex];
        }
        
        // Check if this code already exists
        const existingUser = await User.findOne({ referralCode: code });
        if (!existingUser) {
            isUnique = true;
            break;
        }
    }
    
    if (!isUnique) {
        // If we couldn't generate a unique code after multiple attempts,
        // add a timestamp to ensure uniqueness
        const timestamp = Date.now().toString(36);
        code = code.substring(0, codeLength - timestamp.length) + timestamp;
    }
    
    return code;
}