import type { Request, Response, NextFunction } from 'express';
import { reportService } from './report.service.js';
import { reportQuerySchema } from './report.schemas.js';

export class ReportController {
  async getDashboardOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportService.getDashboardOverview();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getSalesReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = reportQuerySchema.parse(req.query);
      const data = await reportService.getSalesReport(query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getFulfillmentReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = reportQuerySchema.parse(req.query);
      const data = await reportService.getFulfillmentReport(query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getInventoryReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = reportQuerySchema.parse(req.query);
      const data = await reportService.getInventoryReport(query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getReturnsReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = reportQuerySchema.parse(req.query);
      const data = await reportService.getReturnsReport(query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const reportController = new ReportController();
