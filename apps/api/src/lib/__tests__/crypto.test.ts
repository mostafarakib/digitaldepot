import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  encryptGcm,
  decryptGcm,
  generatePkce,
  generateOAuthState,
  verifyOAuthStateHmac,
  isValidPrefix,
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

  describe('AES-256-GCM Encryption and Decryption', () => {
    const validSecretHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    it('encrypts and successfully decrypts a plaintext string', () => {
      const plaintext = 'super-secret-code-verifier-string-123456789';
      const encrypted = encryptGcm(plaintext, validSecretHex);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
      expect(encrypted.tag).toHaveLength(32); // 16 bytes = 32 hex chars

      const decrypted = decryptGcm(encrypted, validSecretHex);
      expect(decrypted).toBe(plaintext);
    });

    it('fails decryption if ciphertext is tampered with', () => {
      const plaintext = 'sensitive-token-payload';
      const encrypted = encryptGcm(plaintext, validSecretHex);

      const tamperedCiphertext =
        encrypted.ciphertext.slice(0, -2) + (encrypted.ciphertext.slice(-2) === 'aa' ? 'bb' : 'aa');
      expect(() =>
        decryptGcm({ ...encrypted, ciphertext: tamperedCiphertext }, validSecretHex),
      ).toThrow();
    });

    it('fails decryption if tag is tampered with', () => {
      const plaintext = 'sensitive-token-payload';
      const encrypted = encryptGcm(plaintext, validSecretHex);

      const tamperedTag =
        encrypted.tag.slice(0, -2) + (encrypted.tag.slice(-2) === 'aa' ? 'bb' : 'aa');
      expect(() => decryptGcm({ ...encrypted, tag: tamperedTag }, validSecretHex)).toThrow();
    });

    it('rejects keys that are not 32 bytes', () => {
      expect(() => encryptGcm('test', 'short-hex')).toThrow(
        'Encryption secret must be exactly 32 bytes',
      );
      expect(() => decryptGcm({ ciphertext: 'aa', iv: 'bb', tag: 'cc' }, 'short-hex')).toThrow(
        'Encryption secret must be exactly 32 bytes',
      );
    });
  });

  describe('PKCE Generation', () => {
    it('generates a valid base64url code verifier and S256 code challenge', () => {
      const { codeVerifier, codeChallenge } = generatePkce();

      expect(codeVerifier).toHaveLength(43);
      expect(codeChallenge).toBeDefined();
      expect(/^[A-Za-z0-9_-]+$/.test(codeVerifier)).toBe(true);
      expect(/^[A-Za-z0-9_-]+$/.test(codeChallenge)).toBe(true);
    });
  });

  describe('OAuth State and HMAC', () => {
    it('generates state with valid prefix, hash, and HMAC', () => {
      const { rawState, statePrefix, stateHash, hmac } = generateOAuthState();

      expect(rawState).toHaveLength(43);
      expect(statePrefix).toHaveLength(16);
      expect(rawState.startsWith(statePrefix)).toBe(true);
      expect(isValidPrefix(statePrefix)).toBe(true);
      expect(stateHash).toHaveLength(64);
      expect(hmac).toHaveLength(64);
    });

    it('verifies valid state HMAC', () => {
      const { rawState, hmac } = generateOAuthState();
      expect(verifyOAuthStateHmac(rawState, hmac)).toBe(true);
    });

    it('rejects tampered state or HMAC', () => {
      const { rawState, hmac } = generateOAuthState();
      expect(verifyOAuthStateHmac(rawState + 'x', hmac)).toBe(false);
      const flipped = hmac.endsWith('00') ? hmac.slice(0, -2) + 'ff' : hmac.slice(0, -2) + '00';
      expect(verifyOAuthStateHmac(rawState, flipped)).toBe(false);
      expect(verifyOAuthStateHmac(rawState, 'invalid-length-hmac')).toBe(false);
    });
  });

  describe('Prefix Validation', () => {
    it('validates 16-character base64url prefixes correctly', () => {
      expect(isValidPrefix('abcdefghijklmnop')).toBe(true);
      expect(isValidPrefix('ABC_123-xyz98765')).toBe(true);
      expect(isValidPrefix('short')).toBe(false);
      expect(isValidPrefix('waytoolongprefixexceeding16chars')).toBe(false);
      expect(isValidPrefix('special!@#$%^&*(')).toBe(false);
    });
  });
});
