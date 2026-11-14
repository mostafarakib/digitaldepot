import type { Request, Response } from 'express';
import { paymentService } from './payment.service.js';
import { adminPaymentQuerySchema } from './payment.schemas.js';

export class AdminPaymentController {
  async listPayments(req: Request, res: Response): Promise<void> {
    const query = adminPaymentQuerySchema.parse(req.query);
    const result = await paymentService.listPayments(query);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  async getPaymentDetail(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const result = await paymentService.getPaymentDetail(id);

    res.status(200).json({
      success: true,
      data: result,
    });
  }
}

export const adminPaymentController = new AdminPaymentController();
