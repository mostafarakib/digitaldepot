import { Router } from 'express';
import { wishlistController } from './wishlist.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';

const router = Router();

router.get('/', authenticate, wishlistController.getWishlist.bind(wishlistController));
router.post('/', authenticate, csrfProtection, wishlistController.addItem.bind(wishlistController));
router.delete(
  '/:productId',
  authenticate,
  csrfProtection,
  wishlistController.removeItem.bind(wishlistController),
);

export default router;
