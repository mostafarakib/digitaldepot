import { Router } from 'express';
import { checkoutController } from './checkout.controller.js';
import { authenticate, requireVerifiedEmail } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { checkoutSubmissionLimiter } from '../../middleware/rate-limiter.js';

const router = Router();

router.post(
  '/validate',
  authenticate,
  requireVerifiedEmail,
  csrfProtection,
  checkoutController.validate.bind(checkoutController),
);

router.post(
  '/cod',
  authenticate,
  requireVerifiedEmail,
  checkoutSubmissionLimiter,
  csrfProtection,
  checkoutController.submitCod.bind(checkoutController),
);

router.post(
  '/online',
  authenticate,
  requireVerifiedEmail,
  checkoutSubmissionLimiter,
  csrfProtection,
  checkoutController.submitOnline.bind(checkoutController),
);

router.get(
  '/orders/:orderNumber/confirmation',
  authenticate,
  requireVerifiedEmail,
  checkoutController.getOrderConfirmation.bind(checkoutController),
);

export default router;
