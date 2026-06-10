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

function unwrapList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && key in data) {
    const inner = (data as Record<string, unknown>)[key]
    return Array.isArray(inner) ? (inner as T[]) : []
  }
  return []
}

function filterActiveClients(list: ClientOption[]): ClientOption[] {
  return list.filter((c) => {
    const rawStatus = String(c.status || (c as { engagementStage?: string }).engagementStage || 'active')
      .trim()
      .toLowerCase()
    const type = (c.type || 'client').toLowerCase()
    const isInactive = rawStatus === 'inactive'
    return !isInactive && (type === 'client' || !c.type)
  })
}

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

  delete(token: string, id: string) {
    return request<{ deleted: boolean; id: string }>(
      `/api/jobcards/${encodeURIComponent(id)}`,
      { method: 'DELETE', token }
    )
  },

  getClients(token: string) {
    return request<unknown>('/api/clients', { token })
      .then((d) => filterActiveClients(unwrapList<ClientOption>(d, 'clients')))
      .catch(() => [])
  },

  getPublicClients() {
    return request<unknown>('/api/public/clients')
      .then((d) => filterActiveClients(unwrapList<ClientOption>(d, 'clients')))
      .catch(() => [])
  },

  /** Public first (ERP job card form), authenticated fallback. */
  async loadClients(token?: string) {
    const fromPublic = await jobcardsApi.getPublicClients()
    if (fromPublic.length) return fromPublic
    if (!token) return []
    return jobcardsApi.getClients(token)
  },

  getUsers(token?: string) {
    return request<unknown>('/api/public/users')
      .then((d) => unwrapList<UserOption>(d, 'users'))
      .catch(() => {
        if (!token) return Promise.resolve([] as UserOption[])
        return request<unknown>('/api/users', { token }).then((d) =>
          unwrapList<UserOption>(d, 'users')
        )
      })
  },

  getClientSites(clientId: string) {
    return request<unknown>(`/api/public/sites/client/${encodeURIComponent(clientId)}`)
      .then((d) => unwrapList<{ id: string; name?: string }>(d, 'sites'))
      .catch(() => [])
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
    return request<unknown>('/api/projects?limit=500', { token }).then((d) =>
      unwrapList<{ id: string; name?: string; clientId?: string; clientName?: string; status?: string }>(
        d,
        'projects'
      )
    )
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
