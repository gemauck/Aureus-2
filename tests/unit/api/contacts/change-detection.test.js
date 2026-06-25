/**
 * Unit tests for contacts API - Change Detection
 * Ensures contacts are only written to normalized tables, never to JSON fields
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { createMockRequest, createMockResponse } from '../../../helpers/mockExpress.js';

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

jest.unstable_mockModule('../../../../api/_lib/authRequired.js', () => ({
  authRequired: (handler) => handler
}));

jest.unstable_mockModule('../../../../api/_lib/withHttp.js', () => ({
  withHttp: (handler) => handler
}));

jest.unstable_mockModule('../../../../api/_lib/logger.js', () => ({
  withLogging: (handler) => handler,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

jest.unstable_mockModule('../../../../api/_lib/contactSiteIds.js', () => ({
  enrichContactsWithSiteIds: (contacts) => contacts,
  fetchContactSiteIdsByClientId: jest.fn().mockResolvedValue(new Map()),
  normalizeContactSiteIds: () => [],
  syncContactSiteLinks: jest.fn().mockResolvedValue(undefined),
  contactWithSiteIds: (contact) => contact
}));

const { default: handler } = await import('../../../../api/contacts.js');

function body(res) {
  const parsed = res.getData();
  return parsed?.data ?? parsed;
}

describe('Contacts API - Change Detection Tests', () => {
  let req;
  let res;
  let mockPrisma;

  beforeEach(async () => {
    req = createMockRequest({
      method: 'GET',
      url: '/contacts/client/client-1',
      user: { sub: 'test-user-id', email: 'test@example.com' }
    });
    res = createMockResponse();

    const prismaModule = await import('../../../../api/_lib/prisma.js');
    mockPrisma = prismaModule.prisma;

    jest.clearAllMocks();

    mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
    mockPrisma.clientContact.findMany.mockResolvedValue([]);
  });

  describe('POST /api/contacts/client/:clientId - Create Contact', () => {
    beforeEach(() => {
      req.method = 'POST';
      req.url = '/contacts/client/client-1';
      req.body = {
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

      await handler(req, res);

      expect(mockPrisma.clientContact.create).toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
    });

    test('should NEVER update client JSON fields when creating contact', async () => {
      mockPrisma.clientContact.create.mockResolvedValue({
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe'
      });

      await handler(req, res);

      expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });

    test('should validate required fields', async () => {
      req.body = {};

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(mockPrisma.clientContact.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/contacts/client/:clientId/:contactId - Update Contact', () => {
    beforeEach(() => {
      req.method = 'PATCH';
      req.url = '/contacts/client/client-1/contact-1';
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

      mockPrisma.clientContact.findFirst.mockResolvedValue(existingContact);
      mockPrisma.clientContact.update.mockResolvedValue({
        ...existingContact,
        name: 'Updated Name'
      });

      await handler(req, res);

      expect(mockPrisma.clientContact.update).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    test('should NEVER update client JSON fields when updating contact', async () => {
      mockPrisma.clientContact.findFirst.mockResolvedValue({
        id: 'contact-1',
        clientId: 'client-1',
        name: 'Original Name'
      });
      mockPrisma.clientContact.update.mockResolvedValue({
        id: 'contact-1',
        clientId: 'client-1',
        name: 'Updated Name'
      });

      await handler(req, res);

      expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/contacts/client/:clientId/:contactId - Delete Contact', () => {
    beforeEach(() => {
      req.method = 'DELETE';
      req.url = '/contacts/client/client-1/contact-1';
    });

    test('should delete contact from normalized table', async () => {
      mockPrisma.clientContact.findFirst.mockResolvedValue({
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe'
      });
      mockPrisma.clientContact.delete.mockResolvedValue({
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe'
      });

      await handler(req, res);

      expect(mockPrisma.clientContact.delete).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    test('should NEVER update client JSON fields when deleting contact', async () => {
      mockPrisma.clientContact.findFirst.mockResolvedValue({
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe'
      });
      mockPrisma.clientContact.delete.mockResolvedValue({
        id: 'contact-1',
        clientId: 'client-1',
        name: 'John Doe'
      });

      await handler(req, res);

      expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/contacts/client/:clientId - List Contacts', () => {
    beforeEach(() => {
      req.method = 'GET';
      req.url = '/contacts/client/client-1';
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
      const responseData = body(res);
      expect(responseData.contacts).toBeDefined();
      expect(responseData.contacts.length).toBe(2);
    });
  });
});
