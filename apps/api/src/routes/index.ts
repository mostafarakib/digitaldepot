import { Router } from 'express';
import healthRouter from './health.js';
import authRouter from '../modules/auth/auth.routes.js';
import accountRouter from '../modules/account/account.routes.js';
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

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/account', accountRouter);

// Public catalogue routes
router.use('/categories', publicCategoryRouter);
router.use('/brands', publicBrandRouter);
router.use('/products', publicProductRouter);

// Admin catalogue management routes
router.use('/admin/categories', adminCategoryRouter);
router.use('/admin/brands', adminBrandRouter);
router.use('/admin/products', adminProductRouter);
router.use('/admin/variants', adminVariantRouter);
router.use('/admin/inventory', adminInventoryRouter);

export default router;
