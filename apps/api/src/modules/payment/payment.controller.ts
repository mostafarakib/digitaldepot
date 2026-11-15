import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { paymentService } from './payment.service.js';
import {
  sslcommerzSuccessCallbackSchema,
  sslcommerzFailCallbackSchema,
  sslcommerzCancelCallbackSchema,
  sslcommerzIpnCallbackSchema,
} from './payment.schemas.js';

export class PaymentController {
  async handleSuccess(req: Request, res: Response): Promise<void> {
    try {
      const payload = sslcommerzSuccessCallbackSchema.parse(req.body || {});
      const result = await paymentService.handlePaymentSuccess(payload as Record<string, string>);
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', result.orderNumber);
      targetUrl.searchParams.set('status', result.status);
      res.redirect(targetUrl.toString());
    } catch (err) {
      logger.error({ err, body: req.body }, 'Payment success callback error or validation failure');
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      const reportedTranId = typeof req.body?.tran_id === 'string' ? req.body.tran_id : '';
      targetUrl.searchParams.set('orderNumber', reportedTranId);
      targetUrl.searchParams.set('status', 'FAILED');
      targetUrl.searchParams.set(
        'reason',
        err instanceof Error ? err.message : 'Payment verification failed',
      );
      res.redirect(targetUrl.toString());
    }
  }

  async handleFail(req: Request, res: Response): Promise<void> {
    try {
      const payload = sslcommerzFailCallbackSchema.parse(req.body || {});
      const result = await paymentService.handlePaymentFail(payload as Record<string, string>);
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', result.orderNumber);
      targetUrl.searchParams.set('status', 'FAILED');
      if (result.reason) {
        targetUrl.searchParams.set('reason', result.reason);
      }
      res.redirect(targetUrl.toString());
    } catch (err) {
      logger.error({ err, body: req.body }, 'Payment fail callback error or validation failure');
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      const reportedTranId = typeof req.body?.tran_id === 'string' ? req.body.tran_id : '';
      targetUrl.searchParams.set('orderNumber', reportedTranId);
      targetUrl.searchParams.set('status', 'FAILED');
      res.redirect(targetUrl.toString());
    }
  }

  async handleCancel(req: Request, res: Response): Promise<void> {
    try {
      const payload = sslcommerzCancelCallbackSchema.parse(req.body || {});
      const result = await paymentService.handlePaymentCancel(payload as Record<string, string>);
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      targetUrl.searchParams.set('orderNumber', result.orderNumber);
      targetUrl.searchParams.set('status', 'CANCELLED');
      if (result.reason) {
        targetUrl.searchParams.set('reason', result.reason);
      }
      res.redirect(targetUrl.toString());
    } catch (err) {
      logger.error({ err, body: req.body }, 'Payment cancel callback error or validation failure');
      const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
      const reportedTranId = typeof req.body?.tran_id === 'string' ? req.body.tran_id : '';
      targetUrl.searchParams.set('orderNumber', reportedTranId);
      targetUrl.searchParams.set('status', 'CANCELLED');
      res.redirect(targetUrl.toString());
    }
  }

  async handleIpn(req: Request, res: Response): Promise<void> {
    try {
      const payload = sslcommerzIpnCallbackSchema.parse(req.body || {});
      const result = await paymentService.handleIpn(payload as Record<string, string>);
      res.status(200).json({
        success: true,
        message: 'IPN processed successfully',
        data: result,
      });
    } catch (err) {
      logger.error({ err, body: req.body }, 'IPN handling error or validation failure');
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
