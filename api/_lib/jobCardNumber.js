/**
 * Allocates the next JobCard.jobCardNumber (JC0001-style).
 *
 * Regression: never treat SQL aggregate maxn===0 as "emit JC0001" without the findFirst fallback —
 * maxn is 0 when the table is empty OR when no rows match ^JC[0-9]+$ (legacy formats). Early-returning
 * JC0001 caused unique-constraint loops. See tests/unit/api/_lib/jobCardNumber.test.js.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<string>}
 */
export async function computeNextJobCardNumber(prisma) {
  let nextNumber = 1
  try {
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(MAX(CAST(SUBSTRING("jobCardNumber" FROM 3) AS INTEGER)), 0)::int AS maxn
      FROM "JobCard"
      WHERE "jobCardNumber" ~ '^JC[0-9]+$'
    `
    const maxn = rows?.[0]?.maxn
    const n = Number(maxn)
    if (Number.isFinite(n) && n > 0) {
      nextNumber = n + 1
      return `JC${String(nextNumber).padStart(4, '0')}`
    }
  } catch (e) {
    console.warn('computeNextJobCardNumber: aggregate query failed, using fallback', e?.message)
  }

  const lastJobCard = await prisma.jobCard.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { jobCardNumber: true }
  })
  if (lastJobCard?.jobCardNumber?.startsWith('JC')) {
    const match = lastJobCard.jobCardNumber.match(/JC(\d+)/)
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }
  return `JC${String(nextNumber).padStart(4, '0')}`
}
