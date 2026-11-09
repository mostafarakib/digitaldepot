import { NextResponse } from 'next/server';
import { env } from '@/lib/config';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawReturnUrl = url.searchParams.get('returnUrl');
  const format = url.searchParams.get('format');
  const acceptHeader = request.headers.get('accept') ?? '';
  const wantsJson = format === 'json' || acceptHeader.includes('application/json');

  // Validate returnUrl: safe relative path, never protocol-relative
  let safeReturnUrl: string | undefined;
  if (rawReturnUrl && rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//')) {
    safeReturnUrl = rawReturnUrl;
  }

  const forwardHeaders: Record<string, string> = {
    accept: 'application/json',
    origin: env.storefrontOrigin,
  };

  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    forwardHeaders['cookie'] = cookieHeader;
  }

  const userAgent = request.headers.get('user-agent');
  if (userAgent) {
    forwardHeaders['user-agent'] = userAgent;
  }

  const queryParams = new URLSearchParams({ format: 'json' });
  if (safeReturnUrl) {
    queryParams.set('returnUrl', safeReturnUrl);
  }

  const backendUrl = `${env.serverApiUrl}/api/v1/auth/oauth/google?${queryParams.toString()}`;

  let backendRes: Response;
  try {
    backendRes = await fetch(backendUrl, {
      method: 'GET',
      headers: forwardHeaders,
    });
  } catch {
    if (wantsJson) {
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
    return NextResponse.redirect(
      new URL('/login?error=BACKEND_CONNECTION_ERROR', env.storefrontOrigin),
    );
  }

  const setCookies = backendRes.headers.getSetCookie();

  let body: {
    success?: boolean;
    data?: { authUrl: string; statePrefix: string };
    error?: { code: string; message: string };
  } = {};

  try {
    body = await backendRes.json();
  } catch {
    // Non-JSON response
  }

  if (!backendRes.ok || !body.success || !body.data?.authUrl) {
    const errorCode = body.error?.code ?? 'OAUTH_INITIATE_FAILED';
    if (wantsJson) {
      const errorResponse = NextResponse.json(body, { status: backendRes.status });
      for (const cookieStr of setCookies) {
        errorResponse.headers.append('set-cookie', cookieStr);
      }
      return errorResponse;
    }
    const redirectRes = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorCode)}`, env.storefrontOrigin),
    );
    for (const cookieStr of setCookies) {
      redirectRes.headers.append('set-cookie', cookieStr);
    }
    return redirectRes;
  }

  if (wantsJson) {
    const jsonRes = NextResponse.json(body, { status: 200 });
    for (const cookieStr of setCookies) {
      jsonRes.headers.append('set-cookie', cookieStr);
    }
    return jsonRes;
  }

  const redirectRes = NextResponse.redirect(body.data.authUrl, { status: 302 });
  for (const cookieStr of setCookies) {
    redirectRes.headers.append('set-cookie', cookieStr);
  }
  return redirectRes;
}

