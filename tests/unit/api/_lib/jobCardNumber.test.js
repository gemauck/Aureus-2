import { describe, test, expect, jest } from '@jest/globals';
import { computeNextJobCardNumber } from '../../../../api/_lib/jobCardNumber.js';

/**
 * Regression: aggregate COALESCE(MAX...,0) yields maxn===0 when no JC\d+ rows exist.
 * Must not treat that as “next is JC0001” without findFirst (caused unique P2002 loops).
 */
describe('computeNextJobCardNumber', () => {
  test('maxn 0 still consults findFirst and increments latest JC (legacy / non-matching aggregate rows)', async () => {
    const findFirst = jest.fn().mockResolvedValue({ jobCardNumber: 'JC0100' });
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ maxn: 0 }]),
      jobCard: { findFirst }
    };
    const result = await computeNextJobCardNumber(prisma);
    expect(result).toBe('JC0101');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  test('maxn > 0 returns next from aggregate and skips findFirst', async () => {
    const findFirst = jest.fn();
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ maxn: 20 }]),
      jobCard: { findFirst }
    };
    const result = await computeNextJobCardNumber(prisma);
    expect(result).toBe('JC0021');
    expect(findFirst).not.toHaveBeenCalled();
  });

  test('aggregate throws: uses findFirst fallback', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const findFirst = jest.fn().mockResolvedValue({ jobCardNumber: 'JC0005' });
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('db down')),
      jobCard: { findFirst }
    };
    try {
      const result = await computeNextJobCardNumber(prisma);
      expect(result).toBe('JC0006');
      expect(findFirst).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('empty table: maxn 0, findFirst null -> JC0001', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ maxn: 0 }]),
      jobCard: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    expect(await computeNextJobCardNumber(prisma)).toBe('JC0001');
  });
});
