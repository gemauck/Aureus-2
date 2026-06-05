import { NO_CLIENT_ID } from './constants.js';
import { sanitizeJobCardStockUsedForSave } from '../utils/jobCardStockUsed.js';
import { buildJobCardPhotosPayload } from './mediaPayload.js';
import { estimateJsonBytes } from './util.js';

/**
 * Build API-ready job card body from wizard state (mirrors web handleSave assembly).
 * @param {object} params
 */
export function buildJobCardSavePayload({
  formData,
  editingMeta,
  editingId,
  signatureDataUrl,
  sectionPhotoEntries = [],
  voicePhotoEntries = [],
  normalizedStatus = 'draft',
  nowIso = new Date().toISOString(),
  omitPhotos = false
}) {
  const jobCardData = {
    ...formData,
    id: editingId || editingMeta?.localId,
    stockUsed: sanitizeJobCardStockUsedForSave(formData.stockUsed),
    materialsBought: Array.isArray(formData.materialsBought) ? formData.materialsBought : [],
    otherTechnicians: Array.isArray(formData.otherTechnicians) ? formData.otherTechnicians : [],
    serviceForms: Array.isArray(formData.serviceForms) ? formData.serviceForms : [],
    locationLatitude: formData.latitude || formData.locationLatitude || '',
    locationLongitude: formData.longitude || formData.locationLongitude || ''
  };

  if (!omitPhotos) {
    jobCardData.photos = buildJobCardPhotosPayload({
      formPhotos: formData.photos,
      signatureDataUrl,
      sectionPhotoEntries,
      voicePhotoEntries
    });
  }

  jobCardData.status = normalizedStatus;
  if (normalizedStatus === 'draft') {
    jobCardData.submittedAt = null;
    jobCardData.completedAt = null;
  } else if (normalizedStatus === 'submitted') {
    jobCardData.submittedAt = nowIso;
    jobCardData.completedAt = null;
  } else {
    jobCardData.submittedAt = nowIso;
    jobCardData.completedAt = nowIso;
  }

  if (jobCardData.clientId === NO_CLIENT_ID) {
    jobCardData.clientId = null;
  }

  if (editingMeta?.startedAt) jobCardData.startedAt = editingMeta.startedAt;
  if (editingMeta?.createdAt) jobCardData.createdAt = editingMeta.createdAt;

  return jobCardData;
}

export function estimateSavePayloadBytes(payload) {
  return estimateJsonBytes(payload);
}
