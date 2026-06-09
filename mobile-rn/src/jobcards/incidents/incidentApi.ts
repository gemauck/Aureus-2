import { request } from '../../services/apiClient'

export type IncidentPerson = {
  name: string
  role: string
  injured: boolean
}

export type IncidentReport = {
  id: string
  incidentNumber: string
  status: string
  clientId?: string | null
  clientName: string
  siteId: string
  siteName: string
  jobCardId?: string | null
  jobCardNumber: string
  incidentAt?: string | null
  incidentType: string
  severity: string
  description: string
  immediateActions: string
  investigationNotes: string
  correctiveActions: string
  peopleInvolved?: IncidentPerson[]
  witnesses: string
  equipmentInvolved: string
  locationDescription: string
  locationLatitude: string
  locationLongitude: string
  photos?: unknown[]
  reportedByName: string
  createdAt?: string
}

export const incidentApi = {
  list(token: string, params: Record<string, string> = {}) {
    const q = new URLSearchParams({ pageSize: '100', ...params })
    return request<{ incidentReports?: IncidentReport[] }>(`/api/incident-reports?${q}`, { token })
  },

  get(token: string, id: string) {
    return request<{ incidentReport?: IncidentReport }>(`/api/incident-reports/${encodeURIComponent(id)}`, {
      token
    })
  },

  create(token: string, body: Record<string, unknown>) {
    return request<{ incidentReport?: IncidentReport }>('/api/incident-reports', {
      method: 'POST',
      token,
      body
    })
  },

  patch(token: string, id: string, body: Record<string, unknown>) {
    return request<{ incidentReport?: IncidentReport }>(`/api/incident-reports/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body
    })
  },

  pdfUrl(id: string) {
    return `/api/incident-reports/${encodeURIComponent(id)}/pdf`
  }
}
