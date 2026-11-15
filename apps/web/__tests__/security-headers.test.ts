import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config';

describe('Next.js Security & Optimization Configuration (Phase 9E)', () => {
  it('disables poweredByHeader to prevent disclosing server technology', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('configures remotePatterns for approved image CDNs using HTTPS', () => {
    const patterns = nextConfig.images?.remotePatterns;
    expect(patterns).toBeDefined();
    expect(patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ protocol: 'https', hostname: 'res.cloudinary.com' }),
        expect.objectContaining({ protocol: 'https', hostname: 'images.unsplash.com' }),
      ]),
    );
  });

  it('configures modern responsive image formats (avif and webp)', () => {
    const formats = nextConfig.images?.formats;
    expect(formats).toEqual(['image/avif', 'image/webp']);
  });

  it('optimizes barrel icon imports for lucide-react', () => {
    const packageImports = nextConfig.experimental?.optimizePackageImports;
    expect(packageImports).toContain('lucide-react');
  });

  it('configures defensive HTTP security headers for all routes', async () => {
    expect(typeof nextConfig.headers).toBe('function');
    if (nextConfig.headers) {
      const headerRules = await nextConfig.headers();
      const catchAllRule = headerRules.find(
        (rule: { source: string }) => rule.source === '/:path*',
      );
      expect(catchAllRule).toBeDefined();

      const headers = catchAllRule?.headers || [];
      const headerMap = new Map(
        headers.map((h: { key: string; value: string }) => [h.key, h.value]),
      );

      expect(headerMap.get('X-Frame-Options')).toBe('SAMEORIGIN');
      expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
      expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(headerMap.get('Permissions-Policy')).toContain('camera=()');
    }
  });
});
