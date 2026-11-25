import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../../../config/env.js';
import { CloudinaryService, generateCloudinarySignature } from '../cloudinary.service.js';

describe('CloudinaryService (Signed Uploads & Asset Management)', () => {
  const originalFetch = globalThis.fetch;
  const mutableEnv = env as {
    CLOUDINARY_CLOUD_NAME?: string;
    CLOUDINARY_API_KEY?: string;
    CLOUDINARY_API_SECRET?: string;
  };

  let origCloudName: string | undefined;
  let origApiKey: string | undefined;
  let origApiSecret: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    origCloudName = mutableEnv.CLOUDINARY_CLOUD_NAME;
    origApiKey = mutableEnv.CLOUDINARY_API_KEY;
    origApiSecret = mutableEnv.CLOUDINARY_API_SECRET;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mutableEnv.CLOUDINARY_CLOUD_NAME = origCloudName;
    mutableEnv.CLOUDINARY_API_KEY = origApiKey;
    mutableEnv.CLOUDINARY_API_SECRET = origApiSecret;
  });

  it('computes SHA-1 Cloudinary signature sorted alphabetically by parameter key', () => {
    const sig = generateCloudinarySignature(
      {
        timestamp: 1732550000,
        public_id: 'digitaldepot/products/apple-iphone-16-pro-1',
        overwrite: 'true',
        unique_filename: 'false',
      },
      'my-api-secret',
    );

    const expectedString =
      'overwrite=true&public_id=digitaldepot/products/apple-iphone-16-pro-1&timestamp=1732550000&unique_filename=falsemy-api-secret';
    const expectedHash = crypto.createHash('sha1').update(expectedString).digest('hex');

    expect(sig).toBe(expectedHash);
  });

  it('throws CLOUDINARY_NOT_CONFIGURED when attempting to upload without credentials', async () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = undefined;
    mutableEnv.CLOUDINARY_API_KEY = undefined;
    mutableEnv.CLOUDINARY_API_SECRET = undefined;

    const service = new CloudinaryService();
    expect(service.isConfigured()).toBe(false);

    await expect(
      service.uploadBuffer(Buffer.from('fake-webp-bytes'), {
        publicId: 'digitaldepot/products/sample-1',
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'CLOUDINARY_NOT_CONFIGURED',
    });
  });

  it('uploads a local image file with deterministic public_id, overwrite=true, and valid signature', async () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = 'digitaldepot-demo';
    mutableEnv.CLOUDINARY_API_KEY = '123456789012345';
    mutableEnv.CLOUDINARY_API_SECRET = 'super-secret-cloudinary-key';

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dd-cloud-test-'));
    const tempFile = path.join(tmpDir, 'test-product.webp');
    await fs.writeFile(tempFile, Buffer.from('RIFF....WEBP'));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        secure_url:
          'https://res.cloudinary.com/digitaldepot-demo/image/upload/v1732550000/digitaldepot/products/apple-iphone-16-pro-1.webp',
        public_id: 'digitaldepot/products/apple-iphone-16-pro-1',
        width: 1000,
        height: 1000,
        format: 'webp',
        bytes: 12345,
      }),
    });
    globalThis.fetch = mockFetch;

    try {
      const service = new CloudinaryService();
      const result = await service.uploadFile(tempFile, {
        publicId: 'digitaldepot/products/apple-iphone-16-pro-1',
      });

      expect(result.secureUrl).toBe(
        'https://res.cloudinary.com/digitaldepot-demo/image/upload/v1732550000/digitaldepot/products/apple-iphone-16-pro-1.webp',
      );
      expect(result.publicId).toBe('digitaldepot/products/apple-iphone-16-pro-1');
      expect(result.format).toBe('webp');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.cloudinary.com/v1_1/digitaldepot-demo/image/upload');
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);

      const form = init.body as FormData;
      expect(form.get('api_key')).toBe('123456789012345');
      expect(form.get('public_id')).toBe('digitaldepot/products/apple-iphone-16-pro-1');
      expect(form.get('overwrite')).toBe('true');
      expect(form.get('unique_filename')).toBe('false');
      expect(form.get('signature')).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects path-traversal publicId values before making network calls', async () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = 'digitaldepot-demo';
    mutableEnv.CLOUDINARY_API_KEY = '123456789012345';
    mutableEnv.CLOUDINARY_API_SECRET = 'super-secret-cloudinary-key';

    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const service = new CloudinaryService();
    await expect(
      service.uploadBuffer(Buffer.from('abc'), {
        publicId: '../secret/escape',
      }),
    ).rejects.toThrow('Public ID contains invalid characters or path traversal sequences');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles Cloudinary API errors cleanly without exposing API secrets', async () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = 'digitaldepot-demo';
    mutableEnv.CLOUDINARY_API_KEY = '123456789012345';
    mutableEnv.CLOUDINARY_API_SECRET = 'super-secret-cloudinary-key';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: { message: 'Invalid Signature' } }),
    });

    const service = new CloudinaryService();
    await expect(
      service.uploadBuffer(Buffer.from('abc'), {
        publicId: 'digitaldepot/products/test-1',
      }),
    ).rejects.toThrow(
      'Cloudinary upload failed (401) for digitaldepot/products/test-1: Invalid Signature',
    );
  });

  it('signs asset deletion when configured and remains non-blocking when unconfigured', async () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = undefined;
    mutableEnv.CLOUDINARY_API_KEY = undefined;
    mutableEnv.CLOUDINARY_API_SECRET = undefined;

    const service = new CloudinaryService();
    expect(await service.deleteAsset('digitaldepot/products/test-1')).toBe(true);

    mutableEnv.CLOUDINARY_CLOUD_NAME = 'digitaldepot-demo';
    mutableEnv.CLOUDINARY_API_KEY = '123456789012345';
    mutableEnv.CLOUDINARY_API_SECRET = 'super-secret-cloudinary-key';

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    expect(await service.deleteAsset('digitaldepot/products/test-1')).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.cloudinary.com/v1_1/digitaldepot-demo/image/destroy',
    );
  });
});
