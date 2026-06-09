import { request } from '../services/apiClient'
import type {
  CrmClient,
  CrmClientNote,
  CrmGroup,
  CrmGroupMember,
  CrmJobCard,
  CrmLead,
  CrmOpportunity,
  CrmTag
} from './types'

export const crmApi = {
  listClients(token: string) {
    return request<{ clients: CrmClient[] }>('/api/clients', { token }).then((d) => d.clients || [])
  },

  listLeads(token: string) {
    return request<{ leads: CrmLead[] }>('/api/leads', { token }).then((d) => d.leads || [])
  },

  listGroups(token: string) {
    return request<{ groups: CrmGroup[] }>('/api/clients/groups', { token }).then((d) => d.groups || [])
  },

  getGroupMembers(token: string, groupId: string) {
    return request<{ members: CrmGroupMember[] }>(
      `/api/clients/groups/${encodeURIComponent(groupId)}/members`,
      { token }
    ).then((d) => d.members || [])
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
  },

  getOpportunitiesForClient(token: string, clientId: string) {
    return request<{ opportunities: CrmOpportunity[] }>(
      `/api/opportunities/client/${encodeURIComponent(clientId)}`,
      { token }
    ).then((d) => d.opportunities || [])
  },

  getClientTags(token: string, clientId: string) {
    return request<{ tags: CrmTag[] }>(`/api/clients/${encodeURIComponent(clientId)}/tags`, {
      token
    }).then((d) => d.tags || [])
  },

  getClientNotes(token: string, clientId: string) {
    return request<{ notes: CrmClientNote[] }>(`/api/clients/${encodeURIComponent(clientId)}/notes`, {
      token
    }).then((d) => d.notes || [])
  },

  createClientNote(token: string, clientId: string, body: { title?: string; content: string }) {
    return request<{ note: CrmClientNote }>(`/api/clients/${encodeURIComponent(clientId)}/notes`, {
      method: 'POST',
      token,
      body
    }).then((d) => d.note)
  },

  getJobCardsForClient(token: string, clientId: string, limit = 40) {
    const q = new URLSearchParams({
      clientId,
      page: '1',
      pageSize: String(limit),
      sortField: 'createdAt',
      sortDirection: 'desc'
    })
    return request<{ jobCards?: CrmJobCard[] }>(`/api/jobcards?${q}`, { token }).then(
      (d) => d.jobCards || []
    )
  },

  getIncidentReportsForClient(token: string, clientId: string, limit = 40) {
    const q = new URLSearchParams({
      clientId,
      page: '1',
      pageSize: String(limit)
    })
    return request<{ incidentReports?: Array<Record<string, unknown>> }>(
      `/api/incident-reports?${q}`,
      { token }
    ).then((d) => d.incidentReports || [])
  },

  toggleStar(token: string, clientId: string) {
    return request<{ starred: boolean }>(`/api/starred-clients/${encodeURIComponent(clientId)}`, {
      method: 'PUT',
      token
    })
  },

  createOpportunity(
    token: string,
    body: { title: string; clientId: string; value?: number; engagementStage?: string; aidaStatus?: string }
  ) {
    return request<{ opportunity: CrmOpportunity }>('/api/opportunities', {
      method: 'POST',
      token,
      body
    }).then((d) => d.opportunity)
  },

  listOpportunities(token: string) {
    return request<{ opportunities: CrmOpportunity[] }>('/api/opportunities', { token }).then(
      (d) => d.opportunities || []
    )
  },

  patchOpportunity(token: string, id: string, body: Record<string, unknown>) {
    return request<{ opportunity: CrmOpportunity }>(`/api/opportunities/${encodeURIComponent(id)}`, {
      method: 'PUT',
      token,
      body
    }).then((d) => d.opportunity)
  },

  patchSite(token: string, clientId: string, siteId: string, body: Record<string, unknown>) {
    return request<{ site: unknown }>(
      `/api/sites/client/${encodeURIComponent(clientId)}/${encodeURIComponent(siteId)}`,
      { method: 'PATCH', token, body }
    ).then((d) => d.site)
  }
}
