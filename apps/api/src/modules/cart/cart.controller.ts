import type { Request, Response } from 'express';
import { cartService, type CartIdentifier } from './cart.service.js';
import { addToCartSchema, updateCartItemSchema, estimateShippingSchema } from './cart.schemas.js';
import { applyCouponSchema } from '../coupon/coupon.schemas.js';
import { COOKIE_NAMES, setGuestCartCookie, clearGuestCartCookie } from '../../lib/cookies.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';

export class CartController {
  private getIdentifier(req: Request): CartIdentifier {
    return {
      userId: req.user?.id,
      guestToken: req.cookies?.[COOKIE_NAMES.GUEST_CART],
    };
  }

  async getCart(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);
    const cart = await cartService.getCart(identifier);

    res.json({
      success: true,
      data: cart,
    });
  }

  async addItem(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);
    const input = addToCartSchema.parse(req.body);

    const cart = await cartService.addItem(identifier, input, (rawToken) => {
      setGuestCartCookie(res, rawToken);
    });

    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
    });
  }

  async updateItem(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);
    const itemId = req.params.id as string;
    const input = updateCartItemSchema.parse(req.body);

    const cart = await cartService.updateItem(identifier, itemId, input);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
    });
  }

  async removeItem(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);
    const itemId = req.params.id as string;

    const cart = await cartService.removeItem(identifier, itemId);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
    });
  }

  async applyCoupon(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);
    const input = applyCouponSchema.parse(req.body);

    const cart = await cartService.applyCoupon(identifier, input.code);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
      message: 'Coupon applied successfully',
    });
  }

  async removeCoupon(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);

    const cart = await cartService.removeCoupon(identifier);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
      message: 'Coupon removed successfully',
    });
  }

  async estimateShipping(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);
    const input = estimateShippingSchema.parse(req.body);

    const cart = await cartService.estimateShipping(identifier, input);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
      message: 'Shipping estimate updated',
    });
  }

  async clearShippingEstimate(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);

    const cart = await cartService.clearShippingEstimate(identifier);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
      message: 'Shipping estimate cleared',
    });
  }

  async clearCart(req: Request, res: Response): Promise<void> {
    const identifier = this.getIdentifier(req);

    const cart = await cartService.clearCart(identifier);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
    });
  }

  async mergeCart(req: Request, res: Response): Promise<void> {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const rawGuestToken = req.cookies?.[COOKIE_NAMES.GUEST_CART];
    if (rawGuestToken) {
      await cartService.mergeGuestCart(req.user.id, rawGuestToken);
      clearGuestCartCookie(res);
    }

    const cart = await cartService.getCart({ userId: req.user.id });
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...cart,
        csrfToken,
      },
    });
  }
}

export const cartController = new CartController();
