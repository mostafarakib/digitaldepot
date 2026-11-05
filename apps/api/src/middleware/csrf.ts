import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { COOKIE_NAMES, getCsrfCookieOptions } from '../lib/cookies.js';
import { ForbiddenError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Generates a signed double-submit CSRF token.
 * Format: `${nonce}.${timestamp}.${hmac}`
 */
export function generateCsrfToken(): string {
  const nonce = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', env.CSRF_SECRET)
    .update(`${nonce}.${timestamp}`)
    .digest('hex'); // 64 hex chars

  return `${nonce}.${timestamp}.${signature}`;
}

/**
 * Sets or rotates the CSRF cookie on the response and sets the x-csrf-token response header.
 */
export function rotateCsrfToken(res: Response): string {
  const token = generateCsrfToken();
  res.cookie(COOKIE_NAMES.CSRF_TOKEN, token, getCsrfCookieOptions());
  res.setHeader('x-csrf-token', token);
  return token;
}

/**
 * Normalizes an origin/referer string to its protocol + host for comparison.
 */
function normalizeOrigin(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Validates that the request origin matches the configured FRONTEND_URL.
 */
function validateOrigin(req: Request): void {
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const expectedOrigin = normalizeOrigin(env.FRONTEND_URL);

  let incomingOrigin: string | null = null;
  if (originHeader) {
    incomingOrigin = normalizeOrigin(originHeader);
  } else if (refererHeader) {
    incomingOrigin = normalizeOrigin(refererHeader);
  }

  if (!incomingOrigin || incomingOrigin !== expectedOrigin) {
    throw new ForbiddenError(
      'CSRF_ORIGIN_INVALID',
      'Request origin does not match authorized frontend origin',
    );
  }
}

/**
 * Express middleware enforcing signed double-submit CSRF protection for all state-changing requests.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  // Safe methods are exempt from CSRF validation
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // 1. Strict Origin verification
  validateOrigin(req);

  // 2. Cookie and header retrieval
  const cookieToken = req.cookies?.[COOKIE_NAMES.CSRF_TOKEN];
  const headerToken = req.headers['x-csrf-token'];

  if (
    !cookieToken ||
    typeof cookieToken !== 'string' ||
    !headerToken ||
    typeof headerToken !== 'string'
  ) {
    throw new ForbiddenError(
      'CSRF_TOKEN_MISSING',
      'CSRF verification failed: missing token cookie or header',
    );
  }

  // 3. Format & component length validation
  const parts = headerToken.split('.');
  if (parts.length !== 3) {
    throw new ForbiddenError('CSRF_TOKEN_MALFORMED', 'Malformed CSRF token structure');
  }

  const [nonce, timestampStr, signature] = parts;
  if (
    !nonce ||
    nonce.length !== 32 ||
    !signature ||
    signature.length !== 64 ||
    !timestampStr ||
    !/^\d+$/.test(timestampStr)
  ) {
    throw new ForbiddenError('CSRF_TOKEN_MALFORMED', 'Malformed CSRF token components');
  }

  // 4. Constant-time comparison between cookie and header
  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);

  if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    throw new ForbiddenError(
      'CSRF_TOKEN_MISMATCH',
      'CSRF token mismatch between header and cookie',
    );
  }

  // 5. Timestamp validation: reject future timestamps beyond 60s skew; reject expired (>24h)
  const timestamp = Number(timestampStr);
  const now = Date.now();

  if (timestamp > now + 60000) {
    throw new ForbiddenError('CSRF_TOKEN_FUTURE', 'CSRF token timestamp is in the future');
  }

  if (now - timestamp > 24 * 60 * 60 * 1000) {
    throw new ForbiddenError('CSRF_TOKEN_EXPIRED', 'CSRF token has expired');
  }

  // 6. Cryptographic HMAC re-computation and constant-time verification
  const expectedSig = crypto
    .createHmac('sha256', env.CSRF_SECRET)
    .update(`${nonce}.${timestampStr}`)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expectedSigBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    throw new ForbiddenError('CSRF_SIGNATURE_INVALID', 'CSRF signature verification failed');
  }

  next();
}
