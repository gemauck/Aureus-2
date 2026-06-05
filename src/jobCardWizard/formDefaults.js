import { generateClientDraftId } from './util.js';
import { SECTION_WORK_MEDIA_KEYS } from './constants.js';

export function emptySectionWorkMedia() {
  return { diagnosis: [], actionsTaken: [], futureWorkRequired: [] };
}

export function createStockEntryRow(overrides = {}) {
  return {
    id: `stock-entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    locationId: '',
    sku: '',
    quantity: 0,
    ...overrides
  };
}

export function buildNewJobCardEditingMeta(nowIso = new Date().toISOString()) {
  const localId = generateClientDraftId();
  return {
    localId,
    serverJobCardId: null,
    startedAt: nowIso,
    createdAt: nowIso,
    synced: false,
    jobCardNumber: '',
    useNewJobTimeFlow: true
  };
}

export function createEmptyFormData() {
  return {
    heading: '',
    agentName: '',
    otherTechnicians: [],
    projectId: '',
    projectName: '',
    clientId: '',
    clientName: '',
    siteId: '',
    siteName: '',
    location: '',
    latitude: '',
    longitude: '',
    timeOfArrival: '',
    departureFromSite: '',
    vehicleUsed: '',
    kmReadingBefore: '',
    kmReadingAfter: '',
    reasonForVisit: '',
    callOutCategory: '',
    diagnosis: '',
    futureWorkRequired: '',
    futureWorkScheduledAt: '',
    actionsTaken: '',
    otherComments: '',
    stockUsed: [],
    materialsBought: [],
    photos: [],
    serviceForms: [],
    status: 'draft',
    customerName: '',
    customerTitle: '',
    customerFeedback: '',
    customerSignDate: '',
    customerSignature: ''
  };
}

export { SECTION_WORK_MEDIA_KEYS };
