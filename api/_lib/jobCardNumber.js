/** @param {string} raw */
export function normalizeJobCardNumberToken(raw) {
  if (raw == null) return ''
  const trimmed = String(raw).trim()
  if (!trimmed) return ''
  const compact = trimmed.replace(/\s+/g, '')
  const m = compact.match(/^jc#?0*(\d+)$/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > 0) {
      return `JC${String(n).padStart(4, '0')}`
    }
  }
  if (/^jc\d{4,}$/i.test(compact)) {
    const digits = compact.slice(2)
    return `JC${String(parseInt(digits, 10)).padStart(4, '0')}`
  }
  return trimmed
}

/**
 * Resolve route param to Prisma `where` for JobCard (id, uuid, or JC0001-style number).
 * @param {string} param
 * @returns {{ id: string } | { jobCardNumber: string } | null}
 */
export function jobCardLookupWhere(param) {
  if (param == null) return null
  const v = String(param).trim()
  if (!v) return null
  if (/^c[a-z0-9]{24}$/i.test(v)) return { id: v }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return { id: v }
  }
  const asNumber = normalizeJobCardNumberToken(v)
  if (/^JC\d{4}$/.test(asNumber)) return { jobCardNumber: asNumber }
  return { id: v }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} param
 * @param {object} [select]
 */
export async function findJobCardByLookupParam(prisma, param, select) {
  const where = jobCardLookupWhere(param)
  if (!where) return null
  return prisma.jobCard.findUnique({ where, select })
}

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
