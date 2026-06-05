import { API_BASE_URL } from '../config'
import { request } from '../services/apiClient'
import type {
  ClientOption,
  InventoryItem,
  JobCardFormData,
  PendingJobCard,
  ServiceFormTemplate,
  StockLocation,
  UserOption
} from './types'

export const jobcardsApi = {
  list(token: string, params: { page?: number; search?: string; clientId?: string } = {}) {
    const q = new URLSearchParams({
      page: String(params.page ?? 1),
      pageSize: '30',
      sortField: 'createdAt',
      sortDirection: 'desc'
    })
    if (params.search) q.set('search', params.search)
    if (params.clientId) q.set('clientId', params.clientId)
    return request<{ jobCards: PendingJobCard[] }>(`/api/jobcards?${q}`, { token })
  },

  get(token: string, id: string, omitPhotos = true) {
    const suffix = omitPhotos ? '?omitPhotos=1' : ''
    return request<{ jobCard: PendingJobCard & JobCardFormData }>(
      `/api/jobcards/${encodeURIComponent(id)}${suffix}`,
      { token }
    )
  },

  create(token: string, body: Record<string, unknown>) {
    return request<{ jobCard: PendingJobCard }>('/api/jobcards', {
      method: 'POST',
      token,
      body
    })
  },

  patch(token: string, id: string, body: Record<string, unknown>) {
    return request<{ jobCard: PendingJobCard }>(`/api/jobcards/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body
    })
  },

  getClients(token: string) {
    return request<{ clients: ClientOption[] }>('/api/clients', { token }).then(
      (d) => d.clients || []
    )
  },

  getPublicClients() {
    return request<{ clients: ClientOption[] }>('/api/public/clients').then((d) => d.clients || [])
  },

  getUsers(token: string) {
    return request<{ users: UserOption[] } | UserOption[]>('/api/users', { token }).then((d) =>
      Array.isArray(d) ? d : d.users || []
    )
  },

  getPublicLocations() {
    return request<{ locations: StockLocation[] }>('/api/public/locations').then(
      (d) => d.locations || []
    )
  },

  getPublicInventory(
    locationId?: string,
    opts?: { includeZero?: boolean; allSkus?: boolean }
  ) {
    const params = new URLSearchParams()
    if (locationId) params.set('locationId', locationId)
    if (opts?.includeZero) params.set('includeZero', '1')
    if (opts?.allSkus) params.set('allSkus', '1')
    const q = params.toString() ? `?${params.toString()}` : ''
    return request<{ inventory: InventoryItem[] }>(`/api/public/inventory${q}`).then(
      (d) => d.inventory || []
    )
  },

  getServiceFormTemplates() {
    return request<{ templates: ServiceFormTemplate[] }>('/api/public/service-forms').then((d) =>
      Array.isArray((d as { templates?: ServiceFormTemplate[] }).templates)
        ? (d as { templates: ServiceFormTemplate[] }).templates
        : []
    )
  },

  getPhotos(token: string, id: string) {
    return request<{ photos: unknown[]; customerSignature?: string }>(
      `/api/jobcards/${encodeURIComponent(id)}/photos`,
      { token }
    )
  },

  getProjects(token: string) {
    return request<{ projects: Array<{ id: string; name?: string; clientId?: string; clientName?: string; status?: string }> }>(
      '/api/projects?limit=500',
      { token }
    ).then((d) => d.projects || [])
  },

  syncActivity(token: string, jobCardId: string, events: unknown[]) {
    return request(`/api/jobcards/${encodeURIComponent(jobCardId)}/activity/sync`, {
      method: 'POST',
      token,
      body: { events }
    })
  },

  stockTakeList(token: string) {
    return request<{ submissions: unknown[] }>(
      '/api/manufacturing/stock-take-submissions?mine=1',
      { token }
    )
  },

  stockTakeCreate(token: string, body: Record<string, unknown>) {
    return request('/api/manufacturing/stock-take-submissions', {
      method: 'POST',
      token,
      body
    })
  },

  stockTakeGet(token: string, sessionId: string) {
    return request(`/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}`, {
      token
    })
  },

  stockTakePatch(token: string, sessionId: string, body: Record<string, unknown>) {
    return request(`/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      token,
      body
    })
  },

  stockTakeSubmit(token: string, sessionId: string) {
    return request(
      `/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}/submit-for-review`,
      { method: 'POST', token }
    )
  }
}

export { API_BASE_URL }
