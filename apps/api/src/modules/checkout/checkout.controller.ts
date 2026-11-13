import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { checkoutService } from './checkout.service.js';
import {
  checkoutValidationSchema,
  checkoutCodInputSchema,
  checkoutOnlineInputSchema,
} from './checkout.schemas.js';
import { orderService } from '../order/order.service.js';
import { sslcommerzService } from '../payment/sslcommerz.service.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import { BadGatewayError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

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

  async submitCod(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const input = checkoutCodInputSchema.parse(req.body);

    const order = await orderService.createOrderCore({
      userId: req.user.id,
      addressId: input.addressId,
      deliveryNotes: input.deliveryNotes ?? undefined,
      alternativePhone: input.alternativePhone ?? undefined,
      paymentMethod: 'COD',
      acknowledgedLivePrices: input.acknowledgedLivePrices,
    });

    const csrfToken = rotateCsrfToken(res);

    res.status(201).json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          merchandiseSubtotal: order.merchandiseSubtotal,
          discountAmount: order.discountAmount,
          shippingFee: order.shippingFee,
          totalPayable: order.totalPayable,
          shippingAddress: {
            recipientName: order.shippingRecipientName,
            phone: order.shippingPhone,
            alternativePhone: order.shippingAlternativePhone,
            divisionId: order.shippingDivisionId,
            districtId: order.shippingDistrictId,
            upazila: order.shippingUpazila,
            streetAddress: order.shippingStreetAddress,
            deliveryNotes: order.shippingDeliveryNotes,
          },
          coupon: order.couponCode
            ? {
                code: order.couponCode,
                discountAmount: order.couponDiscountAmount,
              }
            : null,
          items: order.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            variantTitle: item.variantTitle,
            sku: item.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            attributes: item.attributes,
            thumbnailUrl: item.thumbnailUrl,
          })),
          createdAt: order.createdAt.toISOString(),
        },
        csrfToken,
      },
    });
  }

  async submitOnline(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const input = checkoutOnlineInputSchema.parse(req.body);

    // 1. Transaction: Create Order, reserve stock for 30 minutes, consume coupon, empty cart
    // createOrderCore handles transaction internally and commits before returning
    const order = await orderService.createOrderCore({
      userId: req.user.id,
      addressId: input.addressId,
      deliveryNotes: input.deliveryNotes ?? undefined,
      alternativePhone: input.alternativePhone ?? undefined,
      paymentMethod: 'SSLCOMMERZ',
      acknowledgedLivePrices: input.acknowledgedLivePrices,
    });

    const payment = order.payments[0];

    // 2. Outside Transaction: Call SSLCommerz Session Initiation
    let sessionResult: { gatewayUrl: string; sessionKey: string };
    try {
      sessionResult = await sslcommerzService.initiateSession({
        order,
        payment,
        customerEmail: req.user.email,
      });
    } catch (gatewayErr) {
      // 3. Compensation in a separate transaction if initiation fails
      logger.error(
        { err: gatewayErr, orderId: order.id },
        'SSLCommerz session initiation failed. Triggering compensation.',
      );
      await orderService.compensateOrderInitiationFailure({
        orderId: order.id,
        reason:
          gatewayErr instanceof Error ? gatewayErr.message : 'Gateway session initiation failed',
      });

      throw new BadGatewayError(
        'PAYMENT_INITIATION_FAILED',
        'Failed to initiate payment session with gateway. Please try again.',
      );
    }

    const csrfToken = rotateCsrfToken(res);

    res.status(201).json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          merchandiseSubtotal: order.merchandiseSubtotal,
          discountAmount: order.discountAmount,
          shippingFee: order.shippingFee,
          totalPayable: order.totalPayable,
          shippingAddress: {
            recipientName: order.shippingRecipientName,
            phone: order.shippingPhone,
            alternativePhone: order.shippingAlternativePhone,
            divisionId: order.shippingDivisionId,
            districtId: order.shippingDistrictId,
            upazila: order.shippingUpazila,
            streetAddress: order.shippingStreetAddress,
            deliveryNotes: order.shippingDeliveryNotes,
          },
          coupon: order.couponCode
            ? {
                code: order.couponCode,
                discountAmount: order.couponDiscountAmount,
              }
            : null,
          items: order.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            variantTitle: item.variantTitle,
            sku: item.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            attributes: item.attributes,
            thumbnailUrl: item.thumbnailUrl,
          })),
          createdAt: order.createdAt.toISOString(),
        },
        gatewayUrl: sessionResult.gatewayUrl,
        sessionKey: sessionResult.sessionKey,
        csrfToken,
      },
    });
  }

  async getOrderConfirmation(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const { orderNumber } = req.params;
    if (!orderNumber || typeof orderNumber !== 'string') {
      throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
    }

    // Clarification 2: Query order using both orderNumber and authenticated userId
    const order = await prisma.order.findFirst({
      where: {
        orderNumber,
        userId: req.user.id,
      },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
    }

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          merchandiseSubtotal: order.merchandiseSubtotal,
          discountAmount: order.discountAmount,
          shippingFee: order.shippingFee,
          totalPayable: order.totalPayable,
          shippingAddress: {
            recipientName: order.shippingRecipientName,
            phone: order.shippingPhone,
            alternativePhone: order.shippingAlternativePhone,
            divisionId: order.shippingDivisionId,
            districtId: order.shippingDistrictId,
            upazila: order.shippingUpazila,
            streetAddress: order.shippingStreetAddress,
            deliveryNotes: order.shippingDeliveryNotes,
          },
          coupon: order.couponCode
            ? {
                code: order.couponCode,
                discountAmount: order.couponDiscountAmount,
              }
            : null,
          items: order.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            variantTitle: item.variantTitle,
            sku: item.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            attributes: item.attributes,
            thumbnailUrl: item.thumbnailUrl,
          })),
          payments: order.payments.map((p) => ({
            id: p.id,
            transactionId: p.transactionId,
            method: p.method,
            status: p.status,
            amount: p.amount,
            createdAt: p.createdAt.toISOString(),
          })),
          createdAt: order.createdAt.toISOString(),
        },
      },
    });
  }
}

export const checkoutController = new CheckoutController();
