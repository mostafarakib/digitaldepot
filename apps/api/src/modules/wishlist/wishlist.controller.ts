import type { Request, Response } from 'express';
import { wishlistService } from './wishlist.service.js';
import { addToWishlistSchema } from './wishlist.schemas.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import { UnauthorizedError } from '../../lib/errors.js';

export class WishlistController {
  async getWishlist(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }
    const userId = req.user.id;
    const wishlist = await wishlistService.getWishlist(userId);

    res.json({
      success: true,
      data: wishlist,
    });
  }

  async addItem(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }
    const userId = req.user.id;
    const input = addToWishlistSchema.parse(req.body);

    const result = await wishlistService.addToWishlist(userId, input.productId);
    const csrfToken = rotateCsrfToken(res);

    res.status(201).json({
      success: true,
      data: {
        ...result.data,
        csrfToken,
      },
    });
  }

  async removeItem(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }
    const userId = req.user.id;
    const productId = req.params.productId as string;

    const result = await wishlistService.removeFromWishlist(userId, productId);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      message: result.message,
      data: {
        success: true,
        message: result.message,
        csrfToken,
      },
      csrfToken,
    });
  }
}

export const wishlistController = new WishlistController();
