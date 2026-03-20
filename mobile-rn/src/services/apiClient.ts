import { trackError } from './telemetry'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || ''

type RequestOptions = {
  method?: string
  body?: unknown
  token?: string
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const payload = await response.json()
  if (!response.ok) {
    const message = payload?.error?.message || 'Request failed'
    throw new Error(message)
  }
  return payload?.data as T
}

export const apiClient = {
  async mobileLogin(email: string, password: string) {
    return request<{
      accessToken: string
      refreshToken: string
      user: { id: string; email: string; role?: string; name?: string }
    }>('/api/auth/mobile/login', { method: 'POST', body: { email, password } })
  },
  async mobileRefresh(refreshToken: string) {
    return request<{ accessToken: string; refreshToken: string }>('/api/auth/mobile/refresh', {
      method: 'POST',
      body: { refreshToken }
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
    return request<Array<{ id: string; name: string; status?: string }>>('/api/clients', { token })
  },
  getProjects(token: string) {
    return request<Array<{ id: string; name: string; status?: string }>>('/api/projects', { token })
  },
  getTasks(token: string) {
    return request<Array<{ id: string; title?: string; name?: string; status?: string }>>('/api/tasks', { token })
  },
  getNotifications(token: string) {
    return request<Array<{ id: string; title?: string; message?: string }>>('/api/notifications', { token })
  }
}
