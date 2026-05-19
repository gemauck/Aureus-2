/**
 * Resolve ClientSite.name when job cards have siteId but empty siteName (mobile form gap).
 */

export async function resolveClientSiteName(prisma, siteId) {
  const id = String(siteId || '').trim()
  if (!id) return ''
  const site = await prisma.clientSite.findUnique({
    where: { id },
    select: { name: true }
  })
  return site?.name ? String(site.name).trim() : ''
}

/**
 * @template {{ siteId?: string, siteName?: string }} T
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {T[]} rows
 * @returns {Promise<T[]>}
 */
export async function enrichJobCardRowsSiteNames(prisma, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows

  const needIds = [
    ...new Set(
      rows
        .filter((r) => !String(r?.siteName || '').trim() && String(r?.siteId || '').trim())
        .map((r) => String(r.siteId).trim())
    )
  ]

  if (needIds.length === 0) return rows

  const sites = await prisma.clientSite.findMany({
    where: { id: { in: needIds } },
    select: { id: true, name: true }
  })
  const nameById = new Map(sites.map((s) => [s.id, String(s.name || '').trim()]))

  return rows.map((row) => {
    if (String(row?.siteName || '').trim()) return row
    const sid = String(row?.siteId || '').trim()
    if (!sid) return row
    const name = nameById.get(sid)
    return name ? { ...row, siteName: name } : row
  })
}
