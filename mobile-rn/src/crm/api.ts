import { request } from '../services/apiClient'
import type { CrmClient, CrmLead } from './types'

export const crmApi = {
  listClients(token: string) {
    return request<{ clients: CrmClient[] }>('/api/clients', { token }).then((d) => d.clients || [])
  },

  listLeads(token: string) {
    return request<{ leads: CrmLead[] }>('/api/leads', { token }).then((d) => d.leads || [])
  },

  getClient(token: string, id: string) {
    return request<{ client: CrmClient }>(`/api/clients/${encodeURIComponent(id)}`, { token }).then(
      (d) => d.client
    )
  },

  getLead(token: string, id: string) {
    return request<{ lead: CrmLead }>(`/api/leads/${encodeURIComponent(id)}`, { token }).then(
      (d) => d.lead
    )
  },

  patchClient(token: string, id: string, body: Record<string, unknown>) {
    return request<{ client: CrmClient }>(`/api/clients/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body
    }).then((d) => d.client)
  },

  patchLead(token: string, id: string, body: Record<string, unknown>) {
    return request<{ lead: CrmLead }>(`/api/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body
    }).then((d) => d.lead)
  }
}
