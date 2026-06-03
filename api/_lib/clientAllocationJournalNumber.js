/**
 * Allocate Stock-NN journal numbers for Client Allocation QuickBooks export.
 * Uses raw SQL so allocation works when SystemSettings has schema drift (columns
 * present in Prisma but not yet migrated on the DB).
 */

const MIGRATION_HINT =
  'Apply add-client-allocation-journal-seq-migration.sql on the database (see deploy.sh).'

export function formatClientAllocationJournalNo(seq) {
  const n = Number(seq)
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid client allocation journal sequence: ${seq}`)
  }
  return `Stock-${String(n).padStart(2, '0')}`
}

export function isClientAllocationJournalSeqDbError(error) {
  const msg = String(error?.message || '')
  return (
    error?.code === 'P2010' ||
    error?.code === 'P2022' ||
    /clientAllocationJournalSeq/i.test(msg) ||
    (/SystemSettings/i.test(msg) && /does not exist/i.test(msg))
  )
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @returns {Promise<string>} e.g. Stock-01
 */
export async function allocateClientAllocationJournalNumberTx(tx) {
  try {
    const updated = await tx.$queryRaw`
      UPDATE "SystemSettings"
      SET "clientAllocationJournalSeq" = COALESCE("clientAllocationJournalSeq", 0) + 1
      WHERE id = 'system'
      RETURNING "clientAllocationJournalSeq" AS seq
    `
    if (updated?.length) {
      return formatClientAllocationJournalNo(updated[0].seq)
    }

    const inserted = await tx.$queryRaw`
      INSERT INTO "SystemSettings" ("id", "clientAllocationJournalSeq")
      VALUES ('system', 1)
      ON CONFLICT ("id") DO UPDATE
      SET "clientAllocationJournalSeq" = COALESCE("SystemSettings"."clientAllocationJournalSeq", 0) + 1
      RETURNING "clientAllocationJournalSeq" AS seq
    `
    if (!inserted?.length) {
      throw new Error('Could not allocate client allocation journal number (no SystemSettings row)')
    }
    return formatClientAllocationJournalNo(inserted[0].seq)
  } catch (error) {
    if (isClientAllocationJournalSeqDbError(error)) {
      const err = new Error(MIGRATION_HINT)
      err.cause = error
      throw err
    }
    throw error
  }
}
