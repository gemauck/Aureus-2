/**
 * Allocates the next IncidentReport.incidentNumber (INC-YYYY-00001 style).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<string>}
 */
export async function computeNextIncidentNumber(prisma) {
  const year = new Date().getFullYear()
  const prefix = `INC-${year}-`
  let nextSeq = 1
  const last = await prisma.incidentReport.findFirst({
    where: { incidentNumber: { startsWith: prefix } },
    orderBy: { incidentNumber: 'desc' },
    select: { incidentNumber: true }
  })
  if (last?.incidentNumber?.startsWith(prefix)) {
    const tail = last.incidentNumber.slice(prefix.length)
    const parsed = parseInt(tail, 10)
    if (Number.isFinite(parsed) && parsed > 0) nextSeq = parsed + 1
  }
  return `${prefix}${String(nextSeq).padStart(5, '0')}`
}
