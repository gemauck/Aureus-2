import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  enrichJobCardRowsSiteNames,
  resolveClientSiteName
} from '../../../../api/_lib/jobCardSiteResolve.js';

describe('jobCardSiteResolve', () => {
  let prisma;

  beforeEach(() => {
    prisma = {
      clientSite: {
        findUnique: jest.fn(),
        findMany: jest.fn()
      }
    };
  });

  test('resolveClientSiteName returns trimmed name', async () => {
    prisma.clientSite.findUnique.mockResolvedValue({ name: '  MFC  ' });
    await expect(resolveClientSiteName(prisma, 'site-1')).resolves.toBe('MFC');
  });

  test('resolveClientSiteName returns empty for blank id', async () => {
    await expect(resolveClientSiteName(prisma, '')).resolves.toBe('');
    expect(prisma.clientSite.findUnique).not.toHaveBeenCalled();
  });

  test('enrichJobCardRowsSiteNames fills siteName from ClientSite', async () => {
    prisma.clientSite.findMany.mockResolvedValue([
      { id: 's1', name: 'MFC Central' }
    ]);
    const rows = [
      { id: 'jc1', siteId: 's1', siteName: '' },
      { id: 'jc2', siteId: 's1', siteName: 'Already set' }
    ];
    const out = await enrichJobCardRowsSiteNames(prisma, rows);
    expect(out[0].siteName).toBe('MFC Central');
    expect(out[1].siteName).toBe('Already set');
  });
});
