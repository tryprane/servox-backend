import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post('/register' , AuthController.register);
router.post('/login' , AuthController.login);
router.post('/admin/register', AuthController.adminRegister);
router.post('/logout' , protect , AuthController.logout);
router.get('/me', protect, AuthController.getCurrentUser);

export default router;