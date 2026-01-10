/**
 * Unit tests for client API - Change Detection & Regression Prevention
 * 
 * These tests ensure that changes to the codebase don't break existing functionality.
 * They mock Prisma and test the API handlers in isolation.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createMockRequest, createMockResponse } from '../../../helpers/mockExpress.js';
import handler from '../../../../api/clients.js';

// Mock Prisma
jest.unstable_mockModule('../../../../api/_lib/prisma.js', () => ({
  prisma: {
    client: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    clientContact: {
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    clientComment: {
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $disconnect: jest.fn(),
  }
}));

// Mock auth middleware - we'll test the handler directly
jest.unstable_mockModule('../../../../api/_lib/authRequired.js', () => ({
  authRequired: (handler) => handler
}));

// Mock other dependencies
jest.unstable_mockModule('../../../../api/_lib/withHttp.js', () => ({
  withHttp: (handler) => handler
}));

jest.unstable_mockModule('../../../../api/_lib/withLogging.js', () => ({
  withLogging: (handler) => handler
}));

describe('Client API - Change Detection Tests', () => {
  let req, res;
  let mockPrisma;

  beforeEach(async () => {
    req = createMockRequest({
      method: 'GET',
      url: '/api/clients',
      user: { sub: 'test-user-id', email: 'test@example.com' }
    });
    res = createMockResponse();

    // Import mocked prisma
    const prismaModule = await import('../../../../api/_lib/prisma.js');
    mockPrisma = prismaModule.prisma;

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/clients - List Clients', () => {
    test('should return clients with normalized contacts and comments', async () => {
      const mockClients = [
        {
          id: 'client-1',
          name: 'Test Client',
          type: 'client',
          industry: 'Mining',
          status: 'active',
          clientContacts: [
            { id: 'contact-1', name: 'John Doe', email: 'john@test.com', isPrimary: true }
          ],
          clientComments: [
            { id: 'comment-1', text: 'First comment', author: 'Test User' }
          ]
        }
      ];

      mockPrisma.client.findMany.mockResolvedValue(mockClients);

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const responseData = res.getData();
      expect(responseData.clients).toBeDefined();
      expect(responseData.clients.length).toBe(1);
      expect(responseData.clients[0].clientContacts).toBeDefined();
      expect(responseData.clients[0].clientComments).toBeDefined();
    });

    test('should NOT write to deprecated JSON fields when querying', async () => {
      const mockClients = [{ id: 'client-1', name: 'Test Client', type: 'client' }];
      mockPrisma.client.findMany.mockResolvedValue(mockClients);

      await handler(req, res);

      // Verify no update operations were called (no JSON writes)
      expect(mockPrisma.client.update).not.toHaveBeenCalled();
      expect(mockPrisma.client.create).not.toHaveBeenCalled();
    });

    test('should handle missing contacts/comments gracefully', async () => {
      const mockClients = [
        {
          id: 'client-1',
          name: 'Test Client',
          type: 'client',
          clientContacts: [],
          clientComments: []
        }
      ];

      mockPrisma.client.findMany.mockResolvedValue(mockClients);

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const responseData = res.getData();
      expect(Array.isArray(responseData.clients[0].clientContacts)).toBe(true);
      expect(Array.isArray(responseData.clients[0].clientComments)).toBe(true);
    });
  });

  describe('POST /api/clients - Create Client', () => {
    beforeEach(() => {
      req.method = 'POST';
      req.body = {
        name: 'New Test Client',
        industry: 'Technology',
        type: 'client'
      };
    });

    test('should create client and sync contacts to normalized table', async () => {
      const createdClient = {
        id: 'new-client-id',
        name: 'New Test Client',
        type: 'client',
        industry: 'Technology',
        status: 'active'
      };

      mockPrisma.client.create.mockResolvedValue(createdClient);
      mockPrisma.clientContact.createMany.mockResolvedValue({ count: 0 });

      await handler(req, res);

      expect(mockPrisma.client.create).toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
    });

    test('should use upsert for contacts when provided (not createMany)', async () => {
      req.body.contactsJsonb = [
        { id: 'contact-1', name: 'John Doe', email: 'john@test.com' }
      ];

      const createdClient = { id: 'new-client-id', name: 'New Test Client' };
      mockPrisma.client.create.mockResolvedValue(createdClient);
      mockPrisma.clientContact.upsert.mockResolvedValue({});

      await handler(req, res);

      // Should use upsert, not createMany (to handle duplicate IDs)
      expect(mockPrisma.clientContact.upsert).toHaveBeenCalled();
    });

    test('should NOT write contacts to JSON fields', async () => {
      req.body.contactsJsonb = [
        { name: 'John Doe', email: 'john@test.com' }
      ];

      const createdClient = { id: 'new-client-id', name: 'New Test Client' };
      mockPrisma.client.create.mockResolvedValue(createdClient);

      await handler(req, res);

      // Verify the create call doesn't include contacts/contactsJsonb
      const createCall = mockPrisma.client.create.mock.calls[0][0];
      expect(createCall.data).not.toHaveProperty('contacts');
      expect(createCall.data).not.toHaveProperty('contactsJsonb');
    });

    test('should handle missing name gracefully', async () => {
      req.body = { industry: 'Technology' }; // No name

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      const responseData = res.getData();
      expect(responseData.error).toBeDefined();
    });
  });

  describe('PUT /api/clients/[id] - Update Client', () => {
    beforeEach(() => {
      req.method = 'PUT';
      req.params = { id: 'client-1' };
      req.url = '/api/clients/client-1';
      req.body = {
        name: 'Updated Client Name',
        industry: 'Updated Industry'
      };
    });

    test('should update client without affecting contacts/comments', async () => {
      const existingClient = {
        id: 'client-1',
        name: 'Original Name',
        type: 'client'
      };

      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue({
        ...existingClient,
        name: 'Updated Client Name'
      });

      await handler(req, res);

      expect(mockPrisma.client.update).toHaveBeenCalled();
      // Should not delete or modify contacts
      expect(mockPrisma.clientContact.deleteMany).not.toHaveBeenCalled();
    });

    test('should preserve contacts when updating client fields', async () => {
      req.body.contacts = [
        { id: 'contact-1', name: 'John Doe', email: 'john@test.com' },
        { id: 'contact-2', name: 'Jane Doe', email: 'jane@test.com' }
      ];

      const existingClient = { id: 'client-1', name: 'Test Client', type: 'client' };
      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue(existingClient);
      mockPrisma.clientContact.upsert.mockResolvedValue({});

      await handler(req, res);

      // Should use upsert for each contact (handles duplicates)
      expect(mockPrisma.clientContact.upsert).toHaveBeenCalledTimes(2);
      // Should NOT write to JSON fields
      const updateCall = mockPrisma.client.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('contacts');
      expect(updateCall.data).not.toHaveProperty('contactsJsonb');
    });

    test('should preserve comments when updating client', async () => {
      req.body.comments = [
        { id: 'comment-1', text: 'Comment 1' },
        { id: 'comment-2', text: 'Comment 2' }
      ];

      const existingClient = { id: 'client-1', name: 'Test Client', type: 'client' };
      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue(existingClient);
      mockPrisma.clientComment.upsert.mockResolvedValue({});

      await handler(req, res);

      // Should use upsert for comments
      expect(mockPrisma.clientComment.upsert).toHaveBeenCalled();
      // Should NOT write to JSON fields
      const updateCall = mockPrisma.client.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('comments');
      expect(updateCall.data).not.toHaveProperty('commentsJsonb');
    });

    test('should handle partial updates without clearing other fields', async () => {
      req.body = { name: 'Only Name Updated' }; // Only name, no other fields

      const existingClient = {
        id: 'client-1',
        name: 'Original Name',
        industry: 'Original Industry',
        notes: 'Original Notes',
        type: 'client'
      };

      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue({
        ...existingClient,
        name: 'Only Name Updated'
      });

      await handler(req, res);

      // Prisma update should only update provided fields
      const updateCall = mockPrisma.client.update.mock.calls[0][0];
      expect(updateCall.data.name).toBe('Only Name Updated');
      // Other fields should not be in update data (Prisma preserves them)
      expect(updateCall.data).not.toHaveProperty('industry');
    });
  });

  describe('Data Normalization Tests', () => {
    test('should handle client type correctly (client vs lead)', async () => {
      const mockClients = [
        { id: 'client-1', name: 'Client 1', type: 'client' },
        { id: 'client-2', name: 'Client 2', type: null } // Legacy client
      ];

      mockPrisma.client.findMany.mockResolvedValue(mockClients);
      req.method = 'GET';

      await handler(req, res);

      const responseData = res.getData();
      // Should include both 'client' type and null types
      expect(responseData.clients.length).toBe(2);
    });

    test('should preserve lead type when updating lead as client (should not happen)', async () => {
      // This is a regression test - ensures we don't accidentally convert leads to clients
      req.method = 'PUT';
      req.params = { id: 'lead-1' };
      req.url = '/api/clients/lead-1';
      req.body = { name: 'Updated Name' };

      const existingLead = {
        id: 'lead-1',
        name: 'Test Lead',
        type: 'lead' // This is a lead, not a client
      };

      mockPrisma.client.findUnique.mockResolvedValue(existingLead);
      
      // The handler should reject this or handle it appropriately
      // (This depends on your business logic - adjust test accordingly)
      await handler(req, res);

      // Verify type is preserved if update happens
      if (mockPrisma.client.update.mock.calls.length > 0) {
        const updateCall = mockPrisma.client.update.mock.calls[0][0];
        // Type should not be changed from 'lead' to 'client'
        expect(updateCall.data.type).not.toBe('client');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      const dbError = new Error("Can't reach database server");
      dbError.code = 'P1001';
      mockPrisma.client.findMany.mockRejectedValue(dbError);

      req.method = 'GET';

      await handler(req, res);

      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      const responseData = res.getData();
      expect(responseData.error).toBeDefined();
    });

    test('should handle missing client gracefully', async () => {
      req.method = 'GET';
      req.params = { id: 'non-existent-id' };
      req.url = '/api/clients/non-existent-id';

      mockPrisma.client.findUnique.mockResolvedValue(null);

      await handler(req, res);

      expect(res.statusCode).toBe(404);
    });

    test('should validate required fields', async () => {
      req.method = 'POST';
      req.body = {}; // Missing required name field

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(mockPrisma.client.create).not.toHaveBeenCalled();
    });
  });

  describe('Regression Prevention - JSON Write Removal', () => {
    test('should NEVER write to contacts JSON field', async () => {
      req.method = 'PUT';
      req.params = { id: 'client-1' };
      req.body = {
        name: 'Updated Name',
        contacts: [{ name: 'John Doe', email: 'john@test.com' }]
      };

      const existingClient = { id: 'client-1', name: 'Test Client', type: 'client' };
      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue(existingClient);
      mockPrisma.clientContact.upsert.mockResolvedValue({});

      await handler(req, res);

      // Verify update doesn't include contacts field
      const updateCall = mockPrisma.client.update.mock.calls[0][0];
      expect(updateCall.data.contacts).toBeUndefined();
      expect(updateCall.data.contactsJsonb).toBeUndefined();
    });

    test('should NEVER write to comments JSON field', async () => {
      req.method = 'PUT';
      req.params = { id: 'client-1' };
      req.body = {
        name: 'Updated Name',
        comments: [{ text: 'New comment' }]
      };

      const existingClient = { id: 'client-1', name: 'Test Client', type: 'client' };
      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue(existingClient);
      mockPrisma.clientComment.upsert.mockResolvedValue({});

      await handler(req, res);

      // Verify update doesn't include comments field
      const updateCall = mockPrisma.client.update.mock.calls[0][0];
      expect(updateCall.data.comments).toBeUndefined();
      expect(updateCall.data.commentsJsonb).toBeUndefined();
    });
  });
});

