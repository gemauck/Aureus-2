export type JobCardListItem = {
  id: string
  jobCardNumber?: string
  agentName?: string
  clientId?: string | null
  clientName?: string
  siteName?: string
  location?: string
  status?: string
  reasonForVisit?: string
  callOutCategory?: string
  travelKilometers?: number
  createdAt?: string
  updatedAt?: string
  timeOfDeparture?: string | null
  timeOfArrival?: string | null
}

export type JobCardDetail = JobCardListItem & {
  siteId?: string
  diagnosis?: string
  actionsTaken?: string
  otherComments?: string
  kmReadingBefore?: number
  kmReadingAfter?: number
  departureFromSite?: string | null
  locationLatitude?: string
  locationLongitude?: string
  vehicleUsed?: string
  startedAt?: string | null
}

export type ClientOption = {
  id: string
  name: string
  status?: string
  sites?: string
  clientSites?: Array<{ id: string; name?: string; siteName?: string }>
}

export type GpsPoint = {
  latitude: number
  longitude: number
  timestamp: string
}

export type TripSession = {
  active: boolean
  startedAt: string | null
  endedAt: string | null
  points: GpsPoint[]
  distanceKm: number
}

export type JobCardDraftPayload = {
  clientDraftId: string
  agentName: string
  clientId: string
  clientName: string
  siteId?: string
  siteName?: string
  location: string
  locationLatitude?: string
  locationLongitude?: string
  reasonForVisit: string
  callOutCategory: string
  diagnosis: string
  actionsTaken: string
  timeOfDeparture?: string
  timeOfArrival?: string
  kmReadingBefore?: number
  kmReadingAfter?: number
  status: 'draft' | 'submitted'
  startedAt: string
  createdAt: string
  trip?: TripSession
}

export type PendingJobCardRecord = {
  id: string
  payload: JobCardDraftPayload
  createdAt: string
  lastError?: string
}

export const CALL_OUT_CATEGORIES = [
  'Air pump',
  'Calibration',
  'Maintenance',
  'Near Miss',
  'New Install',
  'Nozzle',
  'Observation'
] as const
