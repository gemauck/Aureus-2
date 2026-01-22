import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
} from '../../../../api/_lib/response.js';
import { createMockResponse } from '../../../helpers/mockExpress.js';

describe('Response Utilities', () => {
  let res;

  beforeEach(() => {
    res = createMockResponse();
  });

  describe('ok', () => {
    test('should send 200 status with data', () => {
      const data = { message: 'Success' };
      ok(res, data);
      
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('Content-Type')).toBe('application/json');
      const responseData = res.getData();
      expect(responseData.data).toEqual(data);
    });

    test('should serialize Date objects to ISO strings', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const data = { createdAt: date };
      ok(res, data);
      
      const responseData = res.getData();
      expect(responseData.data.createdAt).toBe(date.toISOString());
    });

    test('should not send response if already sent', () => {
      res.end('Already sent');
      const data = { message: 'Should not send' };
      ok(res, data);
      
      // Should not overwrite the already sent data
      expect(res.data).toBe('Already sent');
    });
  });

  describe('created', () => {
    test('should send 201 status with data', () => {
      const data = { id: '123', name: 'New Resource' };
      created(res, data);
      
      expect(res.statusCode).toBe(201);
      expect(res.getHeader('Content-Type')).toBe('application/json');
      const responseData = res.getData();
      expect(responseData.data).toEqual(data);
    });
  });

  describe('badRequest', () => {
    test('should send 400 status with error message', () => {
      const message = 'Invalid input';
      badRequest(res, message);
      
      expect(res.statusCode).toBe(400);
      const responseData = res.getData();
      expect(responseData.error.code).toBe('BAD_REQUEST');
      expect(responseData.error.message).toBe(message);
    });

    test('should include details when provided', () => {
      const message = 'Validation failed';
      const details = 'Email is required';
      badRequest(res, message, details);
      
      const responseData = res.getData();
      expect(responseData.error.details).toBe(details);
    });
  });

  describe('unauthorized', () => {
    test('should send 401 status with default message', () => {
      unauthorized(res);
      
      expect(res.statusCode).toBe(401);
      const responseData = res.getData();
      expect(responseData.error.code).toBe('UNAUTHORIZED');
      expect(responseData.error.message).toBe('Unauthorized');
    });

    test('should send 401 status with custom message', () => {
      const message = 'Invalid credentials';
      unauthorized(res, message);
      
      expect(res.statusCode).toBe(401);
      const responseData = res.getData();
      expect(responseData.error.message).toBe(message);
    });
  });

  describe('forbidden', () => {
    test('should send 403 status with default message', () => {
      forbidden(res);
      
      expect(res.statusCode).toBe(403);
      const responseData = res.getData();
      expect(responseData.error.code).toBe('FORBIDDEN');
      expect(responseData.error.message).toBe('Forbidden');
    });

    test('should send 403 status with custom message', () => {
      const message = 'Insufficient permissions';
      forbidden(res, message);
      
      expect(res.statusCode).toBe(403);
      const responseData = res.getData();
      expect(responseData.error.message).toBe(message);
    });
  });

  describe('notFound', () => {
    test('should send 404 status with default message', () => {
      notFound(res);
      
      expect(res.statusCode).toBe(404);
      const responseData = res.getData();
      expect(responseData.error.code).toBe('NOT_FOUND');
      expect(responseData.error.message).toBe('Not found');
    });

    test('should send 404 status with custom message', () => {
      const message = 'Resource not found';
      notFound(res, message);
      
      expect(res.statusCode).toBe(404);
      const responseData = res.getData();
      expect(responseData.error.message).toBe(message);
    });
  });

  describe('serverError', () => {
    test('should send 500 status with default message', () => {
      serverError(res);
      
      expect(res.statusCode).toBe(500);
      const responseData = res.getData();
      expect(responseData.error.code).toBe('SERVER_ERROR');
      expect(responseData.error.message).toBe('Server error');
    });

    test('should send 500 status with custom message', () => {
      const message = 'Internal error occurred';
      serverError(res, message);
      
      expect(res.statusCode).toBe(500);
      const responseData = res.getData();
      expect(responseData.error.message).toBe(message);
    });

    test('should detect database connection errors', () => {
      const message = "Can't reach database server";
      serverError(res, message);
      
      const responseData = res.getData();
      expect(responseData.error.code).toBe('DATABASE_CONNECTION_ERROR');
      expect(responseData.error.message).toBe('Database connection failed');
    });

    test('should include full details in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const message = 'Error occurred';
      const details = 'Detailed error information';
      serverError(res, message, details);
      
      const responseData = res.getData();
      expect(responseData.error.fullDetails).toBe(details);
      
      process.env.NODE_ENV = originalEnv;
    });

    test('should not include full details in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const message = 'Error occurred';
      const details = 'Detailed error information';
      serverError(res, message, details);
      
      const responseData = res.getData();
      expect(responseData.error.fullDetails).toBeUndefined();
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});














