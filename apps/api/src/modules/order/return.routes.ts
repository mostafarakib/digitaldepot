import { Router } from 'express';
import { authenticate, requireRole, requireVerifiedEmail } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { Role } from '../../generated/client/client.js';
import { returnController } from './return.controller.js';

export const customerReturnRouter = Router();
export const adminReturnRouter = Router();

// Customer return listing
customerReturnRouter.get(
  '/',
  authenticate,
  requireVerifiedEmail,
  returnController.listCustomerReturns.bind(returnController),
);

// Customer return detail by returnNumber
customerReturnRouter.get(
  '/:returnNumber',
  authenticate,
  requireVerifiedEmail,
  returnController.getCustomerReturn.bind(returnController),
);

// Customer return cancellation
customerReturnRouter.post(
  '/:returnNumber/cancel',
  authenticate,
  requireVerifiedEmail,
  csrfProtection,
  returnController.cancelCustomerReturn.bind(returnController),
);

// -------------------------------------------------------------
// Admin Return Management Routes (Phase 7C)
// -------------------------------------------------------------

// List return requests with status, order, and date filters
adminReturnRouter.get(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  returnController.listAdminReturns.bind(returnController),
);

// Admin return detail by returnNumber
adminReturnRouter.get(
  '/:returnNumber',
  authenticate,
  requireRole(Role.ADMIN),
  returnController.getAdminReturn.bind(returnController),
);

// Approve a requested return
adminReturnRouter.post(
  '/:returnNumber/approve',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  returnController.approveReturn.bind(returnController),
);

// Reject a requested return with mandatory reason
adminReturnRouter.post(
  '/:returnNumber/reject',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  returnController.rejectReturn.bind(returnController),
);

// Physically inspect return items and execute atomic restocking
adminReturnRouter.post(
  '/:returnNumber/inspect',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  returnController.inspectReturn.bind(returnController),
);

// -------------------------------------------------------------
// Admin Refund Processing Routes (Phase 7D)
// -------------------------------------------------------------

// Preview calculated refund, capacities, and target payment
adminReturnRouter.get(
  '/:returnNumber/refund-preview',
  authenticate,
  requireRole(Role.ADMIN),
  returnController.getRefundPreview.bind(returnController),
);

// Process authoritative refund (SSLCommerz gateway or COD manual payout)
adminReturnRouter.post(
  '/:returnNumber/refund',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  returnController.processRefund.bind(returnController),
);

// Reconcile in-flight PENDING refund status with gateway
adminReturnRouter.post(
  '/:returnNumber/refund/reconcile',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  returnController.reconcileRefund.bind(returnController),
);

export default customerReturnRouter;
