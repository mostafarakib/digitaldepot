import type { Request, Response, NextFunction } from 'express';
import { returnService } from './return.service.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import {
  createReturnSchema,
  cancelReturnSchema,
  customerReturnListQuerySchema,
  adminReturnListQuerySchema,
  adminApproveReturnSchema,
  adminRejectReturnSchema,
  adminInspectReturnSchema,
  adminProcessRefundSchema,
} from './return.schemas.js';

export class ReturnController {
  async getReturnEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const orderNumber = req.params.orderNumber as string;

      const eligibility = await returnService.checkCustomerReturnEligibility(userId, orderNumber);

      res.status(200).json({
        success: true,
        data: eligibility,
      });
    } catch (error) {
      next(error);
    }
  }

  async createReturnRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const orderNumber = req.params.orderNumber as string;
      const input = createReturnSchema.parse(req.body);

      const returnRequest = await returnService.createCustomerReturnRequest(
        userId,
        orderNumber,
        input,
      );

      res.status(201).json({
        success: true,
        data: {
          return: returnRequest,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async listCustomerReturns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const query = customerReturnListQuerySchema.parse(req.query);

      const result = await returnService.listCustomerReturns(userId, query);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const returnNumber = req.params.returnNumber as string;

      const returnDetail = await returnService.getCustomerReturnDetail(userId, returnNumber);

      res.status(200).json({
        success: true,
        data: {
          return: returnDetail,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelCustomerReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const returnNumber = req.params.returnNumber as string;
      const input = cancelReturnSchema.parse(req.body ?? {});

      const updatedReturn = await returnService.cancelCustomerReturnRequest(
        userId,
        returnNumber,
        input.reason,
      );

      res.status(200).json({
        success: true,
        data: {
          return: updatedReturn,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async listAdminReturns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminReturnListQuerySchema.parse(req.query);
      const result = await returnService.listAdminReturns(query);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAdminReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const returnNumber = req.params.returnNumber as string;
      const result = await returnService.getAdminReturnDetail(returnNumber);

      res.status(200).json({
        success: true,
        data: {
          return: result,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async approveReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.user!.id;
      const returnNumber = req.params.returnNumber as string;
      const input = adminApproveReturnSchema.parse(req.body ?? {});

      const result = await returnService.approveReturnRequest(adminId, returnNumber, input);

      res.status(200).json({
        success: true,
        data: {
          return: result,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async rejectReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.user!.id;
      const returnNumber = req.params.returnNumber as string;
      const input = adminRejectReturnSchema.parse(req.body);

      const result = await returnService.rejectReturnRequest(adminId, returnNumber, input);

      res.status(200).json({
        success: true,
        data: {
          return: result,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async inspectReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.user!.id;
      const returnNumber = req.params.returnNumber as string;
      const input = adminInspectReturnSchema.parse(req.body);

      const result = await returnService.inspectReturnRequest(adminId, returnNumber, input);

      res.status(200).json({
        success: true,
        data: {
          return: result,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getRefundPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const returnNumber = req.params.returnNumber as string;
      const preview = await returnService.getAdminRefundPreview(returnNumber);

      res.status(200).json({
        success: true,
        data: {
          preview,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async processRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.user!.id;
      const returnNumber = req.params.returnNumber as string;
      const input = adminProcessRefundSchema.parse(req.body ?? {});

      const result = await returnService.processAdminRefund(adminId, returnNumber, input);
      const csrfToken = rotateCsrfToken(res);

      res.status(200).json({
        success: true,
        data: {
          return: result,
        },
        csrfToken,
      });
    } catch (error) {
      next(error);
    }
  }

  async reconcileRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.user!.id;
      const returnNumber = req.params.returnNumber as string;

      const result = await returnService.reconcileAdminRefund(adminId, returnNumber);
      const csrfToken = rotateCsrfToken(res);

      res.status(200).json({
        success: true,
        data: {
          return: result,
        },
        csrfToken,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const returnController = new ReturnController();
