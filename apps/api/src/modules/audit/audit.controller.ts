import type { Request, Response } from 'express';
import { auditService } from './audit.service.js';
import { adminAuditQuerySchema } from './audit.schemas.js';

export class AuditController {
  async listAuditLogs(req: Request, res: Response): Promise<void> {
    const query = adminAuditQuerySchema.parse(req.query);
    const result = await auditService.listAuditLogs(query);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  async listAuditActors(_req: Request, res: Response): Promise<void> {
    const actors = await auditService.listAuditActors();

    res.status(200).json({
      success: true,
      data: { actors },
    });
  }
}

export const auditController = new AuditController();
