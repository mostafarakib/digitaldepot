import { NextResponse } from 'next/server';
import { env } from '@/lib/config';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error || !code || !state) {
    const errorParam = error ?? 'MISSING_OAUTH_PARAMS';
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorParam)}`, env.storefrontOrigin),
    );
  }

  const forwardHeaders: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
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

  let backendRes: Response;
  try {
    backendRes = await fetch(`${env.serverApiUrl}/api/v1/auth/oauth/google/callback`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({ code, state }),
    });
  } catch {
    return NextResponse.redirect(
      new URL('/login?error=BACKEND_CONNECTION_ERROR', env.storefrontOrigin),
    );
  }

  const setCookies = backendRes.headers.getSetCookie();

  let body: {
    success?: boolean;
    data?: {
      status: 'AUTHENTICATED' | 'LINK_REQUIRED' | 'LINKED' | 'REAUTHENTICATED';
      returnUrl?: string;
      challengePrefix?: string;
    };
    error?: { code: string; message: string };
  } = {};

  try {
    body = await backendRes.json();
  } catch {
    // Non-JSON response
  }

  if (!backendRes.ok || !body.success || !body.data) {
    const errorCode = body.error?.code ?? 'OAUTH_CALLBACK_FAILED';
    const hasSessionCookie = Boolean(
      cookieHeader &&
      (cookieHeader.includes('dd_access_token=') || cookieHeader.includes('dd_refresh_token=')),
    );
    const destinationPath = hasSessionCookie ? '/account/security' : '/login';
    const destination = new URL(destinationPath, env.storefrontOrigin);
    destination.searchParams.set('error', errorCode);
    const redirectRes = NextResponse.redirect(destination);
    for (const cookieStr of setCookies) {
      redirectRes.headers.append('set-cookie', cookieStr);
    }
    return redirectRes;
  }

  const outcome = body.data;
  let targetPath =
    outcome.returnUrl || (outcome.status === 'AUTHENTICATED' ? '/account' : '/account/security');

  if (outcome.status === 'LINK_REQUIRED') {
    targetPath = `/confirm-link?challengePrefix=${encodeURIComponent(outcome.challengePrefix ?? '')}&returnUrl=${encodeURIComponent(outcome.returnUrl ?? '/account')}`;
  } else if (outcome.status === 'LINKED') {
    const u = new URL(targetPath, env.storefrontOrigin);
    u.searchParams.set('linked', 'true');
    targetPath = `${u.pathname}${u.search}`;
  } else if (outcome.status === 'REAUTHENTICATED') {
    const u = new URL(targetPath, env.storefrontOrigin);
    u.searchParams.set('reauth', 'true');
    targetPath = `${u.pathname}${u.search}`;
  }

  const redirectResponse = NextResponse.redirect(new URL(targetPath, env.storefrontOrigin));
  for (const cookieStr of setCookies) {
    redirectResponse.headers.append('set-cookie', cookieStr);
  }

  const rotatedCsrf = backendRes.headers.get('x-csrf-token');
  if (rotatedCsrf) {
    redirectResponse.headers.set('x-csrf-token', rotatedCsrf);
  }

  return redirectResponse;
}
