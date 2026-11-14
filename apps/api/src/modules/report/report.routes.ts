import { Router } from 'express';
import { reportController } from './report.controller.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role } from '../../generated/client/client.js';

const router = Router();

// Protect all admin reporting routes
router.use(authenticate, requireRole(Role.ADMIN));

router.get('/overview', (req, res, next) => reportController.getDashboardOverview(req, res, next));
router.get('/sales', (req, res, next) => reportController.getSalesReport(req, res, next));
router.get('/fulfillment', (req, res, next) =>
  reportController.getFulfillmentReport(req, res, next),
);
router.get('/inventory', (req, res, next) => reportController.getInventoryReport(req, res, next));
router.get('/returns', (req, res, next) => reportController.getReturnsReport(req, res, next));

export default router;
