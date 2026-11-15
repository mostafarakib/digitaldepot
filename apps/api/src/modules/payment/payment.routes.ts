import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { paymentCallbackLimiter } from '../../middleware/rate-limiter.js';

const paymentRouter = Router();

// SSLCommerz Callbacks & IPN Webhook (Public, URL-encoded & JSON body parsed)
paymentRouter.post('/sslcommerz/success', paymentCallbackLimiter, (req, res, next) =>
  paymentController.handleSuccess(req, res).catch(next),
);

paymentRouter.post('/sslcommerz/fail', paymentCallbackLimiter, (req, res, next) =>
  paymentController.handleFail(req, res).catch(next),
);

paymentRouter.post('/sslcommerz/cancel', paymentCallbackLimiter, (req, res, next) =>
  paymentController.handleCancel(req, res).catch(next),
);

paymentRouter.post('/sslcommerz/ipn', paymentCallbackLimiter, (req, res, next) =>
  paymentController.handleIpn(req, res).catch(next),
);

export default paymentRouter;
