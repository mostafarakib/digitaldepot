import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env, isCloudinaryConfigured } from '../../config/env.js';
import { ServiceUnavailableError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { secureImageUrlSchema, securePublicIdSchema } from './catalogue.schemas.js';

export interface CloudinaryUploadOptions {
  publicId: string;
  mimeType?: string;
  filename?: string;
  overwrite?: boolean;
  timeoutMs?: number;
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export function generateCloudinarySignature(
  params: Record<string, string | number | boolean>,
  apiSecret: string,
): string {
  const stringToSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto.createHash('sha1').update(`${stringToSign}${apiSecret}`).digest('hex');
}

export class CloudinaryService {
  /**
   * Returns true if valid non-placeholder Cloudinary credentials are configured.
   */
  public isConfigured(): boolean {
    return isCloudinaryConfigured(env);
  }

  /**
   * Ensures Cloudinary credentials are configured, returning them safely.
   */
  public assertConfigured(): { cloudName: string; apiKey: string; apiSecret: string } {
    if (
      !this.isConfigured() ||
      !env.CLOUDINARY_CLOUD_NAME ||
      !env.CLOUDINARY_API_KEY ||
      !env.CLOUDINARY_API_SECRET
    ) {
      throw new ServiceUnavailableError(
        'CLOUDINARY_NOT_CONFIGURED',
        'Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are not configured',
      );
    }

    return {
      cloudName: env.CLOUDINARY_CLOUD_NAME.trim(),
      apiKey: env.CLOUDINARY_API_KEY.trim(),
      apiSecret: env.CLOUDINARY_API_SECRET.trim(),
    };
  }

  /**
   * Performs a signed upload of a local image file to Cloudinary using Node crypto + native fetch.
   * Uses deterministic public_id + overwrite=true so repeat uploads replace cleanly without duplicates.
   */
  async uploadFile(
    filePath: string,
    options: CloudinaryUploadOptions,
  ): Promise<CloudinaryUploadResult> {
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = options.mimeType ?? MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
    const filename = options.filename ?? path.basename(filePath);

    return await this.uploadBuffer(fileBuffer, {
      ...options,
      mimeType,
      filename,
    });
  }

  /**
   * Performs a signed upload of an image buffer to Cloudinary using Node crypto + native fetch.
   */
  async uploadBuffer(
    buffer: Buffer,
    options: CloudinaryUploadOptions,
  ): Promise<CloudinaryUploadResult> {
    const { cloudName, apiKey, apiSecret } = this.assertConfigured();
    const publicId = securePublicIdSchema.parse(options.publicId);
    const overwrite = options.overwrite ?? true;
    const timestamp = Math.floor(Date.now() / 1000);
    const timeoutMs = options.timeoutMs ?? 15000;

    const signParams: Record<string, string | number | boolean> = {
      overwrite: overwrite ? 'true' : 'false',
      public_id: publicId,
      timestamp,
      unique_filename: 'false',
    };

    const signature = generateCloudinarySignature(signParams, apiSecret);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], {
      type: options.mimeType ?? 'image/webp',
    });
    formData.append('file', blob, options.filename ?? `${path.basename(publicId)}.webp`);
    formData.append('api_key', apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('public_id', publicId);
    formData.append('overwrite', overwrite ? 'true' : 'false');
    formData.append('unique_filename', 'false');
    formData.append('signature', signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Cloudinary upload timed out after ${timeoutMs}ms for ${publicId}`);
      }
      throw new Error(
        `Cloudinary upload network error for ${publicId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status} ${response.statusText}`.trim();
      try {
        const errBody = (await response.json()) as { error?: { message?: string } };
        if (errBody?.error?.message) {
          detail = errBody.error.message;
        }
      } catch {
        // Ignore non-JSON error body
      }
      logger.error(
        { publicId, status: response.status, error: detail },
        'Cloudinary signed upload failed',
      );
      throw new Error(`Cloudinary upload failed (${response.status}) for ${publicId}: ${detail}`);
    }

    const payload = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      width?: number;
      height?: number;
      format?: string;
      bytes?: number;
    };

    if (!payload.secure_url || !payload.public_id) {
      throw new Error(`Cloudinary upload response missing secure_url or public_id for ${publicId}`);
    }

    const validatedUrl = secureImageUrlSchema.parse(payload.secure_url);
    const validatedPublicId = securePublicIdSchema.parse(payload.public_id);

    logger.info(
      { publicId: validatedPublicId, bytes: payload.bytes, format: payload.format },
      'Cloudinary signed upload succeeded',
    );

    return {
      secureUrl: validatedUrl,
      publicId: validatedPublicId,
      width: payload.width,
      height: payload.height,
      format: payload.format,
      bytes: payload.bytes,
    };
  }

  /**
   * Deletes an asset from Cloudinary by its publicId.
   * Executed strictly post-commit after successful database record deletion.
   * Failures are logged as operational warnings and do not roll back database state.
   */
  async deleteAsset(publicId: string): Promise<boolean> {
    if (!publicId) return true;

    try {
      if (!this.isConfigured()) {
        logger.info({ publicId }, 'Cloudinary asset deletion requested (credentials not set)');
        return true;
      }

      const { cloudName, apiKey, apiSecret } = this.assertConfigured();
      const safePublicId = securePublicIdSchema.parse(publicId);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateCloudinarySignature(
        { public_id: safePublicId, timestamp },
        apiSecret,
      );

      const formData = new FormData();
      formData.append('public_id', safePublicId);
      formData.append('api_key', apiKey);
      formData.append('timestamp', String(timestamp));
      formData.append('signature', signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
        {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        logger.warn(
          { publicId: safePublicId, status: response.status },
          'Cloudinary destroy returned non-OK status',
        );
        return false;
      }

      logger.info({ publicId: safePublicId }, 'Cloudinary asset deleted');
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
