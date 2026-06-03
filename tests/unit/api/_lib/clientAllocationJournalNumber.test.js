import { describe, it, expect, vi } from 'vitest'
import {
  formatClientAllocationJournalNo,
  allocateClientAllocationJournalNumberTx,
  isClientAllocationJournalSeqDbError
} from '../../../../api/_lib/clientAllocationJournalNumber.js'

describe('formatClientAllocationJournalNo', () => {
  it('pads single-digit sequences', () => {
    expect(formatClientAllocationJournalNo(1)).toBe('Stock-01')
    expect(formatClientAllocationJournalNo(12)).toBe('Stock-12')
  })
})

describe('isClientAllocationJournalSeqDbError', () => {
  it('detects missing column messages', () => {
    expect(
      isClientAllocationJournalSeqDbError({
        code: 'P2010',
        message: 'column clientAllocationJournalSeq does not exist'
      })
    ).toBe(true)
  })
})

describe('allocateClientAllocationJournalNumberTx', () => {
  it('returns formatted number from UPDATE RETURNING', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ seq: 3 }])
    }
    const journalNo = await allocateClientAllocationJournalNumberTx(tx)
    expect(journalNo).toBe('Stock-03')
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('falls back to INSERT when UPDATE returns no rows', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ seq: 1 }])
    }
    const journalNo = await allocateClientAllocationJournalNumberTx(tx)
    expect(journalNo).toBe('Stock-01')
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
  })

  it('wraps missing-column DB errors with migration hint', async () => {
    const tx = {
      $queryRaw: vi.fn().mockRejectedValue({
        code: 'P2010',
        message: 'column "clientAllocationJournalSeq" does not exist'
      })
    }
    await expect(allocateClientAllocationJournalNumberTx(tx)).rejects.toThrow(
      /add-client-allocation-journal-seq-migration/
    )
  })
})
