/**
 * Unit tests for duplicate validation utility
 * Tests business logic in isolation (mocked Prisma)
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../../api/_lib/prisma.js', () => ({
  prisma: {
    client: {
      findMany: jest.fn()
    }
  }
}));

const { checkForDuplicates, formatDuplicateError } = await import(
  '../../../../api/_lib/duplicateValidation.js'
);

describe('Duplicate Validation', () => {
  let mockPrisma;

  beforeEach(async () => {
    const prismaModule = await import('../../../../api/_lib/prisma.js');
    mockPrisma = prismaModule.prisma;
    jest.clearAllMocks();
  });

  describe('checkForDuplicates', () => {
    test('should return null when no duplicates found', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      const result = await checkForDuplicates({
        name: 'Unique Client Name',
        website: 'https://unique.com'
      });

      expect(result).toBeNull();
      expect(mockPrisma.client.findMany).toHaveBeenCalled();
    });

    test('should detect duplicate by name (case-insensitive)', async () => {
      const duplicate = {
        id: 'existing-id',
        name: 'Test Client',
        type: 'client'
      };

      mockPrisma.client.findMany.mockResolvedValue([duplicate]);

      const result = await checkForDuplicates({
        name: 'test client',
        website: 'https://different.com'
      });

      expect(result).not.toBeNull();
      expect(result.isDuplicate).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    test('should detect duplicate by website', async () => {
      const duplicate = {
        id: 'existing-id',
        name: 'Different Name',
        website: 'https://example.com',
        type: 'client'
      };

      mockPrisma.client.findMany.mockResolvedValue([duplicate]);

      const result = await checkForDuplicates({
        name: 'New Client',
        website: 'https://example.com'
      });

      expect(result).not.toBeNull();
      expect(result.isDuplicate).toBe(true);
    });

    test('should detect duplicate by email in contacts', async () => {
      const existingClient = {
        id: 'existing-id',
        name: 'Existing Client',
        type: 'client',
        contacts: JSON.stringify([{ email: 'shared@example.com' }])
      };

      mockPrisma.client.findMany.mockResolvedValue([existingClient]);

      const result = await checkForDuplicates({
        name: 'New Client',
        contacts: [{ email: 'shared@example.com' }]
      });

      expect(result).not.toBeNull();
      expect(result.isDuplicate).toBe(true);
    });

    test('should exclude current record when updating', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      const result = await checkForDuplicates(
        {
          name: 'Updated Client',
          website: 'https://example.com'
        },
        'current-id'
      );

      expect(result).toBeNull();
      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'current-id' }
          })
        })
      );
    });

    test('should detect duplicate by phone in contacts', async () => {
      const existingClient = {
        id: 'existing-id',
        name: 'Existing Client',
        type: 'client',
        contacts: JSON.stringify([{ phone: '082 123 4567' }])
      };

      mockPrisma.client.findMany.mockResolvedValue([existingClient]);

      const result = await checkForDuplicates({
        name: 'New Client',
        contacts: [{ phone: '0821234567' }]
      });

      expect(result).not.toBeNull();
      expect(result.isDuplicate).toBe(true);
    });

    test('should handle empty contacts array', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      const result = await checkForDuplicates({
        name: 'New Client',
        contacts: []
      });

      expect(result).toBeNull();
    });

    test('should handle missing name/website/contacts', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      const result = await checkForDuplicates({});

      expect(result).toBeNull();
    });
  });

  describe('formatDuplicateError', () => {
    test('should format duplicate error message', () => {
      const duplicateMatch = {
        isDuplicate: true,
        matches: [
          {
            id: 'existing-id',
            name: 'Existing Client',
            type: 'client',
            matchReasons: ['name']
          }
        ]
      };

      const message = formatDuplicateError(duplicateMatch);

      expect(message).toContain('duplicate');
      expect(message).toContain('Existing Client');
    });

    test('should handle multiple matches', () => {
      const duplicateMatch = {
        isDuplicate: true,
        matches: [
          { id: 'id1', name: 'Client 1', type: 'client', matchReasons: ['name'] },
          { id: 'id2', name: 'Client 2', type: 'client', matchReasons: ['website'] }
        ]
      };

      const message = formatDuplicateError(duplicateMatch);

      expect(message).toContain('Client 1');
      expect(message).toContain('Client 2');
    });

    test('should return null for non-duplicate matches', () => {
      const nonDuplicate = {
        isDuplicate: false,
        matches: []
      };

      const message = formatDuplicateError(nonDuplicate);

      expect(message).toBeNull();
    });
  });
});
