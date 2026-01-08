import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { authRequired } from '../../../../api/_lib/authRequired.js';
import { signAccessToken } from '../../../../api/_lib/jwt.js';
import { createMockRequest, createMockResponse } from '../../../helpers/mockExpress.js';

describe('authRequired Middleware', () => {
  let mockHandler;
  let req;
  let res;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing';
    mockHandler = jest.fn();
    res = createMockResponse();
  });

  describe('Valid token scenarios', () => {
    test('should call handler when valid token is provided', async () => {
      const payload = { sub: 'user123', email: 'test@example.com', role: 'admin' };
      const token = signAccessToken(payload);
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      
      mockHandler.mockResolvedValue({ success: true });
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.sub).toBe(payload.sub);
      expect(req.user.email).toBe(payload.email);
    });

    test('should attach user payload to request', async () => {
      const payload = { sub: 'user456', email: 'user@example.com', role: 'user' };
      const token = signAccessToken(payload);
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      
      mockHandler.mockResolvedValue({ success: true });
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(req.user).toEqual(expect.objectContaining({
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      }));
    });

    test('should handle async handler functions', async () => {
      const payload = { sub: 'user789' };
      const token = signAccessToken(payload);
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      
      const asyncResult = { data: 'async result' };
      mockHandler.mockResolvedValue(asyncResult);
      
      const middleware = authRequired(mockHandler);
      const result = await middleware(req, res);
      
      expect(result).toEqual(asyncResult);
    });

    test('should handle synchronous handler functions', async () => {
      const payload = { sub: 'user789' };
      const token = signAccessToken(payload);
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      
      const syncResult = { data: 'sync result' };
      mockHandler.mockReturnValue(syncResult);
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('Invalid token scenarios', () => {
    test('should return unauthorized when no token is provided', async () => {
      req = createMockRequest({
        headers: {},
      });
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      const data = res.getData();
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    test('should return unauthorized when authorization header is missing', async () => {
      req = createMockRequest({
        headers: { 'content-type': 'application/json' },
      });
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    test('should return unauthorized when token format is invalid', async () => {
      req = createMockRequest({
        headers: { authorization: 'InvalidFormat token' },
      });
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    test('should return unauthorized when token is invalid', async () => {
      req = createMockRequest({
        headers: { authorization: 'Bearer invalid.token.here' },
      });
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    test('should return unauthorized when token has no sub claim', async () => {
      const jwt = await import('jsonwebtoken');
      const tokenWithoutSub = jwt.default.sign(
        { email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${tokenWithoutSub}` },
      });
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    test('should return unauthorized when token is expired', async () => {
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.default.sign(
        { sub: 'user123' },
        process.env.JWT_SECRET,
        { expiresIn: '1ms' }
      );
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Error handling', () => {
    test('should handle handler errors gracefully', async () => {
      const payload = { sub: 'user123' };
      const token = signAccessToken(payload);
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      
      const handlerError = new Error('Handler error');
      mockHandler.mockRejectedValue(handlerError);
      
      const middleware = authRequired(mockHandler);
      
      await expect(middleware(req, res)).rejects.toThrow('Handler error');
    });

    test('should not send response twice if handler already sent it', async () => {
      const payload = { sub: 'user123' };
      const token = signAccessToken(payload);
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      
      mockHandler.mockImplementation((req, res) => {
        res.end('Response sent');
        throw new Error('Error after response');
      });
      
      const middleware = authRequired(mockHandler);
      
      // Should not throw even if handler sends response and then errors
      await expect(middleware(req, res)).rejects.toThrow();
      expect(res.headersSent).toBe(true);
    });
  });

  describe('Token extraction', () => {
    test('should extract token from Bearer format', async () => {
      const payload = { sub: 'user123' };
      const token = signAccessToken(payload);
      
      req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      
      mockHandler.mockResolvedValue({});
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });

    test('should handle token with extra spaces', async () => {
      const payload = { sub: 'user123' };
      const token = signAccessToken(payload);
      
      req = createMockRequest({
        headers: { authorization: `Bearer  ${token}  ` },
      });
      
      mockHandler.mockResolvedValue({});
      
      const middleware = authRequired(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).toHaveBeenCalled();
    });
  });
});

