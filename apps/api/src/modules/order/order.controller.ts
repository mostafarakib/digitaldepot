import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import { orderService } from './order.service.js';
import {
  customerOrderQuerySchema,
  cancelCustomerOrderInputSchema,
  adminOrderQuerySchema,
  updateOrderStatusInputSchema,
  cancelAdminOrderInputSchema,
  markCodPaidInputSchema,
} from './order.schemas.js';

export class OrderController {
  /**
   * GET /api/v1/orders
   * Lists authenticated customer's orders with pagination and optional status filter.
   */
  async listCustomerOrders(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const query = customerOrderQuerySchema.parse(req.query);
    const result = await orderService.getCustomerOrders(req.user.id, query);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  /**
   * GET /api/v1/orders/:orderNumber
   * Retrieves order details for authenticated customer by orderNumber.
   * Throws 404 if not found or not owned.
   */
  async getCustomerOrder(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const orderNumber = req.params.orderNumber as string;
    const order = await orderService.getCustomerOrderByNumber(req.user.id, orderNumber);

    res.status(200).json({
      success: true,
      data: { order },
    });
  }

  /**
   * POST /api/v1/orders/:orderNumber/cancel
   * Cancels eligible order for authenticated customer.
   */
  async cancelCustomerOrder(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const orderNumber = req.params.orderNumber as string;
    const input = cancelCustomerOrderInputSchema.parse(req.body);

    const cancelledOrder = await orderService.cancelCustomerOrder(
      req.user.id,
      orderNumber,
      input.reason,
    );

    const csrfToken = rotateCsrfToken(res);

    res.status(200).json({
      success: true,
      data: {
        order: {
          id: cancelledOrder.id,
          orderNumber: cancelledOrder.orderNumber,
          status: cancelledOrder.status,
          paymentStatus: cancelledOrder.paymentStatus,
          cancelledAt: cancelledOrder.cancelledAt ? cancelledOrder.cancelledAt.toISOString() : null,
          cancellationReason: cancelledOrder.cancellationReason,
        },
      },
      csrfToken,
    });
  }

  /**
   * GET /api/v1/admin/orders
   * Lists orders for administrators with pagination, search, status, and payment filters.
   */
  async listAdminOrders(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const query = adminOrderQuerySchema.parse(req.query);
    const result = await orderService.getAdminOrders(query);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  /**
   * GET /api/v1/admin/orders/:id
   * Retrieves full admin order details by ID or orderNumber.
   */
  async getAdminOrder(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const id = req.params.id as string;
    const order = await orderService.getAdminOrderById(id);

    res.status(200).json({
      success: true,
      data: { order },
    });
  }

  /**
   * PATCH /api/v1/admin/orders/:id/status
   * Advances order status according to the approved state machine.
   */
  async updateAdminOrderStatus(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const id = req.params.id as string;
    const input = updateOrderStatusInputSchema.parse(req.body);

    const updatedOrder = await orderService.updateOrderStatus(
      req.user.id,
      id,
      input.status,
      input.reason,
    );

    const csrfToken = rotateCsrfToken(res);

    res.status(200).json({
      success: true,
      data: { order: updatedOrder },
      csrfToken,
    });
  }

  /**
   * POST /api/v1/admin/orders/:id/cancel
   * Cancels an eligible unpaid order as an administrator.
   */
  async cancelAdminOrder(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const id = req.params.id as string;
    const input = cancelAdminOrderInputSchema.parse(req.body);

    const cancelledOrder = await orderService.cancelAdminOrder(req.user.id, id, input.reason);

    const csrfToken = rotateCsrfToken(res);

    res.status(200).json({
      success: true,
      data: { order: cancelledOrder },
      csrfToken,
    });
  }

  /**
   * POST /api/v1/admin/orders/:id/mark-cod-paid
   * Marks COD payment as PAID after the order has been delivered.
   */
  async markAdminCodPaid(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const id = req.params.id as string;
    const input = markCodPaidInputSchema.parse(req.body ?? {});

    const paidOrder = await orderService.markCodPaymentPaid(req.user.id, id, input.note);

    const csrfToken = rotateCsrfToken(res);

    res.status(200).json({
      success: true,
      data: { order: paidOrder },
      csrfToken,
    });
  }
}

export const orderController = new OrderController();
