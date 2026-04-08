/**
 * Read Safety Culture list data from local Prisma cache (feeds synced via safetyCultureSync).
 */
import { prisma } from './prisma.js'

export const SAFETY_CULTURE_SYNC_STATE_ID = 'safety-culture-sync'
/** Cap rows read from DB per list request (filtering/sorting happens in memory). */
export const MAX_LOCAL_CACHE_SCAN = Math.min(
  Math.max(500, parseInt(process.env.SAFETY_CULTURE_CACHE_MAX_SCAN || '12000', 10) || 12000),
  50000
)

function toTs(value) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : 0
}

export function latestInspectionTs(item) {
  if (!item || typeof item !== 'object') return 0
  return Math.max(
    toTs(item.date_completed),
    toTs(item.modified_at),
    toTs(item.modifiedAt),
    toTs(item.date_modified),
    toTs(item.updated_at),
    toTs(item.updatedAt),
    toTs(item.date_started),
    toTs(item.created_at),
    toTs(item.createdAt)
  )
}

export function latestIssueTs(item) {
  if (!item || typeof item !== 'object') return 0
  return Math.max(
    toTs(item.modified_at),
    toTs(item.modifiedAt),
    toTs(item.updated_at),
    toTs(item.updatedAt),
    toTs(item.created_at),
    toTs(item.createdAt)
  )
}

function inspectionMatchesFilters(item, { completed, archived, templateParam, webReportLink }) {
  if (!item || typeof item !== 'object') return false

  if (templateParam?.length) {
    const tid = String(item.template_id ?? item.templateId ?? item.template?.id ?? '').trim()
    const allowed = new Set(templateParam.map((t) => String(t).trim()).filter(Boolean))
    if (allowed.size && !allowed.has(tid)) return false
  }

  if (webReportLink === 'public' || webReportLink === 'private') {
    const link = item.web_report_link || item.webReportLink || item.public_report_url || ''
    const s = String(link)
    if (webReportLink === 'public') {
      if (!s || s === 'private') return false
    }
    if (webReportLink === 'private') {
      if (s && s !== 'private' && s.includes('http')) return false
    }
  }

  if (completed === true || completed === false) {
    const v = item.completed ?? item.is_completed ?? item.isCompleted
    if (typeof v === 'boolean' && v !== completed) return false
    if (item.status != null && typeof item.status === 'string') {
      const st = item.status.toLowerCase()
      if (completed && st === 'in_progress') return false
      if (!completed && st === 'complete') return false
    }
  }

  if (archived === true || archived === false) {
    const v = item.archived ?? item.is_archived ?? item.isArchived
    if (typeof v === 'boolean' && v !== archived) return false
  }

  return true
}

function issueMatchesFilters(item, { modifiedBefore }) {
  if (!item || typeof item !== 'object') return false
  if (modifiedBefore) {
    const before = new Date(modifiedBefore).getTime()
    if (Number.isFinite(before) && latestIssueTs(item) > before) return false
  }
  return true
}

/**
 * @returns {Promise<{ inspections: object[]; metadata: object } | null>}
 * null = no local cache rows; caller should use live API.
 */
export async function tryServeInspectionsFromLocalCache({
  offset = 0,
  limit = 50,
  completed,
  archived,
  templateParam,
  webReportLink
}) {
  const count = await prisma.safetyCultureCachedInspection.count()
  if (count === 0) return null

  const rows = await prisma.safetyCultureCachedInspection.findMany({
    orderBy: [{ modifiedAt: 'desc' }, { externalId: 'desc' }],
    take: MAX_LOCAL_CACHE_SCAN,
    select: { payloadJson: true }
  })

  const payloads = rows.map((r) => r.payloadJson).filter(Boolean)
  const filtered = payloads.filter((item) =>
    inspectionMatchesFilters(item, {
      completed,
      archived,
      templateParam,
      webReportLink
    })
  )
  const sorted = [...filtered].sort((a, b) => latestInspectionTs(b) - latestInspectionTs(a))
  const totalFiltered = sorted.length
  const page = sorted.slice(offset, offset + limit)
  const nextOffset = offset + page.length < totalFiltered ? offset + page.length : null

  return {
    inspections: page,
    metadata: {
      next_page: null,
      remaining_records: Math.max(0, totalFiltered - offset - page.length),
      source: 'local_cache',
      cache_offset_next: nextOffset,
      scanned_total: totalFiltered,
      returned_count: page.length,
      cache_rows_loaded: rows.length
    }
  }
}

/**
 * @returns {Promise<{ issues: object[]; metadata: object } | null>}
 */
export async function tryServeIssuesFromLocalCache({ offset = 0, limit = 50, modifiedBefore }) {
  const count = await prisma.safetyCultureCachedIssue.count()
  if (count === 0) return null

  const rows = await prisma.safetyCultureCachedIssue.findMany({
    orderBy: [{ modifiedAt: 'desc' }, { externalId: 'desc' }],
    take: MAX_LOCAL_CACHE_SCAN,
    select: { payloadJson: true }
  })

  const payloads = rows.map((r) => r.payloadJson).filter(Boolean)
  const filtered = payloads.filter((item) => issueMatchesFilters(item, { modifiedBefore }))
  const sorted = [...filtered].sort((a, b) => latestIssueTs(b) - latestIssueTs(a))
  const totalFiltered = sorted.length
  const page = sorted.slice(offset, offset + limit)
  const nextOffset = offset + page.length < totalFiltered ? offset + page.length : null

  return {
    issues: page,
    metadata: {
      next_page: null,
      remaining_records: Math.max(0, totalFiltered - offset - page.length),
      source: 'local_cache',
      cache_offset_next: nextOffset,
      scanned_total: totalFiltered,
      returned_count: page.length,
      cache_rows_loaded: rows.length
    }
  }
}
