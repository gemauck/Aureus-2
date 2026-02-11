/**
 * GET /api/projects/:id/document-collection-received-counts?year=YYYY
 * Returns received and sent email counts per document/month for the project and year.
 * Used to show notification badges on the "Request documents via email" cells.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { normalizeProjectIdFromRequest } from '../../_lib/documentCollectionCellKeys.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

async function handler(req, res) {
  const projectId = normalizeProjectIdFromRequest({ req, rawId: req.params?.id })
  if (!projectId) {
    return badRequest(res, 'Project ID required')
  }

  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  const fullUrl = req.originalUrl || req.url || ''
  const query = (typeof fullUrl === 'string' ? fullUrl : '').split('?')[1] || ''
  const params = new URLSearchParams(query)
  const q = req.query || {}
  const yearParam = params.get('year') ?? q.year
  const year = yearParam != null ? parseInt(String(yearParam), 10) : null

  if (year == null || isNaN(year)) {
    return badRequest(res, 'Query parameter year is required')
  }

  try {
    const userId = req.user?.sub || req.user?.id

    // Raw counts per (documentId, month) - documentId may be from log (not in project) or item
    const rawReceived = new Map()
    const rawSent = new Map()

    const receivedRows = await prisma.documentItemComment.groupBy({
      by: ['itemId', 'month'],
      where: {
        year,
        item: { section: { projectId } },
        OR: [
          { author: 'Email from Client' },
          { text: { startsWith: 'Email from Client' } }
        ]
      },
      _count: { id: true },
      _max: { createdAt: true }
    })
    receivedRows.forEach((r) => {
      const key = `${r.itemId}-${r.month}`
      rawReceived.set(key, { count: r._count.id, latestReceivedAt: r._max?.createdAt || null })
    })

    let sentRows = []
    try {
      if (prisma.documentCollectionEmailLog) {
        sentRows = await prisma.documentCollectionEmailLog.groupBy({
          by: ['documentId', 'month'],
          where: { projectId: String(projectId), year, kind: 'sent' },
          _count: { id: true }
        })
      }
    } catch (e) {
      console.warn('document-collection-received-counts: sent counts query failed:', e?.message)
    }
    sentRows.forEach((r) => {
      const key = `${r.documentId}-${r.month}`
      rawSent.set(key, (rawSent.get(key) || 0) + r._count.id)
    })

    try {
      const sentCommentRows = await prisma.documentItemComment.groupBy({
        by: ['itemId', 'month'],
        where: {
          year,
          item: { section: { projectId } },
          author: { in: ['Sent reply (platform)', 'Sent request (platform)'] }
        },
        _count: { id: true }
      })
      sentCommentRows.forEach((r) => {
        const key = `${r.itemId}-${r.month}`
        rawSent.set(key, (rawSent.get(key) || 0) + r._count.id)
      })
    } catch (e) {
      console.warn('document-collection-received-counts: sent comment fallback query failed:', e?.message)
    }

    // Get project documents (section may be year-scoped; include all for orphan fallback)
    const documents = await prisma.documentItem.findMany({
      where: { section: { projectId } },
      select: { id: true, name: true }
    })
    const nameToDocIds = new Map()
    documents.forEach((d) => {
      const n = (d.name || '').trim().toLowerCase()
      if (!n) return
      if (!nameToDocIds.has(n)) nameToDocIds.set(n, [])
      nameToDocIds.get(n).push(d.id)
    })

    const documentIds = new Set(documents.map((d) => d.id))
    const aggregatedByDocMonth = new Map()

    documents.forEach((doc) => {
      const normName = (doc.name || '').trim().toLowerCase()
      const siblingIds = normName ? (nameToDocIds.get(normName) || [doc.id]) : [doc.id]
      const allKeys = [...rawReceived.keys(), ...rawSent.keys()]
      const months = new Set(
        allKeys
          .filter((k) => {
            const idx = k.lastIndexOf('-')
            const idPart = idx >= 0 ? k.slice(0, idx) : ''
            return siblingIds.includes(idPart)
          })
          .map((k) => {
            const idx = k.lastIndexOf('-')
            return idx >= 0 ? parseInt(k.slice(idx + 1), 10) : 0
          })
          .filter((m) => m >= 1 && m <= 12)
      )
      months.forEach((month) => {
        let receivedCount = 0
        let latestReceivedAt = null
        siblingIds.forEach((id) => {
          const r = rawReceived.get(`${id}-${month}`)
          if (r) {
            receivedCount += r.count
            if (r.latestReceivedAt && (!latestReceivedAt || new Date(r.latestReceivedAt) > new Date(latestReceivedAt))) {
              latestReceivedAt = r.latestReceivedAt
            }
          }
        })
        let sentCount = 0
        siblingIds.forEach((id) => {
          sentCount += rawSent.get(`${id}-${month}`) || 0
        })
        if (receivedCount > 0 || sentCount > 0) {
          aggregatedByDocMonth.set(`${doc.id}-${month}`, {
            documentId: doc.id,
            month,
            receivedCount,
            sentCount,
            latestReceivedAt
          })
        }
      })
    })

    // Include "orphan" document IDs from raw data (e.g. JSON documentSections use client-generated IDs not in DocumentItem table)
    const allRawKeys = [...new Set([...rawReceived.keys(), ...rawSent.keys()])]
    allRawKeys.forEach((key) => {
      const idx = key.lastIndexOf('-')
      const idPart = idx >= 0 ? key.slice(0, idx) : ''
      const month = idx >= 0 ? parseInt(key.slice(idx + 1), 10) : 0
      if (!idPart || month < 1 || month > 12) return
      if (documentIds.has(idPart)) return
      const r = rawReceived.get(key)
      const receivedCount = r ? r.count : 0
      const latestReceivedAt = r?.latestReceivedAt || null
      const sentCount = rawSent.get(key) || 0
      if (receivedCount > 0 || sentCount > 0) {
        const existing = aggregatedByDocMonth.get(`${idPart}-${month}`)
        if (existing) {
          existing.receivedCount += receivedCount
          existing.sentCount += sentCount
          if (latestReceivedAt && (!existing.latestReceivedAt || new Date(latestReceivedAt) > new Date(existing.latestReceivedAt))) {
            existing.latestReceivedAt = latestReceivedAt
          }
        } else {
          aggregatedByDocMonth.set(`${idPart}-${month}`, {
            documentId: idPart,
            month,
            receivedCount,
            sentCount,
            latestReceivedAt
          })
        }
      }
    })

    const counts = Array.from(aggregatedByDocMonth.values())

    let opened = []
    if (userId) {
      opened = await prisma.documentCollectionNotificationRead.findMany({
        where: {
          userId: String(userId),
          projectId: String(projectId),
          year
        },
        select: {
          documentId: true,
          month: true,
          type: true,
          openedAt: true
        }
      })
    }

    return ok(res, { counts, opened })
  } catch (e) {
    console.error('GET document-collection-received-counts error:', e)
    return serverError(res, e.message || 'Failed to load counts')
  }
}

export default authRequired(handler)
