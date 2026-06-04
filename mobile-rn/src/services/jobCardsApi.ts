import type { ClientOption, JobCardDetail, JobCardDraftPayload, JobCardListItem } from '../types/jobCard'
import { request } from './apiClient'

type ListResponse = {
  jobCards: JobCardListItem[]
  pagination?: { page: number; pageSize: number; hasMore: boolean }
}

export const jobCardsApi = {
  list(token: string, page = 1) {
    return request<ListResponse>(`/api/jobcards?page=${page}&pageSize=30&sortField=createdAt&sortDirection=desc`, {
      token
    })
  },

  get(token: string, id: string) {
    return request<{ jobCard: JobCardDetail }>(`/api/jobcards/${encodeURIComponent(id)}?omitPhotos=1`, { token })
  },

  create(token: string, body: Record<string, unknown>) {
    return request<{ jobCard: JobCardDetail; idempotentReplay?: boolean }>('/api/jobcards', {
      method: 'POST',
      token,
      body
    })
  },

  update(token: string, id: string, body: Record<string, unknown>) {
    return request<{ jobCard: JobCardDetail }>(`/api/jobcards/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body
    })
  },

  getClients(token: string) {
    return request<{ clients: ClientOption[] }>('/api/clients', { token })
  }
}

export function draftToApiBody(draft: JobCardDraftPayload): Record<string, unknown> {
  const gpsKm = draft.trip?.distanceKm ?? 0
  const kmAfter =
    gpsKm > 0 ? gpsKm : Math.max(0, (draft.kmReadingAfter ?? 0) - (draft.kmReadingBefore ?? 0))

  const last = draft.trip?.points?.[draft.trip.points.length - 1]

  return {
    clientDraftId: draft.clientDraftId,
    agentName: draft.agentName,
    clientId: draft.clientId || null,
    clientName: draft.clientName,
    siteId: draft.siteId || '',
    siteName: draft.siteName || '',
    location: draft.location,
    locationLatitude: draft.locationLatitude || (last ? String(last.latitude) : ''),
    locationLongitude: draft.locationLongitude || (last ? String(last.longitude) : ''),
    reasonForVisit: draft.reasonForVisit,
    callOutCategory: draft.callOutCategory,
    diagnosis: draft.diagnosis,
    actionsTaken: draft.actionsTaken,
    timeOfDeparture: draft.timeOfDeparture || draft.trip?.startedAt || undefined,
    timeOfArrival: draft.timeOfArrival || draft.trip?.endedAt || undefined,
    kmReadingBefore: draft.kmReadingBefore ?? 0,
    kmReadingAfter: kmAfter > 0 ? kmAfter : draft.kmReadingAfter ?? 0,
    status: draft.status,
    startedAt: draft.startedAt,
    createdAt: draft.createdAt,
    stockUsed: [],
    materialsBought: [],
    photos: [],
    otherTechnicians: []
  }
}
