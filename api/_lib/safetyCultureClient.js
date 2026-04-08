/**
 * Safety Culture API client
 * Docs: https://developer.safetyculture.com/
 * Base URL: https://api.safetyculture.io
 */

import { resolveSafetyCultureApiKey } from './safetyCultureApiKey.js'

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
  const override = options.apiKey != null ? String(options.apiKey).trim() : ''
  const apiKey = override || (await resolveSafetyCultureApiKey())
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
  if (params.modified_before) {
    q.set('modified_before', params.modified_before)
  }
  if (params.limit != null) q.set('limit', String(clampFeedPageLimit(params.limit)))
  if (params.completed != null && params.completed !== '') {
    q.set('completed', String(params.completed))
  }
  if (params.archived != null && params.archived !== '') {
    q.set('archived', String(params.archived))
  }
  if (params.web_report_link === 'public' || params.web_report_link === 'private') {
    q.set('web_report_link', params.web_report_link)
  }
  if (params.template != null) {
    const templates = Array.isArray(params.template) ? params.template : [params.template]
    for (const t of templates) {
      if (t != null && String(t).trim()) q.append('template', String(t).trim())
    }
  }

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
  if (params.modified_before) q.set('modified_before', params.modified_before)
  if (params.limit != null) q.set('limit', String(clampFeedPageLimit(params.limit)))

  const path = `/feed/issues${q.toString() ? `?${q.toString()}` : ''}`
  return safetyCultureRequest(path)
}

/**
 * Parse SafetyCulture streaming / NDJSON answer payloads (newline-delimited JSON objects).
 * @param {string} text
 * @returns {object[]}
 */
export function parseSafetyCultureNdjsonLines(text) {
  if (!text || typeof text !== 'string') return []
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const out = []
  for (const line of lines) {
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip non-JSON lines
    }
  }
  return out
}

/**
 * List inspection answers (question responses). May return many rows; uses extended timeout.
 * @param {string} inspectionId - SafetyCulture inspection / audit id
 * @returns {Promise<{ answers: object[]; raw?: string; error?: string; details?: any }>}
 */
export async function fetchInspectionAnswers(inspectionId) {
  if (!inspectionId) return { error: 'Missing inspection id', answers: [] }
  const id = encodeURIComponent(String(inspectionId))
  const path = `/inspections/v1/answers/${id}`
  const apiKey = await resolveSafetyCultureApiKey()
  if (!apiKey || !apiKey.startsWith('scapi_')) {
    return { error: 'SAFETY_CULTURE_API_KEY not configured or invalid (must start with scapi_)', answers: [] }
  }
  const url = `${BASE_URL}${path}`
  const timeoutMs = 120000
  let timeoutId
  try {
    const controller = new AbortController()
    timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json, application/x-ndjson, */*'
      },
      signal: controller.signal
    })
    if (timeoutId) clearTimeout(timeoutId)
    const text = await res.text()
    if (!res.ok) {
      let body
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = { message: text }
      }
      return {
        error: body?.message || body?.error || `Safety Culture API error: ${res.status}`,
        answers: [],
        details: body
      }
    }
    const trimmed = text.trim()
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed)
        return { answers: Array.isArray(arr) ? arr : [] }
      } catch {
        /* fall through */
      }
    }
    const parsed = parseSafetyCultureNdjsonLines(text)
    if (parsed.length > 0) return { answers: parsed }
    if (trimmed) {
      try {
        const one = JSON.parse(trimmed)
        return { answers: [one] }
      } catch {
        return { answers: [], raw: trimmed.slice(0, 2000) }
      }
    }
    return { answers: [] }
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    return {
      error: isTimeout ? 'Safety Culture answers request timed out' : (err.message || 'Failed to fetch answers'),
      answers: []
    }
  }
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

/**
 * Enrich only the first N rows (detail API per row is slow; gateways often timeout on large lists).
 * @param {Array<object>} items
 * @param {(item: object) => string | undefined | null} getItemId
 * @param {(id: string) => Promise<{ data?: any; error?: string; details?: any }>} fetchDetails
 * @param {{ cap?: number, concurrency?: number }} options
 */
export async function enrichFeedItemsCapped(items, getItemId, fetchDetails, options = {}) {
  const list = Array.isArray(items) ? items : []
  const cap = Math.max(0, Math.min(Number(options.cap) || 50, 200))
  const concurrency = options.concurrency ?? 8
  if (list.length === 0) return []
  const head = list.slice(0, cap)
  const tail = list.slice(cap)
  const enrichedHead = await enrichFeedItems(head, getItemId, fetchDetails, { concurrency })
  return [...enrichedHead, ...tail]
}
