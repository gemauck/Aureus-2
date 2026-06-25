import { apiUrl, API_BASE_URL } from '../config'
import { addBreadcrumb, reportApiError } from './errorReporting'
import {
  isRateLimited,
  noteSuccessfulRequest,
  registerRateLimitHit
} from './rateLimitGuard'
import { trackError } from './telemetry'
import { getMobileClientInfo } from './clientPresence'
import { publicFieldClientHeaders } from '../../../src/utils/publicFieldClientHeaders.js'

export { API_BASE_URL }

type RequestOptions = {
  method?: string
  body?: unknown
  token?: string
  /** Background badge/poll refresh — skip operator error reports on failure */
  silent?: boolean
}

type AuthRefreshHandler = () => Promise<string | null>

export class ApiRequestError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.statusCode = statusCode
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.statusCode === 401
}

export function isRateLimitError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.statusCode === 429
}

type ParsedApiBody = {
  payload: { data?: unknown; error?: { message?: string } }
  message: string
}

/** Read body once; tolerate plain-text 429 from express-rate-limit (not JSON). */
async function parseApiResponse(response: Response): Promise<ParsedApiBody> {
  const text = await response.text()
  const fallbackMessage =
    response.status === 429
      ? 'Too many requests. Please wait a moment and try again.'
      : 'Request failed'

  if (!text.trim()) {
    return { payload: {}, message: fallbackMessage }
  }

  try {
    const payload = JSON.parse(text) as ParsedApiBody['payload']
    const message =
      payload?.error?.message ||
      (typeof (payload as { message?: string })?.message === 'string'
        ? (payload as { message: string }).message
        : '') ||
      fallbackMessage
    return { payload, message }
  } catch {
    return {
      payload: {},
      message: text.trim().slice(0, 300) || fallbackMessage
    }
  }
}

let authRefreshHandler: AuthRefreshHandler | null = null
let refreshInFlight: Promise<string | null> | null = null
const inflightGets = new Map<string, Promise<unknown>>()

function inflightGetKey(method: string, path: string, hasToken: boolean) {
  return `${method}:${path}:${hasToken ? 'auth' : 'anon'}`
}

/** Register handler to refresh access token on 401 (set from AuthProvider). */
export function registerAuthRefresh(handler: AuthRefreshHandler | null) {
  authRefreshHandler = handler
}

/** Single in-flight token refresh shared by 401 retries and session keepalive. */
export async function refreshAccessToken(): Promise<string | null> {
  if (isRateLimited()) return null
  if (!authRefreshHandler) return null
  if (!refreshInFlight) {
    refreshInFlight = authRefreshHandler().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** Raw fetch with one 401 → refresh → retry (for job card sync engine). */
export async function fetchWithTokenRefresh(
  url: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<Response> {
  const { token, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers || {})
  for (const [key, value] of Object.entries(publicFieldClientHeaders())) {
    headers.set(key, value)
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const method = (fetchOptions.method || 'GET').toUpperCase()

  if (isRateLimited()) {
    return new Response(
      JSON.stringify({ error: { message: 'Too many requests. Please wait a moment and try again.' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let response = await fetch(url, { ...fetchOptions, headers })
  if (response.status === 429) registerRateLimitHit(response)
  else if (response.ok) noteSuccessfulRequest()
  if (response.status === 401 && token && authRefreshHandler) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`)
      response = await fetch(url, { ...fetchOptions, headers })
    }
  }

  if (!response.ok && response.status !== 401 && response.status !== 429) {
    let path = url
    try {
      path = new URL(url, API_BASE_URL).pathname
    } catch {
      /* use raw url */
    }
    if (!path.startsWith('/api/public/')) {
      reportApiError(path, method, response.status, `HTTP ${response.status}`)
    }
  }

  return response
}

async function executeRequest<T>(
  path: string,
  options: RequestOptions,
  retriedAfterRefresh: boolean
): Promise<T> {
  const { method = 'GET', body, token, silent = false } = options
  const url = apiUrl(path)

  if (isRateLimited()) {
    throw new ApiRequestError('Too many requests. Please wait a moment and try again.', 429)
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...publicFieldClientHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
  } catch (error) {
    const hint = error instanceof Error ? error.message : 'Network error'
    addBreadcrumb('api', `Network failure ${method} ${path}`, { path, method })
    if (!silent) reportApiError(path, method, 0, hint)
    throw new Error(
      `Cannot reach ${url}. Check Wi‑Fi or mobile data, open that URL in Chrome on this device, then try again. (${hint})`
    )
  }

  const { payload, message } = await parseApiResponse(response)
  if (!response.ok) {
    if (response.status === 429) registerRateLimitHit(response)
    if (
      response.status === 401 &&
      token &&
      !retriedAfterRefresh &&
      authRefreshHandler &&
      !isRateLimited()
    ) {
      const newToken = await refreshAccessToken()
      if (newToken) {
        return executeRequest<T>(path, { ...options, token: newToken }, true)
      }
    }
    if (!silent && response.status !== 429) {
      reportApiError(path, method, response.status, message)
    }
    throw new ApiRequestError(message, response.status)
  }

  noteSuccessfulRequest()
  return payload?.data as T
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
  retriedAfterRefresh = false
): Promise<T> {
  const { method = 'GET', body, token } = options
  const dedupeKey =
    method === 'GET' && body == null ? inflightGetKey(method, path, Boolean(token)) : ''
  if (dedupeKey) {
    const existing = inflightGets.get(dedupeKey)
    if (existing) return existing as Promise<T>
    const promise = executeRequest<T>(path, options, retriedAfterRefresh).finally(() => {
      inflightGets.delete(dedupeKey)
    })
    inflightGets.set(dedupeKey, promise)
    return promise
  }
  return executeRequest<T>(path, options, retriedAfterRefresh)
}

export const apiClient = {
  async mobileLogin(email: string, password: string) {
    return request<{
      accessToken: string
      refreshToken: string
      user: { id: string; email: string; role?: string; name?: string; permissions?: string | string[] }
    }>('/api/auth/mobile/login', {
      method: 'POST',
      body: { email, password, ...getMobileClientInfo() }
    })
  },
  async mobileRefresh(refreshToken: string) {
    return request<{
      accessToken: string
      refreshToken: string
      user?: {
        id: string
        email: string
        role?: string
        name?: string
        permissions?: string | string[]
      }
    }>('/api/auth/mobile/refresh', {
      method: 'POST',
      body: { refreshToken },
      silent: true
    })
  },
  async mobileEmbedToken(token: string) {
    return request<{
      embedToken: string
      expiresIn: number
      user: { id: string; email: string; role?: string; name?: string; permissions?: string | string[] }
    }>('/api/auth/mobile/embed-token', {
      method: 'POST',
      token
    })
  },
  async mobileLogout(refreshToken?: string, token?: string) {
    try {
      await request('/api/auth/mobile/logout', {
        method: 'POST',
        token,
        body: { refreshToken }
      })
    } catch (error) {
      trackError(error, 'mobileLogout')
    }
  },
  getClients(token: string) {
    return request<{ clients: import('../types/jobCard').ClientOption[] }>('/api/clients', {
      token
    }).then((data) => data.clients || [])
  },
  getProjects(token: string) {
    return request<{ projects?: Array<{ id: string; name: string; status?: string }> } | Array<{ id: string; name: string; status?: string }>>('/api/projects', { token }).then(
      (data) => (Array.isArray(data) ? data : data.projects || [])
    )
  },
  getTasks(token: string) {
    return request<{ tasks?: Array<{ id: string; title?: string; name?: string; status?: string }> } | Array<{ id: string; title?: string; name?: string; status?: string }>>('/api/tasks', { token }).then(
      (data) => (Array.isArray(data) ? data : data.tasks || [])
    )
  },
  getNotifications(token: string) {
    return request<
      | { notifications?: Array<{ id: string; title?: string; message?: string }> }
      | Array<{ id: string; title?: string; message?: string }>
    >('/api/notifications', { token }).then((data) =>
      Array.isArray(data) ? data : data.notifications || []
    )
  }
}
