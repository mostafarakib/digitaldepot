import type { Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service.js';
import { updateStoreSettingsSchema } from './settings.schemas.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';

export class SettingsController {
  async getPublicSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await settingsService.getPublicStoreSettings();
      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAdminSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await settingsService.getAdminStoreSettings();
      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateAdminSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const input = updateStoreSettingsSchema.parse(req.body);

      const updated = await settingsService.updateStoreSettings(input, adminUserId);

      // Rotate CSRF token after state-changing operation
      rotateCsrfToken(res);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();
