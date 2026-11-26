import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { ServiceUnavailableError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { paymentService } from './payment.service.js';
import {
  sslcommerzSuccessCallbackSchema,
  sslcommerzFailCallbackSchema,
  sslcommerzCancelCallbackSchema,
  sslcommerzIpnCallbackSchema,
} from './payment.schemas.js';

function buildPaymentResultRedirectUrl(params: {
  orderNumber?: string;
  status: 'SUCCESS' | 'LATE_PAYMENT' | 'PENDING' | 'FAILED' | 'CANCELLED';
}): string {
  const targetUrl = new URL(`${env.FRONTEND_URL}/checkout/payment-result`);
  const orderNumber = params.orderNumber?.trim();
  if (orderNumber) {
    targetUrl.searchParams.set('orderNumber', orderNumber);
  }
  targetUrl.searchParams.set('status', params.status);
  return targetUrl.toString();
}

export class PaymentController {
  async handleSuccess(req: Request, res: Response): Promise<void> {
    try {
      const payload = sslcommerzSuccessCallbackSchema.parse(req.body || {});
      const result = await paymentService.handlePaymentSuccess(payload as Record<string, string>);
      res.redirect(
        buildPaymentResultRedirectUrl({
          orderNumber: result.orderNumber,
          status: result.status,
        }),
      );
    } catch (err) {
      logger.error({ err }, 'Payment success callback error or validation failure');
      const isGatewayTimeout =
        err instanceof ServiceUnavailableError && err.code === 'PAYMENT_GATEWAY_TIMEOUT';
      res.redirect(
        buildPaymentResultRedirectUrl({
          status: isGatewayTimeout ? 'PENDING' : 'FAILED',
        }),
      );
    }
  }

  async handleFail(req: Request, res: Response): Promise<void> {
    try {
      const payload = sslcommerzFailCallbackSchema.parse(req.body || {});
      const result = await paymentService.handlePaymentFail(payload as Record<string, string>);
      res.redirect(
        buildPaymentResultRedirectUrl({
          orderNumber: result.orderNumber,
          status: 'FAILED',
        }),
      );
    } catch (err) {
      logger.error({ err }, 'Payment fail callback error or validation failure');
      res.redirect(
        buildPaymentResultRedirectUrl({
          status: 'FAILED',
        }),
      );
    }
  }

  async handleCancel(req: Request, res: Response): Promise<void> {
    try {
      const payload = sslcommerzCancelCallbackSchema.parse(req.body || {});
      const result = await paymentService.handlePaymentCancel(payload as Record<string, string>);
      res.redirect(
        buildPaymentResultRedirectUrl({
          orderNumber: result.orderNumber,
          status: 'CANCELLED',
        }),
      );
    } catch (err) {
      logger.error({ err }, 'Payment cancel callback error or validation failure');
      res.redirect(
        buildPaymentResultRedirectUrl({
          status: 'CANCELLED',
        }),
      );
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
