import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { Role } from '../../generated/client/client.js';
import { customerController } from './customer.controller.js';

export const adminCustomerRouter = Router();

// All customer management endpoints require active ADMIN authentication
adminCustomerRouter.use(authenticate, requireRole(Role.ADMIN));

// Directory list with filtering, searching, and pagination
adminCustomerRouter.get('/', (req, res, next) => {
  customerController.listCustomers(req, res, next).catch(next);
});

// Single customer detail view with order/return history and safe projections
adminCustomerRouter.get('/:id', (req, res, next) => {
  customerController.getCustomerDetail(req, res, next).catch(next);
});

// Update customer account status (ACTIVE or SUSPENDED)
adminCustomerRouter.patch('/:id/status', csrfProtection, (req, res, next) => {
  customerController.updateCustomerStatus(req, res, next).catch(next);
});
