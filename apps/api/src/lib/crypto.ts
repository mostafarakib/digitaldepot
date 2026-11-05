import crypto from 'node:crypto';
import * as argon2 from 'argon2';
import * as jose from 'jose';
import { env } from '../config/env.js';

// Pre-computed valid Argon2id hash for constant-time dummy verification on unknown/OAuth accounts
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$MQKVEQ73k0dCetilBq0jGA$5AghZKrLGrug94b0Too/b9DT+1HgD8OWJDT2XPTx4Ao';

const jwtSecretKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

/**
 * Hashes a plaintext password using Argon2id with OWASP-recommended parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Performs a dummy Argon2id verification to equalize timing for non-existent users or OAuth-only accounts.
 */
export async function verifyDummyPassword(password: string): Promise<boolean> {
  try {
    await argon2.verify(DUMMY_ARGON2_HASH, password);
  } catch {
    // Ignore error
  }
  return false;
}

/**
 * Generates an opaque 256-bit cryptographically secure random base64url token.
 */
export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Computes the SHA-256 hash of a string (used for refresh tokens, verification tokens).
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

/**
 * Signs a short-lived (15-minute) JWT access token using jose with HS256.
 */
export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new jose.SignJWT({
    sub: payload.sub,
    sid: payload.sid,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(jwtSecretKey);
}

/**
 * Verifies an access token JWT, validating algorithm (HS256), issuer, audience, and expiration.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jose.jwtVerify(token, jwtSecretKey, {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

  if (!payload.sub || typeof payload['sid'] !== 'string') {
    throw new Error('Invalid token claims: missing subject or session id');
  }

  return {
    sub: payload.sub,
    sid: payload['sid'] as string,
  };
}
