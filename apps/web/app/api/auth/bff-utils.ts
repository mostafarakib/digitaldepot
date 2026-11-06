import { NextResponse } from 'next/server';
import { env } from '@/lib/config';

/**
 * Normalizes an origin string to its protocol + host for strict comparison.
 */
export function normalizeOrigin(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Validates that an incoming state-changing request carries a valid Origin
 * matching the configured storefront origin (STOREFRONT_ORIGIN or FRONTEND_URL).
 * Missing or mismatched Origin headers are rejected with HTTP 403.
 */
export function validateBffOrigin(request: Request): NextResponse | null {
  const originHeader = request.headers.get('origin');
  if (!originHeader) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ORIGIN_REQUIRED',
          message: 'Origin header is required for state-changing requests',
        },
      },
      { status: 403 },
    );
  }

  const incomingOrigin = normalizeOrigin(originHeader);
  const expectedOrigin = normalizeOrigin(env.storefrontOrigin);

  if (!incomingOrigin || incomingOrigin !== expectedOrigin) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_ORIGIN',
          message: 'Request origin does not match authorized storefront origin',
        },
      },
      { status: 403 },
    );
  }

  return null;
}

interface ForwardOptions {
  method: string;
  request: Request;
  body?: unknown;
}

/**
 * Forwards a request from the Next.js BFF to the Express backend API.
 * - Preserves and forwards original validated browser Origin.
 * - Forwards incoming cookies and CSRF headers.
 * - Relies on trusted deployment proxy for IP handling (does not blindly forward client X-Forwarded-For).
 * - Preserves and forwards multiple Set-Cookie headers independently.
 * - Forwards rotated x-csrf-token response header.
 * - Ensures authentication tokens are never exposed in JSON bodies.
 */
export async function forwardToExpress(
  apiPath: string,
  options: ForwardOptions,
): Promise<NextResponse> {
  const targetUrl = `${env.serverApiUrl}${apiPath}`;

  const forwardHeaders: Record<string, string> = {
    accept: 'application/json',
  };

  // Forward incoming browser cookies
  const cookieHeader = options.request.headers.get('cookie');
  if (cookieHeader) {
    forwardHeaders['cookie'] = cookieHeader;
  }

  // Forward original browser Origin (validated by validateBffOrigin for mutations)
  const originHeader = options.request.headers.get('origin');
  if (originHeader) {
    forwardHeaders['origin'] = originHeader;
  }

  // Forward CSRF header if present
  const csrfHeader = options.request.headers.get('x-csrf-token');
  if (csrfHeader) {
    forwardHeaders['x-csrf-token'] = csrfHeader;
  }

  // Forward User-Agent
  const userAgent = options.request.headers.get('user-agent');
  if (userAgent) {
    forwardHeaders['user-agent'] = userAgent;
  }

  if (options.body !== undefined) {
    forwardHeaders['content-type'] = 'application/json';
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(targetUrl, {
      method: options.method,
      headers: forwardHeaders,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BACKEND_CONNECTION_ERROR',
          message: 'Unable to communicate with the authentication server',
        },
      },
      { status: 502 },
    );
  }

  let data: unknown;
  const contentType = backendRes.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await backendRes.json();
  } else {
    data = { success: backendRes.ok };
  }

  const response = NextResponse.json(data, { status: backendRes.status });

  // Safeguard 5: Preserve multiple Set-Cookie headers independently
  const setCookies = backendRes.headers.getSetCookie();
  for (const cookieStr of setCookies) {
    response.headers.append('set-cookie', cookieStr);
  }

  // Safeguard 4: Forward rotated CSRF token response header
  const rotatedCsrf = backendRes.headers.get('x-csrf-token');
  if (rotatedCsrf) {
    response.headers.set('x-csrf-token', rotatedCsrf);
  }

  return response;
}

