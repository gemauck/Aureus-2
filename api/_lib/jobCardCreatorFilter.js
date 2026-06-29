/**
 * Resolve JobCard.ownerId filter from a creator display name (User name/email contains).
 */

export function buildJobCardOwnerIdFilter(ownerIds) {
  const ids = [...new Set((ownerIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return { ownerId: { in: [] } }
  if (ids.length === 1) return { ownerId: ids[0] }
  return { ownerId: { in: ids } }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} createdByName
 * @returns {Promise<{ ownerId: string | { in: string[] } } | null>}
 */
export async function resolveJobCardOwnerFilterByCreatorName(prisma, createdByName) {
  const term = String(createdByName || '').trim()
  if (!term) return null

  const matchingUsers = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } }
      ]
    },
    select: { id: true },
    take: 50
  })

  return buildJobCardOwnerIdFilter(matchingUsers.map((u) => u.id))
}
