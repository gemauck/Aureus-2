/**
 * Safety Culture inspections feed
 * GET /api/safety-culture/inspections
 * Query: modified_after, modified_before, limit, completed, archived, next_page,
 *   template (repeatable), web_report_link (private|public), enrich_cap (0–150)
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, badRequest, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import {
  enrichFeedItemsCapped,
  fetchInspectionDetails,
  fetchInspections,
  fetchInspectionsNextPage,
  normaliseFeedData
} from '../_lib/safetyCultureClient.js'

/** Keep first HTTP response under typical proxy timeouts (nginx ~60s). */
const FEED_SCAN_MAX_PAGES = 12
const FEED_SCAN_MAX_ROWS = 2500
const DEFAULT_ENRICH_CAP = 50
const MAX_ENRICH_CAP = 150

function toTs(value) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function latestInspectionTs(item) {
  return Math.max(
    toTs(item?.date_completed),
    toTs(item?.modified_at),
    toTs(item?.modifiedAt),
    toTs(item?.date_modified),
    toTs(item?.updated_at),
    toTs(item?.updatedAt),
    toTs(item?.date_started),
    toTs(item?.created_at),
    toTs(item?.createdAt)
  )
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return ok(res, { error: 'Method not allowed', allowed: ['GET'] })
  }

  const url = new URL(req.url || '', 'http://localhost')
  const modifiedAfter = url.searchParams.get('modified_after')
  const modifiedBefore = url.searchParams.get('modified_before')
  const limit = url.searchParams.get('limit')
  const requestedLimit = Math.max(1, Math.min(parseInt(limit || '50', 10) || 50, 500))
  const completed = url.searchParams.get('completed') || 'both'
  const archived = url.searchParams.get('archived') || 'both'
  const nextPage = url.searchParams.get('next_page')
  const webReportLinkRaw = url.searchParams.get('web_report_link')
  const webReportLink =
    webReportLinkRaw === 'public' || webReportLinkRaw === 'private' ? webReportLinkRaw : undefined
  const templates = url.searchParams.getAll('template').filter(Boolean)
  const templateParam = templates.length ? templates : undefined
  const enrichCapRaw = parseInt(url.searchParams.get('enrich_cap') || '', 10)
  const enrichCap = Number.isFinite(enrichCapRaw)
    ? Math.max(0, Math.min(enrichCapRaw, MAX_ENRICH_CAP))
    : DEFAULT_ENRICH_CAP

  let result
  if (nextPage) {
    result = await fetchInspectionsNextPage(nextPage)
  } else {
    result = await fetchInspections({
      modified_after: modifiedAfter || undefined,
      modified_before: modifiedBefore || undefined,
      limit: requestedLimit,
      completed: completed === 'true' ? true : completed === 'false' ? false : 'both',
      archived: archived === 'true' ? true : archived === 'false' ? false : 'both',
      web_report_link: webReportLink,
      template: templateParam
    })
  }

  if (result.error) {
    return serverError(res, result.error, result.details)
  }

  let feedItems = normaliseFeedData(result)
  let metadata = result.metadata ?? { next_page: null, remaining_records: 0 }

  // Safety Culture feed pagination can return older pages first.
  // For first-page requests, collect additional pages server-side and then return newest items.
  let feedCursorAfterScan = null
  if (!nextPage) {
    let pagesRead = 0
    let cursor = metadata?.next_page || null

    while (cursor && pagesRead < FEED_SCAN_MAX_PAGES && feedItems.length < FEED_SCAN_MAX_ROWS) {
      const pageResult = await fetchInspectionsNextPage(cursor)
      if (pageResult?.error) {
        break
      }
      feedItems = feedItems.concat(normaliseFeedData(pageResult))
      metadata = pageResult?.metadata ?? { next_page: null, remaining_records: 0 }
      cursor = metadata?.next_page || null
      pagesRead += 1
    }
    feedCursorAfterScan = cursor
  }

  const sortedFeedItems = [...feedItems].sort((a, b) => latestInspectionTs(b) - latestInspectionTs(a))
  const latestItems = nextPage ? sortedFeedItems : sortedFeedItems.slice(0, requestedLimit)
  const enriched = await enrichFeedItemsCapped(
    latestItems,
    (item) => item?.id,
    fetchInspectionDetails,
    { cap: enrichCap, concurrency: 8 }
  )

  const sorted = [...enriched].sort((a, b) => latestInspectionTs(b) - latestInspectionTs(a))

  let outMetadata
  if (nextPage) {
    outMetadata = result.metadata ?? { next_page: null, remaining_records: 0 }
  } else {
    const moreUpstreamPages = Boolean(feedCursorAfterScan)
    const notReturnedAfterSort = Math.max(0, sortedFeedItems.length - requestedLimit)
    outMetadata = {
      next_page: moreUpstreamPages ? feedCursorAfterScan : null,
      remaining_records: moreUpstreamPages
        ? (metadata?.remaining_records ?? 0)
        : 0,
      scanned_total: sortedFeedItems.length,
      returned_count: sorted.length,
      not_returned_after_sort: notReturnedAfterSort
    }
  }

  return ok(res, {
    inspections: sorted,
    metadata: outMetadata
  })
}

export default withHttp(withLogging(authRequired(handler)))
