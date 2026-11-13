import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { paymentService } from './payment.service.js';

export class PaymentController {
  async handleSuccess(req: Request, res: Response): Promise<void> {
    const payload = (req.body || {}) as Record<string, string>;
    try {
      const result = await paymentService.handlePaymentSuccess(payload);
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', result.orderNumber);
      targetUrl.searchParams.set('status', result.status);
      res.redirect(targetUrl.toString());
    } catch (err) {
      logger.error({ err, payload }, 'Payment success callback error');
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', payload.tran_id || '');
      targetUrl.searchParams.set('status', 'FAILED');
      targetUrl.searchParams.set(
        'reason',
        err instanceof Error ? err.message : 'Payment verification failed',
      );
      res.redirect(targetUrl.toString());
    }
  }

  async handleFail(req: Request, res: Response): Promise<void> {
    const payload = (req.body || {}) as Record<string, string>;
    try {
      const result = await paymentService.handlePaymentFail(payload);
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', result.orderNumber);
      targetUrl.searchParams.set('status', 'FAILED');
      if (result.reason) {
        targetUrl.searchParams.set('reason', result.reason);
      }
      res.redirect(targetUrl.toString());
    } catch (err) {
      logger.error({ err, payload }, 'Payment fail callback error');
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', payload.tran_id || '');
      targetUrl.searchParams.set('status', 'FAILED');
      res.redirect(targetUrl.toString());
    }
  }

  async handleCancel(req: Request, res: Response): Promise<void> {
    const payload = (req.body || {}) as Record<string, string>;
    try {
      const result = await paymentService.handlePaymentCancel(payload);
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', result.orderNumber);
      targetUrl.searchParams.set('status', 'CANCELLED');
      if (result.reason) {
        targetUrl.searchParams.set('reason', result.reason);
      }
      res.redirect(targetUrl.toString());
    } catch (err) {
      logger.error({ err, payload }, 'Payment cancel callback error');
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', payload.tran_id || '');
      targetUrl.searchParams.set('status', 'CANCELLED');
      res.redirect(targetUrl.toString());
    }
  }

  async handleIpn(req: Request, res: Response): Promise<void> {
    const payload = (req.body || {}) as Record<string, string>;
    try {
      const result = await paymentService.handleIpn(payload);
      res.status(200).json({
        success: true,
        message: 'IPN processed successfully',
        data: result,
      });
    } catch (err) {
      logger.error({ err, payload }, 'IPN handling error');
      res.status(400).json({
        success: false,
        error: {
          code: 'IPN_PROCESSING_FAILED',
          message: err instanceof Error ? err.message : 'IPN processing failed',
        },
      });
    }
  }
}

export const paymentController = new PaymentController();
