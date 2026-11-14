import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { Role } from '../../generated/client/client.js';
import { settingsController } from './settings.controller.js';

export const publicSettingsRouter = Router();
export const adminSettingsRouter = Router();

// Public store settings
publicSettingsRouter.get('/', settingsController.getPublicSettings.bind(settingsController));

// Admin store settings management
adminSettingsRouter.get(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  settingsController.getAdminSettings.bind(settingsController),
);

adminSettingsRouter.put(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  settingsController.updateAdminSettings.bind(settingsController),
);
