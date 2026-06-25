import { describe, test, expect, jest } from '@jest/globals';
import {
  formatClientAllocationJournalNo,
  allocateClientAllocationJournalNumberTx,
  isClientAllocationJournalSeqDbError
} from '../../../../api/_lib/clientAllocationJournalNumber.js';

describe('formatClientAllocationJournalNo', () => {
  test('pads single-digit sequences', () => {
    expect(formatClientAllocationJournalNo(1)).toBe('Stock-01');
    expect(formatClientAllocationJournalNo(12)).toBe('Stock-12');
  });
});

describe('isClientAllocationJournalSeqDbError', () => {
  test('detects missing column messages', () => {
    expect(
      isClientAllocationJournalSeqDbError({
        code: 'P2010',
        message: 'column clientAllocationJournalSeq does not exist'
      })
    ).toBe(true);
  });
});

describe('allocateClientAllocationJournalNumberTx', () => {
  test('returns formatted number from UPDATE RETURNING', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ seq: 3 }])
    };
    const journalNo = await allocateClientAllocationJournalNumberTx(tx);
    expect(journalNo).toBe('Stock-03');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  test('falls back to INSERT when UPDATE returns no rows', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ seq: 1 }])
    };
    const journalNo = await allocateClientAllocationJournalNumberTx(tx);
    expect(journalNo).toBe('Stock-01');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  test('wraps missing-column DB errors with migration hint', async () => {
    const tx = {
      $queryRaw: jest.fn().mockRejectedValue({
        code: 'P2010',
        message: 'column "clientAllocationJournalSeq" does not exist'
      })
    };
    await expect(allocateClientAllocationJournalNumberTx(tx)).rejects.toThrow(
      /add-client-allocation-journal-seq-migration/
    );
  });
});
