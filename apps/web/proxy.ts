import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

const PROTECTED_ROUTE_REGEX = /^\/(?:(en|bn)\/)?(admin|account)(?:\/|$)/;

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const matchProtected = PROTECTED_ROUTE_REGEX.exec(pathname);

  if (matchProtected) {
    const hasAccessToken = request.cookies.has('dd_access_token');
    const hasRefreshToken = request.cookies.has('dd_refresh_token');

    // If neither access nor refresh cookie is present, redirect to login without network calls
    if (!hasAccessToken && !hasRefreshToken) {
      const locale = matchProtected[1] || routing.defaultLocale;
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set('returnUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  // Match all pathnames except:
  // - … if they start with `/api`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
