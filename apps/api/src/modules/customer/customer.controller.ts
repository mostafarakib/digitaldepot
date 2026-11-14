import type { Request, Response, NextFunction } from 'express';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import { adminCustomerQuerySchema, updateCustomerStatusSchema } from './customer.schemas.js';
import { customerService } from './customer.service.js';

export class CustomerController {
  /**
   * GET /api/v1/admin/customers
   * Lists customers with search, status/date filters, order count filtering, sorting, and pagination.
   */
  async listCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminCustomerQuerySchema.parse(req.query);
      const result = await customerService.listCustomers(query);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/customers/:id
   * Retrieves comprehensive safe details for a single customer.
   */
  async getCustomerDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id as string;
      const result = await customerService.getCustomerDetail(customerId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/customers/:id/status
   * Updates customer status (ACTIVE or SUSPENDED) with session revocation and CSRF rotation.
   */
  async updateCustomerStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id as string;
      const input = updateCustomerStatusSchema.parse(req.body);
      const actingAdminId = req.user!.id;

      const result = await customerService.updateCustomerStatus(customerId, input, actingAdminId);

      // Rotate CSRF token after state-changing operation
      rotateCsrfToken(res);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const customerController = new CustomerController();
