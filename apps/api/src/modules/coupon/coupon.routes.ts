import { Router } from 'express';
import { couponController } from './coupon.controller.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';

const router = Router();

// All coupon admin routes require authenticated ADMIN role
router.use(authenticate, requireRole('ADMIN'));

router.get('/', (req, res, next) => {
  couponController.list(req, res).catch(next);
});

router.post('/', csrfProtection, (req, res, next) => {
  couponController.create(req, res).catch(next);
});

router.get('/:id', (req, res, next) => {
  couponController.getById(req, res).catch(next);
});

router.patch('/:id', csrfProtection, (req, res, next) => {
  couponController.update(req, res).catch(next);
});

router.patch('/:id/toggle-active', csrfProtection, (req, res, next) => {
  couponController.toggleActive(req, res).catch(next);
});

router.delete('/:id', csrfProtection, (req, res, next) => {
  couponController.delete(req, res).catch(next);
});

export const adminCouponRouter = router;
