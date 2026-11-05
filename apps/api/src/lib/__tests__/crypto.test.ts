import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../crypto.js';

describe('Crypto Utilities', () => {
  describe('Argon2id Password Hashing', () => {
    it('hashes and successfully verifies a correct password', async () => {
      const password = 'CorrectHorseBatteryStaple123!';
      const hash = await hashPassword(password);

      expect(hash).toMatch(/^\$argon2id\$/);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('rejects an incorrect password', async () => {
      const password = 'CorrectHorseBatteryStaple123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('WrongPassword123!', hash);
      expect(isValid).toBe(false);
    });

    it('verifyDummyPassword returns false', async () => {
      const result = await verifyDummyPassword('any-password');
      expect(result).toBe(false);
    });
  });

  describe('Opaque Tokens and Hashing', () => {
    it('generates a 256-bit cryptographically secure base64url token', () => {
      const token = generateOpaqueToken();
      expect(token).toHaveLength(43); // 32 bytes in base64url without padding
      expect(typeof token).toBe('string');
    });

    it('generates unique tokens on subsequent invocations', () => {
      const token1 = generateOpaqueToken();
      const token2 = generateOpaqueToken();
      expect(token1).not.toBe(token2);
    });

    it('computes deterministic SHA-256 hex hash', () => {
      const token = 'test-token-value';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // 256 bits = 64 hex characters
    });
  });

  describe('jose JWT Access Token', () => {
    it('signs and verifies a valid access token with HS256', async () => {
      const payload = { sub: 'user-cuid-123', sid: 'session-cuid-456' };
      const token = await signAccessToken(payload);

      expect(typeof token).toBe('string');
      const verified = await verifyAccessToken(token);

      expect(verified.sub).toBe(payload.sub);
      expect(verified.sid).toBe(payload.sid);
    });

    it('fails verification on tampered token', async () => {
      const payload = { sub: 'user-cuid-123', sid: 'session-cuid-456' };
      const token = await signAccessToken(payload);
      const tampered = token.slice(0, -5) + 'abcde';

      await expect(verifyAccessToken(tampered)).rejects.toThrow();
    });
  });
});
