import { Router } from 'express';
import { adminPaymentController } from './admin-payment.controller.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role } from '../../generated/client/client.js';

export const adminPaymentRouter = Router();

// Strict RBAC: Admin only, strictly read-only
adminPaymentRouter.use(authenticate, requireRole(Role.ADMIN));

adminPaymentRouter.get('/', (req, res, next) =>
  adminPaymentController.listPayments(req, res).catch(next),
);

adminPaymentRouter.get('/:id', (req, res, next) =>
  adminPaymentController.getPaymentDetail(req, res).catch(next),
);
