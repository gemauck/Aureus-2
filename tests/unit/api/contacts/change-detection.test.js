/**
 * Unit tests for contacts API - Change Detection
 * Ensures contacts are only written to normalized tables, never to JSON fields
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { createMockRequest, createMockResponse } from '../../../helpers/mockExpress.js';
import handler from '../../../../api/contacts.js';

// Mock Prisma
jest.unstable_mockModule('../../../../api/_lib/prisma.js', () => ({
  prisma: {
    clientContact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $disconnect: jest.fn(),
  }
}));

// Mock auth middleware
jest.unstable_mockModule('../../../../api/_lib/authRequired.js', () => ({
  authRequired: (handler) => handler
}));

jest.unstable_mockModule('../../../../api/_lib/withHttp.js', () => ({
  withHttp: (handler) => handler
}));

jest.unstable_mockModule('../../../../api/_lib/withLogging.js', () => ({
  withLogging: (handler) => handler
}));

describe('Contacts API - Change Detection Tests', () => {
  let req, res;
  let mockPrisma;

  beforeEach(async () => {
    req = createMockRequest({
      method: 'GET',
      url: '/api/contacts',
      user: { sub: 'test-user-id', email: 'test@example.com' }
    });
    res = createMockResponse();

    const prismaModule = await import('../../../../api/_lib/prisma.js');
    mockPrisma = prismaModule.prisma;
    jest.clearAllMocks();
  });

  describe('POST /api/contacts - Create Contact', () => {
    beforeEach(() => {
      req.method = 'POST';
      req.body = {
        clientId: 'client-1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '011-123-4567'
      };
    });

    test('should create contact in normalized table', async () => {
      const createdContact = {
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '011-123-4567'
      };

      mockPrisma.clientContact.create.mockResolvedValue(createdContact);
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1', name: 'Test Client' });

      await handler(req, res);

      expect(mockPrisma.clientContact.create).toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
    });

    test('should NEVER update client JSON fields when creating contact', async () => {
      const createdContact = {
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe'
      };

      mockPrisma.clientContact.create.mockResolvedValue(createdContact);
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1', name: 'Test Client' });

      await handler(req, res);

      // CRITICAL: Should NOT update client.contacts or client.contactsJsonb
      expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });

    test('should validate required fields', async () => {
      req.body = { clientId: 'client-1' }; // Missing name

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(mockPrisma.clientContact.create).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/contacts/[id] - Update Contact', () => {
    beforeEach(() => {
      req.method = 'PUT';
      req.params = { id: 'contact-1' };
      req.url = '/api/contacts/contact-1';
      req.body = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };
    });

    test('should update contact in normalized table', async () => {
      const existingContact = {
        id: 'contact-1',
        clientId: 'client-1',
        name: 'Original Name',
        email: 'original@example.com'
      };

      mockPrisma.clientContact.findUnique.mockResolvedValue(existingContact);
      mockPrisma.clientContact.update.mockResolvedValue({
        ...existingContact,
        name: 'Updated Name'
      });

      await handler(req, res);

      expect(mockPrisma.clientContact.update).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    test('should NEVER update client JSON fields when updating contact', async () => {
      const existingContact = {
        id: 'contact-1',
        clientId: 'client-1',
        name: 'Original Name'
      };

      mockPrisma.clientContact.findUnique.mockResolvedValue(existingContact);
      mockPrisma.clientContact.update.mockResolvedValue(existingContact);

      await handler(req, res);

      // CRITICAL: Should NOT update client.contacts or client.contactsJsonb
      expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/contacts/[id] - Delete Contact', () => {
    beforeEach(() => {
      req.method = 'DELETE';
      req.params = { id: 'contact-1' };
      req.url = '/api/contacts/contact-1';
    });

    test('should delete contact from normalized table', async () => {
      const existingContact = {
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe'
      };

      mockPrisma.clientContact.findUnique.mockResolvedValue(existingContact);
      mockPrisma.clientContact.delete.mockResolvedValue(existingContact);

      await handler(req, res);

      expect(mockPrisma.clientContact.delete).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    test('should NEVER update client JSON fields when deleting contact', async () => {
      const existingContact = {
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe'
      };

      mockPrisma.clientContact.findUnique.mockResolvedValue(existingContact);
      mockPrisma.clientContact.delete.mockResolvedValue(existingContact);

      await handler(req, res);

      // CRITICAL: Should NOT update client.contacts or client.contactsJsonb
      expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/contacts - List Contacts', () => {
    beforeEach(() => {
      req.method = 'GET';
      req.query = { clientId: 'client-1' };
    });

    test('should return contacts from normalized table', async () => {
      const mockContacts = [
        { id: 'contact-1', name: 'John Doe', email: 'john@example.com', clientId: 'client-1' },
        { id: 'contact-2', name: 'Jane Doe', email: 'jane@example.com', clientId: 'client-1' }
      ];

      mockPrisma.clientContact.findMany.mockResolvedValue(mockContacts);

      await handler(req, res);

      expect(mockPrisma.clientContact.findMany).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      const responseData = res.getData();
      expect(responseData.contacts).toBeDefined();
      expect(responseData.contacts.length).toBe(2);
    });
  });
});

