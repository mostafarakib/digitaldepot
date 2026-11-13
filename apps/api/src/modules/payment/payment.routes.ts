import { Router } from 'express';
import { paymentController } from './payment.controller.js';

const paymentRouter = Router();

// SSLCommerz Callbacks & IPN Webhook (Public, URL-encoded & JSON body parsed)
paymentRouter.post('/sslcommerz/success', (req, res, next) =>
  paymentController.handleSuccess(req, res).catch(next),
);

paymentRouter.post('/sslcommerz/fail', (req, res, next) =>
  paymentController.handleFail(req, res).catch(next),
);

paymentRouter.post('/sslcommerz/cancel', (req, res, next) =>
  paymentController.handleCancel(req, res).catch(next),
);

paymentRouter.post('/sslcommerz/ipn', (req, res, next) =>
  paymentController.handleIpn(req, res).catch(next),
);

export default paymentRouter;
