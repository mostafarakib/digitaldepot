import { Router } from 'express';
import healthRouter from './health.js';
import authRouter from '../modules/auth/auth.routes.js';
import accountRouter from '../modules/account/account.routes.js';
import cartRouter from '../modules/cart/cart.routes.js';
import wishlistRouter from '../modules/wishlist/wishlist.routes.js';
import checkoutRouter from '../modules/checkout/checkout.routes.js';
import paymentRouter from '../modules/payment/payment.routes.js';
import {
  orderRouter,
  adminOrderRouter,
  customerReturnRouter,
  adminReturnRouter,
} from '../modules/order/index.js';
import { productReviewRouter, adminReviewRouter } from '../modules/review/review.routes.js';
import {
  publicCategoryRouter,
  publicBrandRouter,
  publicProductRouter,
  adminCategoryRouter,
  adminBrandRouter,
  adminProductRouter,
  adminVariantRouter,
  adminInventoryRouter,
} from '../modules/catalogue/catalogue.routes.js';
import { adminCouponRouter } from '../modules/coupon/coupon.routes.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/account', accountRouter);

// Public catalogue routes & reviews
router.use('/categories', publicCategoryRouter);
router.use('/brands', publicBrandRouter);
router.use('/products', productReviewRouter);
router.use('/products', publicProductRouter);

// Shopping cart, Wishlist, Checkout & Orders routes
router.use('/cart', cartRouter);
router.use('/wishlist', wishlistRouter);
router.use('/checkout', checkoutRouter);
router.use('/payments', paymentRouter);
router.use('/orders', orderRouter);
router.use('/customer/returns', customerReturnRouter);

// Admin catalogue management routes
router.use('/admin/categories', adminCategoryRouter);
router.use('/admin/brands', adminBrandRouter);
router.use('/admin/products', adminProductRouter);
router.use('/admin/variants', adminVariantRouter);
router.use('/admin/inventory', adminInventoryRouter);

// Admin promotion, review & order operations routes
router.use('/admin/coupons', adminCouponRouter);
router.use('/admin/reviews', adminReviewRouter);
router.use('/admin/orders', adminOrderRouter);
router.use('/admin/returns', adminReturnRouter);

export default router;
