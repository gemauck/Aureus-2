/**
 * Extract list headings from JobCard.otherComments without loading full text blobs.
 */
import { Prisma } from '@prisma/client'

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} ids
 * @returns {Promise<Map<string, string>>}
 */
export async function fetchJobCardListHeadingsByIds(prisma, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return new Map()

  const rows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT id::text AS id,
        trim((regexp_match("otherComments", ${'^Heading:\\s*(.+)$'}, 'm'))[1]) AS heading
      FROM "JobCard"
      WHERE id IN (${Prisma.join(ids)})
    `
  )

  const map = new Map()
  for (const row of rows) {
    map.set(String(row.id), row.heading ? String(row.heading).trim() : '')
  }
  return map
}

/** Columns for paginated table list — avoids photos, stock JSON, and otherComments. */
export const JOB_CARD_LIST_TABLE_SELECT = {
  id: true,
  jobCardNumber: true,
  agentName: true,
  clientId: true,
  clientName: true,
  siteId: true,
  siteName: true,
  location: true,
  status: true,
  callOutCategory: true,
  reasonForVisit: true,
  ownerId: true,
  createdAt: true,
  startedAt: true,
  totalMaterialsCost: true
}
