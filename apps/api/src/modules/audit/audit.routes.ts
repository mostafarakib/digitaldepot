import { Router } from 'express';
import { auditController } from './audit.controller.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role } from '../../generated/client/client.js';

export const adminAuditRouter = Router();

// Strict RBAC: Admin only, strictly read-only
adminAuditRouter.use(authenticate, requireRole(Role.ADMIN));

adminAuditRouter.get('/actors', (req, res, next) =>
  auditController.listAuditActors(req, res).catch(next),
);

adminAuditRouter.get('/', (req, res, next) => auditController.listAuditLogs(req, res).catch(next));
