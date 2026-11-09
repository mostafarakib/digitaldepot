import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';
import { isValidPrefix } from './crypto.js';

export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'dd_access_token',
  REFRESH_TOKEN: 'dd_refresh_token',
  CSRF_TOKEN: 'dd_csrf',
} as const;

function getBaseCookieOptions(): CookieOptions {
  return {
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function getAccessTokenCookieOptions(): CookieOptions {
  return {
    ...getBaseCookieOptions(),
    httpOnly: true,
    maxAge: 15 * 60 * 1000, // 15 minutes
  };
}

export function getRefreshTokenCookieOptions(
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
): CookieOptions {
  return {
    ...getBaseCookieOptions(),
    httpOnly: true,
    maxAge: maxAgeMs, // Default 7 days
  };
}

export function getCsrfCookieOptions(): CookieOptions {
  return {
    ...getBaseCookieOptions(),
    httpOnly: false, // Must be readable by frontend JavaScript
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  };
}

export function setAuthCookies(
  res: Response,
  tokens: {
    accessToken: string;
    refreshToken: string;
  },
  refreshMaxAgeMs?: number,
): void {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, tokens.accessToken, getAccessTokenCookieOptions());
  res.cookie(
    COOKIE_NAMES.REFRESH_TOKEN,
    tokens.refreshToken,
    getRefreshTokenCookieOptions(refreshMaxAgeMs),
  );
}

export function clearAuthCookies(res: Response): void {
  const clearOptions: CookieOptions = {
    ...getBaseCookieOptions(),
    httpOnly: true,
    maxAge: 0,
    expires: new Date(0),
  };

  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, '', clearOptions);
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, '', clearOptions);
}

export function setOAuthStateCookie(res: Response, statePrefix: string, hmac: string): void {
  if (!isValidPrefix(statePrefix)) {
    throw new Error('Invalid state prefix for OAuth state cookie');
  }
  res.cookie(`dd_oauth_${statePrefix}`, hmac, {
    ...getBaseCookieOptions(),
    httpOnly: true,
    maxAge: 10 * 60 * 1000, // 10 minutes
  });
}

export function clearOAuthStateCookie(res: Response, statePrefix: string): void {
  if (!isValidPrefix(statePrefix)) {
    return;
  }
  res.cookie(`dd_oauth_${statePrefix}`, '', {
    ...getBaseCookieOptions(),
    httpOnly: true,
    maxAge: 0,
    expires: new Date(0),
  });
}

export function setOAuthLinkCookie(res: Response, challengePrefix: string, rawToken: string): void {
  if (!isValidPrefix(challengePrefix)) {
    throw new Error('Invalid challenge prefix for OAuth link challenge cookie');
  }
  res.cookie(`dd_link_${challengePrefix}`, rawToken, {
    ...getBaseCookieOptions(),
    httpOnly: true,
    maxAge: 10 * 60 * 1000, // 10 minutes
  });
}

export function clearOAuthLinkCookie(res: Response, challengePrefix: string): void {
  if (!isValidPrefix(challengePrefix)) {
    return;
  }
  res.cookie(`dd_link_${challengePrefix}`, '', {
    ...getBaseCookieOptions(),
    httpOnly: true,
    maxAge: 0,
    expires: new Date(0),
  });
}
