import { Router } from 'express';
import { authenticate, requireRole, requireVerifiedEmail } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { Role } from '../../generated/client/client.js';
import { orderController } from './order.controller.js';

export const orderRouter = Router();
export const adminOrderRouter = Router();

// Customer order listing with pagination & status filters
orderRouter.get(
  '/',
  authenticate,
  requireVerifiedEmail,
  orderController.listCustomerOrders.bind(orderController),
);

// Customer order details by orderNumber (ownership enforced)
orderRouter.get(
  '/:orderNumber',
  authenticate,
  requireVerifiedEmail,
  orderController.getCustomerOrder.bind(orderController),
);

// Customer order cancellation for eligible orders
orderRouter.post(
  '/:orderNumber/cancel',
  authenticate,
  requireVerifiedEmail,
  csrfProtection,
  orderController.cancelCustomerOrder.bind(orderController),
);

// ---------------- Admin Order Management Routes ----------------

// Admin order listing with search, status & payment filters
adminOrderRouter.get(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  orderController.listAdminOrders.bind(orderController),
);

// Admin order details by id or orderNumber
adminOrderRouter.get(
  '/:id',
  authenticate,
  requireRole(Role.ADMIN),
  orderController.getAdminOrder.bind(orderController),
);

// Advance order status according to state machine
adminOrderRouter.patch(
  '/:id/status',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  orderController.updateAdminOrderStatus.bind(orderController),
);

// Cancel an eligible unpaid order as admin
adminOrderRouter.post(
  '/:id/cancel',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  orderController.cancelAdminOrder.bind(orderController),
);

// Mark COD payment collection as PAID
adminOrderRouter.post(
  '/:id/mark-cod-paid',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  orderController.markAdminCodPaid.bind(orderController),
);

export default orderRouter;
