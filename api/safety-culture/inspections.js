/**
 * Safety Culture inspections feed
 * GET /api/safety-culture/inspections
 * Query: modified_after (ISO date), limit, completed, archived, next_page
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, badRequest, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import {
  enrichFeedItems,
  fetchInspectionDetails,
  fetchInspections,
  fetchInspectionsNextPage
} from '../_lib/safetyCultureClient.js'

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
  const limit = url.searchParams.get('limit')
  const requestedLimit = Math.max(1, Math.min(parseInt(limit || '50', 10) || 50, 500))
  const completed = url.searchParams.get('completed') || 'both'
  const archived = url.searchParams.get('archived') || 'both'
  const nextPage = url.searchParams.get('next_page')

  let result
  if (nextPage) {
    result = await fetchInspectionsNextPage(nextPage)
  } else {
    result = await fetchInspections({
      modified_after: modifiedAfter || undefined,
      limit: requestedLimit,
      completed: completed === 'true' ? true : completed === 'false' ? false : 'both',
      archived: archived === 'true' ? true : archived === 'false' ? false : 'both'
    })
  }

  if (result.error) {
    return serverError(res, result.error, result.details)
  }

  let feedItems = result.data ?? []
  let metadata = result.metadata ?? { next_page: null, remaining_records: 0 }

  // Safety Culture feed pagination can return older pages first.
  // For first-page requests, collect additional pages server-side and then return newest items.
  let feedCursorAfterScan = null
  if (!nextPage) {
    const MAX_PAGES = 100
    const MAX_ITEMS = 20000
    let pagesRead = 0
    let cursor = metadata?.next_page || null

    while (cursor && pagesRead < MAX_PAGES && feedItems.length < MAX_ITEMS) {
      const pageResult = await fetchInspectionsNextPage(cursor)
      if (pageResult?.error) {
        break
      }
      feedItems = feedItems.concat(pageResult?.data ?? [])
      metadata = pageResult?.metadata ?? { next_page: null, remaining_records: 0 }
      cursor = metadata?.next_page || null
      pagesRead += 1
    }
    feedCursorAfterScan = cursor
  }

  const sortedFeedItems = [...feedItems].sort((a, b) => latestInspectionTs(b) - latestInspectionTs(a))
  const latestItems = nextPage ? sortedFeedItems : sortedFeedItems.slice(0, requestedLimit)
  const enriched = await enrichFeedItems(
    latestItems,
    (item) => item?.id,
    fetchInspectionDetails,
    { concurrency: 5 }
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
