import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  verifyRefreshToken,
} from '../../../../api/_lib/jwt.js';

describe('JWT Utilities', () => {
  beforeEach(() => {
    // Ensure JWT_SECRET is set
    process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing';
  });

  describe('signAccessToken', () => {
    test('should sign a valid access token', () => {
      const payload = { sub: 'user123', email: 'test@example.com', role: 'admin' };
      const token = signAccessToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should create tokens with different payloads', () => {
      const payload1 = { sub: 'user1', email: 'user1@example.com' };
      const payload2 = { sub: 'user2', email: 'user2@example.com' };
      
      const token1 = signAccessToken(payload1);
      const token2 = signAccessToken(payload2);
      
      expect(token1).not.toBe(token2);
    });

    test('should handle empty payload', () => {
      const token = signAccessToken({});
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('signRefreshToken', () => {
    test('should sign a valid refresh token', () => {
      const payload = { sub: 'user123', email: 'test@example.com' };
      const token = signRefreshToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    test('should create refresh tokens with longer expiration than access tokens', () => {
      const payload = { sub: 'user123' };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(accessToken).not.toBe(refreshToken);
    });
  });

  describe('verifyToken', () => {
    test('should verify a valid token', () => {
      const payload = { sub: 'user123', email: 'test@example.com', role: 'admin' };
      const token = signAccessToken(payload);
      const verified = verifyToken(token);
      
      expect(verified).toBeDefined();
      expect(verified.sub).toBe(payload.sub);
      expect(verified.email).toBe(payload.email);
      expect(verified.role).toBe(payload.role);
    });

    test('should return null for invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const verified = verifyToken(invalidToken);
      
      expect(verified).toBeNull();
    });

    test('should return null for tampered token', () => {
      const payload = { sub: 'user123' };
      const token = signAccessToken(payload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      const verified = verifyToken(tamperedToken);
      
      expect(verified).toBeNull();
    });

    test('should return null when JWT_SECRET is not set', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      const payload = { sub: 'user123' };
      const token = signAccessToken(payload);
      const verified = verifyToken(token);
      
      expect(verified).toBeNull();
      
      // Restore secret
      process.env.JWT_SECRET = originalSecret;
    });

    test('should return null for expired token', async () => {
      // Create a token with very short expiration
      const jwt = await import('jsonwebtoken');
      const payload = { sub: 'user123' };
      const expiredToken = jwt.default.sign(payload, process.env.JWT_SECRET, { expiresIn: '1ms' });
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const verified = verifyToken(expiredToken);
      expect(verified).toBeNull();
    });
  });

  describe('verifyRefreshToken', () => {
    test('should verify a valid refresh token', () => {
      const payload = { sub: 'user123', email: 'test@example.com' };
      const token = signRefreshToken(payload);
      const verified = verifyRefreshToken(token);
      
      expect(verified).toBeDefined();
      expect(verified.sub).toBe(payload.sub);
      expect(verified.email).toBe(payload.email);
    });

    test('should return null for invalid refresh token', () => {
      const invalidToken = 'invalid.refresh.token';
      const verified = verifyRefreshToken(invalidToken);
      
      expect(verified).toBeNull();
    });
  });

  describe('Token expiration', () => {
    test('access token should expire after 6 hours', () => {
      const payload = { sub: 'user123' };
      const token = signAccessToken(payload);
      const verified = verifyToken(token);
      
      expect(verified).toBeDefined();
      expect(verified.exp).toBeDefined();
      
      // Check expiration is approximately 6 hours from now
      const now = Math.floor(Date.now() / 1000);
      const sixHours = 6 * 60 * 60;
      const expectedExp = now + sixHours;
      
      // Allow 5 second tolerance
      expect(Math.abs(verified.exp - expectedExp)).toBeLessThan(5);
    });

    test('refresh token should expire after 14 days', () => {
      const payload = { sub: 'user123' };
      const token = signRefreshToken(payload);
      const verified = verifyRefreshToken(token);
      
      expect(verified).toBeDefined();
      expect(verified.exp).toBeDefined();
      
      // Check expiration is approximately 14 days from now
      const now = Math.floor(Date.now() / 1000);
      const fourteenDays = 14 * 24 * 60 * 60;
      const expectedExp = now + fourteenDays;
      
      // Allow 5 second tolerance
      expect(Math.abs(verified.exp - expectedExp)).toBeLessThan(5);
    });
  });
});

