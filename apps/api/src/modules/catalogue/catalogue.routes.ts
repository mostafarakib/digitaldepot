import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { categoryController } from './category.controller.js';
import { brandController } from './brand.controller.js';
import { productController } from './product.controller.js';
import { variantController } from './variant.controller.js';
import { imageController } from './image.controller.js';
import { inventoryController } from './inventory.controller.js';

// -------------------------------------------------------------
// Public Routers
// -------------------------------------------------------------

export const publicCategoryRouter = Router();

// Static routes before parameterized routes
// GET /api/v1/categories/tree
publicCategoryRouter.get('/tree', (req, res, next) => {
  categoryController.getPublicTree(req, res).catch(next);
});

// GET /api/v1/categories/:slug
publicCategoryRouter.get('/:slug', (req, res, next) => {
  categoryController.getPublicBySlug(req, res).catch(next);
});

export const publicBrandRouter = Router();

// GET /api/v1/brands
publicBrandRouter.get('/', (req, res, next) => {
  brandController.getPublicBrands(req, res).catch(next);
});

// GET /api/v1/brands/:slug
publicBrandRouter.get('/:slug', (req, res, next) => {
  brandController.getPublicBySlug(req, res).catch(next);
});

export const publicProductRouter = Router();

// GET /api/v1/products
publicProductRouter.get('/', (req, res, next) => {
  productController.getStorefrontListing(req, res).catch(next);
});

// GET /api/v1/products/:slug
publicProductRouter.get('/:slug', (req, res, next) => {
  productController.getStorefrontBySlug(req, res).catch(next);
});

// -------------------------------------------------------------
// Admin Routers
// -------------------------------------------------------------

export const adminCategoryRouter = Router();

// Enforce admin authentication across all admin category operations
adminCategoryRouter.use(authenticate, requireRole('ADMIN'));

// Static routes strictly before parameterized routes
// GET /api/v1/admin/categories/tree
adminCategoryRouter.get('/tree', (req, res, next) => {
  categoryController.getAdminTree(req, res).catch(next);
});

// PATCH /api/v1/admin/categories/reorder
adminCategoryRouter.patch('/reorder', csrfProtection, (req, res, next) => {
  categoryController.reorder(req, res).catch(next);
});

// GET /api/v1/admin/categories
adminCategoryRouter.get('/', (req, res, next) => {
  categoryController.listAdmin(req, res).catch(next);
});

// POST /api/v1/admin/categories
adminCategoryRouter.post('/', csrfProtection, (req, res, next) => {
  categoryController.create(req, res).catch(next);
});

// Parameterized routes
// GET /api/v1/admin/categories/:id
adminCategoryRouter.get('/:id', (req, res, next) => {
  categoryController.getAdminById(req, res).catch(next);
});

// PATCH /api/v1/admin/categories/:id
adminCategoryRouter.patch('/:id', csrfProtection, (req, res, next) => {
  categoryController.update(req, res).catch(next);
});

// DELETE /api/v1/admin/categories/:id
adminCategoryRouter.delete('/:id', csrfProtection, (req, res, next) => {
  categoryController.delete(req, res).catch(next);
});

export const adminBrandRouter = Router();

// Enforce admin authentication across all admin brand operations
adminBrandRouter.use(authenticate, requireRole('ADMIN'));

// GET /api/v1/admin/brands
adminBrandRouter.get('/', (req, res, next) => {
  brandController.listAdmin(req, res).catch(next);
});

// POST /api/v1/admin/brands
adminBrandRouter.post('/', csrfProtection, (req, res, next) => {
  brandController.create(req, res).catch(next);
});

// GET /api/v1/admin/brands/:id
adminBrandRouter.get('/:id', (req, res, next) => {
  brandController.getAdminById(req, res).catch(next);
});

// PATCH /api/v1/admin/brands/:id
adminBrandRouter.patch('/:id', csrfProtection, (req, res, next) => {
  brandController.update(req, res).catch(next);
});

// DELETE /api/v1/admin/brands/:id
adminBrandRouter.delete('/:id', csrfProtection, (req, res, next) => {
  brandController.delete(req, res).catch(next);
});

// -------------------------------------------------------------
// Admin Product & Image Router
// -------------------------------------------------------------

export const adminProductRouter = Router();

adminProductRouter.use(authenticate, requireRole('ADMIN'));

// Image subroutes on product
// PATCH /api/v1/admin/products/:productId/images/reorder (must be before :id routes)
adminProductRouter.patch('/:productId/images/reorder', csrfProtection, (req, res, next) => {
  imageController.reorder(req, res).catch(next);
});

// POST /api/v1/admin/products/:productId/images
adminProductRouter.post('/:productId/images', csrfProtection, (req, res, next) => {
  imageController.add(req, res).catch(next);
});

// PATCH /api/v1/admin/products/:productId/images/:id/primary
adminProductRouter.patch('/:productId/images/:id/primary', csrfProtection, (req, res, next) => {
  imageController.setPrimary(req, res).catch(next);
});

// DELETE /api/v1/admin/products/:productId/images/:id
adminProductRouter.delete('/:productId/images/:id', csrfProtection, (req, res, next) => {
  imageController.delete(req, res).catch(next);
});

// Variant subroutes on product
// GET /api/v1/admin/products/:productId/variants
adminProductRouter.get('/:productId/variants', (req, res, next) => {
  variantController.listByProduct(req, res).catch(next);
});

// POST /api/v1/admin/products/:productId/variants
adminProductRouter.post('/:productId/variants', csrfProtection, (req, res, next) => {
  variantController.create(req, res).catch(next);
});

// Product lifecycle and verification routes
// GET /api/v1/admin/products/:id/check-publish
adminProductRouter.get('/:id/check-publish', (req, res, next) => {
  productController.checkPublication(req, res).catch(next);
});

// POST /api/v1/admin/products/:id/publish
adminProductRouter.post('/:id/publish', csrfProtection, (req, res, next) => {
  productController.publish(req, res).catch(next);
});

// POST /api/v1/admin/products/:id/archive
adminProductRouter.post('/:id/archive', csrfProtection, (req, res, next) => {
  productController.archive(req, res).catch(next);
});

// Product CRUD routes
// GET /api/v1/admin/products
adminProductRouter.get('/', (req, res, next) => {
  productController.listAdmin(req, res).catch(next);
});

// POST /api/v1/admin/products
adminProductRouter.post('/', csrfProtection, (req, res, next) => {
  productController.create(req, res).catch(next);
});

// GET /api/v1/admin/products/:id
adminProductRouter.get('/:id', (req, res, next) => {
  productController.getAdminById(req, res).catch(next);
});

// PATCH /api/v1/admin/products/:id
adminProductRouter.patch('/:id', csrfProtection, (req, res, next) => {
  productController.update(req, res).catch(next);
});

// DELETE /api/v1/admin/products/:id
adminProductRouter.delete('/:id', csrfProtection, (req, res, next) => {
  productController.delete(req, res).catch(next);
});

// -------------------------------------------------------------
// Admin Variant Router (Direct variant operations)
// -------------------------------------------------------------

export const adminVariantRouter = Router();

adminVariantRouter.use(authenticate, requireRole('ADMIN'));

// GET /api/v1/admin/variants/:id/price-history (must be before /:id)
adminVariantRouter.get('/:id/price-history', (req, res, next) => {
  variantController.getPriceHistory(req, res).catch(next);
});

// GET /api/v1/admin/variants/:id
adminVariantRouter.get('/:id', (req, res, next) => {
  variantController.getById(req, res).catch(next);
});

// PATCH /api/v1/admin/variants/:id
adminVariantRouter.patch('/:id', csrfProtection, (req, res, next) => {
  variantController.update(req, res).catch(next);
});

// DELETE /api/v1/admin/variants/:id
adminVariantRouter.delete('/:id', csrfProtection, (req, res, next) => {
  variantController.delete(req, res).catch(next);
});

// -------------------------------------------------------------
// Admin Inventory Router
// -------------------------------------------------------------

export const adminInventoryRouter = Router();

adminInventoryRouter.use(authenticate, requireRole('ADMIN'));

// Static routes strictly before parameterized routes
// GET /api/v1/admin/inventory
adminInventoryRouter.get('/', (req, res, next) => {
  inventoryController.list(req, res).catch(next);
});

// GET /api/v1/admin/inventory/history
adminInventoryRouter.get('/history', (req, res, next) => {
  inventoryController.getGlobalHistory(req, res).catch(next);
});

// POST /api/v1/admin/inventory/adjust
adminInventoryRouter.post('/adjust', csrfProtection, (req, res, next) => {
  inventoryController.adjust(req, res).catch(next);
});

// Parameterized routes
// GET /api/v1/admin/inventory/variant/:variantId/history (static suffix before /variant/:variantId)
adminInventoryRouter.get('/variant/:variantId/history', (req, res, next) => {
  inventoryController.getVariantHistory(req, res).catch(next);
});

// GET /api/v1/admin/inventory/variant/:variantId
adminInventoryRouter.get('/variant/:variantId', (req, res, next) => {
  inventoryController.getByVariantId(req, res).catch(next);
});

// PATCH /api/v1/admin/inventory/variant/:variantId/threshold
adminInventoryRouter.patch('/variant/:variantId/threshold', csrfProtection, (req, res, next) => {
  inventoryController.updateThreshold(req, res).catch(next);
});
