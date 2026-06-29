import { describe, test, expect } from '@jest/globals';
import {
  buildJobCardOwnerIdFilter,
  resolveJobCardOwnerFilterByCreatorName
} from '../../../../api/_lib/jobCardCreatorFilter.js';

describe('buildJobCardOwnerIdFilter', () => {
  test('returns empty in-list when no ids', () => {
    expect(buildJobCardOwnerIdFilter([])).toEqual({ ownerId: { in: [] } });
  });

  test('returns single id for one match', () => {
    expect(buildJobCardOwnerIdFilter(['user-1'])).toEqual({ ownerId: 'user-1' });
  });

  test('dedupes and returns in-list for multiple ids', () => {
    expect(buildJobCardOwnerIdFilter(['user-1', 'user-2', 'user-1'])).toEqual({
      ownerId: { in: ['user-1', 'user-2'] }
    });
  });
});

describe('resolveJobCardOwnerFilterByCreatorName', () => {
  test('resolves users by name contains', async () => {
    const prisma = {
      user: {
        findMany: async ({ where }) => {
          expect(where.OR[0].name.contains).toBe('Ethan Geer');
          return [{ id: 'ethan-id' }];
        }
      }
    };
    const filter = await resolveJobCardOwnerFilterByCreatorName(prisma, 'Ethan Geer');
    expect(filter).toEqual({ ownerId: 'ethan-id' });
  });

  test('returns empty filter when no users match', async () => {
    const prisma = {
      user: {
        findMany: async () => []
      }
    };
    const filter = await resolveJobCardOwnerFilterByCreatorName(prisma, 'Nobody');
    expect(filter).toEqual({ ownerId: { in: [] } });
  });
});
