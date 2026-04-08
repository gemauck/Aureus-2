/**
 * Pull Safety Culture feeds into local Prisma cache; incremental via modified_after watermarks.
 */
import { prisma } from './prisma.js'
import {
  enrichFeedItemsCapped,
  fetchInspectionDetails,
  fetchInspections,
  fetchInspectionsNextPage,
  fetchIssueDetails,
  fetchIssues,
  fetchIssuesNextPage,
  normaliseFeedData
} from './safetyCultureClient.js'
import { SAFETY_CULTURE_SYNC_STATE_ID } from './safetyCultureCacheRead.js'

const MAX_SYNC_PAGES = Math.min(
  Math.max(10, parseInt(process.env.SAFETY_CULTURE_SYNC_MAX_PAGES || '300', 10) || 300),
  500
)

function defaultEnrichCap() {
  const n = parseInt(process.env.SAFETY_CULTURE_SYNC_ENRICH_CAP || '0', 10)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(n, 150))
}

function inspectionModifiedAt(item) {
  if (!item || typeof item !== 'object') return null
  const raw =
    item.modified_at ||
    item.modifiedAt ||
    item.date_modified ||
    item.updated_at ||
    item.updatedAt ||
    item.date_completed ||
    item.date_started ||
    item.created_at ||
    item.createdAt
  if (!raw) return null
  const t = new Date(raw)
  return Number.isFinite(t.getTime()) ? t : null
}

function issueModifiedAt(item) {
  if (!item || typeof item !== 'object') return null
  const raw =
    item.modified_at ||
    item.modifiedAt ||
    item.updated_at ||
    item.updatedAt ||
    item.created_at ||
    item.createdAt
  if (!raw) return null
  const t = new Date(raw)
  return Number.isFinite(t.getTime()) ? t : null
}

function extractTemplateId(payload) {
  if (!payload || typeof payload !== 'object') return null
  const tid = payload.template_id ?? payload.templateId ?? payload.template?.id
  if (tid == null) return null
  const s = String(tid).trim()
  return s || null
}

async function ensureSyncState() {
  await prisma.safetyCultureSyncState.upsert({
    where: { id: SAFETY_CULTURE_SYNC_STATE_ID },
    create: { id: SAFETY_CULTURE_SYNC_STATE_ID },
    update: {}
  })
}

async function upsertInspectionsBatch(items) {
  const valid = items.filter((item) => item?.id != null && String(item.id).trim().length > 0)
  const CHUNK = 35
  for (let i = 0; i < valid.length; i += CHUNK) {
    const slice = valid.slice(i, i + CHUNK)
    await prisma.$transaction(
      slice.map((item) => {
        const ext = String(item.id).trim()
        const modifiedAt = inspectionModifiedAt(item)
        const templateId = extractTemplateId(item)
        return prisma.safetyCultureCachedInspection.upsert({
          where: { externalId: ext },
          create: {
            externalId: ext,
            payloadJson: item,
            modifiedAt,
            templateId
          },
          update: {
            payloadJson: item,
            modifiedAt,
            templateId
          }
        })
      })
    )
  }
}

async function upsertIssuesBatch(items) {
  const valid = items.filter((item) => String(item?.id ?? item?.unique_id ?? '').trim().length > 0)
  const CHUNK = 35
  for (let i = 0; i < valid.length; i += CHUNK) {
    const slice = valid.slice(i, i + CHUNK)
    await prisma.$transaction(
      slice.map((item) => {
        const ext = String(item?.id ?? item?.unique_id ?? '').trim()
        const modifiedAt = issueModifiedAt(item)
        return prisma.safetyCultureCachedIssue.upsert({
          where: { externalId: ext },
          create: {
            externalId: ext,
            payloadJson: item,
            modifiedAt
          },
          update: {
            payloadJson: item,
            modifiedAt
          }
        })
      })
    )
  }
}

async function collectFeedPages(fetchFirst, fetchNext, label) {
  const first = await fetchFirst()
  if (first?.error) {
    return { error: first.error, details: first.details, items: [], pages: 0 }
  }
  let items = normaliseFeedData(first)
  let meta = first.metadata ?? { next_page: null }
  let pages = 0
  while (meta.next_page && pages < MAX_SYNC_PAGES) {
    const next = await fetchNext(meta.next_page)
    if (next?.error) {
      console.warn(`[safety-culture-sync] ${label} pagination stopped:`, next.error)
      break
    }
    items = items.concat(normaliseFeedData(next))
    meta = next.metadata ?? { next_page: null }
    pages += 1
  }
  return { items, pages: pages + 1, lastMeta: meta }
}

/**
 * @param {{ full?: boolean; enrichCap?: number }} options
 * full=true clears watermarks for this entity so full feed is re-fetched (upserts refresh rows).
 */
export async function syncInspectionsToCache(options = {}) {
  const full = Boolean(options.full)
  const enrichCap =
    options.enrichCap != null ? Math.max(0, Math.min(Number(options.enrichCap), 200)) : defaultEnrichCap()

  await ensureSyncState()
  const state = await prisma.safetyCultureSyncState.findUnique({
    where: { id: SAFETY_CULTURE_SYNC_STATE_ID }
  })
  const modifiedAfter = full ? undefined : state?.inspectionsWatermark || undefined

  const collected = await collectFeedPages(
    () =>
      fetchInspections({
        modified_after: modifiedAfter,
        limit: 100,
        completed: 'both',
        archived: 'both'
      }),
    (cursor) => fetchInspectionsNextPage(cursor),
    'inspections'
  )
  if (collected.error) {
    return { ok: false, error: collected.error, details: collected.details }
  }

  let maxModified = null
  for (const row of collected.items) {
    const m = inspectionModifiedAt(row)
    if (m && (!maxModified || m > maxModified)) maxModified = m
  }

  const enriched = await enrichFeedItemsCapped(
    collected.items,
    (item) => item?.id,
    fetchInspectionDetails,
    { cap: enrichCap, concurrency: 6 }
  )

  await upsertInspectionsBatch(enriched)

  await prisma.safetyCultureSyncState.update({
    where: { id: SAFETY_CULTURE_SYNC_STATE_ID },
    data: {
      ...(maxModified ? { inspectionsWatermark: maxModified.toISOString() } : {}),
      lastInspectionsSyncAt: new Date(),
      lastRunAt: new Date(),
      lastRunError: null
    }
  })

  return {
    ok: true,
    upserted: enriched.length,
    feedPages: collected.pages,
    enrichCap
  }
}

export async function syncIssuesToCache(options = {}) {
  const full = Boolean(options.full)
  const enrichCap =
    options.enrichCap != null ? Math.max(0, Math.min(Number(options.enrichCap), 200)) : defaultEnrichCap()

  await ensureSyncState()
  const state = await prisma.safetyCultureSyncState.findUnique({
    where: { id: SAFETY_CULTURE_SYNC_STATE_ID }
  })
  const modifiedAfter = full ? undefined : state?.issuesWatermark || undefined

  const collected = await collectFeedPages(
    () =>
      fetchIssues({
        modified_after: modifiedAfter,
        limit: 100
      }),
    (cursor) => fetchIssuesNextPage(cursor),
    'issues'
  )
  if (collected.error) {
    return { ok: false, error: collected.error, details: collected.details }
  }

  let maxModified = null
  for (const row of collected.items) {
    const m = issueModifiedAt(row)
    if (m && (!maxModified || m > maxModified)) maxModified = m
  }

  const enriched = await enrichFeedItemsCapped(
    collected.items,
    (item) => item?.id || item?.unique_id,
    fetchIssueDetails,
    { cap: enrichCap, concurrency: 6 }
  )

  await upsertIssuesBatch(enriched)

  await prisma.safetyCultureSyncState.update({
    where: { id: SAFETY_CULTURE_SYNC_STATE_ID },
    data: {
      ...(maxModified ? { issuesWatermark: maxModified.toISOString() } : {}),
      lastIssuesSyncAt: new Date(),
      lastRunAt: new Date(),
      lastRunError: null
    }
  })

  return {
    ok: true,
    upserted: enriched.length,
    feedPages: collected.pages,
    enrichCap
  }
}

/**
 * @param {{ full?: boolean; inspections?: boolean; issues?: boolean; enrichCap?: number }} opts
 */
export async function runSafetyCultureSync(opts = {}) {
  const full = Boolean(opts.full)
  const doInsp = opts.inspections !== false
  const doIssues = opts.issues !== false
  const enrichCap = opts.enrichCap

  const out = { inspections: null, issues: null, ok: true }

  try {
    if (doInsp) {
      out.inspections = await syncInspectionsToCache({ full, enrichCap })
      if (!out.inspections.ok) {
        out.ok = false
        await recordSyncError(out.inspections.error)
        return out
      }
    }
    if (doIssues) {
      out.issues = await syncIssuesToCache({ full, enrichCap })
      if (!out.issues.ok) {
        out.ok = false
        await recordSyncError(out.issues.error)
        return out
      }
    }
  } catch (e) {
    out.ok = false
    const msg = e?.message || String(e)
    await recordSyncError(msg)
    out.error = msg
  }

  return out
}

async function recordSyncError(message) {
  try {
    await ensureSyncState()
    await prisma.safetyCultureSyncState.update({
      where: { id: SAFETY_CULTURE_SYNC_STATE_ID },
      data: { lastRunError: String(message).slice(0, 2000), lastRunAt: new Date() }
    })
  } catch (_) {
    /* ignore */
  }
}
