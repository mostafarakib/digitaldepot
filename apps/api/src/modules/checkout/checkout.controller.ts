import type { Request, Response } from 'express';
import { checkoutService } from './checkout.service.js';
import { checkoutValidationSchema } from './checkout.schemas.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import { UnauthorizedError } from '../../lib/errors.js';

export class CheckoutController {
  async validate(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const input = checkoutValidationSchema.parse(req.body);
    const result = await checkoutService.validateCheckout(req.user.id, input);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...result,
        csrfToken,
      },
    });
  }
}

export const checkoutController = new CheckoutController();
