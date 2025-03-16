// types/express.d.ts
declare namespace Express {
    export interface User {
      id: string;
      role?: string;
      // Add any other properties needed for Google auth
      googleId?: string;
      accessToken?: string;
    }
  
    export interface Request {
      user?: User;
    }
  }

  // Add this to a declarations file (e.g., types.d.ts)
import 'node-ssh';

declare module 'node-ssh' {
  interface SSHExecCommandOptions {
    timeout?: number;
    execOptions?: {
      timeout?: number;
      [key: string]: any;
    };
  }
}