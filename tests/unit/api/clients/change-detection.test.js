/**
 * Unit tests for client API - Change Detection & Regression Prevention
 * 
 * These tests ensure that changes to the codebase don't break existing functionality.
 * They mock Prisma and test the API handlers in isolation.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createMockRequest, createMockResponse } from '../../../helpers/mockExpress.js';

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
    clientProposal: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    industry: {
      findUnique: jest.fn(),
      create: jest.fn(),
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

jest.unstable_mockModule('../../../../api/_lib/logger.js', () => ({
  withLogging: (handler) => handler,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

jest.unstable_mockModule('../../../../api/_lib/duplicateValidation.js', () => ({
  checkForDuplicates: jest.fn().mockResolvedValue(null),
  formatDuplicateError: jest.fn()
}));

jest.unstable_mockModule('../../../../api/_lib/notifyClientCreationStakeholders.js', () => ({
  notifyClientCreationStakeholders: jest.fn().mockResolvedValue(undefined)
}));

jest.unstable_mockModule('../../../../api/_lib/contactSiteIds.js', () => ({
  normalizeContactSiteIds: () => [],
  syncContactSiteLinks: jest.fn().mockResolvedValue(undefined),
  enrichContactsWithSiteIds: (c) => c,
  fetchContactSiteIdsByClientId: jest.fn().mockResolvedValue(new Map()),
  contactWithSiteIds: (c) => c
}));

const { default: handler } = await import('../../../../api/clients.js');

function body(res) {
  const parsed = res.getData();
  return parsed?.data ?? parsed;
}

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

    jest.clearAllMocks();

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user-id' });
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count = jest.fn().mockResolvedValue(0);
    mockPrisma.clientComment.findMany.mockResolvedValue([]);
    mockPrisma.clientProposal.findMany.mockResolvedValue([]);
    mockPrisma.clientContact.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.clientContact.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.clientComment.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.clientProposal.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.industry.findUnique.mockResolvedValue(null);
    mockPrisma.industry.create.mockResolvedValue({ name: 'Technology' });
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
      const responseData = body(res);
      expect(responseData.clients).toBeDefined();
      expect(responseData.clients.length).toBe(1);
      expect(responseData.clients[0].contacts).toBeDefined();
      expect(responseData.clients[0].comments).toBeDefined();
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
      const responseData = body(res);
      expect(Array.isArray(responseData.clients[0].contacts)).toBe(true);
      expect(Array.isArray(responseData.clients[0].comments)).toBe(true);
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

    test('should create contacts in normalized table when provided on create', async () => {
      req.url = '/api/clients';
      req.originalUrl = '/api/clients';
      req.body.contacts = [
        { id: 'contact-1', name: 'John Doe', email: 'john@test.com' }
      ];

      const createdClient = { id: 'new-client-id', name: 'New Test Client', type: 'client' };
      mockPrisma.client.create.mockResolvedValue(createdClient);
      mockPrisma.clientContact.create.mockResolvedValue({ id: 'contact-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user-id', name: 'Test', email: 'test@example.com' });

      await handler(req, res);

      expect(res.statusCode).toBe(201);
      expect(mockPrisma.clientContact.create).toHaveBeenCalled();
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
      const responseData = body(res);
      expect(responseData.error).toBeDefined();
    });
  });

  describe('PATCH /api/clients/[id] - Update Client', () => {
    beforeEach(() => {
      req.method = 'PATCH';
      req.params = { id: 'client-1' };
      req.url = '/api/clients/client-1';
      req.originalUrl = '/api/clients/client-1';
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
      req.url = '/api/clients/client-1';
      req.originalUrl = '/api/clients/client-1';
      req.body.contacts = [
        { id: 'contact-1', name: 'John Doe', email: 'john@test.com' },
        { id: 'contact-2', name: 'Jane Doe', email: 'jane@test.com' }
      ];

      const existingClient = { id: 'client-1', name: 'Test Client', type: 'client' };
      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue(existingClient);

      await handler(req, res);

      expect(mockPrisma.clientContact.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.clientContact.createMany).toHaveBeenCalled();
    });

    test('should preserve comments when updating client', async () => {
      req.url = '/api/clients/client-1';
      req.originalUrl = '/api/clients/client-1';
      req.body.comments = [
        { id: 'comment-1', text: 'Comment 1' },
        { id: 'comment-2', text: 'Comment 2' }
      ];

      const existingClient = { id: 'client-1', name: 'Test Client', type: 'client' };
      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue(existingClient);
      mockPrisma.clientComment.findMany.mockResolvedValue([]);
      mockPrisma.clientComment.create.mockResolvedValue({ id: 'comment-1' });

      await handler(req, res);

      expect(mockPrisma.clientComment.create).toHaveBeenCalled();
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

      const responseData = body(res);
      // Should include both 'client' type and null types
      expect(responseData.clients.length).toBe(2);
    });

    test('should preserve lead type when updating lead as client (should not happen)', async () => {
      // This is a regression test - ensures we don't accidentally convert leads to clients
      req.method = 'PATCH';
      req.params = { id: 'lead-1' };
      req.url = '/api/clients/lead-1';
      req.originalUrl = '/api/clients/lead-1';
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
      const responseData = body(res);
      expect(responseData.error).toBeDefined();
    });

    test('should handle missing client gracefully', async () => {
      req.method = 'GET';
      req.params = { id: 'non-existent-id' };
      req.url = '/api/clients/non-existent-id';
      req.originalUrl = '/api/clients/non-existent-id';

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

  describe('Regression Prevention - normalized contact/comment sync', () => {
    test('should sync contacts to normalized table on PATCH', async () => {
      req.method = 'PATCH';
      req.params = { id: 'client-1' };
      req.url = '/api/clients/client-1';
      req.originalUrl = '/api/clients/client-1';
      req.body = {
        name: 'Updated Name',
        contacts: [{ name: 'John Doe', email: 'john@test.com' }]
      };

      const existingClient = { id: 'client-1', name: 'Test Client', type: 'client' };
      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue(existingClient);

      await handler(req, res);

      expect(mockPrisma.clientContact.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.clientContact.createMany).toHaveBeenCalled();
    });

    test('should sync comments to normalized table on PATCH', async () => {
      req.method = 'PATCH';
      req.params = { id: 'client-1' };
      req.url = '/api/clients/client-1';
      req.originalUrl = '/api/clients/client-1';
      req.body = {
        name: 'Updated Name',
        comments: [{ text: 'New comment' }]
      };

      const existingClient = { id: 'client-1', name: 'Test Client', type: 'client' };
      mockPrisma.client.findUnique.mockResolvedValue(existingClient);
      mockPrisma.client.update.mockResolvedValue(existingClient);
      mockPrisma.clientComment.findMany.mockResolvedValue([]);
      mockPrisma.clientComment.create.mockResolvedValue({ id: 'comment-new' });

      await handler(req, res);

      expect(mockPrisma.clientComment.create).toHaveBeenCalled();
    });
  });
});

