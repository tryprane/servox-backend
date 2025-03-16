import express, { Router } from 'express';
import { TerminalController } from '../controllers/terminal.controller';
import { protect } from '../middleware/auth.middleware';

const router: Router = express.Router();

// Apply your protect middleware to the terminal-auth endpoint
router.post('/terminal-auth', protect, TerminalController.createTerminalAuthToken);

export const terminalRoutes = router;