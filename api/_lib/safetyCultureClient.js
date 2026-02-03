/**
 * Safety Culture API client
 * Docs: https://developer.safetyculture.com/
 * Base URL: https://api.safetyculture.io
 */

const BASE_URL = 'https://api.safetyculture.io'

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

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal
    })

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
    return {
      error: err.message || 'Failed to reach Safety Culture API',
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
  if (params.limit != null) q.set('limit', String(params.limit))
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
  if (params.limit != null) q.set('limit', String(params.limit))

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
