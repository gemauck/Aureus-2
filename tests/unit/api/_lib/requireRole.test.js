import { describe, test, expect, beforeEach } from '@jest/globals';
import { requireRole } from '../../../../api/_lib/requireRole.js';
import { createMockRequest, createMockResponse } from '../../../helpers/mockExpress.js';

describe('requireRole Middleware', () => {
  let req;
  let res;
  let mockHandler;

  beforeEach(() => {
    res = createMockResponse();
    mockHandler = jest.fn((req, res) => {
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    });
  });

  describe('Role-based access control', () => {
    test('should allow access when user has required role', async () => {
      req = createMockRequest({
        user: { sub: 'user123', role: 'admin' },
      });
      
      const middleware = requireRole(['admin', 'manager'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    test('should deny access when user does not have required role', async () => {
      req = createMockRequest({
        user: { sub: 'user123', role: 'user' },
      });
      
      const middleware = requireRole(['admin', 'manager'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      const data = res.getData();
      expect(data.error.code).toBe('FORBIDDEN');
    });

    test('should allow access when user has one of multiple allowed roles', async () => {
      req = createMockRequest({
        user: { sub: 'user123', role: 'manager' },
      });
      
      const middleware = requireRole(['admin', 'manager', 'supervisor'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    test('should deny access when user role is not in allowed list', async () => {
      req = createMockRequest({
        user: { sub: 'user123', role: 'guest' },
      });
      
      const middleware = requireRole(['admin', 'manager'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Authentication checks', () => {
    test('should return forbidden when user is not authenticated', async () => {
      req = createMockRequest({
        user: null,
      });
      
      const middleware = requireRole(['admin'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      const data = res.getData();
      expect(data.error.code).toBe('FORBIDDEN');
    });

    test('should return forbidden when req.user is undefined', async () => {
      req = createMockRequest({});
      delete req.user;
      
      const middleware = requireRole(['admin'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    test('should return forbidden when user has no role', async () => {
      req = createMockRequest({
        user: { sub: 'user123' },
      });
      
      const middleware = requireRole(['admin'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Single role requirement', () => {
    test('should allow access for single required role', async () => {
      req = createMockRequest({
        user: { sub: 'user123', role: 'admin' },
      });
      
      const middleware = requireRole(['admin'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    test('should deny access when role does not match single requirement', async () => {
      req = createMockRequest({
        user: { sub: 'user123', role: 'user' },
      });
      
      const middleware = requireRole(['admin'])(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    test('should accept single role as string (not array)', async () => {
      req = createMockRequest({
        user: { sub: 'user123', role: 'admin' },
      });
      
      const middleware = requireRole('admin')(mockHandler);
      await middleware(req, res);
      
      expect(mockHandler).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });
  });
});

