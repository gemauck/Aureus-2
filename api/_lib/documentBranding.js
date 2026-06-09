/**
 * Company letterhead for PDF / print exports (PO, job cards, incident reports).
 * @param {import('@prisma/client').PrismaClient} prismaClient
 */
export async function loadDocumentBranding(prismaClient) {
  const system = await prismaClient.systemSettings.findUnique({ where: { id: 'system' } })
  const companyName = (system?.companyName && String(system.companyName).trim()) || 'Abcotronics'
  let letterhead = {}
  try {
    const raw = system?.poLetterheadJson
    letterhead = raw && typeof raw === 'string' ? JSON.parse(raw) : {}
  } catch {
    letterhead = {}
  }
  if (!letterhead || typeof letterhead !== 'object') letterhead = {}
  return { companyName, letterhead }
}
