import express, { Request, Response } from "express";
import passport from "passport";
import cookieParser from "cookie-parser";
import router from "./routes/auth.routes";
import adminRouter from "./routes/admin.routes";
import planRouter from "./routes/plan.routes";
import vpsRouter from "./routes/vpsOrder.routes";
import refRouter from "./routes/referral.routes";
import actionRouter from "./routes/contabo.routes";
import paymentRouter from "./routes/payment.routes";
import googleAuthRouter from "./routes/google.routes"; // Import Google auth routes
import http from 'http';
import WebSocket from 'ws';
import { TerminalController } from "./controllers/terminal.controller";
import dotenv from 'dotenv';
import { connectDB } from "./config/database.config";
import { configureExpress } from "./config/express.config";
import { logger } from './utils/logger';
import path from 'path';
import overviewRouter from './routes/overview.routes';
import instanceRouter from './routes/instance.routes';
import resetRouter from "./routes/reset.routes";
import { terminalRoutes } from "./routes/terminal.routes";
import { configurePassport } from "./middleware/passport.middleware"; // Import passport configuration

// Configure dotenv
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = 3000;

// Configure Express
configureExpress(app);

// Set up cookie parser
app.use(cookieParser());

// Initialize and configure Passport
app.use(passport.initialize());
configurePassport();

// Connect to database
connectDB();

// Initialize SSH services
// initializeSSHServices();

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        time: new Date().toISOString()
    });
});

// API Routes
app.use('/api/auth', router);
app.use('/api/auth', googleAuthRouter); // Add Google auth routes
app.use('/api/ssh', terminalRoutes);
app.use('/api/vps', planRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/referrals', refRouter);
app.use('/api/orders', vpsRouter);
app.use('/api/order', actionRouter);
app.use('/api/overview', overviewRouter);
app.use('/api/instances', instanceRouter);
app.use('/api/reset', resetRouter);

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocket.Server({
    server,
    path: '/api/ssh/connect'
});

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
    TerminalController.handleWebSocketConnection(ws, req);
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Running At ${PORT}`);
    logger.info(`Server started on port ${PORT}`);
});

// Handle graceful shutdown
