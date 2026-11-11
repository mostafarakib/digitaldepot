import { Router } from 'express';
import { checkoutController } from './checkout.controller.js';
import { authenticate, requireVerifiedEmail } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';

const router = Router();

router.post(
  '/validate',
  authenticate,
  requireVerifiedEmail,
  csrfProtection,
  checkoutController.validate.bind(checkoutController),
);

export default router;
