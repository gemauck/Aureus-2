export type WizardFlow =
  | 'landing'
  | 'prior_list'
  | 'form'
  | 'stock_take'
  | 'stock_transfer_request'
  | 'stock_transfer_approvals'
  | 'incident_form'
  | 'incident_list'
  | 'pending_uploads'

export type IncidentPrefill = {
  clientId?: string
  clientName?: string
  siteId?: string
  siteName?: string
  jobCardId?: string
  jobCardNumber?: string
  linkedJobCards?: Array<{ id: string; jobCardId?: string; jobCardNumber?: string }>
  photos?: unknown[]
  incidentAt?: string
  locationDescription?: string
  locationLatitude?: string
  locationLongitude?: string
  incidentType?: string
  severity?: string
  description?: string
  immediateActions?: string
  investigationNotes?: string
  correctiveActions?: string
  witnesses?: string
  equipmentInvolved?: string
  relevantAssets?: string
  relevantTanksMobileBowsers?: string
  technicianName?: string
  authorName?: string
  peopleInvolved?: Array<{ name: string; role: string; injured: boolean }>
  status?: string
}

export type WizardStepId = 'assignment' | 'visit' | 'work' | 'stock' | 'signoff'

export type JobCardSaveOptions = {
  forceDraft?: boolean
  forceSubmitted?: boolean
  departureFromSiteOverride?: string
  timeOfArrivalOverride?: string
  silent?: boolean
  /** Step navigation — persist fields + photos locally; server sync waits for submit / full save */
  lightweight?: boolean
}

export type JobCardSaveResult = {
  ok: boolean
  persisted: boolean
  synced: boolean
  queued: boolean
  status: string
  error?: string
}

export type JobCardFormData = {
  heading: string
  agentName: string
  otherTechnicians: string[]
  projectId: string
  projectName: string
  clientId: string
  clientName: string
  siteId: string
  siteName: string
  location: string
  latitude: string
  longitude: string
  timeOfArrival: string
  departureFromSite: string
  vehicleUsed: string
  kmReadingBefore: string
  kmReadingAfter: string
  reasonForVisit: string
  callOutCategory: string
  diagnosis: string
  futureWorkRequired: string
  futureWorkScheduledAt: string
  actionsTaken: string
  otherComments: string
  stockUsed: StockUsedLine[]
  materialsBought: MaterialLine[]
  photos: PhotoEntry[]
  serviceForms: ServiceFormInstance[]
  status: string
  customerName: string
  customerTitle: string
  customerFeedback: string
  customerSignDate: string
  customerSignature: string
}

export type StockUsedLine = {
  id?: string
  sku: string
  quantity: number
  locationId: string
  locationName?: string
  itemName?: string
  unitCost?: number
}

export type MaterialLine = {
  id: string
  itemName: string
  description: string
  reason: string
  cost: number
}

export type PhotoEntry = string | Record<string, unknown>

export type ServiceFormInstance = {
  id: string
  templateId: string
  templateName: string
  answers: Record<string, unknown>
}

export type EditingMeta = {
  localId: string
  serverJobCardId: string | null
  startedAt: string
  createdAt: string
  synced: boolean
  jobCardNumber: string
  useNewJobTimeFlow: boolean
  /** Server `updatedAt` when the card was opened — used for sync conflict detection. */
  syncBaseUpdatedAt?: string | null
}

export type PendingJobCard = JobCardFormData & {
  id: string
  synced: boolean
  serverJobCardId?: string | null
  activityQueue?: Array<{ action: string; metadata?: unknown; source?: string }>
  jobCardNumber?: string
  updatedAt?: string
  syncBaseUpdatedAt?: string | null
  syncConflict?: boolean
  forceOverwrite?: boolean
  useNewJobTimeFlow?: boolean
  startedAt?: string
  createdAt?: string
}

export type PriorListRow = PendingJobCard & {
  source?: 'local' | 'server' | 'public'
}

export type StockEntryRow = {
  id: string
  locationId: string
  sku: string
  quantity: number
}

export type VoiceClip = {
  id: string
  section: string
  dataUrl: string
  name?: string
  mimeType?: string
  noteNumber?: number
  transcribed?: boolean
  /** Set when recorded in-app; avoids re-transcribing clips loaded from the server. */
  needsTranscription?: boolean
}

export type SectionWorkMedia = {
  diagnosis: MediaItem[]
  actionsTaken: MediaItem[]
  futureWorkRequired: MediaItem[]
}

export type MediaItem = {
  url: string
  name?: string
  thumbUrl?: string
  previewUrl?: string
  mediaType?: string
}

export type ProjectOption = {
  id: string
  name: string
  clientId?: string
  clientName?: string
  status?: string
}

export type ClientOption = {
  id: string
  name: string
  status?: string
  type?: string
  sites?: string | Array<{ id?: string; name?: string; siteName?: string }>
  clientSites?: Array<{ id: string; name?: string; siteName?: string }>
}

export type UserOption = {
  id: string
  name?: string
  email?: string
  department?: string
  status?: string
}

export type StockLocation = {
  id: string
  name: string
  code?: string
}

export type InventoryItem = {
  id?: string
  /** Catalog row id (ABCO:INV:… QR payload); distinct from synthetic list `id`. */
  inventoryItemId?: string | null
  sku: string
  name?: string
  quantity?: number
  locationId?: string
  locations?: Array<{ locationId: string; quantity: number }>
  status?: string
  thumbnail?: string
}

export type ServiceFormTemplate = {
  id: string
  name: string
  fields?: Array<Record<string, unknown>>
}
