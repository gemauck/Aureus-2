/**
 * Unit tests for duplicate validation utility
 * Tests business logic in isolation (mocked Prisma)
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { checkForDuplicates, formatDuplicateError } from '../../../../api/_lib/duplicateValidation.js';

// Mock Prisma
jest.unstable_mockModule('../../../../api/_lib/prisma.js', () => ({
  prisma: {
    client: {
      findMany: jest.fn(),
    }
  }
}));

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
        name: 'test client', // Different case
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
        website: 'https://example.com' // Same website
      });

      expect(result).not.toBeNull();
      expect(result.isDuplicate).toBe(true);
    });

    test('should detect duplicate by email in contacts', async () => {
      const existingClient = {
        id: 'existing-id',
        name: 'Existing Client',
        contacts: JSON.stringify([
          { email: 'john@example.com' }
        ]),
        type: 'client'
      };

      mockPrisma.client.findMany.mockResolvedValue([existingClient]);

      const result = await checkForDuplicates({
        name: 'New Client',
        contacts: [
          { email: 'john@example.com' } // Same email
        ]
      });

      expect(result).not.toBeNull();
      expect(result.isDuplicate).toBe(true);
    });

    test('should detect duplicate by phone in contacts', async () => {
      const existingClient = {
        id: 'existing-id',
        name: 'Existing Client',
        contacts: JSON.stringify([
          { phone: '011-123-4567' }
        ]),
        type: 'client'
      };

      mockPrisma.client.findMany.mockResolvedValue([existingClient]);

      const result = await checkForDuplicates({
        name: 'New Client',
        contacts: [
          { phone: '(011) 123-4567' } // Same number, different format
        ]
      });

      expect(result).not.toBeNull();
      expect(result.isDuplicate).toBe(true);
    });

    test('should exclude current record when checking duplicates (for updates)', async () => {
      const sameClient = {
        id: 'current-id',
        name: 'Test Client',
        type: 'client'
      };

      mockPrisma.client.findMany.mockResolvedValue([]); // Should exclude current-id

      const result = await checkForDuplicates(
        {
          name: 'Test Client'
        },
        'current-id' // Exclude this ID
      );

      expect(result).toBeNull(); // No duplicates because current record is excluded
      
      // Verify excludeId was used in query
      const queryCall = mockPrisma.client.findMany.mock.calls[0][0];
      expect(queryCall.where.NOT.id).toBe('current-id');
    });

    test('should normalize phone numbers (remove spaces, dashes, parentheses)', async () => {
      const existingClient = {
        id: 'existing-id',
        name: 'Existing Client',
        contacts: JSON.stringify([
          { phone: '0111234567' } // No formatting
        ]),
        type: 'client'
      };

      mockPrisma.client.findMany.mockResolvedValue([existingClient]);

      // Test various phone formats that should match
      const formats = [
        '011-123-4567',
        '(011) 123-4567',
        '011 123 4567',
        '0111234567'
      ];

      for (const phone of formats) {
        mockPrisma.client.findMany.mockResolvedValue([existingClient]);
        const result = await checkForDuplicates({
          name: 'New Client',
          contacts: [{ phone }]
        });

        expect(result).not.toBeNull();
        expect(result.isDuplicate).toBe(true);
      }
    });

    test('should normalize emails (lowercase, trim)', async () => {
      const existingClient = {
        id: 'existing-id',
        name: 'Existing Client',
        contacts: JSON.stringify([
          { email: 'john@example.com' }
        ]),
        type: 'client'
      };

      mockPrisma.client.findMany.mockResolvedValue([existingClient]);

      const formats = [
        'JOHN@EXAMPLE.COM',
        '  john@example.com  ',
        'John@Example.com'
      ];

      for (const email of formats) {
        mockPrisma.client.findMany.mockResolvedValue([existingClient]);
        const result = await checkForDuplicates({
          name: 'New Client',
          contacts: [{ email }]
        });

        expect(result).not.toBeNull();
        expect(result.isDuplicate).toBe(true);
      }
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

      expect(result).toBeNull(); // No duplicates if no data to check
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
            matchType: 'name'
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
          { id: 'id1', name: 'Client 1', matchType: 'name' },
          { id: 'id2', name: 'Client 2', matchType: 'website' }
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

