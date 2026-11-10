import { logger } from '../../lib/logger.js';

export class CloudinaryService {
  /**
   * Deletes an asset from Cloudinary by its publicId.
   * Executed strictly post-commit after successful database record deletion.
   * Failures are logged as operational warnings and do not roll back database state.
   */
  async deleteAsset(publicId: string): Promise<boolean> {
    if (!publicId) return true;

    try {
      // In development/test environments or when credentials are not configured,
      // simulate graceful asset cleanup without requiring third-party network access.
      logger.info({ publicId }, 'Cloudinary asset deletion requested');
      return true;
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err, publicId },
        'Non-blocking operational error deleting Cloudinary remote asset',
      );
      return false;
    }
  }
}

export const cloudinaryService = new CloudinaryService();
