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

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Validates that an OAuth or challenge prefix matches the required 16-character base64url pattern.
 */
export function isValidPrefix(prefix: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(prefix);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Key must be a 64-character hex string representing a 32-byte key.
 */
export function encryptGcm(plaintext: string, secretHex: string): EncryptedPayload {
  const key = Buffer.from(secretHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption secret must be exactly 32 bytes (64 hex characters)');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
export function decryptGcm(encrypted: EncryptedPayload, secretHex: string): string {
  const key = Buffer.from(secretHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption secret must be exactly 32 bytes (64 hex characters)');
  }
  const iv = Buffer.from(encrypted.iv, 'hex');
  const tag = Buffer.from(encrypted.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

/**
 * Generates an RFC 7636 PKCE code verifier and S256 code challenge.
 */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Signs an OAuth state string using HMAC-SHA256 with OAUTH_STATE_SECRET.
 */
export function signOAuthState(rawState: string): string {
  return crypto.createHmac('sha256', env.OAUTH_STATE_SECRET).update(rawState).digest('hex');
}

/**
 * Generates an OAuth state string, 16-char prefix, hash, and HMAC signature.
 */
export function generateOAuthState(): {
  rawState: string;
  statePrefix: string;
  stateHash: string;
  hmac: string;
} {
  const rawState = crypto.randomBytes(32).toString('base64url');
  const statePrefix = rawState.slice(0, 16);
  const stateHash = hashToken(rawState);
  const hmac = signOAuthState(rawState);
  return { rawState, statePrefix, stateHash, hmac };
}

/**
 * Verifies an OAuth state HMAC signature in constant time.
 */
export function verifyOAuthStateHmac(rawState: string, hmac: string): boolean {
  try {
    const expectedHmac = crypto
      .createHmac('sha256', env.OAUTH_STATE_SECRET)
      .update(rawState)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    const actualBuf = Buffer.from(hmac, 'hex');
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}
