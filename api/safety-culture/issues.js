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
  fetchIssuesNextPage
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
  const nextPage = url.searchParams.get('next_page')

  let result
  if (nextPage) {
    result = await fetchIssuesNextPage(nextPage)
  } else {
    result = await fetchIssues({
      modified_after: modifiedAfter || undefined,
      limit: limit ? parseInt(limit, 10) : 50
    })
  }

  if (result.error) {
    return serverError(res, result.error, result.details)
  }

  const feedItems = result.data ?? []
  const enriched = await enrichFeedItems(
    feedItems,
    (item) => item?.id,
    fetchIssueDetails,
    { concurrency: 5 }
  )
  const sorted = [...enriched].sort((a, b) => latestIssueTs(b) - latestIssueTs(a))

  return ok(res, {
    issues: sorted,
    metadata: result.metadata ?? { next_page: null, remaining_records: 0 }
  })
}

export default withHttp(withLogging(authRequired(handler)))
