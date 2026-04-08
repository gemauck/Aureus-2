/**
 * Safety Culture issues feed
 * GET /api/safety-culture/issues
 * Query: modified_after (ISO date), limit, next_page
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import {
  enrichFeedItems,
  fetchIssueDetails,
  fetchIssues,
  fetchIssuesNextPage,
  normaliseFeedData
} from '../_lib/safetyCultureClient.js'

function toTs(value) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function latestIssueTs(item) {
  return Math.max(
    toTs(item?.modified_at),
    toTs(item?.modifiedAt),
    toTs(item?.updated_at),
    toTs(item?.updatedAt),
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
  const nextPage = url.searchParams.get('next_page')

  let result
  if (nextPage) {
    result = await fetchIssuesNextPage(nextPage)
  } else {
    result = await fetchIssues({
      modified_after: modifiedAfter || undefined,
      limit: requestedLimit
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
    const MAX_PAGES = 100
    const MAX_ITEMS = 20000
    let pagesRead = 0
    let cursor = metadata?.next_page || null

    while (cursor && pagesRead < MAX_PAGES && feedItems.length < MAX_ITEMS) {
      const pageResult = await fetchIssuesNextPage(cursor)
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

  const sortedFeedItems = [...feedItems].sort((a, b) => latestIssueTs(b) - latestIssueTs(a))
  const latestItems = nextPage ? sortedFeedItems : sortedFeedItems.slice(0, requestedLimit)
  const enriched = await enrichFeedItems(
    latestItems,
    (item) => item?.id,
    fetchIssueDetails,
    { concurrency: 5 }
  )
  const sorted = [...enriched].sort((a, b) => latestIssueTs(b) - latestIssueTs(a))

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
    issues: sorted,
    metadata: outMetadata
  })
}

export default withHttp(withLogging(authRequired(handler)))
