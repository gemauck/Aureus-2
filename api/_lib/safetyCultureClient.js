/**
 * Safety Culture API client
 * Docs: https://developer.safetyculture.com/
 * Base URL: https://api.safetyculture.io
 */

const BASE_URL = 'https://api.safetyculture.io'

/** Feed APIs typically cap page size (docs use 20–100); larger values can error. */
function clampFeedPageLimit(limit) {
  const n = typeof limit === 'number' ? limit : parseInt(limit, 10)
  if (!Number.isFinite(n)) return 100
  return Math.max(1, Math.min(n, 100))
}

/**
 * Normalise feed payload to a row array (SafetyCulture usually returns `{ data, metadata }`).
 * @param {object} result
 * @returns {any[]}
 */
export function normaliseFeedData(result) {
  if (!result || result.error) return []
  if (Array.isArray(result.data)) return result.data
  if (Array.isArray(result.issues)) return result.issues
  if (Array.isArray(result.inspections)) return result.inspections
  if (Array.isArray(result.items)) return result.items
  if (Array.isArray(result)) return result
  return []
}

/**
 * Make a request to the Safety Culture API
 * @param {string} path - API path (e.g. /feed/inspections)
 * @param {object} options - fetch options
 * @returns {Promise<{ data?: any; metadata?: any; error?: string }>}
 */
export async function safetyCultureRequest(path, options = {}) {
  const apiKey = process.env.SAFETY_CULTURE_API_KEY
  if (!apiKey || !apiKey.startsWith('scapi_')) {
    return { error: 'SAFETY_CULTURE_API_KEY not configured or invalid (must start with scapi_)' }
  }

  const url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...options.headers
  }

  let timeoutId
  try {
    const controller = options.signal ? null : new AbortController()
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), options.timeout ?? 45000) // 45s default
    }
    const signal = options.signal || (controller && controller.signal)

    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal
    })
    if (timeoutId) clearTimeout(timeoutId) // clear on success

    const text = await res.text()
    let body
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { error: text || 'Invalid JSON response' }
    }

    if (!res.ok) {
      return {
        error: body?.message || body?.error || `Safety Culture API error: ${res.status}`,
        status: res.status,
        details: body
      }
    }

    return body
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    return {
      error: isTimeout ? 'Safety Culture API request timed out' : (err.message || 'Failed to reach Safety Culture API'),
      cause: err.cause?.message
    }
  }
}

/**
 * Fetch inspections from the feed API (paginated)
 * @param {object} params - optional: modified_after, limit, completed, archived
 * @returns {Promise<{ data: array; metadata: object }|{ error: string }>}
 */
export async function fetchInspections(params = {}) {
  const q = new URLSearchParams()
  if (params.modified_after) {
    q.set('modified_after', params.modified_after)
  }
  if (params.limit != null) q.set('limit', String(clampFeedPageLimit(params.limit)))
  if (params.completed) q.set('completed', params.completed) // e.g. true, false, both
  if (params.archived) q.set('archived', params.archived)   // e.g. true, false, both

  const path = `/feed/inspections${q.toString() ? `?${q.toString()}` : ''}`
  return safetyCultureRequest(path)
}

/**
 * Fetch next page of inspections using metadata.next_page
 * @param {string} nextPagePath - from response.metadata.next_page (includes leading slash)
 * @returns {Promise<{ data: array; metadata: object }|{ error: string }>}
 */
export async function fetchInspectionsNextPage(nextPagePath) {
  if (!nextPagePath) return { data: [], metadata: { next_page: null, remaining_records: 0 } }
  const path = nextPagePath.startsWith('/') ? nextPagePath : `/${nextPagePath}`
  return safetyCultureRequest(path)
}

/**
 * Fetch groups/organizations the user belongs to
 * @returns {Promise<{ data?: array }|{ error: string }>}
 */
export async function fetchGroups() {
  return safetyCultureRequest('/share/connections')
}

/**
 * Fetch issues from the feed API (paginated)
 * @param {object} params - optional: modified_after, limit
 * @returns {Promise<{ data: array; metadata: object }|{ error: string }>}
 */
export async function fetchIssues(params = {}) {
  const q = new URLSearchParams()
  if (params.modified_after) q.set('modified_after', params.modified_after)
  if (params.limit != null) q.set('limit', String(clampFeedPageLimit(params.limit)))

  const path = `/feed/issues${q.toString() ? `?${q.toString()}` : ''}`
  return safetyCultureRequest(path)
}

/**
 * Fetch next page of issues using metadata.next_page
 * @param {string} nextPagePath - from response.metadata.next_page
 * @returns {Promise<{ data: array; metadata: object }|{ error: string }>}
 */
export async function fetchIssuesNextPage(nextPagePath) {
  if (!nextPagePath) return { data: [], metadata: { next_page: null, remaining_records: 0 } }
  const path = nextPagePath.startsWith('/') ? nextPagePath : `/${nextPagePath}`
  return safetyCultureRequest(path)
}

/**
 * Fetch full inspection details by inspection/audit id.
 * SafetyCulture commonly uses the /audits/{id} resource for inspection detail.
 * @param {string} auditId
 * @returns {Promise<{ data?: any; error?: string; details?: any }>}
 */
export async function fetchInspectionDetails(auditId) {
  if (!auditId) return { error: 'Missing inspection id' }
  const id = encodeURIComponent(String(auditId))
  const candidates = [
    `/audits/${id}`,
    `/inspections/${id}`,
    `/feed/inspections/${id}`
  ]
  let lastError = null
  for (const path of candidates) {
    const result = await safetyCultureRequest(path)
    if (!result?.error) return result
    lastError = { path, error: result.error, details: result.details, status: result.status }
  }
  return {
    error: 'Unable to fetch inspection details',
    details: { auditId, lastError }
  }
}

/**
 * Fetch full issue details by issue id with endpoint fallbacks.
 * Different SafetyCulture APIs use either issues or incidents naming.
 * @param {string} issueId
 * @returns {Promise<{ data?: any; error?: string; details?: any }>}
 */
export async function fetchIssueDetails(issueId) {
  if (!issueId) return { error: 'Missing issue id' }
  const id = encodeURIComponent(String(issueId))
  const candidates = [
    `/issues/${id}`,
    `/incidents/${id}`,
    `/feed/issues/${id}`
  ]
  let lastError = null
  for (const path of candidates) {
    const result = await safetyCultureRequest(path)
    if (!result?.error) return result
    lastError = { path, error: result.error, details: result.details, status: result.status }
  }
  return {
    error: 'Unable to fetch issue details',
    details: { issueId, lastError }
  }
}

/**
 * Execute async mapper with bounded concurrency.
 * @template T,U
 * @param {T[]} items
 * @param {(item: T, idx: number) => Promise<U>} mapper
 * @param {number} concurrency
 * @returns {Promise<U[]>}
 */
export async function mapWithConcurrency(items, mapper, concurrency = 5) {
  const safeConcurrency = Math.max(1, Math.min(Number(concurrency) || 1, 20))
  if (!Array.isArray(items) || items.length === 0) return []
  const out = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const i = cursor
      cursor += 1
      if (i >= items.length) return
      out[i] = await mapper(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(safeConcurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return out
}

/**
 * Enrich feed items with per-item detail payloads.
 * On detail failures, preserve the original item and attach non-fatal enrichment status.
 * @param {Array<object>} items
 * @param {(item: object) => string | undefined | null} getItemId
 * @param {(id: string) => Promise<{ data?: any; error?: string; details?: any }>} fetchDetails
 * @param {{ concurrency?: number }} options
 * @returns {Promise<Array<object>>}
 */
export async function enrichFeedItems(items, getItemId, fetchDetails, options = {}) {
  const list = Array.isArray(items) ? items : []
  const concurrency = options.concurrency ?? 5

  return mapWithConcurrency(list, async (item) => {
    const id = getItemId?.(item)
    if (!id) {
      return {
        ...item,
        _enrichment: { ok: false, skipped: true, reason: 'missing_id' }
      }
    }

    const detailResult = await fetchDetails(id)
    if (detailResult?.error) {
      return {
        ...item,
        _enrichment: { ok: false, error: detailResult.error }
      }
    }

    const detail = detailResult?.data ?? detailResult
    if (!detail || typeof detail !== 'object') {
      return {
        ...item,
        _enrichment: { ok: false, error: 'detail_payload_empty' }
      }
    }

    return {
      ...item,
      ...detail,
      _enrichment: { ok: true }
    }
  }, concurrency)
}
