import express , { Request , Response} from  "express";

import router from "./routes/auth.routes";
import adminRouter from "./routes/admin.routes";
import planRouter from "./routes/plan.routes";
import vpsRouter from "./routes/vpsOrder.routes";
import refRouter from "./routes/referral.routes";
import actionRouter from "./routes/contabo.routes";
import paymentRouter from "./routes/payment.routes";
import {ContaboVPSService} from "./services/contabo.service"


import dotenv from 'dotenv';
import { connectDB } from "./config/database.config";
import { configureExpress } from "./config/express.config";
import {logger} from './utils/logger';
import path from 'path';
import overviewRouter from './routes/overview.routes';
import instanceRouter from './routes/instance.routes';
import resetRouter from "./routes/reset.routes";
// Configure dotenv
dotenv.config({ path: path.join(__dirname, '../.env') });


const app = express();

const PORT = 3000;

configureExpress(app);

connectDB();



app.get("/health" , (req: Request , res : Response) => {

    res.status(200).json({
        status: 'ok',
        time: new Date().toISOString()
    })
});



app.use('/api/auth', router);
app.use('/api/vps', planRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/referrals', refRouter);
app.use('/api/orders', vpsRouter);
app.use('/api/order', actionRouter);
app.use('/api/overview', overviewRouter);
app.use('/api/instances', instanceRouter);
app.use('/api/reset', resetRouter);

app.listen(PORT , '0.0.0.0', () => {
    console.log(`Server Running At ${PORT}`);
})