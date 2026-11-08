import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { accountController } from './account.controller.js';

const router = Router();

// All customer account endpoints require authentication and strictly CUSTOMER role
router.use(authenticate, requireRole('CUSTOMER'));

// Customer Profile Endpoints
// GET /api/v1/account/profile
router.get('/profile', (req, res, next) => {
  accountController.getProfile(req, res).catch(next);
});

// PATCH /api/v1/account/profile
router.patch('/profile', csrfProtection, (req, res, next) => {
  accountController.updateProfile(req, res).catch(next);
});

// Delivery Address Endpoints
// 1. Static geographical hierarchy route registered strictly before dynamic /:id parameter routes
// GET /api/v1/account/addresses/divisions
router.get('/addresses/divisions', (req, res, next) => {
  accountController.getDivisions(req, res).catch(next);
});

// 2. Collection endpoints
// GET /api/v1/account/addresses
router.get('/addresses', (req, res, next) => {
  accountController.getAddresses(req, res).catch(next);
});

// POST /api/v1/account/addresses
router.post('/addresses', csrfProtection, (req, res, next) => {
  accountController.createAddress(req, res).catch(next);
});

// 3. Dynamic parameterized endpoints registered after static routes
// GET /api/v1/account/addresses/:id
router.get('/addresses/:id', (req, res, next) => {
  accountController.getAddressById(req, res).catch(next);
});

// PATCH /api/v1/account/addresses/:id/default
router.patch('/addresses/:id/default', csrfProtection, (req, res, next) => {
  accountController.setDefaultAddress(req, res).catch(next);
});

// PATCH /api/v1/account/addresses/:id
router.patch('/addresses/:id', csrfProtection, (req, res, next) => {
  accountController.updateAddress(req, res).catch(next);
});

// DELETE /api/v1/account/addresses/:id
router.delete('/addresses/:id', csrfProtection, (req, res, next) => {
  accountController.deleteAddress(req, res).catch(next);
});

export default router;
