import { Router } from 'express';
import { cartController } from './cart.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';

const router = Router();

// Cart retrieval (supports authenticated customer or guest cookie)
router.get('/', optionalAuthenticate, cartController.getCart.bind(cartController));

// Cart item additions (supports authenticated customer or guest cookie)
router.post(
  '/items',
  optionalAuthenticate,
  csrfProtection,
  cartController.addItem.bind(cartController),
);

// Cart item quantity update
router.patch(
  '/items/:id',
  optionalAuthenticate,
  csrfProtection,
  cartController.updateItem.bind(cartController),
);

// Cart line item deletion
router.delete(
  '/items/:id',
  optionalAuthenticate,
  csrfProtection,
  cartController.removeItem.bind(cartController),
);

// Entire cart clearing
router.delete(
  '/',
  optionalAuthenticate,
  csrfProtection,
  cartController.clearCart.bind(cartController),
);

// Apply coupon to cart (supports authenticated customer or guest cookie)
router.post(
  '/coupon',
  optionalAuthenticate,
  csrfProtection,
  cartController.applyCoupon.bind(cartController),
);

// Remove applied coupon from cart (supports authenticated customer or guest cookie)
router.delete(
  '/coupon',
  optionalAuthenticate,
  csrfProtection,
  cartController.removeCoupon.bind(cartController),
);

// Set or update shipping estimate (supports authenticated customer or guest cookie)
router.post(
  '/shipping-estimate',
  optionalAuthenticate,
  csrfProtection,
  cartController.estimateShipping.bind(cartController),
);

// Clear shipping estimate from cart (supports authenticated customer or guest cookie)
router.delete(
  '/shipping-estimate',
  optionalAuthenticate,
  csrfProtection,
  cartController.clearShippingEstimate.bind(cartController),
);

// Explicit cart merge upon authentication
router.post('/merge', authenticate, csrfProtection, cartController.mergeCart.bind(cartController));

export default router;
