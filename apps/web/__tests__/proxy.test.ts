import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'bn'],
    defaultLocale: 'en',
    localePrefix: 'always',
  },
}));

vi.mock('next-intl/middleware', () => ({
  default: () => vi.fn(() => new Response(null, { status: 200 })),
}));

import proxy from '../proxy';

describe('Navigation proxy middleware', () => {
  it('redirects unauthenticated access to /admin to /en/login with returnUrl', () => {
    const req = new NextRequest('http://localhost:3000/admin');
    const res = proxy(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/en/login?returnUrl=%2Fadmin');
  });

  it('redirects unauthenticated access to /bn/account to /bn/login with returnUrl', () => {
    const req = new NextRequest('http://localhost:3000/bn/account');
    const res = proxy(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/bn/login?returnUrl=%2Fbn%2Faccount');
  });

  it('allows access to /admin if dd_access_token cookie is present', () => {
    const req = new NextRequest('http://localhost:3000/en/admin', {
      headers: {
        cookie: 'dd_access_token=valid_token',
      },
    });
    const res = proxy(req);
    // Does not redirect to login (either 200 or next-intl redirect)
    const location = res.headers.get('location');
    if (location) {
      expect(location).not.toContain('/login');
    }
  });

  it('allows access to /admin if dd_refresh_token cookie is present for SSR renewal', () => {
    const req = new NextRequest('http://localhost:3000/en/admin', {
      headers: {
        cookie: 'dd_refresh_token=valid_refresh',
      },
    });
    const res = proxy(req);
    const location = res.headers.get('location');
    if (location) {
      expect(location).not.toContain('/login');
    }
  });

  it('allows public routes like / and /status without cookies', () => {
    const req = new NextRequest('http://localhost:3000/status');
    const res = proxy(req);
    const location = res.headers.get('location');
    if (location) {
      expect(location).not.toContain('/login');
    }
  });
});
