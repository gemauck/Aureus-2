// Mobile Job Card wizard — used at /job-card behind JobCardAppGate (login required).
// Offline-friendly: drafts can be saved locally and synced when online.
import {
  formatJobCardActivityAction,
  formatJobCardActivityDetail,
  formatJobCardActivitySource,
  sortJobCardActivitiesChronological,
  jobSiteMinutesFromDatetimeLocals,
  formatTravelDurationMinutes,
  JOB_CARD_CALL_OUT_CATEGORY_OPTIONS
} from './jobCardActivityDisplay.js';
import jsQR from 'jsqr';
import {
  buildInventoryIdToSkuMap,
  fetchInventorySkuByItemId,
  resolveInventoryScanToSku
} from '../../utils/resolveInventoryScanToSku.js';
import { sanitizeJobCardStockUsedForSave } from '../../utils/jobCardStockUsed.js';
import {
  stockTakeAvailabilityEmptyMessage,
  stockTakeRowMatchesAvailability,
  STOCK_TAKE_AVAILABILITY_OPTIONS
} from '../../utils/stockTakeAvailability.js';
import { StockTakeAvailabilityFilter } from './StockTakeAvailabilityFilter.jsx';
import {
  STEP_IDS,
  STEP_META,
  NO_CLIENT_ID,
  JOB_CARD_IMAGE_MAX_BYTES,
  JOB_CARD_VIDEO_MAX_BYTES,
  JOB_CARD_IMAGE_TARGET_BYTES,
  JOB_CARD_IMAGE_MAX_DIMENSION,
  JOB_CARD_IMAGE_THUMB_MAX_DIMENSION,
  JOB_CARD_SYNC_WARN_PAYLOAD_BYTES,
  JOB_CARD_SYNC_HARD_PAYLOAD_BYTES,
  JOB_CARD_SYNC_REQUEST_TIMEOUT_MS,
  JOB_CARD_SYNC_RETRY_ATTEMPTS,
  PRIOR_CARD_HEADING_MAX_CHARS,
  SECTION_WORK_MEDIA_KEYS,
  JOB_CARD_PUBLIC_PRIOR_IDS_KEY,
  MAX_PUBLIC_PRIOR_IDS,
  PROJECT_ASSOCIATION_PREFIX,
  HEADING_PREFIX,
  STOCK_TAKE_PAGE_SIZE,
  STOCK_TAKE_DRAFT_KEY,
  STOCK_TAKE_NOTES_SEP,
  emptySectionWorkMedia,
  createStockEntryRow,
  buildNewJobCardEditingMeta,
  generateClientDraftId,
  isLikelyServerJobCardId,
  estimateJsonBytes,
  fetchWithRetry,
  parseJobCardSyncFailureMessage,
  parseStoredJsonArray,
  toDatetimeLocalInput,
  formatWizardDatetimeLabel,
  dataUrlApproxBytes,
  sleepMs,
  jobCardQuantityAtLocation,
  jobCardStockPickListFromCachedInventory,
  jobCardStockTakePickListFromCachedInventory,
  buildJobCardPhotosPayload,
  photosArrayWithoutSignature,
  extractSignatureUrlFromPhotosValue,
  validateWizardStep,
  priorListLocalSearchHay,
  getPriorCardOpenId,
  buildMergedWizardJobCardRows as mergeWizardJobCardRows
} from '../../jobCardWizard/index.js';
import { getWebOfflineStore, createWebSyncEngine } from '../../jobCardWizard/webAdapter.js';

const { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } = React;

const webOfflineStore = getWebOfflineStore();
const readLocalPendingJobCards = () => webOfflineStore.readLocalPendingJobCards();
const writeLocalPendingJobCards = (cards) => webOfflineStore.writeLocalPendingJobCards(cards);
const upsertLocalPendingJobCard = (card) => webOfflineStore.upsertLocalPendingJobCard(card);
const removeLocalPendingJobCard = (id) => webOfflineStore.removeLocalPendingJobCard(id);
const listUnsyncedLocalPendingJobCards = () => webOfflineStore.listUnsyncedLocalPendingJobCards();
const readPublicPriorJobCardIds = () => webOfflineStore.readPublicPriorJobCardIds();
const rememberPublicPriorJobCardId = (id) => webOfflineStore.rememberPublicPriorJobCardId(id);

function isUsableInventoryThumbnail(url) {
  const t = String(url || '').trim();
  return /^https?:\/\//i.test(t) || /^data:image\//i.test(t);
}

function StockTakeLineThumbnail({ src, alt }) {
  const [failed, setFailed] = useState(false);
  const usable = isUsableInventoryThumbnail(src) && !failed;
  if (!usable) {
    return (
      <div
        className="w-10 h-10 shrink-0 rounded border border-gray-200 bg-gray-100 flex items-center justify-center text-gray-400"
        aria-hidden
      >
        <i className="fas fa-box text-sm" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      decoding="async"
      className="w-10 h-10 shrink-0 rounded border border-gray-200 object-cover bg-white"
      onError={() => setFailed(true)}
    />
  );
}

function defaultStockTakeDescription() {
  const now = new Date();
  const monthYear = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const dayPart = now.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  return `${monthYear} — ${dayPart}`;
}

function combineStockTakeNotes(description, reviewerNotes) {
  const desc = String(description || '').trim();
  const extra = String(reviewerNotes || '').trim();
  if (!desc) return extra;
  if (!extra) return desc;
  return desc + STOCK_TAKE_NOTES_SEP + extra;
}

function splitStockTakeNotes(combined) {
  const raw = String(combined || '');
  const idx = raw.indexOf(STOCK_TAKE_NOTES_SEP);
  if (idx < 0) return { description: raw.trim(), reviewerNotes: '' };
  return {
    description: raw.slice(0, idx).trim(),
    reviewerNotes: raw.slice(idx + STOCK_TAKE_NOTES_SEP.length).trim()
  };
}

function sortJobCardStockLocations(list) {
  const fn = window.manufacturingStockLocations?.sortStockLocationsForManufacturing;
  return fn ? fn(list) : (Array.isArray(list) ? [...list] : []);
}

/** Set before navigating to `/` to log in; LoginPage reads and redirects back here. */
const REDIRECT_AFTER_LOGIN_KEY = 'redirectAfterLogin';

function getJobCardAuthToken() {
  try {
    const t =
      (typeof window !== 'undefined' && window.storage?.getToken?.()) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('abcotronics_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('authToken')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('token'));
    if (!t || t === 'undefined' || t === 'null') return null;
    return t;
  } catch {
    return null;
  }
}

/** Logged-in ERP user — this name is stored on the server as job card owner / captured-by identity. */
function getJobCardRecorderDisplayName() {
  try {
    const u = typeof window !== 'undefined' && window.storage?.getUser?.();
    if (!u || typeof u !== 'object') return '';
    const name = u.name || u.displayName;
    const email = u.email;
    if (name && String(name).trim()) return String(name).trim();
    if (email && String(email).trim()) return String(email).trim();
    return '';
  } catch {
    return '';
  }
}

function goToSignInForJobCardHistory() {
  try {
    sessionStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, '/job-card');
  } catch {
    /* ignore */
  }
  window.location.assign('/');
}

let _webSyncEngine;
function getWebSyncEngineInstance() {
  if (!_webSyncEngine) {
    _webSyncEngine = createWebSyncEngine(
      getJobCardAuthToken,
      () => typeof navigator !== 'undefined' && navigator.onLine
    );
  }
  return _webSyncEngine;
}

async function syncOneLocalPendingJobCardToServer(draftCard) {
  return getWebSyncEngineInstance().syncOneLocalPendingJobCardToServer(draftCard);
}

async function flushJobCardActivityQueue(serverJobCardId, events) {
  return getWebSyncEngineInstance().flushJobCardActivityQueue(serverJobCardId, events);
}

function buildMergedWizardJobCardRows(serverList) {
  return mergeWizardJobCardRows(
    serverList,
    readLocalPendingJobCards(),
    Boolean(getJobCardAuthToken())
  );
}

function jobCardMediaIsVideoDataUrl(url) {
  return typeof url === 'string' && /^data:video\//i.test(url);
}

function jobCardMediaIsVideoUrl(url, mediaType = '', filename = '') {
  if (jobCardMediaIsVideoDataUrl(url)) return true;
  if (typeof mediaType === 'string' && /video/i.test(mediaType)) return true;
  const target = `${String(url || '')} ${String(filename || '')}`.toLowerCase();
  return /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$|\s)/i.test(target);
}

function jobCardFileLooksImageOrVideo(file) {
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|mp4|webm|mov|mkv)$/i.test(file.name || '');
}

function jobCardFileIsVideo(file) {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|mkv)$/i.test(file.name || '');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function canvasToBlobPromise(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || null), type, quality);
  });
}

function loadImageForCompression(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to decode image.'));
    };
    image.src = objectUrl;
  });
}

async function prepareJobCardImageDataUrl(file) {
  const fallbackDataUrl = await readFileAsDataUrl(file);
  if ((file.type || '').includes('gif') || /\.gif$/i.test(file.name || '')) {
    return fallbackDataUrl;
  }
  try {
    const image = await loadImageForCompression(file);
    const sourceW = image.naturalWidth || image.width || 0;
    const sourceH = image.naturalHeight || image.height || 0;
    if (!sourceW || !sourceH) return fallbackDataUrl;

    const maxSide = Math.max(sourceW, sourceH);
    const baseScale = maxSide > JOB_CARD_IMAGE_MAX_DIMENSION ? JOB_CARD_IMAGE_MAX_DIMENSION / maxSide : 1;
    const outputType = 'image/jpeg';
    const attempts = [
      { scale: baseScale, quality: 0.82 },
      { scale: Math.min(baseScale, 0.9), quality: 0.74 },
      { scale: Math.min(baseScale, 0.8), quality: 0.66 },
      { scale: Math.min(baseScale, 0.7), quality: 0.58 }
    ];

    let selectedDataUrl = fallbackDataUrl;
    let selectedBytes = dataUrlApproxBytes(fallbackDataUrl);

    for (const attempt of attempts) {
      const w = Math.max(1, Math.round(sourceW * attempt.scale));
      const h = Math.max(1, Math.round(sourceH * attempt.scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(image, 0, 0, w, h);
      const blob = await canvasToBlobPromise(canvas, outputType, attempt.quality);
      if (!blob) continue;
      const dataUrl = await readFileAsDataUrl(blob);
      const bytes = dataUrlApproxBytes(dataUrl);
      if (bytes > 0 && (selectedBytes <= 0 || bytes < selectedBytes)) {
        selectedDataUrl = dataUrl;
        selectedBytes = bytes;
      }
      if (bytes > 0 && bytes <= JOB_CARD_IMAGE_TARGET_BYTES) {
        return dataUrl;
      }
    }
    return selectedDataUrl;
  } catch {
    return fallbackDataUrl;
  }
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to decode image.'));
    image.src = dataUrl;
  });
}

async function buildJobCardImageThumbnailDataUrl(imageDataUrl) {
  if (typeof imageDataUrl !== 'string' || !/^data:image\//i.test(imageDataUrl)) return '';
  try {
    const image = await loadImageFromDataUrl(imageDataUrl);
    const sourceW = image.naturalWidth || image.width || 0;
    const sourceH = image.naturalHeight || image.height || 0;
    if (!sourceW || !sourceH) return '';
    const maxSide = Math.max(sourceW, sourceH);
    const scale = maxSide > JOB_CARD_IMAGE_THUMB_MAX_DIMENSION ? JOB_CARD_IMAGE_THUMB_MAX_DIMENSION / maxSide : 1;
    const w = Math.max(1, Math.round(sourceW * scale));
    const h = Math.max(1, Math.round(sourceH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(image, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.58);
  } catch {
    return '';
  }
}

function extractVisualPhotoEntries(photosValue) {
  const photosRaw = parseStoredJsonArray(photosValue, []);
  const visualEntries = [];
  photosRaw.forEach((p, idx) => {
    if (typeof p === 'string') {
      if (!p) return;
      visualEntries.push({
        stored: p,
        url: p,
        previewUrl: '',
        name: `Photo ${idx + 1}`
      });
      return;
    }
    if (!p || typeof p !== 'object') return;
    if (p.kind === 'voice' || p.kind === 'sectionMedia' || p.kind === 'signature') return;
    if (p.kind === 'safetyCultureMedia' && p.mediaId && p.token) {
      visualEntries.push({
        stored: p,
        url: '',
        previewUrl: '',
        name: p.filename || `Photo ${idx + 1}`,
        safetyCulture: true,
        mediaId: String(p.mediaId),
        token: String(p.token),
        mediaType: p.mediaType != null ? String(p.mediaType) : '',
        issueId: p.issueId != null ? String(p.issueId) : '',
        filename: p.filename != null ? String(p.filename) : ''
      });
      return;
    }
    const candidateUrl =
      (typeof p.url === 'string' && p.url) ||
      (typeof p.dataUrl === 'string' && p.dataUrl) ||
      (typeof p.src === 'string' && p.src) ||
      (typeof p.imageUrl === 'string' && p.imageUrl) ||
      (typeof p.uri === 'string' && p.uri) ||
      '';
    const url = candidateUrl ? String(candidateUrl) : '';
    if (!url) return;
    visualEntries.push({
      stored: p,
      url,
      previewUrl:
        (typeof p.thumbUrl === 'string' && p.thumbUrl) ||
        (typeof p.previewUrl === 'string' && p.previewUrl) ||
        '',
      name: p.name || `Photo ${idx + 1}`
    });
  });
  return visualEntries;
}

function parseProjectAssociationFromComments(rawComments) {
  if (!rawComments || typeof rawComments !== 'string') {
    return { projectId: '', projectName: '' };
  }
  const lines = rawComments.split('\n');
  const line = lines.find(
    l => typeof l === 'string' && l.startsWith(PROJECT_ASSOCIATION_PREFIX)
  );
  if (!line) return { projectId: '', projectName: '' };
  const raw = line.slice(PROJECT_ASSOCIATION_PREFIX.length).trim();
  if (!raw) return { projectId: '', projectName: '' };
  const idMatch = raw.match(/\(([^)]+)\)\s*$/);
  if (idMatch && idMatch[1]) {
    const projectId = String(idMatch[1]).trim();
    const projectName = raw.slice(0, idMatch.index).trim();
    return { projectId, projectName };
  }
  return { projectId: '', projectName: raw };
}

function parseHeadingFromComments(rawComments) {
  if (!rawComments || typeof rawComments !== 'string') return '';
  const line = rawComments
    .split('\n')
    .find(l => typeof l === 'string' && l.startsWith(HEADING_PREFIX));
  return line ? line.slice(HEADING_PREFIX.length).trim() : '';
}

function abbreviateHeading(value, maxChars = PRIOR_CARD_HEADING_MAX_CHARS) {
  const heading = String(value || '').trim();
  if (!heading) return '';
  if (heading.length <= maxChars) return heading;
  return `${heading.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

const WORK_NOTE_TEXT_FIELDS = [
  'diagnosis',
  'actionsTaken',
  'futureWorkRequired',
  'otherComments',
  'reasonForVisit',
  'heading'
];

function jobCardOpenTimestamp(card) {
  const t = card?.updatedAt || card?.createdAt;
  const ms = t ? new Date(t).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function pickRicherTextField(localVal, serverVal, localNewer) {
  const ls = String(localVal ?? '').trim();
  const ss = String(serverVal ?? '').trim();
  if (localNewer && ls) return localVal ?? '';
  if (ss && !ls) return serverVal ?? '';
  if (ls && !ss) return localVal ?? '';
  if (ls.length >= ss.length) return localVal ?? serverVal ?? '';
  return serverVal ?? localVal ?? '';
}

/** When reopening, prefer fresher / richer local draft fields over a stale server shell. */
function mergeJobCardOpenSources(localCard, serverCard) {
  if (!serverCard) return localCard || {};
  if (!localCard) return serverCard;
  const localNewer = jobCardOpenTimestamp(localCard) > jobCardOpenTimestamp(serverCard);
  const merged = { ...serverCard };
  for (const key of WORK_NOTE_TEXT_FIELDS) {
    merged[key] = pickRicherTextField(localCard[key], serverCard[key], localNewer);
  }
  const localPhotos = parseStoredJsonArray(localCard.photos, []);
  const serverPhotos = parseStoredJsonArray(serverCard.photos, []);
  if (localNewer && localPhotos.length > serverPhotos.length) {
    merged.photos = localCard.photos;
  }
  const localForms = parseStoredJsonArray(localCard.serviceForms, []);
  if (localForms.length > 0 && localNewer) {
    merged.serviceForms = localCard.serviceForms;
  }
  if (localNewer) {
    merged.updatedAt = localCard.updatedAt || merged.updatedAt;
  }
  return merged;
}

function findLocalPendingJobCardForOpen(openId, card) {
  const sid = String(openId || '').trim();
  if (!sid) return null;
  return (
    readLocalPendingJobCards().find(c => {
      if (!c) return false;
      if (String(c.id) === sid) return true;
      if (card?.serverJobCardId && String(c.id) === String(card.serverJobCardId)) return true;
      if (c.serverJobCardId && String(c.serverJobCardId) === sid) return true;
      return false;
    }) || null
  );
}

const isLikelyServerFormInstanceId = id =>
  typeof id === 'string' && /^c[a-z0-9]{24}$/i.test(id);

function buildFormDataFromJobCard(full) {
  const parsedProject = parseProjectAssociationFromComments(full.otherComments || '');
  const parsedHeading = parseHeadingFromComments(full.otherComments || '');
  return {
    heading: full.heading || parsedHeading || '',
    agentName: full.agentName || '',
    otherTechnicians: parseStoredJsonArray(full.otherTechnicians, []),
    projectId: full.projectId || parsedProject.projectId || '',
    projectName: full.projectName || parsedProject.projectName || '',
    clientId: full.clientId || '',
    clientName: full.clientName || '',
    siteId: full.siteId || '',
    siteName: full.siteName || '',
    location: full.location || '',
    latitude:
      full.latitude != null && full.latitude !== ''
        ? String(full.latitude)
        : full.locationLatitude != null && full.locationLatitude !== ''
          ? String(full.locationLatitude)
          : '',
    longitude:
      full.longitude != null && full.longitude !== ''
        ? String(full.longitude)
        : full.locationLongitude != null && full.locationLongitude !== ''
          ? String(full.locationLongitude)
          : '',
    timeOfArrival: toDatetimeLocalInput(full.timeOfArrival),
    departureFromSite: toDatetimeLocalInput(full.departureFromSite),
    vehicleUsed: full.vehicleUsed || '',
    kmReadingBefore: full.kmReadingBefore != null ? String(full.kmReadingBefore) : '',
    kmReadingAfter: full.kmReadingAfter != null ? String(full.kmReadingAfter) : '',
    reasonForVisit: full.reasonForVisit || '',
    callOutCategory: full.callOutCategory || '',
    diagnosis: full.diagnosis || '',
    futureWorkRequired: full.futureWorkRequired || '',
    futureWorkScheduledAt: toDatetimeLocalInput(full.futureWorkScheduledAt),
    actionsTaken: full.actionsTaken || '',
    otherComments: full.otherComments || '',
    stockUsed: parseStoredJsonArray(full.stockUsed, []),
    materialsBought: parseStoredJsonArray(full.materialsBought, []),
    photos: extractVisualPhotoEntries(full.photos).map(item => item.stored),
    serviceForms: parseStoredJsonArray(full.serviceForms, []),
    status: full.status || 'draft',
    customerName: full.customerName || '',
    customerTitle: full.customerTitle || full.customerPosition || '',
    customerFeedback: full.customerFeedback || '',
    customerSignDate: full.customerSignDate ? String(full.customerSignDate).slice(0, 10) : '',
    customerSignature:
      (typeof full.customerSignature === 'string' && full.customerSignature.trim()) ||
      extractSignatureUrlFromPhotosValue(full.photos) ||
      ''
  };
}

async function syncServiceFormsToServer(serverJobCardId, serviceForms) {
  const forms = Array.isArray(serviceForms) ? serviceForms : [];
  if (!serverJobCardId || forms.length === 0) return;
  const token = getJobCardAuthToken();
  if (!token) return;
  for (const form of forms) {
    if (!form?.templateId) continue;
    const answersArr = Object.entries(form.answers || {}).map(([fieldId, value]) => ({
      fieldId,
      value: String(value ?? '')
    }));
    const completed = answersArr.some(a => String(a.value || '').trim()) ? 'completed' : 'not_started';
    try {
      if (isLikelyServerFormInstanceId(form.id)) {
        await fetch(
          `/api/jobcards/${encodeURIComponent(serverJobCardId)}/forms/${encodeURIComponent(form.id)}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ answers: answersArr, status: completed })
          }
        );
      } else {
        const res = await fetch(`/api/jobcards/${encodeURIComponent(serverJobCardId)}/forms`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            templateId: form.templateId,
            answers: answersArr,
            status: completed
          })
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const inst = data?.data?.form ?? data?.form;
          if (inst?.id) form.id = inst.id;
        }
      }
    } catch (e) {
      console.warn('JobCardFormPublic: checklist sync failed', e);
    }
  }
}

function flushActiveFormField() {
  if (typeof document === 'undefined') return;
  const el = document.activeElement;
  if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT')) return;
  try {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } catch {
    /* ignore */
  }
  try {
    el.blur();
  } catch {
    /* ignore */
  }
}

/** Inline photo/video strip for Diagnosis / Actions / Future work sections on the work step. */
const WorkSectionMediaAttachments = ({ sectionKey, items, onUpload, onRemove, onPreview }) => {
  const inputId = `section-work-media-${sectionKey}`;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-600 mb-2">Photos &amp; video for this section (optional)</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          id={inputId}
          className="hidden"
          accept="image/*,video/*"
          multiple
          onChange={(e) => onUpload(sectionKey, e)}
        />
        <label
          htmlFor={inputId}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer touch-manipulation"
        >
          <i className="fas fa-camera text-gray-500" />
          <span>Add photo or video</span>
        </label>
      </div>
      {items && items.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((photo, idx) => (
            <JobCardWizardAttachmentPreview
              key={`${sectionKey}-m-${idx}`}
              url={photo.url}
              previewUrl={photo.thumbUrl || ''}
              index={idx}
              onRemove={(i) => onRemove(sectionKey, i)}
              onPreview={onPreview}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const JobCardWizardSafetyCultureAttachmentPreview = ({
  mediaId,
  token,
  mediaType,
  filename,
  issueId,
  index,
  onRemove,
  onPreview
}) => {
  const [retryTick, setRetryTick] = useState(0);
  const [err, setErr] = useState('');
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [renderFailed, setRenderFailed] = useState(false);
  const blobUrlRef = useRef(null);

  const proxyUrl = useMemo(() => {
    const params = new URLSearchParams({
      id: String(mediaId || ''),
      token: String(token || '')
    });
    if (mediaType) params.set('media_type', String(mediaType));
    if (filename) params.set('filename', String(filename));
    if (issueId) params.set('issue_id', String(issueId));
    if (retryTick > 0) params.set('retry', String(retryTick));
    return `/api/safety-culture/media/proxy?${params.toString()}`;
  }, [mediaId, token, mediaType, filename, issueId, retryTick]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    const revokeBlob = () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };

    const authTok = typeof window !== 'undefined' ? window.storage?.getToken?.() : '';
    if (!authTok || !mediaId || !token) {
      setErr('Media unavailable');
      setResolvedSrc('');
      revokeBlob();
      return () => {
        cancelled = true;
        ac.abort();
        revokeBlob();
      };
    }

    setErr('');
    setResolvedSrc('');
    setRenderFailed(false);
    revokeBlob();

    (async () => {
      try {
        const res = await fetch(proxyUrl, {
          headers: { Authorization: `Bearer ${authTok}` },
          signal: ac.signal
        });
        if (!res.ok) {
          if (!cancelled && retryTick < 2) {
            setRetryTick((n) => n + 1);
            return;
          }
          if (!cancelled) setErr('Could not load media');
          return;
        }
        const blob = await res.blob();
        if (cancelled || ac.signal.aborted) return;
        const u = URL.createObjectURL(blob);
        blobUrlRef.current = u;
        setResolvedSrc(u);
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        if (!cancelled && retryTick < 2) {
          setRetryTick((n) => n + 1);
          return;
        }
        if (!cancelled) setErr('Could not load media');
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      revokeBlob();
      setResolvedSrc('');
    };
  }, [proxyUrl, mediaId, token, retryTick]);

  const isVideo = jobCardMediaIsVideoUrl('', mediaType, filename);

  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-white">
      {err ? (
        <div className="min-h-[88px] w-full flex items-center justify-center text-[11px] text-red-500 px-2 text-center bg-red-50">
          {err}
        </div>
      ) : renderFailed ? (
        <div className="min-h-[88px] w-full flex items-center justify-center text-xs text-gray-500 bg-slate-50">
          <span className="inline-flex items-center gap-2">
            <i className="fas fa-image" />
            Preview unavailable
          </span>
        </div>
      ) : !resolvedSrc ? (
        <div className="min-h-[88px] w-full flex items-center justify-center text-xs text-gray-500 bg-slate-50">
          <i className="fas fa-spinner fa-spin mr-2" />
          Loading...
        </div>
      ) : isVideo ? (
        <video
          src={resolvedSrc}
          className="w-full max-h-44 object-contain bg-black"
          controls
          playsInline
          preload="metadata"
          onError={() => setRenderFailed(true)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            if (typeof onPreview === 'function') onPreview(resolvedSrc);
          }}
          className="h-full w-full cursor-zoom-in"
          title="Open full photo"
        >
          <img
            src={resolvedSrc}
            alt={`Attachment ${index + 1}`}
            loading="lazy"
            decoding="async"
            className="block w-full h-auto max-h-44 object-cover bg-white"
            onError={() => setRenderFailed(true)}
          />
        </button>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove(index);
        }}
        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition touch-manipulation z-10"
        title="Remove"
      >
        <i className="fas fa-times text-xs"></i>
      </button>
    </div>
  );
};

const JobCardWizardAttachmentPreview = ({
  url,
  previewUrl,
  index,
  onRemove,
  onPreview,
  safetyCulture,
  mediaId,
  token,
  mediaType,
  issueId,
  filename
}) => {
  const [renderFailed, setRenderFailed] = useState(false);
  if (safetyCulture && mediaId && token) {
    return (
      <JobCardWizardSafetyCultureAttachmentPreview
        mediaId={mediaId}
        token={token}
        mediaType={mediaType}
        filename={filename}
        issueId={issueId}
        index={index}
        onRemove={onRemove}
        onPreview={onPreview}
      />
    );
  }
  const isVideo = jobCardMediaIsVideoUrl(url, mediaType, filename);
  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-white">
      {renderFailed ? (
        <div className="min-h-[88px] w-full flex items-center justify-center text-xs text-gray-500 bg-slate-50">
          <span className="inline-flex items-center gap-2">
            <i className="fas fa-image" />
            Preview unavailable
          </span>
        </div>
      ) : isVideo ? (
        <video
          src={url}
          className="w-full max-h-44 object-contain bg-black"
          controls
          playsInline
          preload="metadata"
          onError={() => setRenderFailed(true)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            if (typeof onPreview === 'function') onPreview(url);
          }}
          className="h-full w-full cursor-zoom-in"
          title="Open full photo"
        >
          <img
            src={previewUrl || url}
            alt={`Attachment ${index + 1}`}
            loading="lazy"
            decoding="async"
            className="block w-full h-auto max-h-44 object-cover bg-white"
            onError={() => setRenderFailed(true)}
          />
        </button>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove(index);
        }}
        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition touch-manipulation z-10"
        title="Remove"
      >
        <i className="fas fa-times text-xs"></i>
      </button>
    </div>
  );
};

/** Full-width title above step body so steps 4–5 match wizard labels (Stock & Costs, Customer Sign-off). */
const WizardStepPageHeader = ({ stepIndex, stepId }) => {
  const meta = STEP_META[stepId] || {};
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/40 px-4 py-4 sm:px-6 sm:py-5 ring-1 ring-slate-100">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 mb-1">
        Step {stepIndex + 1}
      </p>
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{meta.title || stepId}</h2>
      {meta.subtitle ? (
        <p className="text-sm text-gray-600 mt-1">{meta.subtitle}</p>
      ) : null}
    </div>
  );
};

const StepBadge = ({
  index,
  stepId,
  active,
  complete,
  onClick,
  className = '',
  /** 'carousel' = single horizontal swipe row in mobile header (below xl) */
  variant = 'default'
}) => {
  const meta = STEP_META[stepId] || {};
  const baseClasses =
    variant === 'carousel'
      ? 'group flex flex-row items-center justify-start gap-2 rounded-lg px-2.5 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/70 focus-visible:ring-offset-blue-700 snap-start shrink-0 touch-manipulation [scroll-snap-stop:always] max-w-[12.5rem]'
      : 'group flex items-center lg:flex-col lg:items-start lg:justify-start sm:flex-col sm:items-center justify-between sm:justify-center gap-3 sm:gap-2 lg:gap-3 rounded-xl px-3 py-3 sm:px-4 sm:py-4 lg:px-3 lg:py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/70 focus-visible:ring-offset-blue-700 min-w-[160px] sm:min-w-0 lg:min-w-0 snap-start w-full lg:w-full';
  const stateClass =
    active && variant === 'carousel'
      ? 'bg-blue-50 border-2 border-blue-600 text-slate-900 shadow-md shadow-blue-900/10'
      : active
        ? 'bg-white/95 text-blue-800 shadow-lg shadow-blue-600/25'
        : complete
          ? 'bg-white/35 text-white ring-1 ring-white/25'
          : 'bg-white/15 text-blue-50 hover:bg-white/25';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${stateClass} job-card-wizard-step ${variant === 'carousel' ? 'job-card-step-chip' : ''} ${className}`}
      aria-current={active ? 'step' : undefined}
    >
      <div
        className={[
          variant === 'carousel'
            ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition'
            : 'flex h-11 w-11 items-center justify-center rounded-full border-2 transition',
          active && variant === 'carousel'
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
            : active
              ? 'bg-white text-blue-600 border-white shadow'
              : complete
                ? 'bg-white/90 text-blue-600 border-transparent'
                : 'bg-white/20 text-white border-white/30 group-hover:border-white/50'
        ].join(' ')}
      >
        <i
          className={`fa-solid ${meta.icon || 'fa-circle-dot'} ${variant === 'carousel' ? 'text-sm' : 'text-base'}`}
        ></i>
      </div>
      <div
        className={
          variant === 'carousel'
            ? 'flex min-w-0 flex-1 flex-col gap-0.5 text-left'
            : 'flex min-w-0 flex-1 flex-col gap-0.5 text-left sm:items-center sm:text-center lg:items-start lg:text-left'
        }
      >
        <span
          className={`${variant === 'carousel' ? 'text-xs' : 'text-[11px]'} uppercase tracking-wide font-semibold ${
            active && variant === 'carousel'
              ? 'text-blue-800'
              : active
                ? '!text-blue-700'
                : 'text-blue-50'
          } ${variant === 'carousel' ? '' : 'sm:text-center lg:text-left'}`}
        >
          Step {index + 1}
        </span>
        <span
          className={`${variant === 'carousel' ? 'text-sm' : 'text-sm'} font-semibold leading-tight ${
            active && variant === 'carousel'
              ? 'text-slate-900'
              : active
                ? '!text-blue-950'
                : 'text-white'
          } ${variant === 'carousel' ? '' : 'sm:text-center lg:text-left'}`}
        >
          {meta.title || stepId}
        </span>
        {meta.subtitle && variant !== 'carousel' && (
          <span
            className={`text-[11px] sm:text-xs ${active ? '!text-blue-700/90' : 'text-blue-100/90'} ${variant === 'carousel' ? '' : 'sm:text-center lg:text-left'}`}
          >
            {meta.subtitle}
          </span>
        )}
      </div>
    </button>
  );
};

const SummaryRow = ({ label, value }) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-900 text-right font-medium">{value || '—'}</span>
  </div>
);

/** Combobox-style select: type to filter, click to choose (technicians, clients, stock, etc.) */
const SearchableSelect = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Search or select…',
  disabled = false,
  required = false,
  className = '',
  name,
  'aria-label': ariaLabel
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [menuFixedStyle, setMenuFixedStyle] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const listId = id ? `${id}-listbox` : undefined;

  const positionMenu = useCallback(() => {
    if (!open || !inputRef.current || typeof window === 'undefined') return;
    const r = inputRef.current.getBoundingClientRect();
    const gap = 4;
    const maxH = 224;
    const spaceBelow = window.innerHeight - r.bottom - gap - 16;
    const mh = Math.min(maxH, Math.max(96, spaceBelow));
    setMenuFixedStyle({
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxHeight: mh
    });
  }, [open]);

  /** Real choices only — never show "Select…" style rows in the dropdown */
  const listOptions = useMemo(
    () =>
      (options || []).filter(
        o => o && o.value !== '' && o.value != null && String(o.value).length > 0
      ),
    [options]
  );

  const selected = useMemo(
    () => listOptions.find(o => String(o.value) === String(value)),
    [listOptions, value]
  );

  useEffect(() => {
    if (!open) {
      setFilter(selected ? selected.label : '');
    }
  }, [value, selected, open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return listOptions;
    return listOptions.filter(
      o =>
        String(o.label).toLowerCase().includes(q) ||
        String(o.value).toLowerCase().includes(q)
    );
  }, [listOptions, filter]);

  useEffect(() => {
    const onDoc = e => {
      const t = e.target;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuFixedStyle(null);
      return;
    }
    positionMenu();
    const onWin = () => positionMenu();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, positionMenu, filtered.length, listOptions.length]);

  const canPortal =
    typeof document !== 'undefined' &&
    window.ReactDOM &&
    typeof window.ReactDOM.createPortal === 'function';

  const renderDropdown = () => {
    if (!open || disabled) return null;

    const menuShellClass =
      'job-card-public-select-menu rounded-lg border border-gray-200 bg-white shadow-lg';

    if (listOptions.length === 0) {
      return (
        <div
          ref={menuRef}
          className={`${menuShellClass} fixed z-[10050] px-3 py-2 text-sm text-gray-500 job-card-public-select-menu-empty`}
          style={menuFixedStyle || undefined}
        >
          No options available
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div
          ref={menuRef}
          className={`${menuShellClass} fixed z-[10050] px-3 py-2 text-sm text-gray-500 job-card-public-select-menu-empty`}
          style={menuFixedStyle || undefined}
        >
          No matches
        </div>
      );
    }

    return (
      <div
        ref={menuRef}
        className={`${menuShellClass} fixed z-[10050] overflow-y-auto py-1`}
        style={menuFixedStyle || undefined}
      >
        <ul id={listId} role="listbox" className="py-0">
          {filtered.map(opt => {
            const isOptSelected = String(opt.value) === String(value);
            return (
            <li
              key={String(opt.value) + String(opt.label)}
              role="option"
              aria-selected={isOptSelected}
              className={`cursor-pointer px-3 py-3 text-base touch-manipulation border-l-2 ${
                isOptSelected
                  ? 'bg-blue-100 text-blue-900 font-medium border-blue-600'
                  : 'border-transparent text-gray-900 hover:bg-blue-50 active:bg-blue-100'
              }`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onChange(opt.value);
                setFilter(opt.label);
                setOpen(false);
              }}
            >
              {opt.label}
            </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const dropdownNode = renderDropdown();
  const portaledDropdown =
    canPortal && dropdownNode ? window.ReactDOM.createPortal(dropdownNode, document.body) : null;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          name={name}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-required={required}
          aria-label={ariaLabel}
          disabled={disabled}
          autoComplete="off"
          value={open ? filter : (selected ? selected.label : '')}
          onChange={e => {
            setFilter(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange('');
          }}
          onFocus={() => {
            setOpen(true);
            // When opening from a closed list, clear the query so all options show (previously
            // we prefilled the filter with the selected label, which hid every other row).
            if (!open) {
              setFilter('');
            }
          }}
          placeholder={placeholder}
          className={[
            'w-full pl-4 pr-11 py-3 text-base rounded-lg bg-white disabled:bg-gray-100 disabled:cursor-not-allowed touch-manipulation transition-shadow',
            open && !disabled
              ? 'border-2 border-blue-600 ring-2 ring-blue-200 shadow-sm'
              : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
          ].join(' ')}
          style={{ fontSize: '16px' }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Close list' : 'Open list'}
          className={`absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-md touch-manipulation ${
            open && !disabled ? 'text-blue-700 bg-blue-50' : 'text-gray-500 hover:bg-gray-100 active:bg-gray-200'
          }`}
          onMouseDown={e => {
            e.preventDefault();
          }}
          onClick={() => {
            if (disabled) return;
            if (open) {
              setOpen(false);
            } else {
              setFilter('');
              setOpen(true);
              inputRef.current?.focus();
            }
          }}
        >
          <i className={`fas fa-chevron-down text-sm transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {canPortal ? (
        portaledDropdown
      ) : (
        <>
          {open && !disabled && listOptions.length > 0 && filtered.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              ref={menuRef}
              className="job-card-public-select-menu absolute z-[60] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            >
              {filtered.map(opt => {
                const isOptSelected = String(opt.value) === String(value);
                return (
                <li
                  key={String(opt.value) + String(opt.label)}
                  role="option"
                  aria-selected={isOptSelected}
                  className={`cursor-pointer px-3 py-3 text-base touch-manipulation border-l-2 ${
                    isOptSelected
                      ? 'bg-blue-100 text-blue-900 font-medium border-blue-600'
                      : 'border-transparent text-gray-900 hover:bg-blue-50 active:bg-blue-100'
                  }`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    onChange(opt.value);
                    setFilter(opt.label);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </li>
                );
              })}
            </ul>
          )}
          {open && !disabled && listOptions.length === 0 && (
            <div
              ref={menuRef}
              className="job-card-public-select-menu job-card-public-select-menu-empty absolute z-[60] mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg"
            >
              No options available
            </div>
          )}
          {open && !disabled && listOptions.length > 0 && filtered.length === 0 && (
            <div
              ref={menuRef}
              className="job-card-public-select-menu job-card-public-select-menu-empty absolute z-[60] mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg"
            >
              No matches
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Voice-note field (shared with classic JobCardModal) — core-entry loads JobCardVoiceNoteTextarea.jsx before this file */
const VoiceNoteTextarea =
  typeof window !== 'undefined' && window.JobCardVoiceNoteTextarea
    ? window.JobCardVoiceNoteTextarea
    : function VoiceNoteTextareaFallback(props) {
        const { name, value, onChange, rows = 3, placeholder = '', className = '' } = props;
        return (
          <textarea
            name={name}
            value={value}
            onChange={onChange}
            rows={rows}
            placeholder={placeholder}
            className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg ${className}`}
          />
        );
      };

const JobCardFormPublic = () => {
  const [formData, setFormData] = useState({
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
    // Service form instances attached to this job card
    // [{ id, templateId, templateName, answers: { fieldId: value } }]
    serviceForms: [],
    status: 'draft',
    customerName: '',
    customerTitle: '',
    customerFeedback: '',
    customerSignDate: '',
    customerSignature: ''
  });

  const [technicianInput, setTechnicianInput] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [photoLightboxUrl, setPhotoLightboxUrl] = useState('');
  /** Per-section photos/videos on work step (Diagnosis, Actions, Future work). */
  const [sectionWorkMedia, setSectionWorkMedia] = useState(() => emptySectionWorkMedia());
  const [availableSites, setAvailableSites] = useState([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [inventory, setInventory] = useState([]);
  const [stockLocations, setStockLocations] = useState([]);
  /** Draft stock lines in the wizard (one row per location being picked from). */
  const [stockEntryRows, setStockEntryRows] = useState(() => [createStockEntryRow()]);
  /** Cached on-hand rows per stock location (SKU dropdowns). */
  const [inventoryByLocation, setInventoryByLocation] = useState({});
  const loadingInventoryByLocationRef = useRef({});
  const [newMaterialItem, setNewMaterialItem] = useState({ itemName: '', description: '', reason: '', cost: 0 });
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const wizardScrollRef = useRef(null);
  /** False while opening a card with `attachmentsPending` until /photos has loaded (avoid PATCH wiping attachments). */
  const photosHydrationCompleteRef = useRef(true);
  /** User added/removed section photos, voice, or gallery after open — skip clobbering from deferred photo fetch. */
  const editMediaDirtyRef = useRef(false);
  const [stepError, setStepError] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureLocked, setSignatureLocked] = useState(false);
  const [shareStatus, setShareStatus] = useState('Copy share link');
  const [calendarStatus, setCalendarStatus] = useState('Copy calendar link');
  /** Voice clips recorded from text fields: saved with the job card and keyed by section */
  const [voiceAttachments, setVoiceAttachments] = useState([]);
  // Service form templates and selection state
  const [formTemplates, setFormTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  /** New-job-only: blocking arrival confirmation before the wizard is usable */
  const [arrivalConfirmOpen, setArrivalConfirmOpen] = useState(false);
  const [arrivalConfirmPickMode, setArrivalConfirmPickMode] = useState(false);
  const [arrivalConfirmDraft, setArrivalConfirmDraft] = useState('');
  const [departureConfirmOpen, setDepartureConfirmOpen] = useState(false);
  const [departureConfirmPickMode, setDepartureConfirmPickMode] = useState(false);
  const [departureConfirmDraft, setDepartureConfirmDraft] = useState('');
  /** landing → pick create vs edit; prior_list → choose a saved card; form → wizard */
  const [wizardFlow, setWizardFlow] = useState('landing');
  const [stockTakeLocationId, setStockTakeLocationId] = useState('');
  const [stockTakeRows, setStockTakeRows] = useState([]);
  const [stockTakeCounts, setStockTakeCounts] = useState({});
  const [stockTakeNewItems, setStockTakeNewItems] = useState([]);
  const [stockTakeShowNewItemForm, setStockTakeShowNewItemForm] = useState(false);
  const [stockTakeDraftNewItem, setStockTakeDraftNewItem] = useState({
    itemName: '',
    sku: '',
    unit: 'pcs',
    category: 'components',
    type: 'raw_material',
    unitCost: '',
    reorderPoint: '',
    supplier: '',
    supplierPartNumber: '',
    manufacturingPartNumber: '',
    boxNumber: '',
    countedQty: '',
    notes: ''
  });
  const [stockTakeDescription, setStockTakeDescription] = useState(() => defaultStockTakeDescription());
  const [stockTakeNotes, setStockTakeNotes] = useState('');
  const [stockTakeStartedAt, setStockTakeStartedAt] = useState('');
  const [stockTakeSubmitting, setStockTakeSubmitting] = useState(false);
  const [stockTakeSaving, setStockTakeSaving] = useState(false);
  const [stockTakeStatus, setStockTakeStatus] = useState('');
  const [stockTakeError, setStockTakeError] = useState('');
  const [stockTakeDraftNotice, setStockTakeDraftNotice] = useState('');
  const [stockTakeSavedSessions, setStockTakeSavedSessions] = useState([]);
  const [stockTakeSavedLoading, setStockTakeSavedLoading] = useState(false);
  const [stockTakeDeletingId, setStockTakeDeletingId] = useState('');
  const [stockTakeSubmitConfirmOpen, setStockTakeSubmitConfirmOpen] = useState(false);
  const [stockTakeScanOpen, setStockTakeScanOpen] = useState(false);
  const [stockTakeHighlightSku, setStockTakeHighlightSku] = useState('');
  const [stockTakeExtraThumbnails, setStockTakeExtraThumbnails] = useState({});
  const stockTakeThumbFetchRef = useRef(new Set());
  const [stockTakeLineSearch, setStockTakeLineSearch] = useState('');
  const [stockTakeAvailabilityFilter, setStockTakeAvailabilityFilter] = useState('all');
  const stockTakeLineSearchRef = useRef('');
  const [stockTakePage, setStockTakePage] = useState(1);
  /** Collaborative stock-take session (same API as Manufacturing web) */
  const [stockTakeSessionId, setStockTakeSessionId] = useState('');
  const [stockTakeSessionRevision, setStockTakeSessionRevision] = useState(0);
  const [stockTakeJoinInput, setStockTakeJoinInput] = useState('');
  const stockTakePollRef = useRef(null);
  const stockTakePatchTimerRef = useRef(null);
  const stockTakeDirtySkusRef = useRef(new Set());
  const stockTakeLocalEditSkusRef = useRef(new Set());
  const stockTakeCountsRef = useRef({});
  const stockTakeNotesRef = useRef('');
  const stockTakeDescriptionRef = useRef('');
  const stockTakeCombinedNotesRef = useRef('');
  const stockTakeRowsRef = useRef([]);
  const stockTakeNewItemsRef = useRef([]);
  const stockTakeSessionRevisionRef = useRef(0);
  const stockTakeScanVideoRef = useRef(null);
  const stockTakeScanCanvasRef = useRef(null);
  const stockTakeScanStreamRef = useRef(null);
  const stockTakeScanRafRef = useRef(null);
  const stockTakeScanActiveRef = useRef(false);
  const stockTakeScanLastRef = useRef({ text: '', t: 0 });
  /** Prior list: server + public API; merged with readLocalPendingJobCards() for display */
  const [serverPriorList, setServerPriorList] = useState([]);
  const [serverPriorLoading, setServerPriorLoading] = useState(false);
  /** Full-screen overlay while fetching job card detail for edit (large payloads). */
  const [openingJobCard, setOpeningJobCard] = useState(false);
  const [syncingPriorCardId, setSyncingPriorCardId] = useState('');
  /** Prior list: server search + client filter (authenticated) */
  const [priorSearchInput, setPriorSearchInput] = useState('');
  const [priorSearchDebounced, setPriorSearchDebounced] = useState('');
  const [priorClientId, setPriorClientId] = useState('');
  const [priorSiteName, setPriorSiteName] = useState('');
  const [priorTechnician, setPriorTechnician] = useState('');
  /** Bump when returning from login (another tab) or visibility — refetch job card list */
  const [priorListRefreshTick, setPriorListRefreshTick] = useState(0);
  /** Bump after local pending queue changes so landing / prior list re-read storage */
  const [localDraftsTick, setLocalDraftsTick] = useState(0);
  const [pendingAutoSync, setPendingAutoSync] = useState({ running: false, synced: 0, failed: 0 });
  const pendingAutoSyncInFlightRef = useRef(false);
  const saveInProgressRef = useRef(false);
  /** Activity trail when editing a card opened from prior list (server GET). */
  const [priorLoadedActivities, setPriorLoadedActivities] = useState([]);
  const [priorActivityLoading, setPriorActivityLoading] = useState(false);
  const [priorActivityOpen, setPriorActivityOpen] = useState(true);
  const [showAllSelectedPhotos, setShowAllSelectedPhotos] = useState(false);
  /** For offline warning when there is no cached auth */
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  /** When editing, keep stable id / createdAt / sync flags for save */
  const [editingMeta, setEditingMeta] = useState(null);
  const lastSignatureRestoreRef = useRef(null);
  /** New wizard events since this session opened (merged into activityQueue on save). */
  const sessionActivityQueueRef = useRef([]);
  const activeEditCardIdRef = useRef(null);
  const persistWizardDraftRef = useRef(null);
  const handleSaveRef = useRef(null);
  /** Resume submit after arrival/departure confirmation modal */
  const pendingSubmitOptionsRef = useRef(null);

  const stockTakeFilteredRows = useMemo(() => {
    const q = stockTakeLineSearch.trim().toLowerCase();
    const rows = stockTakeRows || [];
    return rows.filter((row) => {
      if (!stockTakeRowMatchesAvailability(row, stockTakeAvailabilityFilter)) return false;
      if (!q) return true;
      const sku = String(row?.sku || '').trim().toLowerCase();
      const name = String(row?.name || '').trim().toLowerCase();
      return sku.includes(q) || name.includes(q);
    });
  }, [stockTakeRows, stockTakeLineSearch, stockTakeAvailabilityFilter]);

  const stockTakeAvailabilityFilterLabel = useMemo(() => {
    const hit = STOCK_TAKE_AVAILABILITY_OPTIONS.find((o) => o.value === stockTakeAvailabilityFilter);
    return hit?.label || 'All';
  }, [stockTakeAvailabilityFilter]);

  const stockTakeLineCount = stockTakeFilteredRows.length;
  const stockTakeAllLineCount = stockTakeRows?.length ?? 0;
  const stockTakeTotalPages = Math.max(1, Math.ceil(stockTakeLineCount / STOCK_TAKE_PAGE_SIZE));
  const stockTakePagedRows = useMemo(() => {
    const start = (stockTakePage - 1) * STOCK_TAKE_PAGE_SIZE;
    return (stockTakeFilteredRows || []).slice(start, start + STOCK_TAKE_PAGE_SIZE);
  }, [stockTakeFilteredRows, stockTakePage]);

  const inventoryThumbBySku = useMemo(() => {
    const map = {};
    for (const item of inventory || []) {
      const sku = String(item?.sku || '').trim();
      if (!sku) continue;
      const thumb = String(item?.thumbnail || '').trim();
      if (isUsableInventoryThumbnail(thumb)) map[sku] = thumb;
    }
    return map;
  }, [inventory]);

  const resolveStockTakeThumbnail = useCallback(
    (row) => {
      const sku = String(row?.sku || '').trim();
      const direct = String(row?.thumbnail || '').trim();
      if (isUsableInventoryThumbnail(direct)) return direct;
      if (sku && stockTakeExtraThumbnails[sku]) return stockTakeExtraThumbnails[sku];
      if (sku && inventoryThumbBySku[sku]) return inventoryThumbBySku[sku];
      return '';
    },
    [stockTakeExtraThumbnails, inventoryThumbBySku]
  );

  useEffect(() => {
    if (wizardFlow !== 'stock_take' || !isOnline) return;
    const needSkus = [];
    for (const row of stockTakePagedRows || []) {
      const sku = String(row?.sku || '').trim();
      if (!sku) continue;
      if (isUsableInventoryThumbnail(resolveStockTakeThumbnail(row))) continue;
      if (row?.hasThumbnail === false) continue;
      if (stockTakeThumbFetchRef.current.has(sku)) continue;
      needSkus.push(sku);
    }
    if (!needSkus.length) return;
    let cancelled = false;
    needSkus.forEach((sku) => stockTakeThumbFetchRef.current.add(sku));
    const run = async () => {
      try {
        const res = await fetch(
          `/api/public/inventory?thumbnails=${encodeURIComponent(needSkus.join(','))}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const thumbs = data?.data?.thumbnails || data?.thumbnails || {};
        if (!thumbs || typeof thumbs !== 'object') return;
        setStockTakeExtraThumbnails((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [sku, url] of Object.entries(thumbs)) {
            const key = String(sku || '').trim();
            const val = String(url || '').trim();
            if (!key || !isUsableInventoryThumbnail(val) || next[key] === val) continue;
            next[key] = val;
            changed = true;
          }
          return changed ? next : prev;
        });
      } catch (e) {
        console.warn('⚠️ JobCardFormPublic: stock take thumbnail fetch failed:', e?.message || e);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [wizardFlow, isOnline, stockTakePagedRows, resolveStockTakeThumbnail]);

  useEffect(() => {
    setStockTakePage((p) => {
      const total = Math.max(1, Math.ceil((stockTakeFilteredRows?.length || 0) / STOCK_TAKE_PAGE_SIZE));
      if (p > total) return total;
      if (p < 1) return 1;
      return p;
    });
  }, [stockTakeFilteredRows?.length]);

  useEffect(() => {
    setStockTakePage(1);
  }, [stockTakeLineSearch, stockTakeAvailabilityFilter]);

  useEffect(() => {
    setStockTakeAvailabilityFilter('all');
  }, [stockTakeLocationId]);

  useEffect(() => {
    stockTakeLineSearchRef.current = stockTakeLineSearch;
  }, [stockTakeLineSearch]);

  useEffect(() => {
    stockTakeCountsRef.current = stockTakeCounts;
  }, [stockTakeCounts]);
  useEffect(() => {
    stockTakeNotesRef.current = stockTakeNotes;
  }, [stockTakeNotes]);
  useEffect(() => {
    stockTakeDescriptionRef.current = stockTakeDescription;
  }, [stockTakeDescription]);
  useEffect(() => {
    stockTakeCombinedNotesRef.current = combineStockTakeNotes(stockTakeDescription, stockTakeNotes);
  }, [stockTakeDescription, stockTakeNotes]);
  useEffect(() => {
    stockTakeRowsRef.current = stockTakeRows;
  }, [stockTakeRows]);
  useEffect(() => {
    stockTakeNewItemsRef.current = stockTakeNewItems;
  }, [stockTakeNewItems]);
  useEffect(() => {
    stockTakeSessionRevisionRef.current = stockTakeSessionRevision;
  }, [stockTakeSessionRevision]);

  const pushWizardActivity = useCallback((action, metadata) => {
    const ev = {
      action,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      source: 'mobile'
    };
    sessionActivityQueueRef.current.push(ev);
  }, []);

  const applyPhotosToEditState = useCallback((targetLocalId, photosValue) => {
    if (!targetLocalId || String(activeEditCardIdRef.current || '') !== String(targetLocalId)) {
      return;
    }
    const photosRaw = parseStoredJsonArray(photosValue, []);
    const voiceEntries = photosRaw.filter(
      p => p && typeof p === 'object' && p.kind === 'voice'
    );
    const sectionMediaEntries = photosRaw.filter(
      p => p && typeof p === 'object' && p.kind === 'sectionMedia'
    );
    const visualEntries = extractVisualPhotoEntries(photosRaw);

    if (!editMediaDirtyRef.current) {
      const restoredSectionMedia = emptySectionWorkMedia();
      sectionMediaEntries.forEach(item => {
        const sec = item.section;
        if (restoredSectionMedia[sec] != null) {
          const mediaUrl =
            (typeof item.url === 'string' && item.url) ||
            (typeof item.dataUrl === 'string' && item.dataUrl) ||
            (typeof item.src === 'string' && item.src) ||
            '';
          if (!mediaUrl) return;
          restoredSectionMedia[sec].push({
            name: item.name || `Attachment ${restoredSectionMedia[sec].length + 1}`,
            url: mediaUrl,
            thumbUrl:
              (typeof item.thumbUrl === 'string' && item.thumbUrl) ||
              (typeof item.previewUrl === 'string' && item.previewUrl) ||
              ''
          });
        }
      });
      setSectionWorkMedia(restoredSectionMedia);
      setVoiceAttachments(
        voiceEntries.map((v, i) => ({
          id: `vn_restore_${i}_${Date.now()}`,
          section: v.section || 'otherComments',
          dataUrl: v.url || v.dataUrl || '',
          mimeType: v.mimeType || 'audio/webm',
          noteNumber: i + 1
        }))
      );
      setSelectedPhotos(
        visualEntries.map((item, i) => ({
          name: item.name || `Photo ${i + 1}`,
          url: item.url,
          previewUrl: item.previewUrl || '',
          entry: item.stored,
          safetyCulture: item.safetyCulture === true,
          mediaId: item.mediaId || '',
          token: item.token || '',
          mediaType: item.mediaType || '',
          issueId: item.issueId || '',
          filename: item.filename || ''
        }))
      );
      setFormData(prev => {
        if (String(activeEditCardIdRef.current || '') !== String(targetLocalId)) return prev;
        return { ...prev, photos: visualEntries.map(item => item.stored) };
      });
    }
  }, []);

  const signatureCanvasRef = useRef(null);
  const signatureWrapperRef = useRef(null);
  const isDrawingRef = useRef(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapDraft, setMapDraft] = useState({ location: '', latitude: '', longitude: '' });
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapLocating, setMapLocating] = useState(false);
  const [mapSearching, setMapSearching] = useState(false);
  const [mapHint, setMapHint] = useState('');
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapMarkerRef = useRef(null);
  const mapInitRef = useRef({ lat: -25.7479, lng: 28.2293, hasMarker: false });

  useEffect(() => {
    const body = typeof document !== 'undefined' ? document.body : null;
    const html = typeof document !== 'undefined' ? document.documentElement : null;

    if (body) {
      body.classList.add('job-card-public');
    }
    if (html) {
      html.classList.add('job-card-public');
    }

    return () => {
      if (body) {
        body.classList.remove('job-card-public');
      }
      if (html) {
        html.classList.remove('job-card-public');
      }
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPriorSearchDebounced(priorSearchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [priorSearchInput]);

  useEffect(() => {
    const up = () => setNetworkOnline(true);
    const down = () => setNetworkOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    const bump = () => setPriorListRefreshTick(x => x + 1);
    const onStorage = e => {
      if (e.key === 'abcotronics_token') bump();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const availableTechnicians = useMemo(
    () => users.filter(u => u.status !== 'inactive' && u.status !== 'suspended'),
    [users]
  );

  const priorClientSelectOptions = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    return [...list]
      .filter(c => c && c.id)
      .sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      );
  }, [clients]);

  const priorFilterRowsSource = useMemo(
    () => (wizardFlow === 'prior_list' ? buildMergedWizardJobCardRows(serverPriorList) : []),
    [wizardFlow, serverPriorList, localDraftsTick]
  );

  const priorSiteSelectOptions = useMemo(() => {
    if (!priorClientId) return [];
    const seen = new Set();
    const out = [];
    priorFilterRowsSource.forEach((jc) => {
      if (String(jc?.clientId || '') !== String(priorClientId)) return;
      const site = String(jc?.siteName || '').trim();
      if (!site) return;
      const key = site.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(site);
    });
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [priorFilterRowsSource, priorClientId]);

  const priorTechnicianSelectOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    priorFilterRowsSource.forEach((jc) => {
      if (priorClientId && String(jc?.clientId || '') !== String(priorClientId)) return;
      if (priorSiteName && String(jc?.siteName || '').trim() !== priorSiteName) return;
      const primaryTech = String(jc?.agentName || '').trim();
      if (primaryTech) {
        const key = primaryTech.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(primaryTech);
        }
      }
      const team = Array.isArray(jc?.otherTechnicians) ? jc.otherTechnicians : [];
      team.forEach((name) => {
        const tech = String(name || '').trim();
        if (!tech) return;
        const key = tech.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(tech);
      });
    });
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [priorFilterRowsSource, priorClientId, priorSiteName]);

  useEffect(() => {
    setPriorSiteName('');
  }, [priorClientId]);

  useEffect(() => {
    if (!priorSiteName) return;
    if (!priorSiteSelectOptions.includes(priorSiteName)) {
      setPriorSiteName('');
    }
  }, [priorSiteName, priorSiteSelectOptions]);

  useEffect(() => {
    if (!priorTechnician) return;
    if (!priorTechnicianSelectOptions.includes(priorTechnician)) {
      setPriorTechnician('');
    }
  }, [priorTechnician, priorTechnicianSelectOptions]);

  const addVoiceClip = useCallback(
    clip => {
      pushWizardActivity('wizard_media_added', {
        kind: 'voice',
        section: clip?.section || 'unknown'
      });
      editMediaDirtyRef.current = true;
      setVoiceAttachments(prev => [
        ...prev,
        {
          ...clip,
          id: `vn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        }
      ]);
    },
    [pushWizardActivity]
  );

  const updateVoiceClip = useCallback((clipId, patch) => {
    if (!clipId || !patch || typeof patch !== 'object') return;
    setVoiceAttachments(prev =>
      prev.map(v => (v.id === clipId ? { ...v, ...patch } : v))
    );
  }, []);

  const leadTechnicianOptions = useMemo(
    () =>
      availableTechnicians.map(tech => ({
        value: tech.name || tech.email,
        label: `${tech.name || tech.email}${tech.department ? ` (${tech.department})` : ''}`
      })),
    [availableTechnicians]
  );

  const teamTechnicianOptions = useMemo(
    () =>
      availableTechnicians
        .filter(tech => !formData.otherTechnicians.includes(tech.name || tech.email))
        .map(tech => ({
          value: tech.name || tech.email,
          label: tech.name || tech.email
        })),
    [availableTechnicians, formData.otherTechnicians]
  );

  const clientSelectOptions = useMemo(
    () => [
      ...clients.map(c => ({ value: c.id, label: c.name || c.companyName || c.id })),
      { value: NO_CLIENT_ID, label: 'No Client (enter details manually)' }
    ],
    [clients]
  );

  const siteSelectOptions = useMemo(() => {
    if (!formData.clientId || availableSites.length === 0) {
      return [];
    }
    return availableSites.map(site => ({
      value: site.id || site.name || site,
      label: String(site.name || site)
    }));
  }, [formData.clientId, availableSites]);

  const projectSelectOptions = useMemo(() => {
    const selectedClient = (clients || []).find(
      c => String(c.id) === String(formData.clientId)
    );
    const selectedClientName = (
      selectedClient?.name ||
      selectedClient?.companyName ||
      ''
    )
      .toString()
      .trim()
      .toLowerCase();
    const hasClientFilter =
      Boolean(formData.clientId) && formData.clientId !== NO_CLIENT_ID;

    const filteredProjects = (projects || []).filter(project => {
      if (!hasClientFilter) return true;

      const projectClientId = project?.clientId != null ? String(project.clientId) : '';
      if (projectClientId && projectClientId === String(formData.clientId)) {
        return true;
      }

      const projectClientName = (
        project?.clientName ||
        project?.client ||
        ''
      )
        .toString()
        .trim()
        .toLowerCase();

      if (projectClientName && selectedClientName && projectClientName === selectedClientName) {
        return true;
      }

      return false;
    });

    return filteredProjects.map(project => ({
      value: project.id,
      label: project.name || project.projectName || project.title || project.id
    }));
  }, [projects, clients, formData.clientId]);

  useEffect(() => {
    if (!formData.projectId) return;
    const stillValid = projectSelectOptions.some(
      p => String(p.value) === String(formData.projectId)
    );
    if (!stillValid) {
      setFormData(prev => ({
        ...prev,
        projectId: ''
      }));
    }
  }, [formData.projectId, projectSelectOptions]);

  const stockLocationOptions = useMemo(
    () =>
      stockLocations
        .filter((loc) => loc.status !== 'inactive' && loc.status !== 'suspended')
        .map((loc) => ({
          value: loc.id,
          label: `${loc.name} (${loc.code})`
        })),
    [stockLocations]
  );

  const getStockSkuOptionsForLocation = useCallback((locId) => {
    const rows = inventoryByLocation[String(locId || '')] || [];
    return rows.map((item) => {
      const sku = item.sku || item.id;
      const q = Number(item.quantity) || 0;
      return {
        value: sku,
        label: `${item.name || sku} (${sku}) — ${q} on hand`
      };
    });
  }, [inventoryByLocation]);

  const ensureInventoryForLocation = useCallback(
    async (locId) => {
      if (!locId) return;
      const key = String(locId);
      if (loadingInventoryByLocationRef.current[key]) return;
      let alreadyLoaded = false;
      setInventoryByLocation((prev) => {
        if (Array.isArray(prev[key])) alreadyLoaded = true;
        return prev;
      });
      if (alreadyLoaded) return;
      loadingInventoryByLocationRef.current[key] = true;

      const applyRows = (rows) => {
        setInventoryByLocation((prev) => ({ ...prev, [key]: Array.isArray(rows) ? rows : [] }));
      };

      if (!isOnline) {
        applyRows(jobCardStockPickListFromCachedInventory(inventory, key));
        loadingInventoryByLocationRef.current[key] = false;
        return;
      }

      try {
        const response = await fetch(
          `/api/public/inventory?locationId=${encodeURIComponent(key)}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        );
        if (response.ok) {
          const data = await response.json();
          const rows = data?.data?.inventory || data?.inventory || [];
          applyRows(rows);
          loadingInventoryByLocationRef.current[key] = false;
          return;
        }
      } catch (e) {
        console.warn('⚠️ JobCardFormPublic: location inventory fetch failed:', e?.message || e);
      }

      const token = getJobCardAuthToken();
      if (token && window.DatabaseAPI?.getInventory) {
        try {
          const response = await window.DatabaseAPI.getInventory(key, { forceRefresh: true });
          const rows = response?.data?.inventory || [];
          applyRows(Array.isArray(rows) ? rows.map((item) => ({ ...item, id: item.id })) : []);
          loadingInventoryByLocationRef.current[key] = false;
          return;
        } catch (authError) {
          console.warn(
            '⚠️ JobCardFormPublic: authenticated location inventory failed:',
            authError?.message || authError
          );
        }
      }

      applyRows(jobCardStockPickListFromCachedInventory(inventory, key));
      loadingInventoryByLocationRef.current[key] = false;
    },
    [isOnline, inventory]
  );

  useEffect(() => {
    if (isOnline) return;
    setInventoryByLocation((prev) => {
      const keys = Object.keys(prev);
      if (!keys.length) return prev;
      const next = { ...prev };
      let changed = false;
      for (const locId of keys) {
        const rows = jobCardStockPickListFromCachedInventory(inventory, locId);
        if (rows !== prev[locId]) {
          next[locId] = rows;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [inventory, isOnline]);

  useEffect(() => {
    const locIds = new Set();
    (formData.stockUsed || []).forEach((line) => {
      if (line?.locationId) locIds.add(String(line.locationId));
    });
    stockEntryRows.forEach((row) => {
      if (row.locationId) locIds.add(String(row.locationId));
    });
    locIds.forEach((id) => {
      void ensureInventoryForLocation(id);
    });
  }, [formData.stockUsed, stockEntryRows, ensureInventoryForLocation]);

  const jobStatusOptions = useMemo(
    () => [
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'completed', label: 'Completed' }
    ],
    []
  );

  const jobSiteDurationMinutes = useMemo(
    () => jobSiteMinutesFromDatetimeLocals(formData.timeOfArrival, formData.departureFromSite),
    [formData.timeOfArrival, formData.departureFromSite]
  );
  const jobSiteDurationLabel = useMemo(
    () => formatTravelDurationMinutes(jobSiteDurationMinutes),
    [jobSiteDurationMinutes]
  );

  const totalMaterialCost = useMemo(
    () => (formData.materialsBought || []).reduce((sum, item) => sum + (item.cost || 0), 0),
    [formData.materialsBought]
  );

  /** General gallery (work + sign-off) plus per-section work-step attachments. */
  const totalPhotoVideoCount = useMemo(() => {
    const sectionCount = SECTION_WORK_MEDIA_KEYS.reduce(
      (n, k) => n + (sectionWorkMedia[k]?.length || 0),
      0
    );
    return selectedPhotos.length + sectionCount;
  }, [selectedPhotos, sectionWorkMedia]);
  const visibleSelectedPhotos = useMemo(
    () => (showAllSelectedPhotos ? selectedPhotos : selectedPhotos.slice(0, 8)),
    [showAllSelectedPhotos, selectedPhotos]
  );
  const hiddenSelectedPhotosCount = Math.max(0, selectedPhotos.length - visibleSelectedPhotos.length);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/job-card';
    }
    return `${window.location.origin}/job-card`;
  }, []);

  const calendarUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/api/public/jobcards-calendar.ics';
    }
    const base = `${window.location.origin}/api/public/jobcards-calendar.ics`;
    const token = getJobCardAuthToken();
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }, []);

  const resizeSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    const wrapper = signatureWrapperRef.current;
    if (!canvas || !wrapper) return;

    const ratio = window.devicePixelRatio || 1;
    const width = wrapper.clientWidth;
    const height = 180;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }, []);

  const getSignaturePosition = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const pointer = event.touches ? event.touches[0] : event;
    return {
      x: pointer.clientX - rect.left,
      y: pointer.clientY - rect.top
    };
  }, []);

  const startSignature = useCallback((event) => {
    if (signatureLocked) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    isDrawingRef.current = true;
    const ctx = canvas.getContext('2d');
    const { x, y } = getSignaturePosition(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.preventDefault();
  }, [getSignaturePosition, signatureLocked]);

  const drawSignature = useCallback((event) => {
    if (signatureLocked || !isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { x, y } = getSignaturePosition(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
    event.preventDefault();
  }, [getSignaturePosition, signatureLocked]);

  const endSignature = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  const captureSignature = useCallback(() => {
    if (!hasSignature || !signatureCanvasRef.current) return;
    const dataUrl = signatureCanvasRef.current.toDataURL('image/png');
    if (!dataUrl) return;
    setFormData(prev => ({ ...prev, customerSignature: dataUrl }));
    setSignatureLocked(true);
    lastSignatureRestoreRef.current = dataUrl;
  }, [hasSignature]);

  const clearSignature = useCallback(() => {
    lastSignatureRestoreRef.current = null;
    setFormData(prev => ({ ...prev, customerSignature: '' }));
    setSignatureLocked(false);
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    resizeSignatureCanvas();
    setHasSignature(false);
  }, [resizeSignatureCanvas]);

  const exportSignature = useCallback(() => {
    if (signatureLocked && formData.customerSignature) {
      return String(formData.customerSignature).trim();
    }
    if (!hasSignature || !signatureCanvasRef.current) {
      return '';
    }
    return signatureCanvasRef.current.toDataURL('image/png');
  }, [hasSignature, signatureLocked, formData.customerSignature]);

  const handleShareLink = useCallback(async () => {
    const targetUrl = shareUrl || (typeof window !== 'undefined' ? `${window.location.origin}/job-card` : '/job-card');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Job Card Capture',
          text: 'Use the mobile-friendly job card wizard to capture site visits.',
          url: targetUrl
        });
        setShareStatus('Link shared');
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetUrl);
        setShareStatus('Link copied');
      } else {
        throw new Error('Share API unavailable');
      }
    } catch (error) {
      console.warn('Job card share failed, attempting clipboard fallback:', error);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(targetUrl);
          setShareStatus('Link copied');
        } catch (clipboardError) {
          console.error('Clipboard fallback failed:', clipboardError);
          setShareStatus('Copy unavailable');
          return;
        }
      } else {
        setShareStatus('Copy unavailable');
        return;
      }
    } finally {
      setTimeout(() => setShareStatus('Copy share link'), 2500);
    }
  }, [shareUrl]);

  const handleOpenClassicView = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const classicUrl = `${window.location.origin}/service-maintenance`;
    window.open(classicUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const handleCopyCalendarLink = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCalendarStatus('Copy unavailable');
      setTimeout(() => setCalendarStatus('Copy calendar link'), 2500);
      return;
    }
    try {
      await navigator.clipboard.writeText(calendarUrl);
      setCalendarStatus('Calendar link copied');
    } catch (error) {
      console.error('Calendar link copy failed:', error);
      setCalendarStatus('Copy unavailable');
    } finally {
      setTimeout(() => setCalendarStatus('Copy calendar link'), 2500);
    }
  }, [calendarUrl]);

  const handleSubscribeCalendar = useCallback(() => {
    if (typeof window === 'undefined') return;
    let target = calendarUrl;
    if (target.startsWith('https://')) {
      target = `webcal://${target.slice('https://'.length)}`;
    } else if (target.startsWith('http://')) {
      target = `webcal://${target.slice('http://'.length)}`;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  }, [calendarUrl]);

  // Map selection functions
  const nominatimHeaders = { 'User-Agent': 'Abcotronics-ERP/1.0' };

  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: nominatimHeaders }
      );
      const data = await response.json();

      let address = '';
      if (data.address) {
        const parts = [];
        if (data.address.road) parts.push(data.address.road);
        if (data.address.suburb || data.address.neighbourhood) parts.push(data.address.suburb || data.address.neighbourhood);
        if (data.address.city || data.address.town) parts.push(data.address.city || data.address.town);
        if (data.address.state) parts.push(data.address.state);
        address = parts.join(', ');
      }

      if (!address) {
        address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }

      setMapDraft({
        location: address,
        latitude: lat.toString(),
        longitude: lng.toString()
      });
      setMapSearchQuery(address);
      setMapHint('');
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
      const fallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setMapDraft({
        location: fallback,
        latitude: lat.toString(),
        longitude: lng.toString()
      });
      setMapSearchQuery(fallback);
      setMapHint('Could not look up address — coordinates saved instead.');
    }
  }, []);

  const placeMapMarker = useCallback((lat, lng, { pan = true } = {}) => {
    const L = typeof window !== 'undefined' ? window.L : null;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    if (mapMarkerRef.current) {
      map.removeLayer(mapMarkerRef.current);
    }

    const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    mapMarkerRef.current = marker;

    marker.on('dragend', (e) => {
      const newLat = e.target.getLatLng().lat;
      const newLng = e.target.getLatLng().lng;
      reverseGeocode(newLat, newLng);
    });

    if (pan) {
      map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }
  }, [reverseGeocode]);

  const initializeMap = useCallback(() => {
    if (!mapContainerRef.current || typeof window === 'undefined' || !window.L) {
      console.warn('⚠️ JobCardFormPublic: Cannot initialize map - missing container or Leaflet');
      return;
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const L = window.L;
    const { lat: defaultLat, lng: defaultLng, hasMarker } = mapInitRef.current;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: hasMarker ? 15 : 6,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    if (hasMarker) {
      placeMapMarker(defaultLat, defaultLng, { pan: false });
    }

    map.on('click', (e) => {
      placeMapMarker(e.latlng.lat, e.latlng.lng);
      reverseGeocode(e.latlng.lat, e.latlng.lng);
    });

    requestAnimationFrame(() => {
      map.invalidateSize(true);
      if (hasMarker) {
        map.setView([defaultLat, defaultLng], 15);
      }
    });
  }, [placeMapMarker, reverseGeocode]);

  useEffect(() => {
    if (!showMapModal) return undefined;

    const initTimer = setTimeout(() => initializeMap(), 80);
    const resizeTimer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize(true);
      }
    }, 320);

    const onResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize(true);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(initTimer);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, [showMapModal, initializeMap]);

  const handleOpenMap = useCallback(() => {
    const hasCoords = !!(formData.latitude && formData.longitude);
    mapInitRef.current = {
      lat: hasCoords ? parseFloat(formData.latitude) : -25.7479,
      lng: hasCoords ? parseFloat(formData.longitude) : 28.2293,
      hasMarker: hasCoords
    };
    setMapDraft({
      location: formData.location || '',
      latitude: formData.latitude || '',
      longitude: formData.longitude || ''
    });
    setMapSearchQuery(formData.location || '');
    setMapHint('');
    setShowMapModal(true);
  }, [formData.location, formData.latitude, formData.longitude]);

  const handleCloseMap = useCallback(() => {
    setShowMapModal(false);
    setMapLocating(false);
    setMapSearching(false);
    setMapHint('');
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    mapMarkerRef.current = null;
  }, []);

  const handleConfirmMap = useCallback(() => {
    if (mapDraft.latitude && mapDraft.longitude) {
      setFormData(prev => ({
        ...prev,
        location: mapDraft.location,
        latitude: mapDraft.latitude,
        longitude: mapDraft.longitude
      }));
    }
    handleCloseMap();
  }, [mapDraft, handleCloseMap]);

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setMapHint('Location is not available on this device.');
      return;
    }

    setMapLocating(true);
    setMapHint('Finding your location…');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        placeMapMarker(lat, lng);
        reverseGeocode(lat, lng);
        setMapLocating(false);
      },
      (error) => {
        setMapLocating(false);
        setMapHint(
          error.code === error.PERMISSION_DENIED
            ? 'Allow location access in your device settings, then try again.'
            : 'Could not get your location. Tap the map or search for an address.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, [placeMapMarker, reverseGeocode]);

  const handleMapSearch = useCallback(async () => {
    const query = mapSearchQuery.trim();
    if (!query) {
      setMapHint('Enter an address, suburb, or place name to search.');
      return;
    }

    setMapSearching(true);
    setMapHint('Searching…');

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=za`,
        { headers: nominatimHeaders }
      );
      const results = await response.json();

      if (!Array.isArray(results) || results.length === 0) {
        setMapHint('No results found. Try a nearby town or tap the map.');
        return;
      }

      const hit = results[0];
      const lat = parseFloat(hit.lat);
      const lng = parseFloat(hit.lon);
      placeMapMarker(lat, lng);
      setMapDraft({
        location: hit.display_name || query,
        latitude: lat.toString(),
        longitude: lng.toString()
      });
      setMapSearchQuery(hit.display_name || query);
      setMapHint('');
    } catch (error) {
      console.warn('Forward geocoding failed:', error);
      setMapHint('Search failed. Check your connection or tap the map.');
    } finally {
      setMapSearching(false);
    }
  }, [mapSearchQuery, placeMapMarker]);

  const progressPercent = Math.min(100, Math.round(((currentStep + 1) / STEP_IDS.length) * 100));

  const scrollWizardToTop = useCallback(() => {
    const el = wizardScrollRef.current;
    if (el) el.scrollTop = 0;
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    if (wizardFlow !== 'form') return;
    scrollWizardToTop();
    const frame = requestAnimationFrame(() => scrollWizardToTop());
    return () => cancelAnimationFrame(frame);
  }, [currentStep, wizardFlow, scrollWizardToTop]);

  useEffect(() => {
    // Only load while viewing the list. A separate fetch on `landing` (no `q`) could finish after a
    // filtered `prior_list` request and overwrite results — that made search appear broken.
    if (wizardFlow !== 'prior_list') return;

    const controller = new AbortController();
    let cancelled = false;
    const token = getJobCardAuthToken();

    (async () => {
      if (!cancelled) setServerPriorLoading(true);
      if (token) {
        try {
          const params = new URLSearchParams({
            page: '1',
            // Server caps list size; smaller batches keep the prior-card picker fast on phones.
            pageSize: '120',
            // updatedAt — cards re-opened or edited recently (e.g. JC0049/50) stay near the top.
            sortField: 'updatedAt',
            sortDirection: 'desc'
          });
          if (priorSearchDebounced) params.set('q', priorSearchDebounced);
          if (priorClientId) params.set('clientId', priorClientId);

          const r = await fetch(`/api/jobcards?${params.toString()}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          });
          if (!r.ok) {
            if (!cancelled) setServerPriorList([]);
            return;
          }
          const raw = await r.json();
          const list = raw?.data?.jobCards ?? raw?.jobCards ?? [];
          if (!cancelled) setServerPriorList(Array.isArray(list) ? list : []);
        } catch (e) {
          if (e?.name === 'AbortError') return;
          if (!cancelled) setServerPriorList([]);
        } finally {
          if (!cancelled) setServerPriorLoading(false);
        }
        return;
      }

      const ids = readPublicPriorJobCardIds();
      if (ids.length === 0) {
        if (!cancelled) {
          setServerPriorList([]);
          setServerPriorLoading(false);
        }
        return;
      }
      try {
        const q = encodeURIComponent(ids.join(','));
        const r = await fetch(`/api/public/jobcards?ids=${q}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
        if (!r.ok) {
          if (!cancelled) {
            setServerPriorList([]);
            setServerPriorLoading(false);
          }
          return;
        }
        const raw = await r.json();
        const list = raw?.data?.jobCards ?? raw?.jobCards ?? [];
        if (!cancelled) setServerPriorList(Array.isArray(list) ? list : []);
      } catch (e) {
        if (e?.name === 'AbortError') return;
        if (!cancelled) setServerPriorList([]);
      } finally {
        if (!cancelled) setServerPriorLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [wizardFlow, priorSearchDebounced, priorClientId, priorListRefreshTick]);

  const mergedPriorJobCards = useMemo(() => {
    if (wizardFlow !== 'prior_list') return [];
    const rows = priorFilterRowsSource;
    if (!priorSearchDebounced && !priorClientId && !priorSiteName && !priorTechnician) return rows;

    const q = priorSearchDebounced.toLowerCase();
    return rows.filter(jc => {
      if (priorClientId && String(jc.clientId || '') !== priorClientId) return false;
      if (priorSiteName && String(jc.siteName || '').trim() !== priorSiteName) return false;
      if (priorTechnician) {
        const primaryTech = String(jc.agentName || '').trim();
        const team = Array.isArray(jc.otherTechnicians) ? jc.otherTechnicians : [];
        const hasTechnician =
          primaryTech === priorTechnician ||
          team.some(name => String(name || '').trim() === priorTechnician);
        if (!hasTechnician) return false;
      }
      if (!priorSearchDebounced) return true;
      return priorListLocalSearchHay(jc).includes(q);
    });
  }, [
    wizardFlow,
    priorFilterRowsSource,
    priorSearchDebounced,
    priorClientId,
    priorSiteName,
    priorTechnician
  ]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const loadClients = async () => {
      try {
        
        // Always load from cache first
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_clients') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('clients') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        const activeClients = Array.isArray(cached) ? cached.filter(c => {
          const status = (c.status || '').toLowerCase();
          const type = (c.type || 'client').toLowerCase();
          return (status === 'active' || status === '' || !c.status) && (type === 'client' || !c.type);
        }) : [];
        
        
        if (activeClients.length > 0) {
          setClients(activeClients);
        }
        
        setIsLoading(false); // Always set loading to false after checking cache

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            const response = await fetch('/api/public/clients', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const clients = data?.data?.clients || data?.clients || [];
              
              if (clients.length > 0) {
                setClients(clients);
                try {
                  localStorage.setItem('manufacturing_clients', JSON.stringify(clients));
                  localStorage.setItem('clients', JSON.stringify(clients));
                } catch (e) {
                  if (e.name === 'QuotaExceededError') {
                    const slim = clients.map(c => ({ id: c.id, name: c.name || c.companyName, status: c.status, type: c.type }));
                    try {
                      localStorage.setItem('manufacturing_clients', JSON.stringify(slim));
                      localStorage.setItem('clients', JSON.stringify(slim));
                    } catch (_) {
                      console.warn('JobCardFormPublic: Client cache skipped (storage full)');
                    }
                  }
                }
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public API returned error:', response.status);
              // Try authenticated API as fallback
              if (window.DatabaseAPI?.getClients) {
                try {
                  const response = await window.DatabaseAPI.getClients();
                  if (response?.data?.clients || Array.isArray(response?.data)) {
                    const allClients = response.data.clients || response.data || [];
                    const active = Array.isArray(allClients) ? allClients.filter(c => {
                      const status = (c.status || '').toLowerCase();
                      const type = (c.type || 'client').toLowerCase();
                      return (status === 'active' || status === '' || !c.status) && (type === 'client' || !c.type);
                    }) : [];
                    if (active.length > 0) {
                      setClients(active);
                      try {
                        localStorage.setItem('manufacturing_clients', JSON.stringify(active));
                        localStorage.setItem('clients', JSON.stringify(active));
                      } catch (e) {
                        if (e.name === 'QuotaExceededError') {
                          const slim = active.map(c => ({ id: c.id, name: c.name || c.companyName, status: c.status, type: c.type }));
                          try {
                            localStorage.setItem('manufacturing_clients', JSON.stringify(slim));
                            localStorage.setItem('clients', JSON.stringify(slim));
                          } catch (_) {
                            console.warn('JobCardFormPublic: Client cache skipped (storage full)');
                          }
                        }
                      }
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load clients from public API:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading clients:', error);
        setIsLoading(false);
      }
    };
    loadClients();
  }, [isOnline]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        
        // Always load from cache first
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_users') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('users') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        
        
        if (cached.length > 0) {
          setUsers(cached);
        }

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            const response = await fetch('/api/public/users', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const usersData = data?.data?.users || data?.users || [];
              
              if (usersData.length > 0) {
                setUsers(usersData);
                localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                localStorage.setItem('users', JSON.stringify(usersData));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public API returned error:', response.status);
              // Try authenticated API as fallback
              if (window.DatabaseAPI?.getUsers) {
                try {
                  const response = await window.DatabaseAPI.getUsers();
                  if (response?.data?.users || Array.isArray(response?.data)) {
                    const usersData = response.data.users || response.data || [];
                    if (usersData.length > 0) {
                      setUsers(usersData);
                      localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                      localStorage.setItem('users', JSON.stringify(usersData));
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load users from public API:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading users:', error);
      }
    };
    loadUsers();
  }, [isOnline]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_projects') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('projects') || '[]');
        const cached = Array.isArray(cached1) && cached1.length > 0 ? cached1 : cached2;
        if (Array.isArray(cached) && cached.length > 0) {
          setProjects(cached);
        }

        if (!isOnline) return;
        const token = getJobCardAuthToken();
        if (!token) return;

        try {
          const response = await fetch('/api/projects?limit=500', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            const projectRows = data?.data?.projects || data?.projects || [];
            if (Array.isArray(projectRows) && projectRows.length > 0) {
              setProjects(projectRows);
              localStorage.setItem('manufacturing_projects', JSON.stringify(projectRows));
              localStorage.setItem('projects', JSON.stringify(projectRows));
            }
          } else if (window.DatabaseAPI?.getProjects) {
            const dbResp = await window.DatabaseAPI.getProjects({
              limit: 500,
              page: 1,
              includeTaskCount: false
            });
            const projectRows = dbResp?.data?.projects || dbResp?.projects || dbResp?.data || [];
            if (Array.isArray(projectRows) && projectRows.length > 0) {
              setProjects(projectRows);
              localStorage.setItem('manufacturing_projects', JSON.stringify(projectRows));
              localStorage.setItem('projects', JSON.stringify(projectRows));
            }
          }
        } catch (error) {
          console.warn('⚠️ JobCardFormPublic: Failed to load projects:', error.message);
        }
      } catch (error) {
        console.warn('⚠️ JobCardFormPublic: Project cache load failed:', error.message);
      }
    };
    loadProjects();
  }, [isOnline]);

  useEffect(() => {
    const loadStockData = async () => {
      try {
        
        // Always load from cache first
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        
        if (cachedInventory.length > 0) {
          setInventory(cachedInventory);
        }

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            const response = await fetch('/api/public/inventory', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const inventoryItems = data?.data?.inventory || data?.inventory || [];
              
              if (inventoryItems.length > 0) {
                setInventory(inventoryItems);
                try {
                  localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
                } catch (e) {
                  if (e?.name === 'QuotaExceededError' || e?.code === 22) {
                    console.warn('⚠️ localStorage quota exceeded, skipping manufacturing_inventory cache');
                  } else {
                    throw e;
                  }
                }
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public inventory API returned error:', response.status);
              // Try authenticated API as fallback
              const token = getJobCardAuthToken();
              if (token && window.DatabaseAPI?.getInventory) {
                try {
                  const response = await window.DatabaseAPI.getInventory();
                  if (response?.data?.inventory || Array.isArray(response?.data)) {
                    const inventoryItems = response.data.inventory || response.data || [];
                    if (inventoryItems.length > 0) {
                      setInventory(inventoryItems);
                      try {
                        localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
                      } catch (e) {
                        if (e?.name === 'QuotaExceededError' || e?.code === 22) {
                          console.warn('⚠️ localStorage quota exceeded, skipping manufacturing_inventory cache');
                        } else {
                          throw e;
                        }
                      }
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated inventory API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load inventory from public API:', error.message);
          }
        }
        
        
        // Always load from cache first
        const cachedLocations1 = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        const cachedLocations2 = JSON.parse(localStorage.getItem('manufacturing_locations') || '[]');
        const cachedLocations = cachedLocations1.length > 0 ? cachedLocations1 : cachedLocations2;
        
        
        if (cachedLocations.length > 0) {
          setStockLocations(sortJobCardStockLocations(cachedLocations));
        } else {
          const defaultLocations = [
            { id: 'LOC001', code: 'WH-MAIN', name: 'Main Warehouse', type: 'warehouse', status: 'active' },
            { id: 'LOC002', code: 'LDV-001', name: 'Service LDV 1', type: 'vehicle', status: 'active' }
          ];
          const ordered = sortJobCardStockLocations(defaultLocations);
          setStockLocations(ordered);
          localStorage.setItem('stock_locations', JSON.stringify(ordered));
        }
        
        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            const response = await fetch('/api/public/locations', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const locations = data?.data?.locations || data?.locations || [];
              
              if (locations.length > 0) {
                const ordered = sortJobCardStockLocations(locations);
                setStockLocations(ordered);
                localStorage.setItem('stock_locations', JSON.stringify(ordered));
                localStorage.setItem('manufacturing_locations', JSON.stringify(ordered));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public locations API returned error:', response.status);
              // Try authenticated API as fallback
              const token = getJobCardAuthToken();
              if (token && window.DatabaseAPI?.getStockLocations) {
                try {
                  const response = await window.DatabaseAPI.getStockLocations();
                  if (response?.data?.locations || Array.isArray(response?.data)) {
                    const locations = response.data.locations || response.data || [];
                    if (locations.length > 0) {
                      const ordered = sortJobCardStockLocations(locations);
                      setStockLocations(ordered);
                      localStorage.setItem('stock_locations', JSON.stringify(ordered));
                      localStorage.setItem('manufacturing_locations', JSON.stringify(ordered));
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated locations API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load locations from public API:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading stock data:', error);
      }
    };
    loadStockData();
  }, [isOnline]);

  useEffect(() => {
    const loadSitesForClient = async () => {
      // When "No Client" is selected, clear sites and rely on manual entry
      if (formData.clientId === NO_CLIENT_ID) {
        setAvailableSites([]);
        setFormData(prev => ({ ...prev, siteId: '', siteName: prev.siteName || '' }));
        return;
      }

      if (formData.clientId && clients.length > 0) {
        const client = clients.find(c => c.id === formData.clientId);

        if (!client) {
          // Client id not found in list – clear available sites
          setAvailableSites([]);
          setFormData(prev => ({ ...prev, siteId: '', siteName: '' }));
          return;
        }

        
        // First, try to get sites from client object
        let sites = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []);
        
        
        // Also try to load from API if online
        if (isOnline && sites.length === 0) {
          try {
            const response = await fetch(`/api/public/sites/client/${encodeURIComponent(formData.clientId)}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const apiSites = data?.data?.sites || data?.sites || [];
              if (Array.isArray(apiSites) && apiSites.length > 0) {
                sites = apiSites;
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Sites API returned error:', response.status);
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load sites from API:', error.message);
          }
        }
        
        setAvailableSites(sites);
        setFormData(prev => ({ ...prev, clientName: client.name || '' }));
      } else {
        setAvailableSites([]);
        setFormData(prev => ({ ...prev, siteId: '', siteName: '' }));
      }
    };
    
    loadSitesForClient();
  }, [formData.clientId, clients, isOnline]);

  // Keep siteName in sync when a site is selected (list/detail show siteName, not siteId).
  useEffect(() => {
    if (!formData.siteId || availableSites.length === 0) return;
    const site = availableSites.find((s) => String(s.id) === String(formData.siteId));
    if (!site?.name) return;
    const nextName = String(site.name).trim();
    if (String(formData.siteName || '').trim() === nextName) return;
    setFormData((prev) => ({ ...prev, siteName: nextName }));
  }, [formData.siteId, availableSites]);

  useEffect(() => {
    resizeSignatureCanvas();
    if (signatureLocked && formData.customerSignature) {
      const sig = formData.customerSignature;
      if (typeof sig === 'string' && sig.startsWith('data:image') && lastSignatureRestoreRef.current !== sig) {
        const canvas = signatureCanvasRef.current;
        if (canvas) {
          const img = new Image();
          img.onload = () => {
            resizeSignatureCanvas();
            const ctx = canvas.getContext('2d');
            const ratio = window.devicePixelRatio || 1;
            ctx.drawImage(img, 0, 0, canvas.width / ratio, canvas.height / ratio);
            setHasSignature(true);
            lastSignatureRestoreRef.current = sig;
          };
          img.src = sig;
        }
      }
    }

    const handleResize = () => {
      resizeSignatureCanvas();
      if (signatureLocked && formData.customerSignature) {
        const sig = formData.customerSignature;
        if (typeof sig === 'string' && sig.startsWith('data:image')) {
          lastSignatureRestoreRef.current = null;
          const canvas = signatureCanvasRef.current;
          if (!canvas) return;
          const img = new Image();
          img.onload = () => {
            resizeSignatureCanvas();
            const ctx = canvas.getContext('2d');
            const ratio = window.devicePixelRatio || 1;
            ctx.drawImage(img, 0, 0, canvas.width / ratio, canvas.height / ratio);
            lastSignatureRestoreRef.current = sig;
          };
          img.src = sig;
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [resizeSignatureCanvas, signatureLocked, formData.customerSignature]);

  useEffect(() => {
    if (wizardFlow !== 'form') return;
    if (currentStep !== STEP_IDS.length - 1) return;
    const sig = formData.customerSignature;
    if (typeof sig !== 'string' || !sig.startsWith('data:image')) return;

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;
      if (lastSignatureRestoreRef.current === sig) return;

      const img = new Image();
      img.onload = () => {
        if (cancelled || lastSignatureRestoreRef.current === sig) return;
        resizeSignatureCanvas();
        const ctx = canvas.getContext('2d');
        const ratio = window.devicePixelRatio || 1;
        const w = canvas.width / ratio;
        const h = canvas.height / ratio;
        ctx.drawImage(img, 0, 0, w, h);
        setHasSignature(true);
        setSignatureLocked(true);
        lastSignatureRestoreRef.current = sig;
      };
      img.onerror = () => {};
      img.src = sig;
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [wizardFlow, currentStep, formData.customerSignature, resizeSignatureCanvas]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === 'projectId') {
      const selectedProject = (projects || []).find(p => String(p.id) === String(value));
      setFormData(prev => ({
        ...prev,
        projectId: value || '',
        projectName:
          selectedProject?.name ||
          selectedProject?.projectName ||
          selectedProject?.title ||
          prev.projectName ||
          ''
      }));
      return;
    }

    // When the client selection changes, clear site selection and handle "No Client"
    if (name === 'clientId') {
      if (value === NO_CLIENT_ID) {
        setFormData(prev => ({
          ...prev,
          clientId: value,
          clientName: prev.clientName || '',
          siteId: '',
          siteName: prev.siteName || ''
        }));
        setAvailableSites([]);
        return;
      }

      setFormData(prev => ({
        ...prev,
        clientId: value,
        siteId: '',
        siteName: ''
      }));
      return;
    }

    if (name === 'siteId') {
      const site = availableSites.find((s) => String(s.id) === String(value));
      setFormData((prev) => ({
        ...prev,
        siteId: value,
        siteName: site?.name ? String(site.name).trim() : ''
      }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddTechnician = () => {
    const techName = technicianInput.trim();
    if (techName && !formData.otherTechnicians.includes(techName)) {
      setFormData(prev => ({
        ...prev,
        otherTechnicians: [...prev.otherTechnicians, techName]
      }));
      setTechnicianInput('');
    }
  };

  const handleRemoveTechnician = (technician) => {
    setFormData(prev => ({
      ...prev,
      otherTechnicians: prev.otherTechnicians.filter(t => t !== technician)
    }));
  };

  const handlePhotoUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    const input = event.target;
    if (files.length === 0) return;

    for (const file of files) {
      if (!jobCardFileLooksImageOrVideo(file)) {
        alert('Please choose an image or video file.');
        continue;
      }
      const isVid = jobCardFileIsVideo(file);
      const maxBytes = isVid ? JOB_CARD_VIDEO_MAX_BYTES : JOB_CARD_IMAGE_MAX_BYTES;
      if (file.size > maxBytes) {
        alert(
          isVid
            ? `Each video must be ${JOB_CARD_VIDEO_MAX_BYTES / 1024 / 1024}MB or smaller.`
            : `Each image must be ${JOB_CARD_IMAGE_MAX_BYTES / 1024 / 1024}MB or smaller.`
        );
        continue;
      }
      try {
        const dataUrl = isVid
          ? await readFileAsDataUrl(file)
          : await prepareJobCardImageDataUrl(file);
        const finalBytes = dataUrlApproxBytes(dataUrl);
        if (!isVid && finalBytes > JOB_CARD_IMAGE_MAX_BYTES) {
          alert(`This image is still too large after compression. Please choose a smaller photo.`);
          continue;
        }
        const thumbUrl = !isVid ? await buildJobCardImageThumbnailDataUrl(dataUrl) : '';
        const storedEntry = isVid
          ? dataUrl
          : {
              kind: 'imageMedia',
              name: file.name || '',
              url: dataUrl,
              thumbUrl: thumbUrl || ''
            };
        pushWizardActivity('wizard_media_added', { kind: 'photo' });
        editMediaDirtyRef.current = true;
        setSelectedPhotos(prev => [
          ...prev,
          {
            name: file.name,
            url: dataUrl,
            previewUrl: thumbUrl || '',
            entry: storedEntry,
            size: finalBytes || file.size
          }
        ]);
        setFormData(prev => ({ ...prev, photos: [...prev.photos, storedEntry] }));
      } catch (error) {
        console.warn('JobCardFormPublic: media read failed', error);
        alert('Failed to read that file. Please try again.');
      }
    }
    input.value = '';
  };

  const handleRemovePhoto = (index) => {
    editMediaDirtyRef.current = true;
    const newPhotos = selectedPhotos.filter((_, idx) => idx !== index);
    setSelectedPhotos(newPhotos);
    setFormData(prev => ({
      ...prev,
      photos: newPhotos.map(photo => {
        if (photo && typeof photo === 'object' && photo.entry !== undefined) return photo.entry;
        return typeof photo === 'string' ? photo : photo.url;
      })
    }));
  };

  const handleSectionWorkMediaUpload = async (section, event) => {
    const files = Array.from(event.target.files || []);
    const input = event.target;
    if (files.length === 0) return;

    for (const file of files) {
      if (!jobCardFileLooksImageOrVideo(file)) {
        alert('Please choose an image or video file.');
        continue;
      }
      const isVid = jobCardFileIsVideo(file);
      const maxBytes = isVid ? JOB_CARD_VIDEO_MAX_BYTES : JOB_CARD_IMAGE_MAX_BYTES;
      if (file.size > maxBytes) {
        alert(
          isVid
            ? `Each video must be ${JOB_CARD_VIDEO_MAX_BYTES / 1024 / 1024}MB or smaller.`
            : `Each image must be ${JOB_CARD_IMAGE_MAX_BYTES / 1024 / 1024}MB or smaller.`
        );
        continue;
      }
      try {
        const dataUrl = isVid
          ? await readFileAsDataUrl(file)
          : await prepareJobCardImageDataUrl(file);
        const finalBytes = dataUrlApproxBytes(dataUrl);
        if (!isVid && finalBytes > JOB_CARD_IMAGE_MAX_BYTES) {
          alert('This image is still too large after compression. Please choose a smaller photo.');
          continue;
        }
        const thumbUrl = !isVid ? await buildJobCardImageThumbnailDataUrl(dataUrl) : '';
        pushWizardActivity('wizard_media_added', { kind: 'sectionMedia', section });
        editMediaDirtyRef.current = true;
        setSectionWorkMedia(prev => ({
          ...prev,
          [section]: [
            ...(prev[section] || []),
            { name: file.name, url: dataUrl, thumbUrl: thumbUrl || '', size: finalBytes || file.size }
          ]
        }));
      } catch (error) {
        console.warn('JobCardFormPublic: section media read failed', error);
        alert('Failed to read that file. Please try again.');
      }
    }
    input.value = '';
  };

  const handleRemoveSectionWorkMedia = (section, index) => {
    editMediaDirtyRef.current = true;
    setSectionWorkMedia(prev => ({
      ...prev,
      [section]: (prev[section] || []).filter((_, i) => i !== index)
    }));
  };

  const addStockEntryRow = () => {
    setStockEntryRows((prev) => [...prev, createStockEntryRow()]);
  };

  const removeStockEntryRow = (rowId) => {
    setStockEntryRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const updateStockEntryRow = (rowId, patch) => {
    setStockEntryRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
    if (patch.locationId) {
      void ensureInventoryForLocation(patch.locationId);
    }
  };

  const handleAddStockItem = (entryRowId) => {
    const entry = stockEntryRows.find((row) => row.id === entryRowId);
    if (!entry) return;

    const selectedLocationId = String(entry.locationId || '');
    if (!selectedLocationId) {
      alert('Please select the stock location first.');
      return;
    }
    if (!entry.sku || entry.quantity <= 0) {
      alert('Please select a component with stock at that location, and enter a quantity greater than zero.');
      return;
    }

    const rowsAtLocation = inventoryByLocation[selectedLocationId] || [];
    const inventoryItem =
      rowsAtLocation.find((item) => item.sku === entry.sku || item.id === entry.sku) ||
      inventory.find((item) => item.sku === entry.sku || item.id === entry.sku);
    if (!inventoryItem) {
      alert('Selected component could not be found for this location.');
      return;
    }

    const stockItem = {
      id: Date.now().toString(),
      sku: inventoryItem.sku || inventoryItem.id,
      itemName: inventoryItem.name || '',
      quantity: parseFloat(entry.quantity),
      locationId: selectedLocationId,
      locationName: stockLocations.find((loc) => String(loc.id) === selectedLocationId)?.name || '',
      unitCost: inventoryItem.unitCost || 0
    };

    setFormData((prev) => ({
      ...prev,
      stockUsed: [...prev.stockUsed, stockItem]
    }));
    pushWizardActivity('stock_line_added', { sku: stockItem.sku });
    updateStockEntryRow(entryRowId, { sku: '', quantity: 0 });
  };

  const handleRemoveStockItem = (itemId) => {
    setFormData(prev => ({
      ...prev,
      stockUsed: prev.stockUsed.filter(item => item.id !== itemId)
    }));
  };

  const handleAddMaterialItem = () => {
    if (!newMaterialItem.itemName || newMaterialItem.cost <= 0) {
      alert('Please provide an item name and a cost greater than zero.');
      return;
    }

    const materialItem = {
      id: Date.now().toString(),
      itemName: newMaterialItem.itemName,
      description: newMaterialItem.description || '',
      reason: newMaterialItem.reason || '',
      cost: parseFloat(newMaterialItem.cost)
    };

    setFormData(prev => ({
      ...prev,
      materialsBought: [...prev.materialsBought, materialItem]
    }));
    pushWizardActivity('material_line_added', {
      itemName: String(materialItem.itemName || '').slice(0, 120)
    });
    setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
  };

  const handleRemoveMaterialItem = (itemId) => {
    setFormData(prev => ({
      ...prev,
      materialsBought: prev.materialsBought.filter(item => item.id !== itemId)
    }));
  };

  // --- Service form templates loading ----------------------------------------

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      if (!isOnline) {
        // Try to load from cache if offline
        const cached = JSON.parse(localStorage.getItem('service_form_templates') || '[]');
        if (cached.length > 0) {
          setFormTemplates(cached);
        }
        return;
      }

      try {
        setLoadingTemplates(true);
        const response = await fetch('/api/public/service-forms', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.warn('⚠️ JobCardFormPublic: Failed to load form templates', {
            status: response.status,
            statusText: response.statusText
          });
          // Try cache as fallback
          const cached = JSON.parse(localStorage.getItem('service_form_templates') || '[]');
          if (cached.length > 0 && !cancelled) {
            setFormTemplates(cached);
          }
          return;
        }

        const data = await response.json();
        
        // The API wraps responses in { data: ... }, so templates are at data.data.templates
        const templates = Array.isArray(data.data?.templates) 
          ? data.data.templates 
          : Array.isArray(data.templates) 
            ? data.templates 
            : [];
        
        
        if (!cancelled) {
          setFormTemplates(templates);
          // Cache for offline use
          localStorage.setItem('service_form_templates', JSON.stringify(templates));
        }
      } catch (error) {
        console.warn('⚠️ JobCardFormPublic: Error loading form templates:', error);
        // Try cache as fallback
        const cached = JSON.parse(localStorage.getItem('service_form_templates') || '[]');
        if (cached.length > 0 && !cancelled) {
          setFormTemplates(cached);
        }
      } finally {
        if (!cancelled) {
          setLoadingTemplates(false);
        }
      }
    };

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  // --- Service form instance handlers ----------------------------------------

  const ensureServiceFormsArray = (prev) => Array.isArray(prev.serviceForms) ? prev.serviceForms : [];

  const handleAddForm = (templateId) => {
    const template = formTemplates.find(t => t.id === templateId);
    if (!template) return;

    const formId = `form_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setFormData(prev => {
      const existing = ensureServiceFormsArray(prev);
      // Check if this template is already added
      if (existing.some(f => f.templateId === templateId)) {
        alert('This form is already added to the job card.');
        return prev;
      }
      return {
        ...prev,
        serviceForms: [
          ...existing,
          {
            id: formId,
            templateId: template.id,
            templateName: template.name,
            templateVersion: template.version || 1,
            answers: {}
          }
        ]
      };
    });
    pushWizardActivity('service_form_attached_local', {
      templateId: template.id,
      templateName: template.name,
      localFormId: formId
    });
    setShowTemplateModal(false);
  };

  const handleRemoveForm = (formId) => {
    const existing = ensureServiceFormsArray(formData);
    const removed = existing.find(f => f.id === formId);
    if (removed) {
      pushWizardActivity('service_form_removed', {
        formId,
        templateId: removed.templateId,
        templateName: removed.templateName
      });
    }
    setFormData(prev => ({
      ...prev,
      serviceForms: ensureServiceFormsArray(prev).filter(f => f.id !== formId)
    }));
  };

  const handleFormAnswerChange = (formId, fieldId, value) => {
    setFormData(prev => {
      const existing = ensureServiceFormsArray(prev);
      return {
        ...prev,
        serviceForms: existing.map(f => {
          if (f.id !== formId) return f;
          return {
            ...f,
            answers: {
              ...(f.answers || {}),
              [fieldId]: value
            }
          };
        })
      };
    });
  };


  const syncClientContact = async (jobCardData) => {
    if (!formData.clientId || !window.DatabaseAPI?.updateClient) return;
              const client = clients.find(c => c.id === formData.clientId);
    if (!client) return;

                const activityLog = Array.isArray(client.activityLog) ? client.activityLog : [];
                const newActivityEntry = {
                  id: Date.now(),
                  type: 'Job Card Created',
                  description: `Job card created for ${client.name}${formData.siteName ? ` at ${formData.siteName}` : ''}${formData.location ? ` - ${formData.location}` : ''}`,
                  timestamp: new Date().toISOString(),
                  user: formData.agentName || 'Technician'
                };
                
                const updatedClient = {
                  ...client,
                  lastContact: new Date().toISOString(),
                  activityLog: [...activityLog, newActivityEntry]
                };
                
                await window.DatabaseAPI.updateClient(formData.clientId, {
                  lastContact: updatedClient.lastContact,
                  activityLog: updatedClient.activityLog
                });
                
    const updatedClients = clients.map(clientEntry =>
      clientEntry.id === formData.clientId ? updatedClient : clientEntry
                );
                setClients(updatedClients);
                try {
                  localStorage.setItem('manufacturing_clients', JSON.stringify(updatedClients));
                  localStorage.setItem('clients', JSON.stringify(updatedClients));
                } catch (e) {
                  if (e.name === 'QuotaExceededError') {
                    const slim = updatedClients.map(c => ({ id: c.id, name: c.name || c.companyName, status: c.status, type: c.type }));
                    try {
                      localStorage.setItem('manufacturing_clients', JSON.stringify(slim));
                      localStorage.setItem('clients', JSON.stringify(slim));
                    } catch (_) {}
                  }
                }
  };

  const resetForm = () => {
      setFormData({
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
        // Reset service forms
        serviceForms: [],
        status: 'draft',
        customerName: '',
        customerTitle: '',
        customerFeedback: '',
        customerSignDate: '',
        customerSignature: ''
      });
      setSelectedPhotos([]);
      setSectionWorkMedia(emptySectionWorkMedia());
      setTechnicianInput('');
      setStockEntryRows([createStockEntryRow()]);
      setInventoryByLocation({});
      setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    setVoiceAttachments([]);
    setCurrentStep(0);
    setShowAllSelectedPhotos(false);
    lastSignatureRestoreRef.current = null;
    sessionActivityQueueRef.current = [];
    activeEditCardIdRef.current = null;
    photosHydrationCompleteRef.current = true;
    editMediaDirtyRef.current = false;
    clearSignature();
  };

  const exitToMenu = () => {
    if (photoLightboxUrl) {
      setPhotoLightboxUrl('');
      return;
    }
    if (wizardFlow === 'form' && editingMeta) {
      void persistWizardDraftRef.current?.({
        syncServer: Boolean(editingMeta?.serverJobCardId)
      });
    }
    const hasDraftWork =
      wizardFlow === 'form' &&
      (WORK_NOTE_TEXT_FIELDS.some(k => String(formData[k] || '').trim()) ||
        (Array.isArray(formData.serviceForms) && formData.serviceForms.length > 0));
    if (hasDraftWork) {
      let leave = true;
      try {
        leave = window.confirm(
          'Leave this job card? Your latest changes are saved as a draft on this device and you can reopen it from “View or Edit Existing Job Card”.'
        );
      } catch {
        leave = true;
      }
      if (!leave) return;
    }
    setEditingMeta(null);
    activeEditCardIdRef.current = null;
    sessionActivityQueueRef.current = [];
    setPriorLoadedActivities([]);
    setPriorActivityLoading(false);
    setArrivalConfirmOpen(false);
    setArrivalConfirmPickMode(false);
    setArrivalConfirmDraft('');
    setDepartureConfirmOpen(false);
    setDepartureConfirmPickMode(false);
    setDepartureConfirmDraft('');
    pendingSubmitOptionsRef.current = null;
    resetForm();
    setWizardFlow('landing');
  };

  const confirmArrivalOnSite = useCallback(
    (arrivalValue) => {
      const v = String(arrivalValue || arrivalConfirmDraft || '').trim();
      if (!v) return;
      setFormData(prev => ({ ...prev, timeOfArrival: v }));
      setArrivalConfirmOpen(false);
      setArrivalConfirmPickMode(false);
      pushWizardActivity('job_time_arrival_confirmed', { timeOfArrival: v });
      void persistWizardDraftRef.current?.({
        syncServer: Boolean(editingMeta?.serverJobCardId)
      });
      const pendingSubmit = pendingSubmitOptionsRef.current;
      if (pendingSubmit) {
        queueMicrotask(() => {
          void handleSaveRef.current?.({ ...pendingSubmit, timeOfArrivalOverride: v });
        });
      }
    },
    [arrivalConfirmDraft, editingMeta?.serverJobCardId, pushWizardActivity]
  );

  const startNewJobCard = () => {
    const meta = buildNewJobCardEditingMeta();
    setEditingMeta(meta);
    activeEditCardIdRef.current = meta.localId;
    sessionActivityQueueRef.current = [];
    setPriorLoadedActivities([]);
    setPriorActivityLoading(false);
    photosHydrationCompleteRef.current = true;
    editMediaDirtyRef.current = false;
    resetForm();
    const nowLocal = toDatetimeLocalInput(new Date());
    setArrivalConfirmDraft(nowLocal);
    setArrivalConfirmPickMode(false);
    setArrivalConfirmOpen(true);
    setWizardFlow('form');
  };

  const openPriorList = () => {
    setPriorListRefreshTick(t => t + 1);
    setWizardFlow('prior_list');
  };

  const parseStockTakeLineMeta = (line) => {
    try {
      return line?.meta ? JSON.parse(line.meta) : {};
    } catch {
      return {};
    }
  };

  const stockTakeSubmissionToState = (submission) => {
    const lines = submission?.lines || [];
    const rows = [];
    const counts = {};
    const newItems = [];
    for (const line of lines) {
      const meta = parseStockTakeLineMeta(line);
      if (meta.isNewItem) {
        const pd = meta.proposedItemDetails || {};
        newItems.push({
          itemName: line.itemName,
          sku: meta.proposedSku || '',
          unit: line.unit || 'pcs',
          category: pd.category || 'components',
          type: pd.type || 'raw_material',
          unitCost: pd.unitCost ?? '',
          reorderPoint: pd.reorderPoint ?? '',
          supplier: pd.supplier || '',
          supplierPartNumber: pd.supplierPartNumber || '',
          manufacturingPartNumber: pd.manufacturingPartNumber || '',
          boxNumber: pd.boxNumber || '',
          countedQty: Number(line.countedQty) || 0,
          notes: pd.notes || '',
          stockTakeLineId: line.id
        });
      } else {
        const sku = String(line.sku || '').trim();
        rows.push({
          sku,
          name: line.itemName,
          itemName: line.itemName,
          quantity: Number(line.systemQty) || 0,
          locationInventoryId: line.locationInventoryId,
          inventoryItemId: line.inventoryItemId,
          stockTakeLineId: line.id
        });
        if (sku) counts[sku] = String(Number(line.countedQty));
      }
    }
    return { rows, counts, newItems };
  };

  const loadJobCardStockTakeSession = async (sessionId, { silent } = {}) => {
    if (!sessionId) return null;
    const token = getJobCardAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(`/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}`, {
        headers
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(payload?.error?.message || payload?.message || res.statusText));
      }
      const submission = payload?.data?.submission || payload?.submission;
      if (!submission) return null;
      if (submission.status !== 'in_progress') {
        if (!silent) {
          setStockTakeSessionId('');
          setStockTakeStatus('This session is no longer active.');
        }
        return submission;
      }
      setStockTakeSessionRevision(Number(submission.sessionRevision) || 0);
      setStockTakeLocationId(submission.locationId || '');
      if (!silent) {
        const s = stockTakeSubmissionToState(submission);
        setStockTakeRows(s.rows);
        setStockTakeCounts(s.counts);
        setStockTakeNewItems(s.newItems);
        const parsedNotes = splitStockTakeNotes(submission.notes || '');
        setStockTakeDescription(parsedNotes.description || defaultStockTakeDescription());
        setStockTakeNotes(parsedNotes.reviewerNotes);
      } else {
        const skip = stockTakeLocalEditSkusRef.current;
        setStockTakeCounts((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const line of submission.lines || []) {
            const meta = parseStockTakeLineMeta(line);
            if (meta.isNewItem) continue;
            const sku = String(line.sku || '').trim();
            if (!sku || skip.has(sku)) continue;
            const val = String(Number(line.countedQty));
            if (next[sku] !== val) {
              next[sku] = val;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
      return submission;
    } catch (e) {
      if (!silent) setStockTakeError(e?.message || 'Failed to load session');
      return null;
    }
  };

  const flushStockTakeSessionPatch = async () => {
    if (!stockTakeSessionId) return;
    const dirty = Array.from(stockTakeDirtySkusRef.current);
    if (!dirty.length) return;
    const counts = stockTakeCountsRef.current;
    const rows = stockTakeRowsRef.current;
    const linePatches = [];
    for (const sku of dirty) {
      const raw = counts[sku];
      if (raw === undefined || raw === null || raw === '') continue;
      const countedQty = Number(raw);
      if (!Number.isFinite(countedQty)) continue;
      const row = rows.find((r) => String(r?.sku || '').trim() === sku);
      linePatches.push({ id: row?.stockTakeLineId, sku, countedQty });
    }
    stockTakeDirtySkusRef.current.clear();
    if (!linePatches.length) return;
    const token = getJobCardAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(`/api/manufacturing/stock-take-submissions/${encodeURIComponent(stockTakeSessionId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sessionRevision: stockTakeSessionRevisionRef.current,
          linePatches,
          notes: stockTakeCombinedNotesRef.current
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 409) {
        await loadJobCardStockTakeSession(stockTakeSessionId, { silent: false });
        setStockTakeError('Session updated elsewhere — refreshed.');
        return;
      }
      if (!res.ok) {
        throw new Error(String(payload?.error?.message || payload?.message || res.statusText));
      }
      const sub = payload?.data?.submission || payload?.submission;
      if (sub) setStockTakeSessionRevision(Number(sub.sessionRevision) || 0);
    } catch (e) {
      setStockTakeError(e?.message || 'Sync failed');
    }
  };

  const scheduleStockTakeSessionPatch = () => {
    if (!stockTakeSessionId) return;
    if (stockTakePatchTimerRef.current) window.clearTimeout(stockTakePatchTimerRef.current);
    stockTakePatchTimerRef.current = window.setTimeout(() => {
      stockTakePatchTimerRef.current = null;
      void flushStockTakeSessionPatch();
    }, 800);
  };

  const buildStockTakeLinePatchesFromCounts = () => {
    const counts = stockTakeCountsRef.current;
    const rows = stockTakeRowsRef.current;
    const linePatches = [];
    for (const row of rows) {
      const sku = String(row?.sku || '').trim();
      if (!sku) continue;
      const raw = counts[sku];
      if (raw === undefined || raw === null || raw === '') continue;
      const countedQty = Number(raw);
      if (!Number.isFinite(countedQty)) continue;
      linePatches.push({ id: row?.stockTakeLineId, sku, countedQty });
    }
    return linePatches;
  };

  const buildStockTakeNewItemsPayload = () =>
    (stockTakeNewItemsRef.current || [])
      .filter((item) => !item?.stockTakeLineId)
      .map((item) => {
        const countedQty = Number(item?.countedQty);
        if (!item?.itemName || !Number.isFinite(countedQty)) return null;
        const parsedUnitCost = Number(item?.unitCost);
        const parsedReorderPoint = Number(item?.reorderPoint);
        return {
          itemName: String(item.itemName).trim(),
          sku: item?.sku ? String(item.sku).trim() : '',
          unit: String(item?.unit || 'pcs').trim() || 'pcs',
          countedQty,
          category: String(item?.category || 'components').trim() || 'components',
          type: String(item?.type || 'raw_material').trim() || 'raw_material',
          unitCost: Number.isFinite(parsedUnitCost) ? parsedUnitCost : 0,
          reorderPoint: Number.isFinite(parsedReorderPoint) ? parsedReorderPoint : 0,
          supplier: String(item?.supplier || '').trim(),
          supplierPartNumber: String(item?.supplierPartNumber || '').trim(),
          manufacturingPartNumber: String(item?.manufacturingPartNumber || '').trim(),
          boxNumber: String(item?.boxNumber || '').trim(),
          notes: String(item?.notes || '').trim(),
          proposedItemDetails: {
            category: String(item?.category || 'components').trim() || 'components',
            type: String(item?.type || 'raw_material').trim() || 'raw_material',
            unitCost: Number.isFinite(parsedUnitCost) ? parsedUnitCost : 0,
            reorderPoint: Number.isFinite(parsedReorderPoint) ? parsedReorderPoint : 0,
            supplier: String(item?.supplier || '').trim(),
            supplierPartNumber: String(item?.supplierPartNumber || '').trim(),
            manufacturingPartNumber: String(item?.manufacturingPartNumber || '').trim(),
            boxNumber: String(item?.boxNumber || '').trim(),
            notes: String(item?.notes || '').trim()
          }
        };
      })
      .filter(Boolean);

  const pushStockTakeSessionSnapshot = async (sessionId) => {
    if (!sessionId) return false;
    const linePatches = buildStockTakeLinePatchesFromCounts();
    const newItems = buildStockTakeNewItemsPayload();
    if (!linePatches.length && !newItems.length) return true;
    const token = getJobCardAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sessionRevision: stockTakeSessionRevisionRef.current,
        linePatches,
        newItems,
        notes: stockTakeCombinedNotesRef.current,
        startedAt: stockTakeStartedAt || new Date().toISOString()
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status === 409) {
      await loadJobCardStockTakeSession(sessionId, { silent: false });
      setStockTakeError('Session updated elsewhere — refreshed.');
      return false;
    }
    if (!res.ok) {
      throw new Error(String(payload?.error?.message || payload?.message || res.statusText));
    }
    const sub = payload?.data?.submission || payload?.submission;
    if (sub) setStockTakeSessionRevision(Number(sub.sessionRevision) || 0);
    stockTakeDirtySkusRef.current.clear();
    return true;
  };

  const loadMyStockTakeSessions = async () => {
    const token = getJobCardAuthToken();
    if (!token) {
      setStockTakeSavedSessions([]);
      return;
    }
    setStockTakeSavedLoading(true);
    try {
      const res = await fetch('/api/manufacturing/stock-take-submissions?mine=1', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(payload?.error?.message || payload?.message || res.statusText));
      }
      const rows = payload?.data?.submissions || payload?.submissions || [];
      setStockTakeSavedSessions(Array.isArray(rows) ? rows : []);
    } catch {
      setStockTakeSavedSessions([]);
    } finally {
      setStockTakeSavedLoading(false);
    }
  };

  const persistLocalStockTakeDraft = () => {
    try {
      const payload = {
        sessionId: stockTakeSessionId || '',
        locationId: stockTakeLocationId,
        description: stockTakeDescription,
        notes: stockTakeNotes,
        startedAt: stockTakeStartedAt,
        counts: stockTakeCounts,
        newItems: stockTakeNewItems,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(STOCK_TAKE_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  };

  const saveStockTakeForLater = async () => {
    if (!stockTakeLocationId) {
      setStockTakeError('Select a stock location first.');
      return;
    }
    const desc = String(stockTakeDescription || '').trim();
    if (!desc) {
      setStockTakeError('Enter a description for this stocktake (month and day).');
      return;
    }
    const token = getJobCardAuthToken();
    if (!token) {
      persistLocalStockTakeDraft();
      setStockTakeDraftNotice(
        `Saved on this device only (${new Date().toLocaleString()}). Sign in to save under your name on the server.`
      );
      setStockTakeError('');
      return;
    }
    setStockTakeSaving(true);
    setStockTakeError('');
    setStockTakeDraftNotice('');
    try {
      let sessionId = stockTakeSessionId;
      if (!sessionId) {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const res = await fetch('/api/manufacturing/stock-take-submissions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'session',
            locationId: stockTakeLocationId,
            notes: stockTakeCombinedNotesRef.current,
            startedAt: stockTakeStartedAt || new Date().toISOString()
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(String(payload?.error?.message || payload?.message || 'Could not save stocktake'));
        }
        const sub = payload?.data?.submission || payload?.submission;
        if (!sub?.id) throw new Error('Invalid save response');
        sessionId = sub.id;
        setStockTakeSessionId(sessionId);
        await loadJobCardStockTakeSession(sessionId, { silent: false });
      } else {
        await flushStockTakeSessionPatch();
      }
      await pushStockTakeSessionSnapshot(sessionId);
      persistLocalStockTakeDraft();
      const who = getJobCardRecorderDisplayName() || 'your account';
      setStockTakeDraftNotice(`Saved for later under ${who} (${new Date().toLocaleString()}).`);
      setStockTakeStatus('You can leave and resume this stocktake from your saved list.');
      await loadMyStockTakeSessions();
    } catch (e) {
      setStockTakeError(e?.message || 'Could not save stocktake');
    } finally {
      setStockTakeSaving(false);
    }
  };

  const resumeSavedStockTake = async (sessionId) => {
    if (!sessionId) return;
    setStockTakeSaving(true);
    setStockTakeError('');
    setStockTakeDraftNotice('');
    setStockTakeSessionId(String(sessionId));
    const sub = await loadJobCardStockTakeSession(sessionId, { silent: false });
    if (sub && sub.status === 'in_progress') {
      setStockTakeStatus('Resumed saved stocktake.');
    } else {
      setStockTakeSessionId('');
      setStockTakeError('This saved stocktake is no longer in progress.');
    }
    setStockTakeSaving(false);
  };

  const deleteSavedStockTake = async (sessionId, event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!sessionId) return;
    const token = getJobCardAuthToken();
    if (!token) {
      setStockTakeError('Sign in to delete saved stocktakes.');
      return;
    }
    const row = stockTakeSavedSessions.find((s) => s.id === sessionId);
    const parsed = splitStockTakeNotes(row?.notes || '');
    const label = parsed.description || row?.submissionRef || 'this stocktake';
    if (!window.confirm(`Delete "${label}"?\n\nThis removes the saved count and cannot be undone.`)) {
      return;
    }
    setStockTakeDeletingId(sessionId);
    setStockTakeError('');
    try {
      const res = await fetch(
        `/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        }
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(payload?.error?.message || payload?.message || res.statusText));
      }
      if (stockTakeSessionId === sessionId) {
        setStockTakeSessionId('');
        setStockTakeSessionRevision(0);
        setStockTakeRows([]);
        setStockTakeCounts({});
        setStockTakeNewItems([]);
        setStockTakeStatus('');
      }
      setStockTakeDraftNotice('Saved stocktake deleted.');
      await loadMyStockTakeSessions();
    } catch (e) {
      setStockTakeError(e?.message || 'Could not delete stocktake');
    } finally {
      setStockTakeDeletingId('');
    }
  };

  const startJobCardStockTakeSession = async () => {
    if (!stockTakeLocationId) {
      setStockTakeError('Select a location first.');
      return;
    }
    setStockTakeSubmitting(true);
    setStockTakeError('');
    try {
      const token = getJobCardAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/manufacturing/stock-take-submissions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'session',
          locationId: stockTakeLocationId,
          notes: stockTakeCombinedNotesRef.current,
          startedAt: stockTakeStartedAt || new Date().toISOString()
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(payload?.error?.message || payload?.message || 'Could not start session'));
      }
      const sub = payload?.data?.submission || payload?.submission;
      if (!sub?.id) throw new Error('Invalid response');
      setStockTakeSessionId(sub.id);
      await loadJobCardStockTakeSession(sub.id, { silent: false });
      setStockTakeStatus('Shared session started — counts sync with the team.');
    } catch (e) {
      setStockTakeError(e?.message || 'Could not start session');
    } finally {
      setStockTakeSubmitting(false);
    }
  };

  const joinJobCardStockTakeSession = async () => {
    const sid = String(stockTakeJoinInput || '').trim();
    if (!sid) {
      setStockTakeError('Paste a session ID.');
      return;
    }
    setStockTakeSubmitting(true);
    setStockTakeError('');
    setStockTakeSessionId(sid);
    const sub = await loadJobCardStockTakeSession(sid, { silent: false });
    if (sub) setStockTakeStatus('Joined shared session.');
    else setStockTakeSessionId('');
    setStockTakeSubmitting(false);
  };

  const openIncidentReport = () => {
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('navigateToPage', {
          detail: { page: 'service-maintenance', subpath: ['incidents'] }
        })
      );
      return;
    }
    window.location.hash = '#/service-maintenance/incidents';
  };

  const openStockTake = () => {
    setStockTakeSessionId('');
    setStockTakeSessionRevision(0);
    setStockTakeJoinInput('');
    setStockTakeLocationId('');
    setStockTakeRows([]);
    setStockTakeCounts({});
    setStockTakeNewItems([]);
    setStockTakeDraftNewItem({
      itemName: '',
      sku: '',
      unit: 'pcs',
      category: 'components',
      type: 'raw_material',
      unitCost: '',
      reorderPoint: '',
      supplier: '',
      supplierPartNumber: '',
      manufacturingPartNumber: '',
      boxNumber: '',
      countedQty: '',
      notes: ''
    });
    setStockTakeDescription(defaultStockTakeDescription());
    setStockTakeNotes('');
    setStockTakeDraftNotice('');
    setStockTakeSubmitConfirmOpen(false);
    setStockTakeStatus('');
    setStockTakeError('');
    setStockTakeScanOpen(false);
    setStockTakeHighlightSku('');
    setStockTakeLineSearch('');
    setStockTakePage(1);
    setStockTakeStartedAt(new Date().toISOString());
    setWizardFlow('stock_take');
    void loadMyStockTakeSessions();
  };

  const openStockTransfer = () => {
    setWizardFlow('stock_transfer');
  };

  const submitStockTake = async () => {
    setStockTakeSubmitConfirmOpen(false);
    if (stockTakeSessionId) {
      await flushStockTakeSessionPatch();
      setStockTakeSubmitting(true);
      setStockTakeError('');
      try {
        const token = getJobCardAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(
          `/api/manufacturing/stock-take-submissions/${encodeURIComponent(stockTakeSessionId)}/submit-for-review`,
          { method: 'POST', headers, body: JSON.stringify({}) }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            String(payload?.error?.message || payload?.message || payload?.error || 'Submit failed')
          );
        }
        const submissionId =
          payload?.data?.submission?.id || payload?.submission?.id || stockTakeSessionId;
        setStockTakeStatus(
          submissionId
            ? `Stock take submitted for review (ref: ${submissionId}).`
            : 'Stock take submitted for review.'
        );
        setStockTakeSessionId('');
        try {
          localStorage.removeItem(STOCK_TAKE_DRAFT_KEY);
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          setWizardFlow('landing');
        }, 1100);
      } catch (error) {
        setStockTakeError(error?.message || 'Failed to submit stock take.');
      } finally {
        setStockTakeSubmitting(false);
      }
      return;
    }
    if (!stockTakeLocationId) {
      setStockTakeError('Select a stock location first.');
      return;
    }
    const existingLines = (stockTakeRows || [])
      .map((row) => {
        const sku = String(row?.sku || '').trim();
        const raw = stockTakeCounts[sku];
        if (raw === undefined || raw === null || raw === '') return null;
        const countedQty = Number(raw);
        if (!Number.isFinite(countedQty)) return null;
        return {
          locationInventoryId: row?.locationInventoryId || row?.id || null,
          inventoryItemId: row?.inventoryItemId || null,
          sku,
          itemName: row?.name || row?.itemName || sku,
          systemQty: Number(row?.quantity) || 0,
          countedQty
        };
      })
      .filter(Boolean);
    const newItemLines = (stockTakeNewItems || [])
      .map((item) => {
        const countedQty = Number(item?.countedQty);
        if (!item?.itemName || !Number.isFinite(countedQty)) return null;
        const parsedUnitCost = Number(item?.unitCost);
        const parsedReorderPoint = Number(item?.reorderPoint);
        return {
          locationInventoryId: null,
          inventoryItemId: null,
          sku: item?.sku ? String(item.sku).trim() : '',
          itemName: String(item.itemName).trim(),
          unit: String(item?.unit || 'pcs').trim() || 'pcs',
          systemQty: 0,
          countedQty,
          isNewItem: true,
          proposedItemDetails: {
            category: String(item?.category || 'components').trim() || 'components',
            type: String(item?.type || 'raw_material').trim() || 'raw_material',
            unitCost: Number.isFinite(parsedUnitCost) ? parsedUnitCost : 0,
            reorderPoint: Number.isFinite(parsedReorderPoint) ? parsedReorderPoint : 0,
            supplier: String(item?.supplier || '').trim(),
            supplierPartNumber: String(item?.supplierPartNumber || '').trim(),
            manufacturingPartNumber: String(item?.manufacturingPartNumber || '').trim(),
            boxNumber: String(item?.boxNumber || '').trim(),
            notes: String(item?.notes || '').trim()
          }
        };
      })
      .filter(Boolean);
    const lines = [...existingLines, ...newItemLines];

    if (lines.length === 0) {
      setStockTakeError('Enter at least one counted quantity before submitting.');
      return;
    }

    setStockTakeSubmitting(true);
    setStockTakeError('');
    setStockTakeStatus('');
    try {
      const token = getJobCardAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch('/api/manufacturing/stock-take-submissions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          locationId: stockTakeLocationId,
          notes: stockTakeCombinedNotesRef.current,
          startedAt: stockTakeStartedAt || new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          lines
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg =
          payload?.error?.message || payload?.message || payload?.error || 'Failed to submit stock take.';
        throw new Error(String(msg));
      }
      const submissionId = payload?.data?.submission?.id || payload?.submission?.id;
      setStockTakeStatus(
        submissionId
          ? `Stock take submitted for review (ref: ${submissionId}).`
          : 'Stock take submitted for review.'
      );
      try {
        localStorage.removeItem(STOCK_TAKE_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        setWizardFlow('landing');
      }, 1100);
    } catch (error) {
      setStockTakeError(error?.message || 'Failed to submit stock take.');
    } finally {
      setStockTakeSubmitting(false);
    }
  };

  const handleSelectPriorCard = async card => {
    const openId = getPriorCardOpenId(card);
    if (!openId) {
      console.warn('JobCardFormPublic: prior card missing id', card);
      try {
        alert('This job card could not be opened (missing reference). Refresh the page or sign in again.');
      } catch {
        /* ignore */
      }
      return;
    }
    lastSignatureRestoreRef.current = null;
    clearSignature();
    sessionActivityQueueRef.current = [];
    activeEditCardIdRef.current = null;
    photosHydrationCompleteRef.current = true;
    editMediaDirtyRef.current = false;
    setOpeningJobCard(true);

    try {
    let full = card;
    const localBackup = findLocalPendingJobCardForOpen(openId, card);
    if (localBackup && (card?.source === 'local' || card?.synced === false)) {
      full = localBackup;
    } else if (localBackup) {
      full = mergeJobCardOpenSources(localBackup, card);
    }
    let deferredPhotosPromise = null;
    const token = getJobCardAuthToken();
    const serverFetchId =
      card?.serverJobCardId ||
      (isLikelyServerJobCardId(openId) ? openId : null) ||
      (localBackup?.serverJobCardId ? String(localBackup.serverJobCardId) : null);
    if (token) {
      setPriorLoadedActivities([]);
      setPriorActivityLoading(true);
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        const activityReq = fetch(`/api/jobcards/${encodeURIComponent(openId)}/activity?order=asc`, { headers });
        void (async () => {
          try {
            const actR = await activityReq;
            if (!actR.ok) {
              setPriorLoadedActivities([]);
              return;
            }
            const aj = await actR.json();
            const acts = aj?.data?.activities ?? aj?.activities;
            setPriorLoadedActivities(
              sortJobCardActivitiesChronological(Array.isArray(acts) ? acts : [])
            );
          } catch {
            setPriorLoadedActivities([]);
          } finally {
            setPriorActivityLoading(false);
          }
        })();
        const r = await fetch(
          `/api/jobcards/${encodeURIComponent(serverFetchId || openId)}?omitPhotos=1`,
          { headers }
        );
        if (r.ok) {
          const data = await r.json();
          const apiCard = data?.data?.jobCard ?? data?.jobCard;
          if (apiCard && apiCard.id) {
            full = mergeJobCardOpenSources(localBackup || card, apiCard);
            if (apiCard.attachmentsPending === true) {
              photosHydrationCompleteRef.current = false;
              deferredPhotosPromise = (async () => {
                try {
                  const pr = await fetch(
                    `/api/jobcards/${encodeURIComponent(serverFetchId || openId)}/photos`,
                    { headers }
                  );
                  if (!pr.ok) return [];
                  const pd = await pr.json();
                  const photos = pd?.data?.photos ?? pd?.photos;
                  return Array.isArray(photos) ? photos : [];
                } catch {
                  return [];
                }
              })();
              full = {
                ...mergeJobCardOpenSources(localBackup || card, apiCard),
                photos: [],
                attachmentsPending: true
              };
            }
          }
        }
      } catch (e) {
        console.warn('JobCardFormPublic: could not load full job card from server', e);
        setPriorLoadedActivities([]);
      } finally {
        setPriorActivityLoading(false);
      }
    } else {
      setPriorLoadedActivities([]);
      setPriorActivityLoading(false);
      try {
        const r = await fetch(`/api/public/jobcards/${encodeURIComponent(openId)}`, {
          headers: { 'Content-Type': 'application/json' }
        });
        if (r.ok) {
          const data = await r.json();
          const apiCard = data?.data?.jobCard ?? data?.jobCard;
          if (apiCard && apiCard.id) {
            full = mergeJobCardOpenSources(localBackup || card, apiCard);
          }
        }
      } catch (e) {
        console.warn('JobCardFormPublic: could not load job card (public GET)', e);
      }
    }

    const localId = String(full.id != null ? full.id : openId);
    const serverJobCardId =
      full.serverJobCardId ||
      (isLikelyServerJobCardId(full.id != null ? full.id : openId)
        ? String(full.id != null ? full.id : openId)
        : null) ||
      null;
    const createdAt = full.createdAt || new Date().toISOString();
    const startedAt = full.startedAt || full.createdAt || new Date().toISOString();
    const synced =
      full.source === 'local' || full.synced === false
        ? false
        : Boolean(full.synced) || Boolean(serverJobCardId);
    const jobCardNumber = full.jobCardNumber || '';

    setEditingMeta({
      localId,
      serverJobCardId,
      startedAt,
      createdAt,
      synced,
      jobCardNumber,
      useNewJobTimeFlow: Boolean(full.useNewJobTimeFlow)
    });
    setArrivalConfirmOpen(false);
    setArrivalConfirmPickMode(false);
    setDepartureConfirmOpen(false);
    setDepartureConfirmPickMode(false);
    pendingSubmitOptionsRef.current = null;
    activeEditCardIdRef.current = localId;

    if (deferredPhotosPromise) {
      void deferredPhotosPromise
        .then((photos) => {
          applyPhotosToEditState(localId, photos);
          photosHydrationCompleteRef.current = true;
        })
        .catch((e) => {
          console.warn('JobCardFormPublic: deferred photos load failed', e);
          // Keep hydration incomplete so PATCH omits photos (avoids wiping attachments).
        });
    } else {
      applyPhotosToEditState(localId, full.photos);
      photosHydrationCompleteRef.current = true;
    }

    const formsJobCardId =
      serverJobCardId ||
      (isLikelyServerJobCardId(localId) ? localId : null);
    let serviceFormsForOpen = parseStoredJsonArray(full.serviceForms, []);
    if (token && formsJobCardId) {
      try {
        const fr = await fetch(`/api/jobcards/${encodeURIComponent(formsJobCardId)}/forms`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (fr.ok) {
          const fj = await fr.json();
          const forms = fj?.data?.forms ?? fj?.forms;
          if (Array.isArray(forms) && forms.length > 0) {
            serviceFormsForOpen = forms.map(f => ({
              id: f.id,
              templateId: f.templateId,
              templateName: f.templateName || f.template?.name || '',
              templateVersion: f.templateVersion || f.template?.version || 1,
              answers: Object.fromEntries(
                (Array.isArray(f.answers) ? f.answers : []).map(a => [
                  a.fieldId,
                  a.value != null ? a.value : ''
                ])
              )
            }));
          }
        }
      } catch (e) {
        console.warn('JobCardFormPublic: could not load service forms', e);
      }
    }
    const localForms = parseStoredJsonArray(localBackup?.serviceForms, []);
    if (
      localForms.length > 0 &&
      localBackup &&
      jobCardOpenTimestamp(localBackup) >= jobCardOpenTimestamp(full)
    ) {
      serviceFormsForOpen = localForms;
    }

    setFormData({
      ...buildFormDataFromJobCard(full),
      serviceForms: serviceFormsForOpen
    });

    setTechnicianInput('');
    setStockEntryRows([createStockEntryRow()]);
    setInventoryByLocation({});
    setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    setCurrentStep(0);
    setStepError('');
    setWizardFlow('form');
    } catch (err) {
      console.error('JobCardFormPublic: failed to open prior job card', err);
      try {
        alert('Could not open this job card. Try again, or refresh the page.');
      } catch {
        /* ignore */
      }
    } finally {
      setOpeningJobCard(false);
    }
  };

  const handleDeleteLocalDraft = useCallback(
    draftCard => {
      if (!draftCard) return;
      const draftId = draftCard.id;
      if (draftId == null) return;
      const normalizedStatus = String(draftCard.status || '').trim().toLowerCase();
      if (normalizedStatus && normalizedStatus !== 'draft') return;
      const title =
        String(draftCard.jobCardNumber || '').trim() ||
        String(draftCard.heading || parseHeadingFromComments(draftCard.otherComments || '') || '').trim() ||
        'this draft';
      let confirmed = true;
      try {
        confirmed = window.confirm(`Delete ${title}? This local draft will be removed from this device.`);
      } catch {
        confirmed = true;
      }
      if (!confirmed) return;
      removeLocalPendingJobCard(draftId);
      setLocalDraftsTick(t => t + 1);
    },
    [setLocalDraftsTick]
  );

  const runAutoSyncPendingJobCards = useCallback(async ({ silent = true } = {}) => {
    if (pendingAutoSyncInFlightRef.current) return { synced: 0, failed: 0 };
    if (!isOnline || !getJobCardAuthToken()) return { synced: 0, failed: 0 };

    const pending = listUnsyncedLocalPendingJobCards();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    pendingAutoSyncInFlightRef.current = true;
    setPendingAutoSync({ running: true, synced: 0, failed: 0 });
    let synced = 0;
    let failed = 0;

    try {
      for (const card of pending) {
        const localId = String(card.id);
        setSyncingPriorCardId(localId);
        const result = await syncOneLocalPendingJobCardToServer(card);
        if (result.ok) synced += 1;
        else failed += 1;
        setSyncingPriorCardId('');
      }
    } finally {
      pendingAutoSyncInFlightRef.current = false;
      setSyncingPriorCardId('');
      setPendingAutoSync({ running: false, synced, failed });
      if (synced > 0) {
        setLocalDraftsTick(t => t + 1);
        setPriorListRefreshTick(t => t + 1);
      }
      if (!silent && synced > 0 && failed === 0) {
        alert(synced === 1 ? 'Job card synced.' : `${synced} job cards synced.`);
      } else if (!silent && failed > 0 && synced === 0) {
        alert('Could not sync pending job cards. Open a card and tap Sync, or remove large photos and retry.');
      }
    }
    return { synced, failed };
  }, [isOnline]);

  const handleSyncLocalPendingCard = useCallback(
    async (draftCard) => {
      if (!draftCard || draftCard.id == null) return;
      const localId = String(draftCard.id);
      if (!localId || syncingPriorCardId === localId) return;
      if (!isOnline) {
        alert('You are offline. Connect to the internet to sync this job card.');
        return;
      }
      if (!getJobCardAuthToken()) {
        alert('Sign in is required to sync this job card.');
        return;
      }

      setSyncingPriorCardId(localId);
      try {
        const result = await syncOneLocalPendingJobCardToServer(draftCard);
        if (!result.ok) {
          alert(
            `Failed to sync this job card.${result.errorText ? `\n\nDetails: ${result.errorText}` : ''}`
          );
          return;
        }
        setLocalDraftsTick(t => t + 1);
        setPriorListRefreshTick(t => t + 1);
        alert('Job card synced.');
      } catch (error) {
        alert(`Failed to sync this job card. ${error?.message || ''}`.trim());
      } finally {
        setSyncingPriorCardId('');
      }
    },
    [syncingPriorCardId, isOnline]
  );

  const unsyncedPendingCount = useMemo(
    () => listUnsyncedLocalPendingJobCards().length,
    [localDraftsTick, pendingAutoSync.running]
  );

  useEffect(() => {
    if (!isOnline || !getJobCardAuthToken()) return undefined;
    if (listUnsyncedLocalPendingJobCards().length === 0) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) void runAutoSyncPendingJobCards({ silent: true });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOnline, localDraftsTick, runAutoSyncPendingJobCards]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (!isOnline || !getJobCardAuthToken()) return;
      if (listUnsyncedLocalPendingJobCards().length === 0) return;
      void runAutoSyncPendingJobCards({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isOnline, runAutoSyncPendingJobCards]);

  const closePhotoLightbox = useCallback(() => {
    setPhotoLightboxUrl('');
  }, []);

  useEffect(() => {
    if (!photoLightboxUrl) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closePhotoLightbox();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photoLightboxUrl, closePhotoLightbox]);

  useEffect(() => {
    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body) return undefined;
    if (photoLightboxUrl) {
      body.classList.add('job-card-lightbox-open');
    } else {
      body.classList.remove('job-card-lightbox-open');
    }
    return () => body.classList.remove('job-card-lightbox-open');
  }, [photoLightboxUrl]);

  useEffect(() => {
    if (wizardFlow !== 'stock_take') return;
    void loadMyStockTakeSessions();
  }, [wizardFlow]);

  useEffect(() => {
    if (wizardFlow !== 'stock_take') return;
    if (stockTakeSessionId) return;
    if (!stockTakeLocationId) {
      setStockTakeRows([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (!isOnline) {
        const rows = jobCardStockTakePickListFromCachedInventory(inventory, stockTakeLocationId);
        if (!cancelled) setStockTakeRows(rows);
        return;
      }
      try {
        const response = await fetch(
          `/api/public/inventory?locationId=${encodeURIComponent(
            stockTakeLocationId
          )}&includeZero=1&allSkus=1`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        );
        if (response.ok) {
          const data = await response.json();
          const rows = data?.data?.inventory || data?.inventory || [];
          if (!cancelled) setStockTakeRows(Array.isArray(rows) ? rows : []);
          return;
        }
      } catch (e) {
        console.warn('⚠️ JobCardFormPublic: stock take location inventory fetch failed:', e?.message || e);
      }
      const rows = jobCardStockTakePickListFromCachedInventory(inventory, stockTakeLocationId);
      if (!cancelled) setStockTakeRows(rows);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [wizardFlow, stockTakeLocationId, stockTakeSessionId, isOnline, inventory]);

  useEffect(() => {
    if (wizardFlow !== 'stock_take' || !stockTakeSessionId) {
      if (stockTakePollRef.current) {
        window.clearInterval(stockTakePollRef.current);
        stockTakePollRef.current = null;
      }
      return;
    }
    stockTakePollRef.current = window.setInterval(() => {
      if (stockTakeLocalEditSkusRef.current.size > 0) return;
      void loadJobCardStockTakeSession(stockTakeSessionId, { silent: true });
    }, 3000);
    return () => {
      if (stockTakePollRef.current) {
        window.clearInterval(stockTakePollRef.current);
        stockTakePollRef.current = null;
      }
    };
  }, [wizardFlow, stockTakeSessionId]);

  useEffect(() => {
    if (wizardFlow !== 'stock_take') {
      setStockTakeScanOpen(false);
      setStockTakeHighlightSku('');
    }
  }, [wizardFlow]);

  useEffect(() => {
    if (!stockTakeScanOpen || wizardFlow !== 'stock_take') {
      stockTakeScanActiveRef.current = false;
      return;
    }
    const video = stockTakeScanVideoRef.current;
    const canvas = stockTakeScanCanvasRef.current;
    if (!video || !canvas) return;

    stockTakeScanActiveRef.current = true;
    let stream = null;

    const tryDecode = async (text) => {
      if (!stockTakeScanActiveRef.current) return;
      const now = Date.now();
      const s = String(text || '').trim();
      if (!s) return;
      const last = stockTakeScanLastRef.current;
      if (s === last.text && now - last.t < 850) return;
      last.text = s;
      last.t = now;

      const rows = stockTakeRowsRef.current || [];
      const idToSkuMap = buildInventoryIdToSkuMap([...rows, ...inventory]);
      const resolved = await resolveInventoryScanToSku(s, rows, {
        idToSkuMap,
        resolveItemIdToSku: (id) => fetchInventorySkuByItemId('', id)
      });
      if ('error' in resolved) {
        if (resolved.error === 'not_in_list') {
          setStockTakeError('This item is not in the stock list for the selected location.');
        } else {
          setStockTakeError('Unrecognized scan. Use the inventory QR label or enter the SKU manually.');
        }
        return;
      }
      const sku = resolved.sku;
      if (!sku) return;
      const q = String(stockTakeLineSearchRef.current || '').trim().toLowerCase();
      const rowMatchesSearch = (r) => {
        const skuStr = String(r?.sku || '').trim().toLowerCase();
        const name = String(r?.name || '').trim().toLowerCase();
        return !q || skuStr.includes(q) || name.includes(q);
      };
      let filtered = rows.filter(rowMatchesSearch);
      let idx = filtered.findIndex((r) => String(r?.sku || '').trim() === sku);
      if (idx < 0) {
        setStockTakeLineSearch('');
        filtered = rows;
        idx = filtered.findIndex((r) => String(r?.sku || '').trim() === sku);
      }
      if (idx < 0) {
        setStockTakeError('This item is not in the stock list for the selected location.');
        return;
      }
      const page = Math.floor(idx / STOCK_TAKE_PAGE_SIZE) + 1;
      setStockTakePage(page);
      setStockTakeHighlightSku(sku);
      setStockTakeScanOpen(false);
      setStockTakeError('');
      window.setTimeout(() => {
        const el = document.getElementById('jc-st-qty-' + encodeURIComponent(sku));
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          el.focus();
          if (typeof el.select === 'function') el.select();
        }
      }, 150);
    };

    const stopLoop = () => {
      if (stockTakeScanRafRef.current != null) {
        cancelAnimationFrame(stockTakeScanRafRef.current);
        stockTakeScanRafRef.current = null;
      }
    };

    /** BarcodeDetector on live video is unreliable on many devices; jsQR on ImageData works consistently. */
    const startJsQrLoop = () => {
      const ctx = canvas.getContext('2d');
      const loop = () => {
        if (!stockTakeScanActiveRef.current) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const result = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
          if (result?.data) void tryDecode(result.data);
        }
        stockTakeScanRafRef.current = requestAnimationFrame(loop);
      };
      stockTakeScanRafRef.current = requestAnimationFrame(loop);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        stockTakeScanStreamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        startJsQrLoop();
      } catch (err) {
        console.warn('Stock-take camera:', err);
        setStockTakeError('Camera access failed. Allow the camera or enter counts manually.');
        setStockTakeScanOpen(false);
      }
    })();

    return () => {
      stockTakeScanActiveRef.current = false;
      stopLoop();
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      video.srcObject = null;
      stockTakeScanStreamRef.current = null;
    };
  }, [stockTakeScanOpen, wizardFlow]);

  const handleSave = async (options = {}) => {
    if (saveInProgressRef.current) {
      console.warn('JobCardFormPublic: save already in progress, ignoring duplicate tap');
      return;
    }
    flushActiveFormField();
    saveInProgressRef.current = true;
    const releaseSaveLock = () => {
      saveInProgressRef.current = false;
      setIsSubmitting(false);
    };

    const timeOfArrivalForSave =
      options?.timeOfArrivalOverride != null
        ? String(options.timeOfArrivalOverride)
        : formData.timeOfArrival;
    const departureFromSiteForSave =
      options?.departureFromSiteOverride != null
        ? String(options.departureFromSiteOverride)
        : formData.departureFromSite;

    const forceDraft = options?.forceDraft === true;
    const forceSubmitted = options?.forceSubmitted === true;
    const normalizedStatus = forceDraft
      ? 'draft'
      : forceSubmitted
        ? (formData.status === 'completed' ? 'completed' : 'submitted')
      : ['draft', 'submitted', 'completed'].includes(formData.status)
        ? formData.status
        : 'draft';
    if (normalizedStatus !== 'draft' && !formData.clientId) {
      setStepError('Please select a client or choose "No Client" before submitting.');
      setCurrentStep(0);
      releaseSaveLock();
      return;
    }
    if (normalizedStatus !== 'draft' && !formData.agentName) {
      setStepError('Please select the attending technician.');
      setCurrentStep(0);
      releaseSaveLock();
      return;
    }
    let signatureForSave =
      (signatureLocked && formData.customerSignature
        ? String(formData.customerSignature).trim()
        : '') ||
      exportSignature() ||
      (typeof formData.customerSignature === 'string' ? formData.customerSignature.trim() : '');
    if (signatureForSave && !signatureLocked) {
      setFormData(prev => ({ ...prev, customerSignature: signatureForSave }));
      setSignatureLocked(true);
      lastSignatureRestoreRef.current = signatureForSave;
    }
    if (normalizedStatus === 'completed' && !signatureForSave) {
      setStepError('A customer signature is required when the job status is Completed.');
      setCurrentStep(STEP_IDS.length - 1);
      releaseSaveLock();
      return;
    }
    if (normalizedStatus !== 'draft') {
      if (editingMeta?.useNewJobTimeFlow && !String(timeOfArrivalForSave || '').trim()) {
        pendingSubmitOptionsRef.current = options;
        setArrivalConfirmDraft(toDatetimeLocalInput(new Date()));
        setArrivalConfirmPickMode(false);
        setArrivalConfirmOpen(true);
        setCurrentStep(STEP_IDS.indexOf('visit'));
        setStepError('');
        releaseSaveLock();
        return;
      }
      if (!String(departureFromSiteForSave || '').trim()) {
        pendingSubmitOptionsRef.current = options;
        setDepartureConfirmDraft(toDatetimeLocalInput(new Date()));
        setDepartureConfirmPickMode(false);
        setDepartureConfirmOpen(true);
        setCurrentStep(STEP_IDS.indexOf('signoff'));
        setStepError('');
        releaseSaveLock();
        return;
      }
    }

    pendingSubmitOptionsRef.current = null;
    setIsSubmitting(true);
    setStepError('');
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const nowIso = new Date().toISOString();
      const draftLocalId =
        editingMeta?.localId ?? activeEditCardIdRef.current ?? generateClientDraftId();
      if (!editingMeta?.localId) {
        setEditingMeta(prev => ({
          ...(prev || buildNewJobCardEditingMeta(nowIso)),
          localId: draftLocalId,
          createdAt: prev?.createdAt ?? nowIso,
          startedAt: prev?.startedAt ?? nowIso
        }));
        activeEditCardIdRef.current = draftLocalId;
      }
      const totalMinutesForSave =
        jobSiteMinutesFromDatetimeLocals(timeOfArrivalForSave, departureFromSiteForSave) ??
        jobSiteDurationMinutes ??
        0;
      const jobCardData = {
        ...formData,
        timeOfArrival: timeOfArrivalForSave,
        departureFromSite: departureFromSiteForSave,
        customerSignature: signatureForSave,
        customerPosition: formData.customerTitle || '',
        id: draftLocalId,
        startedAt: editingMeta?.startedAt ?? editingMeta?.createdAt ?? nowIso,
        createdAt: editingMeta?.createdAt ?? nowIso,
        updatedAt: nowIso,
        synced: editingMeta?.synced ?? false,
        jobCardNumber: editingMeta?.jobCardNumber || '',
        serverJobCardId: editingMeta?.serverJobCardId || null,
        useNewJobTimeFlow: Boolean(editingMeta?.useNewJobTimeFlow)
      };

      if (!jobCardData.projectName && jobCardData.projectId) {
        const selectedProject = (projects || []).find(
          p => String(p.id) === String(jobCardData.projectId)
        );
        jobCardData.projectName =
          selectedProject?.name || selectedProject?.projectName || selectedProject?.title || '';
      }

      {
        const headingLine = String(jobCardData.heading || '').trim();
        const existingLines = String(jobCardData.otherComments || '')
          .split('\n')
          .filter(
            line =>
              line &&
              !line.startsWith(PROJECT_ASSOCIATION_PREFIX) &&
              !line.startsWith(HEADING_PREFIX)
          );
        const linesToStore = [...existingLines];
        if (jobCardData.projectName) {
          const projectAssociationLine = `${PROJECT_ASSOCIATION_PREFIX} ${jobCardData.projectName}${
            jobCardData.projectId ? ` (${jobCardData.projectId})` : ''
          }`;
          linesToStore.unshift(projectAssociationLine);
        }
        if (headingLine) {
          linesToStore.unshift(`${HEADING_PREFIX} ${headingLine}`);
        }
        jobCardData.otherComments = linesToStore.filter(Boolean).join('\n');
      }

      const kmBefore = parseFloat(formData.kmReadingBefore) || 0;
      const kmAfter = parseFloat(formData.kmReadingAfter) || 0;
      jobCardData.travelKilometers = Math.max(0, kmAfter - kmBefore);
      jobCardData.totalTimeMinutes = totalMinutesForSave;
      jobCardData.totalMaterialsCost = totalMaterialCost;
      jobCardData.stockUsed = sanitizeJobCardStockUsedForSave(jobCardData.stockUsed);

      const voicePhotoEntries = voiceAttachments.map(v => ({
        kind: 'voice',
        section: v.section,
        url: v.dataUrl,
        mimeType: v.mimeType || 'audio/webm'
      }));
      const sectionPhotoEntries = SECTION_WORK_MEDIA_KEYS.flatMap(sec =>
        (sectionWorkMedia[sec] || []).map(item => ({
          kind: 'sectionMedia',
          section: sec,
          url: item.url,
          name: item.name || '',
          thumbUrl: item.thumbUrl || ''
        }))
      );
      const serverJobCardIdForPhotos =
        editingMeta?.serverJobCardId ||
        (editingMeta?.localId && isLikelyServerJobCardId(editingMeta.localId)
          ? String(editingMeta.localId)
          : null);
      const omitPhotosOnServer = Boolean(serverJobCardIdForPhotos && !photosHydrationCompleteRef.current);
      if (!omitPhotosOnServer) {
        jobCardData.photos = buildJobCardPhotosPayload({
          formPhotos: formData.photos,
          signatureDataUrl: signatureForSave,
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

      const prevPending = readLocalPendingJobCards().find(
        c => c && String(c.id) === String(jobCardData.id)
      );
      jobCardData.activityQueue = Array.isArray(prevPending?.activityQueue)
        ? [...prevPending.activityQueue]
        : [];

      // Persist locally before any server call so work notes survive offline / partial sync.
      upsertLocalPendingJobCard({ ...jobCardData, synced: false });
      setLocalDraftsTick(t => t + 1);

      // Stock movements are posted server-side when /api/jobcards saves (all statuses).

      const serverJobCardId =
        editingMeta?.serverJobCardId ||
        (editingMeta?.localId && isLikelyServerJobCardId(editingMeta.localId)
          ? String(editingMeta.localId)
          : null);

      let serverReachOk = false;
      let lastSyncError = '';
      let resolvedServerId = null;
      let skipRemoteSync = false;

      const parseSyncFailureMessage = (status, text) => {
        if (status === 413) {
          return 'Payload too large for the server (try fewer or smaller photos/videos).';
        }
        if (status === 429) {
          return 'Too many requests right now. Please retry in a few moments.';
        }
        if (status === 502 || status === 503 || status === 504) {
          return 'Server temporarily unreachable. Please retry in a few moments.';
        }
        if (!text) return `HTTP ${status}`;
        try {
          const j = JSON.parse(text);
          return (
            j?.error?.message ||
            j?.message ||
            j?.data?.message ||
            (typeof text === 'string' ? text.slice(0, 280) : String(text))
          );
        } catch {
          return typeof text === 'string' ? text.slice(0, 280) : String(text);
        }
      };

      const attemptPostCreate = async () => {
        const createPayload = { ...jobCardData };
        delete createPayload.id;
        delete createPayload.serverJobCardId;
        delete createPayload.activityQueue;
        createPayload.clientDraftId = draftLocalId;
        const estimatedCreatePayloadBytes = estimateJsonBytes(createPayload);
        if (estimatedCreatePayloadBytes > JOB_CARD_SYNC_HARD_PAYLOAD_BYTES) {
          lastSyncError = 'Upload payload is too large for reliable sync on mobile. Remove some media and retry.';
          skipRemoteSync = true;
          return { ok: false, serverId: null };
        }
        if (estimatedCreatePayloadBytes > JOB_CARD_SYNC_WARN_PAYLOAD_BYTES) {
          console.warn('⚠️ JobCardFormPublic: large create payload', {
            estimatedCreatePayloadBytes
          });
        }
        const token = getJobCardAuthToken();
        if (!token) {
          lastSyncError = 'Sign in is required to save the job card to the server.';
          return { ok: false, serverId: null };
        }
        try {
          const response = await fetchWithRetry('/api/jobcards', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(createPayload)
          });
          const text = await response.text().catch(() => '');
          if (!response.ok) {
            lastSyncError = parseSyncFailureMessage(response.status, text);
            console.warn('⚠️ JobCardFormPublic: POST /api/jobcards error', response.status, text);
            return { ok: false, serverId: null };
          }
          let result = {};
          try {
            result = text ? JSON.parse(text) : {};
          } catch {
            result = {};
          }
          const jc = result?.data?.jobCard ?? result?.jobCard;
          const sid = jc?.id ? String(jc.id) : null;
          if (sid) {
            rememberPublicPriorJobCardId(sid);
            resolvedServerId = sid;
            setEditingMeta(prev =>
              prev
                ? { ...prev, serverJobCardId: sid, synced: true }
                : {
                    localId: draftLocalId,
                    serverJobCardId: sid,
                    createdAt: jobCardData.createdAt,
                    startedAt: jobCardData.startedAt,
                    synced: true,
                    jobCardNumber: jc?.jobCardNumber || ''
                  }
            );
          }
          return { ok: true, serverId: sid };
        } catch (error) {
          lastSyncError =
            error?.name === 'AbortError'
              ? 'Sync timed out: the server took too long (busy DB, large payload, or proxy limit)—not only weak signal. Retry from “View or Edit Existing Job Card”.'
              : (error.message || 'Network error');
          console.warn('⚠️ JobCardFormPublic: POST /api/jobcards failed:', error.message);
          return { ok: false, serverId: null };
        }
      };

      if (!skipRemoteSync && serverJobCardId) {
        resolvedServerId = serverJobCardId;
        const payloadObj = { ...jobCardData };
        delete payloadObj.activityQueue;
        delete payloadObj.id;
        delete payloadObj.synced;
        delete payloadObj.serverJobCardId;
        delete payloadObj.source;
        delete payloadObj.useNewJobTimeFlow;
        delete payloadObj.projectName;
        const estimatedPatchPayloadBytes = estimateJsonBytes(payloadObj);
        if (estimatedPatchPayloadBytes > JOB_CARD_SYNC_HARD_PAYLOAD_BYTES) {
          lastSyncError = 'Upload payload is too large for reliable sync on mobile. Remove some media and retry.';
          skipRemoteSync = true;
        }
        if (estimatedPatchPayloadBytes > JOB_CARD_SYNC_WARN_PAYLOAD_BYTES) {
          console.warn('⚠️ JobCardFormPublic: large patch payload', {
            estimatedPatchPayloadBytes
          });
        }
        const payloadJson = JSON.stringify(payloadObj);
        const token = getJobCardAuthToken();
        let patchStatus = 0;
        if (!skipRemoteSync && token) {
          try {
            const authRes = await fetchWithRetry(`/api/jobcards/${encodeURIComponent(serverJobCardId)}`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: payloadJson
            });
            patchStatus = authRes.status;
            if (authRes.ok) {
              serverReachOk = true;
              const authData = await authRes.json().catch(() => ({}));
              const ac = authData.data?.jobCard || authData.jobCard;
              if (ac?.id) {
                rememberPublicPriorJobCardId(String(ac.id));
                resolvedServerId = String(ac.id);
              }
            } else {
              const text = await authRes.text().catch(() => '');
              lastSyncError = parseSyncFailureMessage(authRes.status, text);
            }
          } catch (e) {
            console.warn('JobCardFormPublic: authenticated PATCH failed', e);
            lastSyncError =
              e?.name === 'AbortError'
                ? 'Sync timed out: the server took too long (busy DB, large payload, or proxy limit)—not only weak signal. Retry from “View or Edit Existing Job Card”.'
                : (e.message || 'Network error');
          }
        } else if (!skipRemoteSync) {
          lastSyncError = 'Sign in is required to update this job card on the server.';
        }
        if (!serverReachOk && patchStatus === 404) {
          const postResult = await attemptPostCreate();
          serverReachOk = postResult.ok;
          if (postResult.serverId) {
            resolvedServerId = postResult.serverId;
          }
        }
      } else if (!skipRemoteSync) {
        const postResult = await attemptPostCreate();
        serverReachOk = postResult.ok;
        resolvedServerId = postResult.serverId;
      }

      if (serverReachOk && resolvedServerId && jobCardData.activityQueue?.length) {
        await flushJobCardActivityQueue(resolvedServerId, jobCardData.activityQueue);
      }

      if (serverReachOk && resolvedServerId && Array.isArray(formData.serviceForms) && formData.serviceForms.length > 0) {
        await syncServiceFormsToServer(resolvedServerId, formData.serviceForms);
      }

      if (serverReachOk) {
        sessionActivityQueueRef.current = [];
        if (normalizedStatus === 'draft') {
          upsertLocalPendingJobCard({
            ...jobCardData,
            synced: false,
            serverJobCardId: resolvedServerId || serverJobCardId || jobCardData.serverJobCardId || null,
            activityQueue: []
          });
          setLocalDraftsTick(t => t + 1);
        } else {
          removeLocalPendingJobCard(jobCardData.id);
        }
        try {
          const photosNote = omitPhotosOnServer
            ? '\n\nPhotos and voice notes are still loading from the server — other fields were saved. Wait a moment and save again to update attachments.'
            : '';
          alert(
            (normalizedStatus === 'draft' ? 'Draft saved.' : 'Job card saved.') + photosNote
          );
        } catch {
          /* ignore */
        }
      } else {
        const q = [...(jobCardData.activityQueue || [])];
        q.push({
          action: normalizedStatus === 'draft' ? 'draft_saved_local' : 'saved_local_pending_sync',
          metadata: { status: normalizedStatus },
          source: 'mobile'
        });
        upsertLocalPendingJobCard({ ...jobCardData, activityQueue: q });
        setLocalDraftsTick(t => t + 1);
        const hint = lastSyncError ? `\n\nDetails: ${lastSyncError}` : '';
        if (normalizedStatus === 'draft') {
          alert(
            `⚠️ Draft saved on this device only (not synced).${hint}\n\nCheck your connection and open “View or Edit Existing Job Card” to sync later.`
          );
        } else {
          alert(
            `⚠️ Submission saved on this device and queued to sync.${hint}\n\nThis job card stays ${normalizedStatus.toUpperCase()} and can be re-opened from “View or Edit Existing Job Card”.`
          );
        }
      }
      setEditingMeta(null);
      resetForm();
      setPriorListRefreshTick(t => t + 1);
      setWizardFlow('landing');
    } catch (error) {
      console.error('Error saving job card:', error);
      alert(`Failed to save job card: ${error.message}`);
    } finally {
      releaseSaveLock();
    }
  };
  handleSaveRef.current = handleSave;

  const confirmDepartureFromSite = useCallback(
    (departureValue) => {
      const v = String(departureValue || departureConfirmDraft || '').trim();
      if (!v) return;
      setFormData(prev => ({ ...prev, departureFromSite: v }));
      setDepartureConfirmOpen(false);
      setDepartureConfirmPickMode(false);
      pushWizardActivity('job_time_departure_confirmed', { departureFromSite: v });
      const pendingSubmit = pendingSubmitOptionsRef.current;
      queueMicrotask(() => {
        if (pendingSubmit) {
          void handleSaveRef.current?.({ ...pendingSubmit, departureFromSiteOverride: v });
        }
      });
    },
    [departureConfirmDraft, pushWizardActivity]
  );

  const buildWizardPhotosPayload = useCallback(() => {
    const draftSignature =
      (signatureLocked && formData.customerSignature) ||
      exportSignature() ||
      (typeof formData.customerSignature === 'string' ? formData.customerSignature.trim() : '');
    return buildJobCardPhotosPayload({
      formPhotos: formData.photos,
      signatureDataUrl: draftSignature,
      sectionPhotoEntries: SECTION_WORK_MEDIA_KEYS.flatMap(sec =>
        (sectionWorkMedia[sec] || []).map(item => ({
          kind: 'sectionMedia',
          section: sec,
          url: item.url,
          name: item.name || '',
          thumbUrl: item.thumbUrl || ''
        }))
      ),
      voicePhotoEntries: voiceAttachments.map(v => ({
        kind: 'voice',
        section: v.section,
        url: v.dataUrl,
        mimeType: v.mimeType || 'audio/webm'
      }))
    });
  }, [formData, signatureLocked, sectionWorkMedia, voiceAttachments, exportSignature]);

  const persistWizardDraft = useCallback(
    async ({ syncServer = false } = {}) => {
      const nowIso = new Date().toISOString();
      const draftLocalId =
        editingMeta?.localId ?? activeEditCardIdRef.current ?? generateClientDraftId();
      const prevPending = readLocalPendingJobCards().find(
        c => c && String(c.id) === String(draftLocalId)
      );
      const draftSignature =
        (signatureLocked && formData.customerSignature) ||
        exportSignature() ||
        (typeof formData.customerSignature === 'string' ? formData.customerSignature.trim() : '');
      const serverJobCardId =
        editingMeta?.serverJobCardId ||
        (isLikelyServerJobCardId(draftLocalId) ? String(draftLocalId) : null);
      const snapshot = {
        ...formData,
        customerSignature: draftSignature,
        id: draftLocalId,
        startedAt: editingMeta?.startedAt ?? editingMeta?.createdAt ?? nowIso,
        createdAt: editingMeta?.createdAt ?? nowIso,
        updatedAt: nowIso,
        synced: false,
        status: 'draft',
        submittedAt: null,
        completedAt: null,
        jobCardNumber: editingMeta?.jobCardNumber || '',
        serverJobCardId: editingMeta?.serverJobCardId || null,
        useNewJobTimeFlow: Boolean(editingMeta?.useNewJobTimeFlow),
        totalMaterialsCost: totalMaterialCost,
        travelKilometers: Math.max(
          0,
          (parseFloat(formData.kmReadingAfter) || 0) - (parseFloat(formData.kmReadingBefore) || 0)
        ),
        totalTimeMinutes: jobSiteDurationMinutes ?? 0,
        stockUsed: sanitizeJobCardStockUsedForSave(formData.stockUsed),
        photos: buildWizardPhotosPayload(),
        activityQueue: Array.isArray(prevPending?.activityQueue) ? [...prevPending.activityQueue] : []
      };
      upsertLocalPendingJobCard(snapshot);
      setEditingMeta(prev => ({
        localId: prev?.localId ?? draftLocalId,
        serverJobCardId: prev?.serverJobCardId || null,
        startedAt: prev?.startedAt ?? prev?.createdAt ?? nowIso,
        createdAt: prev?.createdAt ?? nowIso,
        synced: false,
        jobCardNumber: prev?.jobCardNumber || ''
      }));
      setLocalDraftsTick(t => t + 1);

      if (!syncServer || !serverJobCardId || !isOnline || !getJobCardAuthToken()) return;

      const payloadObj = { ...snapshot };
      delete payloadObj.activityQueue;
      delete payloadObj.synced;
      delete payloadObj.source;
      delete payloadObj.serverJobCardId;
      delete payloadObj.id;
      if (!photosHydrationCompleteRef.current) {
        delete payloadObj.photos;
      }
      const patchBytes = estimateJsonBytes(payloadObj);
      if (patchBytes > JOB_CARD_SYNC_HARD_PAYLOAD_BYTES) return;

      const token = getJobCardAuthToken();
      try {
        const patchRes = await fetchWithRetry(`/api/jobcards/${encodeURIComponent(serverJobCardId)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payloadObj)
        });
        if (!patchRes.ok) {
          const text = await patchRes.text().catch(() => '');
          console.warn(
            'JobCardFormPublic: background draft PATCH failed',
            patchRes.status,
            text.slice(0, 200)
          );
        }
      } catch (e) {
        console.warn('JobCardFormPublic: background draft PATCH error', e);
      }
    },
    [
      editingMeta,
      formData,
      signatureLocked,
      totalMaterialCost,
      jobSiteDurationMinutes,
      buildWizardPhotosPayload,
      exportSignature,
      isOnline
    ]
  );

  useEffect(() => {
    persistWizardDraftRef.current = persistWizardDraft;
  }, [persistWizardDraft]);

  const validateStep = (stepIndex) =>
    validateWizardStep(stepIndex, formData, {
      useNewJobTimeFlow: editingMeta?.useNewJobTimeFlow,
      arrivalConfirmOpen,
      departureConfirmOpen
    });

  const goToStep = (stepIndex) => {
    if (stepIndex === currentStep) return;
    if (arrivalConfirmOpen || departureConfirmOpen) {
      setStepError('Confirm the date and time to continue.');
      return;
    }
    // Already-submitted cards: allow moving between steps to review (saved data may not re-pass assignment checks).
    if (stepIndex > currentStep && !editingMeta?.synced) {
      const validationError = validateStep(currentStep);
      if (validationError) {
        setStepError(validationError);
        return;
      }
    }
    void persistWizardDraft({ syncServer: Boolean(editingMeta?.serverJobCardId) });
    setStepError('');
    pushWizardActivity('wizard_step_entered', { stepId: STEP_IDS[stepIndex] });
    setCurrentStep(stepIndex);
  };

  const handleNext = () => {
    if (arrivalConfirmOpen || departureConfirmOpen) {
      setStepError('Confirm the date and time to continue.');
      return;
    }
    if (!editingMeta?.synced) {
      const errorMessage = validateStep(currentStep);
      if (errorMessage) {
        setStepError(errorMessage);
        return;
      }
    }
    setStepError('');
    const nextIdx = Math.min(currentStep + 1, STEP_IDS.length - 1);
    if (nextIdx !== currentStep) {
      pushWizardActivity('wizard_step_entered', { stepId: STEP_IDS[nextIdx] });
      void persistWizardDraft({ syncServer: Boolean(editingMeta?.serverJobCardId) });
    }
    setCurrentStep(prev => Math.min(prev + 1, STEP_IDS.length - 1));
  };

  const handlePrevious = () => {
    setStepError('');
    const prevIdx = Math.max(currentStep - 1, 0);
    if (prevIdx !== currentStep) {
      pushWizardActivity('wizard_step_entered', { stepId: STEP_IDS[prevIdx] });
      void persistWizardDraft({ syncServer: Boolean(editingMeta?.serverJobCardId) });
    }
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const renderAssignmentStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Heading</h2>
          <p className="text-sm text-gray-500 mt-1">Add a short free-text heading for this job card.</p>
        </header>
        <div>
          <label htmlFor="jobcard-heading" className="block text-sm font-medium text-gray-700 mb-2">
            Heading
          </label>
          <input
            id="jobcard-heading"
            type="text"
            name="heading"
            value={formData.heading || ''}
            onChange={handleChange}
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            placeholder="Enter heading"
            style={{ fontSize: '16px' }}
          />
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Lead Technician</h2>
          <p className="text-sm text-gray-500 mt-1">Assign the primary technician responsible for this job card.</p>
        </header>
        <div>
          <label htmlFor="lead-technician" className="block text-sm font-medium text-gray-700 mb-2">
            Technician <span className="text-red-500">*</span>
          </label>
          <SearchableSelect
            id="lead-technician"
            name="agentName"
            aria-label="Lead technician"
            value={formData.agentName}
            onChange={v => handleChange({ target: { name: 'agentName', value: v } })}
            options={leadTechnicianOptions}
            placeholder="Tap to choose or search…"
            required
          />
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          <p className="text-sm text-gray-500 mt-1">Add additional technicians assisting on-site.</p>
        </header>
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <label htmlFor="team-technician" className="block text-sm font-medium text-gray-700 mb-2">
                  Team member
                </label>
                <SearchableSelect
                  id="team-technician"
                  aria-label="Team member"
                  value={technicianInput}
                  onChange={v => setTechnicianInput(v)}
                  options={teamTechnicianOptions}
                  placeholder="Search team members…"
                />
              </div>
              <button
                type="button"
                onClick={handleAddTechnician}
                disabled={!technicianInput}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium touch-manipulation"
              >
                <i className="fas fa-plus mr-1"></i>Add
              </button>
            </div>
            {formData.otherTechnicians.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
                {formData.otherTechnicians.map((technician, idx) => (
                  <span key={idx} className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-sm">
                    {technician}
                    <button
                      type="button"
                      onClick={() => handleRemoveTechnician(technician)}
                      className="hover:text-blue-950 ml-1"
                      title="Remove"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Client & Site</h2>
          <p className="text-sm text-gray-500 mt-1">Link this visit to a client and optional customer site.</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client *
            </label>
            <SearchableSelect
              id="jobcard-client"
              name="clientId"
              aria-label="Client"
              value={formData.clientId}
              onChange={v => handleChange({ target: { name: 'clientId', value: v } })}
              options={clientSelectOptions}
              placeholder="Search clients…"
              required
            />
          </div>
          {formData.clientId === NO_CLIENT_ID ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client Name (manual)
                </label>
                <input
                  type="text"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Enter client name"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Site (manual)
                </label>
                <input
                  type="text"
                  name="siteName"
                  value={formData.siteName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Enter site / location"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site
              </label>
              <SearchableSelect
                id="jobcard-site"
                name="siteId"
                aria-label="Site"
                value={formData.siteId}
                onChange={v => handleChange({ target: { name: 'siteId', value: v } })}
                options={siteSelectOptions}
                placeholder={
                  availableSites.length === 0 && formData.clientId && formData.clientId !== NO_CLIENT_ID
                    ? 'No sites for this client'
                    : 'Search sites…'
                }
                disabled={!formData.clientId || formData.clientId === NO_CLIENT_ID || availableSites.length === 0}
              />
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Project Association</h2>
          <p className="text-sm text-gray-500 mt-1">Link this visit to a project (optional).</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project
            </label>
            <SearchableSelect
              id="jobcard-project"
              name="projectId"
              aria-label="Project"
              value={formData.projectId}
              onChange={v => handleChange({ target: { name: 'projectId', value: v } })}
              options={projectSelectOptions}
              placeholder={
                projectSelectOptions.length === 0
                  ? formData.clientId && formData.clientId !== NO_CLIENT_ID
                    ? 'No projects linked to selected client'
                    : 'No projects available'
                  : 'Search projects…'
              }
              disabled={projectSelectOptions.length === 0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Name (manual)
            </label>
            <input
              type="text"
              name="projectName"
              value={formData.projectName}
              onChange={handleChange}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              placeholder="Enter project name if not listed"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </section>
      {renderNavigationButtons({ placement: 'inline' })}
    </div>
  );

  const renderVisitStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Call Out Category</h2>
          <p className="text-sm text-gray-500 mt-1">Choose the type of call-out or visit.</p>
        </header>
        <div>
          <label htmlFor="jobcard-call-out-category" className="block text-sm font-medium text-gray-700 mb-2">
            Call Out Category
          </label>
          <select
            id="jobcard-call-out-category"
            name="callOutCategory"
            value={formData.callOutCategory || ''}
            onChange={handleChange}
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            style={{ fontSize: '16px' }}
          >
            <option value="">Select…</option>
            {JOB_CARD_CALL_OUT_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Visit Details</h2>
          <p className="text-sm text-gray-500 mt-1">Capture the customer location and call-out reason.</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Facility, area or coordinates"
                style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={handleOpenMap}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 touch-manipulation"
                title="Select location on map"
              >
                <i className="fas fa-map-marker-alt"></i>
              </button>
            </div>
            {formData.latitude && formData.longitude && (
              <p className="text-xs text-gray-500 mt-1">
                Coordinates: {formData.latitude}, {formData.longitude}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Call Out / Visit
            </label>
            <VoiceNoteTextarea
              sectionId="reasonForVisit"
              name="reasonForVisit"
              value={formData.reasonForVisit}
              onChange={handleChange}
              rows={3}
              placeholder="Why was the technician requested to attend?"
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'reasonForVisit')}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Job Time</h2>
          {editingMeta?.useNewJobTimeFlow ? (
            <p className="text-sm text-gray-500 mt-1">
              Arrival was set when you opened this job card. Adjust here if needed; departure is recorded on sign-off.
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">
              Arrival on site through departure from site; total is calculated automatically.
            </p>
          )}
        </header>
        {editingMeta?.useNewJobTimeFlow ? (
          <div className="space-y-3">
            {formData.timeOfArrival ? (
              <p className="text-base text-gray-900 font-medium" aria-live="polite">
                Arrived: {formatWizardDatetimeLabel(formData.timeOfArrival)}
              </p>
            ) : (
              <p className="text-sm text-amber-700">Arrival time not set yet.</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Arrival on site
              </label>
              <input
                type="datetime-local"
                name="timeOfArrival"
                value={formData.timeOfArrival}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Arrival on site
              </label>
              <input
                type="datetime-local"
                name="timeOfArrival"
                value={formData.timeOfArrival}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Departure from site
              </label>
              <input
                type="datetime-local"
                name="departureFromSite"
                value={formData.departureFromSite}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total time
              </label>
              <div
                className="w-full px-4 py-3 text-base border border-gray-200 rounded-lg bg-slate-50 text-gray-900"
                style={{ fontSize: '16px' }}
                aria-live="polite"
              >
                {jobSiteDurationLabel || '—'}
              </div>
            </div>
          </div>
        )}
      </section>
      {renderNavigationButtons({ placement: 'inline' })}
    </div>
  );

  const renderWorkStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Diagnosis</h2>
          <p className="text-sm text-gray-500 mt-1">Summarise the fault, findings or observations.</p>
        </header>
        <label className="mb-2 block text-sm font-medium text-gray-700">Diagnosis Notes</label>
            <VoiceNoteTextarea
              sectionId="diagnosis"
              name="diagnosis"
              value={formData.diagnosis}
              onChange={handleChange}
              rows={4}
              placeholder="e.g., Pump not priming due to airlock in suction line..."
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'diagnosis')}
            />
            <WorkSectionMediaAttachments
              sectionKey="diagnosis"
              items={sectionWorkMedia.diagnosis}
              onUpload={handleSectionWorkMediaUpload}
              onRemove={handleRemoveSectionWorkMedia}
              onPreview={setPhotoLightboxUrl}
            />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Work Done / Carried Out</h2>
            <p className="text-sm text-gray-500 mt-1">
              Detail the corrective actions and resolution steps.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            >
              <i className="fa-solid fa-list-check text-xs" />
              <span>Add a Checklist</span>
            </button>
            <p className="text-[11px] text-gray-400 max-w-xs text-right">
              Select a form template created by your admin to complete as part of this job.
            </p>
          </div>
        </header>
        <label className="mb-2 block text-sm font-medium text-gray-700">Work Done / Carried Out Notes</label>
            <VoiceNoteTextarea
              sectionId="actionsTaken"
              name="actionsTaken"
              value={formData.actionsTaken}
              onChange={handleChange}
              rows={4}
              placeholder="Steps taken, parts replaced, calibrations performed..."
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'actionsTaken')}
            />
            <WorkSectionMediaAttachments
              sectionKey="actionsTaken"
              items={sectionWorkMedia.actionsTaken}
              onUpload={handleSectionWorkMediaUpload}
              onRemove={handleRemoveSectionWorkMedia}
              onPreview={setPhotoLightboxUrl}
            />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Future Work</h2>
          <p className="text-sm text-gray-500 mt-1">
            Capture additional work required and schedule the next visit date/time.
          </p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Future Work Required
            </label>
            <VoiceNoteTextarea
              sectionId="futureWorkRequired"
              name="futureWorkRequired"
              value={formData.futureWorkRequired}
              onChange={handleChange}
              rows={3}
              placeholder="Describe remaining tasks, parts to source, or follow-up work needed..."
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'futureWorkRequired')}
            />
            <WorkSectionMediaAttachments
              sectionKey="futureWorkRequired"
              items={sectionWorkMedia.futureWorkRequired}
              onUpload={handleSectionWorkMediaUpload}
              onRemove={handleRemoveSectionWorkMedia}
              onPreview={setPhotoLightboxUrl}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scheduled Follow-up Date & Time
            </label>
            <input
              type="datetime-local"
              name="futureWorkScheduledAt"
              value={formData.futureWorkScheduledAt}
              onChange={handleChange}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Additional Notes</h2>
          <p className="text-sm text-gray-500 mt-1">Capture handover notes, risks or recommended next actions.</p>
        </header>
        <label className="mb-2 block text-sm font-medium text-gray-700">General Notes</label>
        <VoiceNoteTextarea
          sectionId="otherComments"
          name="otherComments"
          value={formData.otherComments}
          onChange={handleChange}
          rows={3}
          placeholder="Outstanding concerns, customer requests, safety notes..."
          onVoiceSaved={addVoiceClip}
          onVoiceClipUpdate={updateVoiceClip}
          voiceClips={voiceAttachments.filter(c => c.section === 'otherComments')}
        />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Photos & video</h2>
            <p className="text-sm text-gray-500 mt-1">Add photos or short videos of the site, fault, or work completed (optional).</p>
          </div>
          {totalPhotoVideoCount > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {totalPhotoVideoCount} attachment{totalPhotoVideoCount === 1 ? '' : 's'}
            </span>
          )}
        </header>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center">
          <input
            type="file"
            id="photoUploadWork"
            onChange={handlePhotoUpload}
            className="hidden"
            accept="image/*,video/*"
            multiple
          />
          <label
            htmlFor="photoUploadWork"
            className="cursor-pointer block"
          >
            <span className="inline-flex items-center justify-center gap-3 text-gray-400 mb-2">
              <i className="fas fa-camera text-3xl sm:text-4xl" />
              <i className="fas fa-video text-2xl sm:text-3xl" />
            </span>
            <p className="text-sm sm:text-base text-gray-600">
              Tap to add photos or videos
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Mobile camera or gallery • Images up to {JOB_CARD_IMAGE_MAX_BYTES / 1024 / 1024}MB • Videos up to {JOB_CARD_VIDEO_MAX_BYTES / 1024 / 1024}MB each
            </p>
          </label>
        </div>
        {selectedPhotos.length > 0 && (
          <>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {visibleSelectedPhotos.map((photo, idx) => (
              <JobCardWizardAttachmentPreview
                key={showAllSelectedPhotos ? idx : `${idx}-${hiddenSelectedPhotosCount}`}
                url={typeof photo === 'string' ? photo : photo.url}
                previewUrl={typeof photo === 'string' ? '' : (photo.previewUrl || photo.thumbUrl || '')}
                safetyCulture={typeof photo === 'object' && photo?.safetyCulture === true}
                mediaId={typeof photo === 'object' ? photo.mediaId : ''}
                token={typeof photo === 'object' ? photo.token : ''}
                mediaType={typeof photo === 'object' ? photo.mediaType : ''}
                issueId={typeof photo === 'object' ? photo.issueId : ''}
                filename={typeof photo === 'object' ? photo.filename : ''}
                index={idx}
                onRemove={handleRemovePhoto}
                onPreview={setPhotoLightboxUrl}
              />
            ))}
          </div>
          {hiddenSelectedPhotosCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllSelectedPhotos(true)}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Load remaining {hiddenSelectedPhotosCount} attachment{hiddenSelectedPhotosCount === 1 ? '' : 's'}
            </button>
          )}
          </>
        )}
      </section>

      {/* Service forms attached to this job card */}
      {Array.isArray(formData.serviceForms) && formData.serviceForms.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
          <header className="mb-4">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <i className="fa-solid fa-list-check text-xs" />
              </span>
              Job Checklists & Forms
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Complete these forms as part of your work documentation.
            </p>
          </header>

          <div className="space-y-4">
            {formData.serviceForms.map((form) => {
              const template = formTemplates.find(t => t.id === form.templateId);
              const fields = Array.isArray(template?.fields) ? template.fields : [];
              const answers = form.answers || {};

              return (
                <div
                  key={form.id}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">
                        {form.templateName || template?.name || 'Form'}
                      </h4>
                      {template?.description && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {template.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveForm(form.id)}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200"
                      aria-label="Remove form"
                    >
                      <i className="fa-solid fa-trash text-xs" />
                    </button>
                  </div>

                  {fields.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      This form has no fields configured.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {fields.map((field, idx) => {
                        const fieldId = field.id || `field_${idx}`;
                        const value = answers[fieldId] ?? '';

                        // Handle conditional visibility
                        if (field.visibilityCondition && field.visibilityCondition.fieldId) {
                          const refValue = String(answers[field.visibilityCondition.fieldId] || '').toLowerCase();
                          const expected = String(field.visibilityCondition.equals || '').toLowerCase();
                          if (!expected || refValue !== expected) {
                            return null;
                          }
                        }

                        const controlId = `${form.id}_${fieldId}`;
                        const selectOptionsFromField = Array.isArray(field.options)
                          ? field.options.filter(Boolean).map(opt => ({ value: opt, label: opt }))
                          : [];

                        return (
                          <div key={fieldId} className="space-y-1">
                            <label
                              htmlFor={controlId}
                              className="flex items-center justify-between gap-2 text-xs font-medium text-gray-700"
                            >
                              <span>{field.label || 'Field'}</span>
                              {field.required && (
                                <span className="text-[10px] font-semibold text-red-600">
                                  Required
                                </span>
                              )}
                            </label>
                            {field.type === 'textarea' ? (
                              <VoiceNoteTextarea
                                sectionId={`form_${form.id}_${fieldId}`}
                                name={fieldId}
                                value={value}
                                onChange={e => handleFormAnswerChange(form.id, fieldId, e.target.value)}
                                rows={3}
                                onVoiceSaved={addVoiceClip}
                                onVoiceClipUpdate={updateVoiceClip}
                                voiceClips={voiceAttachments.filter(
                                  c => c.section === `form_${form.id}_${fieldId}`
                                )}
                              />
                            ) : field.type === 'number' ? (
                              <input
                                type="number"
                                id={controlId}
                                value={value}
                                onChange={e => handleFormAnswerChange(form.id, fieldId, e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            ) : field.type === 'checkbox' ? (
                              <SearchableSelect
                                id={controlId}
                                value={value}
                                onChange={v => handleFormAnswerChange(form.id, fieldId, v)}
                                options={[
                                  { value: 'yes', label: 'Yes' },
                                  { value: 'no', label: 'No' }
                                ]}
                                placeholder="Yes or No…"
                              />
                            ) : field.type === 'select' ? (
                              <SearchableSelect
                                id={controlId}
                                value={value}
                                onChange={v => handleFormAnswerChange(form.id, fieldId, v)}
                                options={selectOptionsFromField}
                                placeholder="Search…"
                              />
                            ) : (
                              <input
                                type="text"
                                id={controlId}
                                value={value}
                                onChange={e => handleFormAnswerChange(form.id, fieldId, e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            )}
                            {field.helpText && (
                              <p className="text-[10px] text-gray-500">
                                {field.helpText}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Template selection modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Select a Form</h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="p-4">
              {loadingTemplates ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Loading forms...</p>
                </div>
              ) : formTemplates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">
                    No form templates available. Ask your admin to create forms in the form builder.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {formTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleAddForm(template.id)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition"
                    >
                      <div className="font-medium text-sm text-gray-900">{template.name}</div>
                      {template.description && (
                        <div className="text-xs text-gray-500 mt-1">{template.description}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        {Array.isArray(template.fields) ? template.fields.length : 0} field{template.fields?.length !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {renderNavigationButtons({ placement: 'inline' })}
    </div>
  );

  const renderStockStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <WizardStepPageHeader stepIndex={STEP_IDS.indexOf('stock')} stepId="stock" />
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Stock Used</h2>
            <p className="text-sm text-gray-500 mt-1">Record components issued from inventory for this job.</p>
          </div>
          {formData.stockUsed.length > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {formData.stockUsed.length} item{formData.stockUsed.length === 1 ? '' : 's'}
            </span>
          )}
        </header>
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Select the <strong>stock location</strong> first (e.g. each bakkie or warehouse). The component list only includes items with <strong>quantity on hand</strong> at that site. Use <strong>Add another stock location</strong> when stock comes from more than one place on the same job.
            </p>
            <div className="space-y-4 mb-3">
              {stockEntryRows.map((entry, entryIndex) => {
                const entrySkuOptions = getStockSkuOptionsForLocation(entry.locationId);
                return (
                  <div
                    key={entry.id}
                    className={
                      entryIndex > 0
                        ? 'pt-3 border-t border-slate-200'
                        : ''
                    }
                  >
                    {stockEntryRows.length > 1 && (
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-600">
                          Stock location {entryIndex + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStockEntryRow(entry.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Remove location
                        </button>
                      </div>
                    )}
                    <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-2">
                      <div className="sm:col-span-4">
                        <SearchableSelect
                          id={`stock-location-${entry.id}`}
                          aria-label="Stock location"
                          value={entry.locationId}
                          onChange={(v) => updateStockEntryRow(entry.id, { locationId: v, sku: '' })}
                          options={stockLocationOptions}
                          placeholder="Select stock location first…"
                          required
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <SearchableSelect
                          id={`stock-sku-${entry.id}`}
                          aria-label="Stock component"
                          value={entry.sku}
                          onChange={(v) => updateStockEntryRow(entry.id, { sku: v })}
                          options={entrySkuOptions}
                          placeholder={
                            entry.locationId
                              ? 'Search component…'
                              : 'Choose location first…'
                          }
                          disabled={!entry.locationId}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={entry.quantity || ''}
                          onChange={(e) =>
                            updateStockEntryRow(entry.id, {
                              quantity: parseFloat(e.target.value) || 0
                            })
                          }
                          placeholder="Qty"
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => handleAddStockItem(entry.id)}
                          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-medium touch-manipulation"
                        >
                          <i className="fas fa-plus mr-1"></i>Add
                        </button>
                      </div>
                    </div>
                    {entry.locationId && entrySkuOptions.length === 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        No on-hand stock at this location
                        {!isOnline ? ' (offline — connect to refresh, or stock may be empty).' : '.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addStockEntryRow}
              className="mb-3 w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 active:bg-blue-200 touch-manipulation"
            >
              <i className="fas fa-map-marker-alt mr-1.5"></i>
              Add another stock location
            </button>
            {formData.stockUsed.length > 0 && (
              <div className="space-y-2">
                {formData.stockUsed.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.itemName}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {item.locationName || 'Location N/A'} • Qty: {item.quantity} • SKU: {item.sku}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStockItem(item.id)}
                  className="ml-3 text-red-600 hover:text-red-800"
                      title="Remove"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
        {formData.stockUsed.length === 0 && (
          <p className="text-sm text-gray-400">No stock usage recorded yet.</p>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Materials Bought</h2>
            <p className="text-sm text-gray-500 mt-1">Capture purchases not taken from stock (cash, card, etc.).</p>
          </div>
          {totalMaterialCost > 0 && (
            <span className="text-sm font-semibold text-blue-600">
              R {totalMaterialCost.toFixed(2)}
            </span>
          )}
        </header>
            <div className="space-y-3 mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newMaterialItem.itemName}
                  onChange={e => setNewMaterialItem({ ...newMaterialItem, itemName: e.target.value })}
                  placeholder="Item Name *"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
                  style={{ fontSize: '16px' }}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={newMaterialItem.cost || ''}
                  onChange={(e) => setNewMaterialItem({ ...newMaterialItem, cost: parseFloat(e.target.value) || 0 })}
                  placeholder="Cost (R) *"
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
              style={{ fontSize: '16px' }}
                />
              </div>
              <input
                type="text"
                value={newMaterialItem.description}
                onChange={e => setNewMaterialItem({ ...newMaterialItem, description: e.target.value })}
                placeholder="Description"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
                style={{ fontSize: '16px' }}
              />
              <input
                type="text"
                value={newMaterialItem.reason}
                onChange={e => setNewMaterialItem({ ...newMaterialItem, reason: e.target.value })}
                placeholder="Reason for purchase"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
                style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={handleAddMaterialItem}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-medium touch-manipulation"
              >
                <i className="fas fa-plus mr-1"></i>Add Material
              </button>
            </div>
        {formData.materialsBought.length > 0 ? (
              <div className="space-y-2">
                {formData.materialsBought.map(item => (
                  <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.itemName}</p>
                        {item.description && (
                          <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                        )}
                        {item.reason && (
                          <p className="text-xs text-gray-500 mt-1">Reason: {item.reason}</p>
                        )}
                        <p className="text-sm font-semibold text-gray-900 mt-2">R {item.cost.toFixed(2)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterialItem(item.id)}
                    className="text-red-600 hover:text-red-800"
                        title="Remove"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  </div>
                ))}
            <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-900">Total Cost</span>
              <span className="text-lg font-bold text-blue-600">R {totalMaterialCost.toFixed(2)}</span>
                  </div>
                </div>
        ) : (
          <p className="text-sm text-gray-400">No ad-hoc purchases recorded yet.</p>
            )}
      </section>
      {renderNavigationButtons({ placement: 'inline' })}
    </div>
  );

  const renderSignoffStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <WizardStepPageHeader stepIndex={STEP_IDS.indexOf('signoff')} stepId="signoff" />
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
            <p className="text-sm text-gray-500 mt-1">Capture supporting photos or videos from site.</p>
          </div>
          {totalPhotoVideoCount > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {totalPhotoVideoCount} attachment{totalPhotoVideoCount === 1 ? '' : 's'}
            </span>
          )}
        </header>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center">
              <input
                type="file"
                id="photoUpload"
                onChange={handlePhotoUpload}
                className="hidden"
                accept="image/*,video/*"
                multiple
              />
              <label
                htmlFor="photoUpload"
                className="cursor-pointer block"
              >
                <span className="inline-flex items-center justify-center gap-3 text-gray-400 mb-2">
                  <i className="fas fa-camera text-3xl sm:text-4xl" />
                  <i className="fas fa-video text-2xl sm:text-3xl" />
                </span>
                <p className="text-sm sm:text-base text-gray-600">
                  Tap to add photos or videos
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Mobile camera or gallery • Images up to {JOB_CARD_IMAGE_MAX_BYTES / 1024 / 1024}MB • Videos up to {JOB_CARD_VIDEO_MAX_BYTES / 1024 / 1024}MB each
                </p>
              </label>
            </div>
            {selectedPhotos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {visibleSelectedPhotos.map((photo, idx) => (
                  <JobCardWizardAttachmentPreview
                    key={showAllSelectedPhotos ? idx : `${idx}-${hiddenSelectedPhotosCount}`}
                    url={typeof photo === 'string' ? photo : photo.url}
                    previewUrl={typeof photo === 'string' ? '' : (photo.previewUrl || photo.thumbUrl || '')}
                    safetyCulture={typeof photo === 'object' && photo?.safetyCulture === true}
                    mediaId={typeof photo === 'object' ? photo.mediaId : ''}
                    token={typeof photo === 'object' ? photo.token : ''}
                    mediaType={typeof photo === 'object' ? photo.mediaType : ''}
                    issueId={typeof photo === 'object' ? photo.issueId : ''}
                    filename={typeof photo === 'object' ? photo.filename : ''}
                    index={idx}
                    onRemove={handleRemovePhoto}
                    onPreview={setPhotoLightboxUrl}
                  />
                ))}
              </div>
            )}
      </section>

      {editingMeta?.useNewJobTimeFlow ? (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">End of job</h2>
            <p className="text-sm text-gray-500 mt-1">
              Select when you left the site. Total time is calculated from your arrival on site.
            </p>
          </header>
          <div className="space-y-4">
            {formData.timeOfArrival ? (
              <p className="text-sm text-gray-600">
                Arrival on site:{' '}
                <span className="font-medium text-gray-900">
                  {formatWizardDatetimeLabel(formData.timeOfArrival)}
                </span>
              </p>
            ) : null}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Departure from site
                <span className="text-red-500"> *</span>
              </label>
              <input
                type="datetime-local"
                name="departureFromSite"
                value={formData.departureFromSite}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
                required
              />
              <button
                type="button"
                onClick={() =>
                  handleChange({
                    target: {
                      name: 'departureFromSite',
                      value: toDatetimeLocalInput(new Date())
                    }
                  })
                }
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Use current time
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total time on job
              </label>
              <div
                className="w-full px-4 py-3 text-base border border-gray-200 rounded-lg bg-slate-50 text-gray-900"
                style={{ fontSize: '16px' }}
                aria-live="polite"
              >
                {jobSiteDurationLabel || '—'}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Customer Acknowledgement</h2>
          <p className="text-sm text-gray-500 mt-1">
            Capture customer details; a signature is required when you set the job status to Completed (choose status below).
          </p>
        </header>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name
              </label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Full name"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position / Title
              </label>
              <input
                type="text"
                name="customerTitle"
                value={formData.customerTitle}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Role at site"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Feedback
            </label>
            <VoiceNoteTextarea
              sectionId="customerFeedback"
              name="customerFeedback"
              value={formData.customerFeedback}
              onChange={handleChange}
              rows={3}
              placeholder="Optional comments from customer"
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'customerFeedback')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sign-off Date
              </label>
              <input
                type="date"
                name="customerSignDate"
                value={formData.customerSignDate}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Status
            </label>
            <SearchableSelect
              id="jobcard-status"
              name="status"
              aria-label="Job status"
              value={formData.status}
              onChange={v => handleChange({ target: { name: 'status', value: v } })}
              options={jobStatusOptions}
              placeholder="Search status…"
            />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Signature
              {formData.status === 'completed' ? (
                <span className="text-red-500"> *</span>
              ) : (
                <span className="text-gray-400 font-normal"> (optional unless Completed)</span>
              )}
            </label>
            <div
              ref={signatureWrapperRef}
              className={[
                'signature-wrapper border-2 rounded-lg overflow-hidden relative bg-white',
                signatureLocked || hasSignature ? 'border-blue-500' : 'border-gray-300'
              ].join(' ')}
            >
              <canvas
                ref={signatureCanvasRef}
                className={[
                  'signature-canvas w-full h-48 touch-none',
                  signatureLocked ? 'pointer-events-none opacity-0' : ''
                ].join(' ')}
                style={{ touchAction: 'none', display: 'block' }}
                onPointerDown={startSignature}
                onPointerMove={drawSignature}
                onPointerUp={endSignature}
                onPointerLeave={endSignature}
                onMouseDown={startSignature}
                onMouseMove={drawSignature}
                onMouseUp={endSignature}
                onMouseLeave={endSignature}
                onTouchStart={startSignature}
                onTouchMove={drawSignature}
                onTouchEnd={endSignature}
                onTouchCancel={endSignature}
              />
              {signatureLocked && formData.customerSignature ? (
                <img
                  src={formData.customerSignature}
                  alt="Saved customer signature"
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                />
              ) : null}
              {!hasSignature && !signatureLocked && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-xs sm:text-sm text-gray-400 text-center px-4">
                    Sign here with finger or stylus
            </p>
          </div>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {signatureLocked ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-emerald-700">
                    <i className="fa-solid fa-lock mr-1" aria-hidden />
                    Signature saved — safe to scroll
                  </span>
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-sm font-medium text-blue-600 hover:text-blue-900"
                  >
                    Clear and re-sign
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    Tap Save after the customer signs so it stays in place.
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={captureSignature}
                      disabled={!hasSignature}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save signature
                    </button>
                    <button
                      type="button"
                      onClick={clearSignature}
                      disabled={!hasSignature}
                      className="text-sm font-medium text-blue-600 hover:text-blue-900 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Submission Summary</h2>
          <p className="text-sm text-gray-500 mt-1">Quick review before submitting this job card.</p>
        </header>
        <div className="space-y-3">
          <SummaryRow label="Heading" value={formData.heading} />
          <SummaryRow label="Technician" value={formData.agentName} />
          <SummaryRow
            label="Recorded as (ERP account)"
            value={getJobCardRecorderDisplayName() || '—'}
          />
          <SummaryRow
            label="Project"
            value={
              formData.projectName ||
              projects.find(p => String(p.id) === String(formData.projectId))?.name
            }
          />
          <SummaryRow label="Client" value={formData.clientName || clients.find(c => c.id === formData.clientId)?.name} />
          <SummaryRow label="Site" value={formData.siteName} />
          {editingMeta?.useNewJobTimeFlow ? (
            <>
              <SummaryRow
                label="Arrival on site"
                value={formData.timeOfArrival ? formatWizardDatetimeLabel(formData.timeOfArrival) : ''}
              />
              <SummaryRow
                label="Departure from site"
                value={
                  formData.departureFromSite
                    ? formatWizardDatetimeLabel(formData.departureFromSite)
                    : ''
                }
              />
              <SummaryRow label="Time on job" value={jobSiteDurationLabel} />
            </>
          ) : (
            <SummaryRow label="Time on job" value={jobSiteDurationLabel} />
          )}
          <SummaryRow label="Stock Lines" value={formData.stockUsed.length > 0 ? `${formData.stockUsed.length}` : ''} />
          <SummaryRow label="Materials Cost" value={totalMaterialCost > 0 ? `R ${totalMaterialCost.toFixed(2)}` : ''} />
          <SummaryRow label="Future Work" value={formData.futureWorkRequired || ''} />
          <SummaryRow label="Follow-up Schedule" value={formData.futureWorkScheduledAt ? new Date(formData.futureWorkScheduledAt).toLocaleString() : ''} />
          <SummaryRow label="Photos / video" value={totalPhotoVideoCount > 0 ? `${totalPhotoVideoCount}` : ''} />
          <SummaryRow
            label="Job status"
            value={jobStatusOptions.find(o => o.value === formData.status)?.label || formData.status}
          />
          <SummaryRow
            label="Customer Signature"
            value={signatureLocked || hasSignature ? 'Captured' : 'Pending'}
          />
        </div>
        <div className="mt-5 pt-5 border-t border-gray-200 space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Stock used</h3>
            {formData.stockUsed.length > 0 ? (
              <ul className="space-y-2">
                {formData.stockUsed.map((item) => (
                  <li
                    key={item.id}
                    className="text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <div className="font-medium">{item.itemName || item.sku || 'Item'}</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      Qty {item.quantity}
                      {item.sku ? ` • SKU ${item.sku}` : ''}
                      {item.locationName ? ` • ${item.locationName}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">None recorded.</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Purchases</h3>
            {formData.materialsBought.length > 0 ? (
              <ul className="space-y-2">
                {formData.materialsBought.map((item) => (
                  <li
                    key={item.id}
                    className="text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <span className="font-medium">{item.itemName || 'Purchase'}</span>
                      <span className="font-semibold text-gray-900 shrink-0">
                        R {(Number(item.cost) || 0).toFixed(2)}
                      </span>
                    </div>
                    {item.description ? (
                      <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                    ) : null}
                    {item.reason ? (
                      <div className="text-xs text-gray-500 mt-0.5">Reason: {item.reason}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">None recorded.</p>
            )}
          </div>
        </div>
      </section>
      {renderNavigationButtons({ placement: 'inline' })}
    </div>
  );

  const renderNavigationButtons = ({ placement = 'inline' } = {}) => {
    const isFooter = placement === 'footer';
    const shellClass = isFooter
      ? 'job-card-wizard-footer xl:hidden flex-shrink-0 border-t border-slate-200/90 bg-white shadow-[0_-4px_24px_rgba(15,23,42,0.12)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
      : 'mt-6 pt-6 border-t border-slate-200/90 bg-white rounded-2xl p-4 sm:p-6 shadow-sm shadow-slate-200/30 ring-1 ring-slate-100 hidden xl:block';
    const stepLabelClass = isFooter
      ? 'text-sm text-slate-600 text-center font-semibold mb-2'
      : 'text-xs text-slate-500 text-center sm:text-left font-medium';
    const btnClass = isFooter
      ? 'min-h-[52px] flex-1 px-3 py-3 text-base font-semibold rounded-xl touch-manipulation'
      : 'min-h-[48px] px-5 py-3 text-sm font-semibold rounded-xl touch-manipulation';
    return (
      <div className={shellClass}>
        <div className={isFooter ? 'max-w-4xl mx-auto' : ''}>
          <div className={isFooter ? '' : 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4'}>
            <div className={stepLabelClass}>
              Step {currentStep + 1} of {STEP_IDS.length}
            </div>
            <div
              className={
                isFooter
                  ? 'flex flex-row flex-wrap gap-2'
                  : 'flex flex-col sm:flex-row gap-3 sm:gap-3'
              }
            >
              <button
                type="button"
                onClick={handlePrevious}
                disabled={currentStep === 0 || isSubmitting}
                className={`${btnClass} border border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isFooter ? 'min-w-[5.5rem]' : ''
                }`}
              >
                Back
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  handleSave({ forceDraft: true });
                }}
                disabled={isSubmitting}
                className={`${btnClass} border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isFooter ? 'min-w-[6.5rem]' : ''
                }`}
              >
                Save draft
              </button>
              {currentStep < STEP_IDS.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isSubmitting}
                  className={`${btnClass} bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-md shadow-blue-900/10 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isFooter ? 'flex-[1.2] min-w-[6rem]' : 'px-6'
                  }`}
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  onClick={(event) => {
                    event.preventDefault();
                    handleSave({ forceSubmitted: true });
                  }}
                  disabled={isSubmitting}
                  className={`${btnClass} bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-md shadow-blue-900/10 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isFooter ? 'flex-[1.2] min-w-[6rem]' : 'px-6'
                  }`}
                >
                  {isSubmitting
                    ? 'Saving...'
                    : formData.status === 'completed'
                      ? 'Save completed job card'
                      : 'Submit job card'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    switch (STEP_IDS[currentStep]) {
      case 'assignment':
        return renderAssignmentStep();
      case 'visit':
        return renderVisitStep();
      case 'work':
        return renderWorkStep();
      case 'stock':
        return renderStockStep();
      case 'signoff':
        return renderSignoffStep();
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-6">
        <div className="text-center rounded-3xl border border-white/10 bg-white/5 px-8 py-10 backdrop-blur-sm max-w-sm w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-white/20 border-t-blue-400 mx-auto mb-5" />
          <p className="text-white font-semibold">Loading Job Card</p>
          <p className="text-slate-400 text-sm mt-2">Preparing your form…</p>
        </div>
      </div>
    );
  }

  if (wizardFlow === 'landing') {
    return (
      <div className="job-card-landing-root min-h-[100dvh] flex flex-col items-center justify-start overflow-y-auto bg-gradient-to-b from-slate-50 via-blue-50/35 to-slate-200/90 text-slate-900 px-4 sm:px-6">
        <div className="w-full max-w-md space-y-8 pb-8">
          {!networkOnline && !getJobCardAuthToken() && (
            <div className="rounded-2xl border border-amber-300/90 bg-amber-50 px-4 py-3.5 text-sm text-amber-950 shadow-sm">
              You are offline and there is no saved sign-in on this device. Connect to the internet and open this page
              once to log in; after that you can keep working offline with your cached account.
            </div>
          )}
          <div className="text-center space-y-4 pt-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-900/25 ring-4 ring-white/80">
              <i className="fa-solid fa-clipboard-check text-2xl" aria-hidden />
            </div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-blue-600/90 font-semibold">
              Field service
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-slate-900 tracking-tight">
              Job cards
            </h1>
            <p className="text-base text-slate-600 max-w-sm mx-auto leading-relaxed">
              Capture visits, stock, and sign-off in one guided flow. Works offline; sync when you are back online.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={startNewJobCard}
              className="w-full rounded-2xl bg-white text-slate-900 px-5 py-5 text-left shadow-md hover:bg-slate-50 transition touch-manipulation border border-slate-200/90"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <i className="fa-solid fa-plus text-xl" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-base sm:text-lg">Create new job card</span>
                  <span className="block text-sm text-slate-600 mt-0.5">
                    Start the guided wizard for a new visit.
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-blue-300 flex-shrink-0" aria-hidden />
              </span>
            </button>
            <button
              type="button"
              onClick={openPriorList}
              className="w-full rounded-2xl bg-white text-slate-900 px-5 py-5 text-left shadow-md hover:bg-slate-50 transition touch-manipulation border border-slate-200/90"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <i className="fa-solid fa-clock-rotate-left text-xl" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-base sm:text-lg">View or Edit Existing Job Card</span>
                  <span className="block text-sm text-slate-600 mt-0.5 leading-snug">
                    Search and filter when signed in; includes drafts not synced on this device.
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-blue-300 flex-shrink-0" aria-hidden />
              </span>
            </button>
            <button
              type="button"
              onClick={openStockTake}
              className="w-full rounded-2xl bg-white text-slate-900 px-5 py-5 text-left shadow-md hover:bg-slate-50 transition touch-manipulation border border-slate-200/90"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <i className="fa-solid fa-clipboard-list text-xl" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-base sm:text-lg">Stock-Take</span>
                  <span className="block text-sm text-slate-600 mt-0.5 leading-snug">
                    Count stock by location on this device, then submit for review and system update.
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-blue-300 flex-shrink-0" aria-hidden />
              </span>
            </button>
            <button
              type="button"
              onClick={openStockTransfer}
              className="w-full rounded-2xl bg-white text-slate-900 px-5 py-5 text-left shadow-md hover:bg-slate-50 transition touch-manipulation border border-slate-200/90"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <i className="fa-solid fa-truck-ramp-box text-xl" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-base sm:text-lg">Transfer stock</span>
                  <span className="block text-sm text-slate-600 mt-0.5 leading-snug">
                    Request stock from another location; source owner approves before stock moves.
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-emerald-300 flex-shrink-0" aria-hidden />
              </span>
            </button>
            <button
              type="button"
              onClick={openIncidentReport}
              className="w-full rounded-2xl bg-white text-slate-900 px-5 py-5 text-left shadow-md hover:bg-slate-50 transition touch-manipulation border border-slate-200/90"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <i className="fa-solid fa-triangle-exclamation text-xl" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-base sm:text-lg">Report incident</span>
                  <span className="block text-sm text-slate-600 mt-0.5 leading-snug">
                    Record a site incident in Service &amp; Maintenance (optional job card link).
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-amber-300 flex-shrink-0" aria-hidden />
              </span>
            </button>
          </div>

          {unsyncedPendingCount > 0 ? (
            <section className="rounded-2xl border border-blue-200/90 bg-blue-50/95 p-4 shadow-sm space-y-2">
              <p className="text-sm font-semibold text-blue-950">
                {pendingAutoSync.running
                  ? 'Syncing job cards to the server…'
                  : `${unsyncedPendingCount} job card${unsyncedPendingCount === 1 ? '' : 's'} waiting to sync`}
              </p>
              <p className="text-xs text-blue-900/90 leading-snug">
                Stock used is recorded in Manufacturing only after the job card reaches the server.
                {pendingAutoSync.synced > 0 && !pendingAutoSync.running
                  ? ` Last sync: ${pendingAutoSync.synced} succeeded${pendingAutoSync.failed ? `, ${pendingAutoSync.failed} failed` : ''}.`
                  : ' We sync automatically when you are online and signed in.'}
              </p>
              <button
                type="button"
                disabled={!isOnline || !getJobCardAuthToken() || pendingAutoSync.running}
                onClick={() => void runAutoSyncPendingJobCards({ silent: false })}
                className="w-full mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-3 py-2.5 text-sm font-semibold text-blue-950 hover:bg-blue-100/80 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pendingAutoSync.running ? (
                  <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                ) : (
                  <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
                )}
                {pendingAutoSync.running ? 'Syncing…' : 'Sync now'}
              </button>
            </section>
          ) : null}

          {!getJobCardAuthToken() ? (
            <section className="rounded-2xl border border-amber-200/90 bg-amber-50/90 p-4 shadow-sm space-y-2">
              <p className="text-sm font-semibold text-amber-950">See all job cards on this phone</p>
              <p className="text-xs text-amber-900/90 leading-snug">
                The public link only remembers cards submitted in this browser until you sign in. Use your ERP login to
                load the full history everywhere, including search and filter by client.
              </p>
              <button
                type="button"
                onClick={goToSignInForJobCardHistory}
                className="w-full mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100/80 touch-manipulation"
              >
                <i className="fa-solid fa-right-to-bracket" aria-hidden />
                Sign in for full history
              </button>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-up calendar</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                Subscribe to an ICS feed for scheduled future-work job card events.
              </p>
              {!getJobCardAuthToken() && (
                <p className="text-[11px] text-amber-700 mt-1">
                  Sign in first to generate a personal calendar URL.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSubscribeCalendar}
                disabled={!getJobCardAuthToken()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-regular fa-calendar-plus" aria-hidden />
                Subscribe calendar
              </button>
              <button
                type="button"
                onClick={handleCopyCalendarLink}
                disabled={!getJobCardAuthToken()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-regular fa-copy" aria-hidden />
                {calendarStatus}
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (wizardFlow === 'prior_list') {
    return (
      <div className="job-card-prior-list min-h-[100dvh] flex flex-col bg-gradient-to-b from-slate-100 via-white to-blue-50/30 relative">
        <header className="flex-shrink-0 bg-gradient-to-br from-blue-700 via-blue-600 to-blue-900 text-white shadow-md px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setWizardFlow('landing')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white mb-3 touch-manipulation"
          >
            <i className="fa-solid fa-arrow-left" aria-hidden />
            Back
          </button>
          <h1 className="text-xl font-bold">Prior job cards</h1>
          <p className="text-sm text-white/80 mt-1">
            {getJobCardAuthToken()
              ? 'Search and filter below, most recently updated first — tap a card to open. Local drafts not yet synced are included.'
              : 'Sign in to load the full server list on any device. Without signing in, only cards submitted from this browser are listed, plus offline drafts on this device.'}
          </p>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 pb-8">
          {!getJobCardAuthToken() ? (
            <div className="max-w-2xl mx-auto mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
              <p className="text-sm font-semibold">No server history on this device yet?</p>
              <p className="text-xs mt-1 text-amber-900/90 leading-snug">
                Sign in once with your ERP account to load every submitted job card and use search and client filter.
              </p>
              <button
                type="button"
                onClick={goToSignInForJobCardHistory}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-100 border border-amber-300 px-3 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-200/80 touch-manipulation"
              >
                <i className="fa-solid fa-right-to-bracket" aria-hidden />
                Sign in for full history
              </button>
            </div>
          ) : null}
          {getJobCardAuthToken() ? (
            <div className="max-w-2xl mx-auto mb-4 space-y-3">
              <div>
                <label htmlFor="jobcard-prior-search" className="block text-xs font-semibold text-gray-600 mb-1">
                  Search
                </label>
                <input
                  id="jobcard-prior-search"
                  type="search"
                  autoComplete="off"
                  placeholder="Search everything: client, site, notes, stock, materials, vehicle…"
                  value={priorSearchInput}
                  onChange={e => setPriorSearchInput(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
              </div>
              <div>
                <label htmlFor="jobcard-prior-client" className="block text-xs font-semibold text-gray-600 mb-1">
                  Client
                </label>
                <select
                  id="jobcard-prior-client"
                  value={priorClientId}
                  onChange={e => setPriorClientId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                >
                  <option value="">All clients</option>
                  {priorClientSelectOptions.map(c => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {c.name || c.companyName || c.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="jobcard-prior-site" className="block text-xs font-semibold text-gray-600 mb-1">
                  Site
                </label>
                <select
                  id="jobcard-prior-site"
                  value={priorSiteName}
                  onChange={e => setPriorSiteName(e.target.value)}
                  disabled={!priorClientId}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  <option value="">{priorClientId ? 'All sites' : 'Select client first'}</option>
                  {priorSiteSelectOptions.map(site => (
                    <option key={site} value={site}>
                      {site}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="jobcard-prior-technician" className="block text-xs font-semibold text-gray-600 mb-1">
                  Technician
                </label>
                <select
                  id="jobcard-prior-technician"
                  value={priorTechnician}
                  onChange={e => setPriorTechnician(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                >
                  <option value="">All technicians</option>
                  {priorTechnicianSelectOptions.map(tech => (
                    <option key={tech} value={tech}>
                      {tech}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          {mergedPriorJobCards.length === 0 && !serverPriorLoading ? (
            <div className="max-w-lg mx-auto mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600 shadow-sm">
              <i className="fa-regular fa-folder-open text-3xl text-gray-400 mb-3" aria-hidden />
              <p className="font-medium text-gray-800">No job cards to show</p>
              <p className="text-sm mt-2">
                Sign in to load job cards from the server, submit one from this browser, or save a card while offline
                — not synced drafts appear here from this device.
              </p>
              <button
                type="button"
                onClick={startNewJobCard}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 touch-manipulation"
              >
                Create new job card
              </button>
            </div>
          ) : mergedPriorJobCards.length === 0 && serverPriorLoading ? (
            <div className="max-w-lg mx-auto mt-12 flex flex-col items-center text-gray-500">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl mb-3 text-blue-500" aria-hidden />
              <p className="text-sm font-medium">Loading job cards…</p>
            </div>
          ) : (
            <ul className="max-w-2xl mx-auto space-y-2">
              {mergedPriorJobCards.map(jc => {
                const whenUpdated = jc.updatedAt || jc.createdAt;
                const whenCreated = jc.createdAt;
                const whenLabel = whenUpdated
                  ? new Date(whenUpdated).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })
                  : '';
                const showUpdatedHint =
                  whenUpdated &&
                  whenCreated &&
                  new Date(whenUpdated).getTime() > new Date(whenCreated).getTime() + 60_000;
                const num = jc.jobCardNumber || (jc.clientName ? 'Job card' : 'Job card draft');
                const headingLabel = String(
                  jc.heading || parseHeadingFromComments(jc.otherComments || '')
                ).trim();
                const headingShort = abbreviateHeading(headingLabel);
                const clientLine = (jc.clientName && String(jc.clientName).trim()) || '—';
                const isLocalPending = jc.source === 'local' || jc.synced === false;
                const isSyncingThisCard = syncingPriorCardId && String(syncingPriorCardId) === String(jc.id);
                const syncDisabled = !isOnline || Boolean(isSyncingThisCard);
                const syncTitle = !isOnline
                  ? 'Connect to internet to sync'
                  : isSyncingThisCard
                    ? 'Syncing…'
                    : 'Sync now';
                const canDeleteLocalDraft =
                  isLocalPending && String(jc.status || 'draft').trim().toLowerCase() === 'draft';
                return (
                  <li key={`${jc.source || 'local'}-${getPriorCardOpenId(jc) || String(jc.id ?? 'row')}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleSelectPriorCard(jc);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleSelectPriorCard(jc);
                        }
                      }}
                      className="w-full text-left rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-blue-300 hover:shadow-md transition touch-manipulation cursor-pointer relative z-[1] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate">
                            {num}
                            {headingShort ? (
                              <span className="ml-2 font-medium text-gray-500">- {headingShort}</span>
                            ) : null}
                          </p>
                          <p className="text-sm text-gray-700 mt-1 leading-snug">
                            <span className="text-gray-500">Client</span>{' '}
                            <span className="text-gray-900">{clientLine}</span>
                          </p>
                          {whenLabel && (
                            <p className="text-xs text-gray-500 mt-1.5">
                              {showUpdatedHint ? 'Updated ' : ''}
                              {whenLabel}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {canDeleteLocalDraft ? (
                            <button
                              type="button"
                              aria-label="Delete local draft"
                              title="Delete local draft"
                              onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteLocalDraft(jc);
                              }}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 touch-manipulation"
                            >
                              <i className="fa-regular fa-trash-can text-xs" aria-hidden />
                            </button>
                          ) : null}
                          {isLocalPending ? (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleSyncLocalPendingCard(jc);
                                }}
                                disabled={syncDisabled}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide touch-manipulation ${
                                  syncDisabled
                                    ? 'border-blue-100 bg-blue-50 text-blue-400 cursor-not-allowed'
                                    : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                }`}
                                aria-label={!isOnline ? 'Connect to internet to sync' : isSyncingThisCard ? 'Syncing job card' : 'Sync this job card'}
                                title={syncTitle}
                              >
                                {isSyncingThisCard ? (
                                  <i className="fa-solid fa-circle-notch fa-spin text-[10px]" aria-hidden />
                                ) : (
                                  <i className="fa-solid fa-rotate text-[10px]" aria-hidden />
                                )}
                                {!isOnline ? 'Offline' : isSyncingThisCard ? 'Syncing' : 'Sync'}
                              </button>
                              {!isOnline ? (
                                <span className="text-[10px] text-gray-500">Connect to internet to sync</span>
                              ) : null}
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                                Not synced
                              </span>
                            </div>
                          ) : jc.synced ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              Server
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                              Draft
                            </span>
                          )}
                          <i className="fa-solid fa-chevron-right text-gray-400 mt-1" aria-hidden />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {openingJobCard ? (
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/45 px-6"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="rounded-2xl bg-white px-8 py-7 shadow-2xl flex flex-col items-center gap-4 max-w-sm text-center">
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-blue-600" aria-hidden />
              <div>
                <p className="font-semibold text-gray-900">Opening job card…</p>
                <p className="text-sm text-gray-600 mt-1">Loading details and attachments</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (wizardFlow === 'stock_transfer') {
    if (window.StockTransferRequestField) {
      return (
        <window.StockTransferRequestField
          stockLocations={stockLocations}
          inventory={inventory}
          getAuthToken={getJobCardAuthToken}
          onBack={() => setWizardFlow('landing')}
        />
      );
    }
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-slate-500">
        Loading transfer stock…
      </div>
    );
  }

  if (wizardFlow === 'stock_take') {
    const countedExistingLines = (stockTakeRows || []).filter((row) => {
      const sku = String(row?.sku || '').trim();
      return sku && stockTakeCounts[sku] !== undefined && stockTakeCounts[sku] !== '';
    }).length;
    const countedLines = countedExistingLines + stockTakeNewItems.length;
    const stockTakeScanFabDisabled =
      !stockTakeLocationId || stockTakeRows.length === 0 || stockTakeScanOpen;
    const stockTakeScanFabNode = (
      <button
        type="button"
        onClick={() => {
          setStockTakeError('');
          setStockTakeScanOpen(true);
        }}
        disabled={stockTakeScanFabDisabled}
        title={
          stockTakeScanFabDisabled && !stockTakeScanOpen
            ? !stockTakeLocationId
              ? 'Select a stock location first'
              : 'No stock lines for this location'
            : undefined
        }
        aria-label="Scan inventory QR code"
        className="job-card-stock-take-scan-fab pointer-events-auto fixed left-3 sm:left-auto sm:right-4 inline-flex items-center gap-1.5 rounded-full border border-blue-700 bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-900/30 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        style={{
          // Keep FAB above bottom action row on narrow phones.
          bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))',
          zIndex: 1200
        }}
      >
        <i className="fa-solid fa-camera text-sm" aria-hidden />
        Scan QR
      </button>
    );
    const canPortalStockTakeFab =
      typeof document !== 'undefined' &&
      window.ReactDOM &&
      typeof window.ReactDOM.createPortal === 'function';
    const stockTakeScanFabRendered = canPortalStockTakeFab
      ? window.ReactDOM.createPortal(stockTakeScanFabNode, document.body)
      : stockTakeScanFabNode;

    return (
      <div className="job-card-stock-take min-h-[100dvh] flex flex-col bg-gradient-to-b from-slate-100 via-white to-blue-50/30 relative">
        <header className="flex-shrink-0 bg-gradient-to-br from-blue-700 via-blue-600 to-blue-900 text-white shadow-md px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setWizardFlow('landing')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white mb-3 touch-manipulation"
          >
            <i className="fa-solid fa-arrow-left" aria-hidden />
            Back
          </button>
          <h1 className="text-xl font-bold">Stock-Take</h1>
          <p className="text-sm text-white/80 mt-1">
            Save your progress to finish later, then submit for admin review when ready.
          </p>
          {getJobCardRecorderDisplayName() ? (
            <p className="text-xs text-white/70 mt-2">
              Counting as <span className="font-semibold text-white">{getJobCardRecorderDisplayName()}</span>
            </p>
          ) : null}
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 pb-24 sm:pb-28">
          <div className="max-w-3xl mx-auto space-y-4">
            {getJobCardAuthToken() && (stockTakeSavedLoading || stockTakeSavedSessions.length > 0) ? (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-gray-900">Your saved stocktakes</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Tap to resume, or use the delete button to remove a saved count.
                </p>
                {stockTakeSavedLoading ? (
                  <p className="text-xs text-gray-500 mt-2">Loading…</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {stockTakeSavedSessions.map((s) => {
                      const parsed = splitStockTakeNotes(s.notes || '');
                      const title = parsed.description || s.submissionRef || s.id;
                      const when = s.updatedAt || s.startedAt || s.createdAt;
                      const whenLabel = when ? new Date(when).toLocaleString() : '';
                      const locLabel = s.locationName || s.locationCode || 'Location';
                      const isActive = stockTakeSessionId === s.id;
                      const isDeleting = stockTakeDeletingId === s.id;
                      return (
                        <li key={s.id} className="flex gap-2 items-stretch">
                          <button
                            type="button"
                            disabled={stockTakeSaving || isActive || isDeleting}
                            onClick={() => void resumeSavedStockTake(s.id)}
                            className={
                              'flex-1 min-w-0 text-left rounded-lg border px-3 py-2.5 touch-manipulation ' +
                              (isActive
                                ? 'border-blue-400 bg-blue-50'
                                : 'border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300')
                            }
                          >
                            <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
                            <p className="text-[11px] text-gray-600 mt-0.5">
                              {locLabel}
                              {s.submittedBy ? ` · ${s.submittedBy}` : ''}
                              {whenLabel ? ` · ${whenLabel}` : ''}
                            </p>
                          </button>
                          <button
                            type="button"
                            disabled={stockTakeSaving || isDeleting}
                            onClick={(e) => void deleteSavedStockTake(s.id, e)}
                            aria-label={`Delete saved stocktake ${title}`}
                            title="Delete saved stocktake"
                            className="shrink-0 inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-red-700 hover:bg-red-100 disabled:opacity-50 touch-manipulation"
                          >
                            {isDeleting ? (
                              <i className="fa-solid fa-circle-notch fa-spin text-sm" aria-hidden />
                            ) : (
                              <i className="fa-solid fa-trash text-sm" aria-hidden />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <label htmlFor="stock-take-description" className="block text-xs font-semibold text-gray-600 mb-1">
                Description (month and day)
              </label>
              <input
                id="stock-take-description"
                type="text"
                value={stockTakeDescription}
                onChange={(e) => setStockTakeDescription(e.target.value)}
                placeholder={defaultStockTakeDescription()}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
              />
              <button
                type="button"
                onClick={() => setStockTakeDescription(defaultStockTakeDescription())}
                className="mt-1.5 text-xs font-semibold text-blue-700 underline touch-manipulation"
              >
                Use today&apos;s date
              </button>
              <label htmlFor="stock-take-location" className="block text-xs font-semibold text-gray-600 mt-3 mb-1">
                Stock location
              </label>
              <select
                id="stock-take-location"
                value={stockTakeLocationId}
                disabled={!!stockTakeSessionId}
                onChange={(e) => {
                  setStockTakeLocationId(e.target.value);
                  setStockTakeCounts({});
                  setStockTakeLineSearch('');
                  setStockTakePage(1);
                  setStockTakeShowNewItemForm(false);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
              >
                <option value="">Select location</option>
                {stockLocationOptions.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
              <label htmlFor="stock-take-notes" className="block text-xs font-semibold text-gray-600 mt-3 mb-1">
                Additional notes for reviewer (optional)
              </label>
              <textarea
                id="stock-take-notes"
                rows={2}
                value={stockTakeNotes}
                onChange={(e) => setStockTakeNotes(e.target.value)}
                placeholder="Anything else the reviewer should know..."
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
              />
              <div className="mt-3 rounded-lg border border-dashed border-blue-200 bg-blue-50/70 p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-900">Shared count (optional)</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <input
                    type="text"
                    placeholder="Paste session ID to join"
                    value={stockTakeJoinInput}
                    onChange={(e) => setStockTakeJoinInput(e.target.value)}
                    disabled={!!stockTakeSessionId}
                    className="flex-1 min-w-[200px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => void joinJobCardStockTakeSession()}
                    disabled={stockTakeSubmitting || !!stockTakeSessionId}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-manipulation"
                  >
                    Join
                  </button>
                </div>
                {stockTakeLocationId && !stockTakeSessionId ? (
                  <button
                    type="button"
                    onClick={() => void startJobCardStockTakeSession()}
                    disabled={stockTakeSubmitting}
                    className="text-sm font-semibold text-blue-800 underline disabled:opacity-50 touch-manipulation"
                  >
                    Start shared session for this location
                  </button>
                ) : null}
                {stockTakeSessionId ? (
                  <p className="text-[11px] text-blue-900 break-all">
                    Live session{' '}
                    <span className="font-mono" title={stockTakeSessionId}>
                      {stockTakeSessionId}
                    </span>
                    {' · rev '}
                    {stockTakeSessionRevision}
                  </p>
                ) : null}
              </div>
              {stockTakeLocationId ? (
                <p className="text-[11px] text-amber-700 mt-2">
                  New items can be added below with full details and will require admin confirmation before final apply.
                </p>
              ) : null}
            </div>

            {stockTakeLocationId ? (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Stock lines</p>
                    {stockTakeLineCount > 0 ? (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {stockTakeAvailabilityFilter !== 'all' || stockTakeLineSearch.trim()
                          ? `${stockTakeLineCount} ${stockTakeAvailabilityFilter !== 'all' ? stockTakeAvailabilityFilterLabel.toLowerCase() + ' · ' : ''}${
                              stockTakeLineSearch.trim() ? 'matching · ' : ''
                            }of ${stockTakeAllLineCount} lines`
                          : `${stockTakeLineCount} line${stockTakeLineCount === 1 ? '' : 's'}`}
                        {stockTakeTotalPages > 1
                          ? ` · Page ${stockTakePage} of ${stockTakeTotalPages} (${STOCK_TAKE_PAGE_SIZE} per page)`
                          : ''}
                      </p>
                    ) : stockTakeAllLineCount > 0 ? (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {stockTakeLineSearch.trim()
                          ? 'No lines match your search.'
                          : stockTakeAvailabilityEmptyMessage(stockTakeAvailabilityFilter)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-600">{countedLines} counted</p>
                    <button
                      type="button"
                      onClick={() => setStockTakeShowNewItemForm((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 touch-manipulation"
                    >
                      <i className="fas fa-plus" aria-hidden />
                      {stockTakeShowNewItemForm ? 'Hide new item' : 'Add new item'}
                    </button>
                  </div>
                </div>
                {stockTakeRows.length > 0 ? (
                  <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 space-y-2">
                    <StockTakeAvailabilityFilter
                      value={stockTakeAvailabilityFilter}
                      onChange={setStockTakeAvailabilityFilter}
                    />
                    <label htmlFor="stock-take-line-search" className="sr-only">
                      Search stock lines
                    </label>
                    <input
                      id="stock-take-line-search"
                      type="search"
                      autoComplete="off"
                      value={stockTakeLineSearch}
                      onChange={(e) => setStockTakeLineSearch(e.target.value)}
                      placeholder="Search by name or SKU…"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                    />
                  </div>
                ) : null}
                {stockTakeRows.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">No stock lines found for this location.</div>
                ) : stockTakeFilteredRows.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    {stockTakeLineSearch.trim()
                      ? 'No lines match your search.'
                      : stockTakeAvailabilityEmptyMessage(stockTakeAvailabilityFilter)}
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-gray-100">
                      {stockTakePagedRows.map((row, idx) => {
                        const sku = String(row?.sku || '').trim();
                        const lineNo = (stockTakePage - 1) * STOCK_TAKE_PAGE_SIZE + idx + 1;
                        return (
                          <div
                            key={`${stockTakeLocationId}-${sku}`}
                            className={`px-3 py-2 grid grid-cols-[2.5rem_minmax(0,1fr)_5.25rem] sm:grid-cols-12 gap-2 items-center overflow-hidden transition-shadow ${
                              stockTakeHighlightSku === sku ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/60' : ''
                            }`}
                          >
                            <div className="hidden sm:col-span-1 sm:flex items-center justify-start sm:justify-center shrink-0">
                              <span className="text-xs font-semibold text-gray-500 tabular-nums w-8 text-center">
                                {lineNo}
                              </span>
                            </div>
                            <div className="sm:col-span-1 flex items-center justify-center shrink-0">
                              <StockTakeLineThumbnail
                                src={resolveStockTakeThumbnail(row)}
                                alt={row?.name || sku}
                              />
                            </div>
                            <div className="min-w-0 max-w-full overflow-hidden sm:col-span-5">
                              <p
                                className="text-xs sm:text-sm font-semibold text-gray-900 leading-tight whitespace-normal break-words"
                                style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                              >
                                <span className="inline sm:hidden text-gray-500 mr-1">#{lineNo}</span>
                                {row?.name || sku}
                              </p>
                              {sku ? (
                                <p
                                  className="text-[10px] sm:text-[11px] text-gray-500 leading-tight whitespace-normal break-words"
                                  style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                                >
                                  {sku}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex justify-end sm:col-span-5 sm:justify-end">
                              <input
                                id={'jc-st-qty-' + encodeURIComponent(sku)}
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                value={stockTakeCounts[sku] ?? ''}
                                onFocus={() => {
                                  stockTakeLocalEditSkusRef.current.add(sku);
                                }}
                                onBlur={() => {
                                  window.setTimeout(() => {
                                    stockTakeLocalEditSkusRef.current.delete(sku);
                                  }, 400);
                                }}
                                onChange={(e) => {
                                  const nextValue = e.target.value;
                                  setStockTakeCounts((prev) => ({ ...prev, [sku]: nextValue }));
                                  if (stockTakeSessionId) {
                                    stockTakeDirtySkusRef.current.add(sku);
                                    scheduleStockTakeSessionPatch();
                                  }
                                }}
                                placeholder="Qty"
                                className="w-full max-w-[5.25rem] rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {stockTakeTotalPages > 1 ? (
                      <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-gray-50/80">
                        <p className="text-[11px] text-gray-600">
                          Showing {(stockTakePage - 1) * STOCK_TAKE_PAGE_SIZE + 1}–
                          {Math.min(stockTakePage * STOCK_TAKE_PAGE_SIZE, stockTakeLineCount)} of {stockTakeLineCount}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setStockTakePage((p) => Math.max(1, p - 1))}
                            disabled={stockTakePage <= 1}
                            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 touch-manipulation"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            onClick={() => setStockTakePage((p) => Math.min(stockTakeTotalPages, p + 1))}
                            disabled={stockTakePage >= stockTakeTotalPages}
                            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 touch-manipulation"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {stockTakeLocationId && stockTakeShowNewItemForm ? (
              <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4">
              <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Add new item (admin confirmation)</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{stockTakeNewItems.length} added</span>
                  <button
                    type="button"
                    onClick={() => setStockTakeShowNewItemForm(false)}
                    className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 touch-manipulation"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Item name *"
                  value={stockTakeDraftNewItem.itemName}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, itemName: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="text"
                  placeholder="SKU (optional)"
                  value={stockTakeDraftNewItem.sku}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, sku: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="text"
                  placeholder="Unit (e.g. pcs)"
                  value={stockTakeDraftNewItem.unit}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, unit: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Counted qty *"
                  value={stockTakeDraftNewItem.countedQty}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, countedQty: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="text"
                  placeholder="Category"
                  value={stockTakeDraftNewItem.category}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, category: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="text"
                  placeholder="Type"
                  value={stockTakeDraftNewItem.type}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, type: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Unit cost"
                  value={stockTakeDraftNewItem.unitCost}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, unitCost: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Reorder point"
                  value={stockTakeDraftNewItem.reorderPoint}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, reorderPoint: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="text"
                  placeholder="Supplier"
                  value={stockTakeDraftNewItem.supplier}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, supplier: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="text"
                  placeholder="Supplier part number"
                  value={stockTakeDraftNewItem.supplierPartNumber}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, supplierPartNumber: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="text"
                  placeholder="Manufacturing part number"
                  value={stockTakeDraftNewItem.manufacturingPartNumber}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, manufacturingPartNumber: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
                <input
                  type="text"
                  placeholder="Box number"
                  value={stockTakeDraftNewItem.boxNumber}
                  onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, boxNumber: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
              </div>
              <textarea
                rows={2}
                placeholder="Notes for admin confirmation"
                value={stockTakeDraftNewItem.notes}
                onChange={(e) => setStockTakeDraftNewItem((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const itemName = String(stockTakeDraftNewItem.itemName || '').trim();
                    const countedQty = Number(stockTakeDraftNewItem.countedQty);
                    if (!itemName || !Number.isFinite(countedQty)) {
                      setStockTakeError('New item needs item name and counted qty.');
                      return;
                    }
                    setStockTakeError('');
                    setStockTakeNewItems((prev) => [...prev, { ...stockTakeDraftNewItem, itemName, countedQty }]);
                    setStockTakeDraftNewItem({
                      itemName: '',
                      sku: '',
                      unit: 'pcs',
                      category: 'components',
                      type: 'raw_material',
                      unitCost: '',
                      reorderPoint: '',
                      supplier: '',
                      supplierPartNumber: '',
                      manufacturingPartNumber: '',
                      boxNumber: '',
                      countedQty: '',
                      notes: ''
                    });
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 touch-manipulation"
                >
                  Add new item
                </button>
              </div>
              {stockTakeNewItems.length > 0 ? (
                <ul className="space-y-2">
                  {stockTakeNewItems.map((item, idx) => (
                    <li key={`stk-new-${idx}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-amber-900">{item.itemName}</p>
                          <p className="text-xs text-amber-800">
                            Qty {Number(item.countedQty)} · Unit {item.unit || 'pcs'} · SKU {item.sku || 'auto-generated'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setStockTakeNewItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-xs font-semibold text-amber-900 underline"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              </div>
              </div>
            ) : null}

            {stockTakeError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-2">
                {stockTakeError}
              </div>
            ) : null}
            {stockTakeStatus ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-4 py-2">
                {stockTakeStatus}
              </div>
            ) : null}
            {stockTakeDraftNotice ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-2">
                {stockTakeDraftNotice}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 pb-20 sm:pb-0">
              <button
                type="button"
                onClick={() => void saveStockTakeForLater()}
                disabled={!stockTakeLocationId || stockTakeSaving || stockTakeSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              >
                <i className="fa-solid fa-floppy-disk" aria-hidden />
                {stockTakeSaving ? 'Saving…' : 'Save for later'}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWizardFlow('landing')}
                  className="flex-1 inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!stockTakeLocationId) {
                      setStockTakeError('Select a stock location first.');
                      return;
                    }
                    if (!String(stockTakeDescription || '').trim()) {
                      setStockTakeError('Enter a description for this stocktake.');
                      return;
                    }
                    setStockTakeError('');
                    setStockTakeSubmitConfirmOpen(true);
                  }}
                  disabled={!stockTakeLocationId || stockTakeSubmitting}
                  className="flex-1 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  {stockTakeSubmitting ? 'Submitting...' : 'Submit stock take'}
                </button>
              </div>
            </div>

            {stockTakeSubmitConfirmOpen ? (
              <div
                className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="stock-take-submit-confirm-title"
              >
                <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl space-y-4">
                  <h2 id="stock-take-submit-confirm-title" className="text-base font-semibold text-gray-900">
                    Submit stock take?
                  </h2>
                  <p className="text-sm text-gray-600">
                    Are you sure you want to submit the stock take? After submission it goes for admin review and you
                    cannot edit counts here.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStockTakeSubmitConfirmOpen(false)}
                      disabled={stockTakeSubmitting}
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 touch-manipulation"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitStockTake()}
                      disabled={stockTakeSubmitting}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-manipulation"
                    >
                      {stockTakeSubmitting ? 'Submitting…' : 'Yes, submit'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {stockTakeScanOpen ? (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
                <div className="bg-white rounded-xl max-w-md w-full p-4 shadow-xl space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Scan inventory QR</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Point the camera at the label. The matching line opens and the quantity field is focused so you can enter the count.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStockTakeScanOpen(false)}
                      className="text-gray-500 hover:text-gray-800 p-1"
                      aria-label="Close scanner"
                    >
                      <i className="fa-solid fa-xmark text-lg" />
                    </button>
                  </div>
                  <video
                    ref={stockTakeScanVideoRef}
                    className="w-full rounded-lg bg-black max-h-[48vh] object-cover"
                    playsInline
                    muted
                    autoPlay
                  />
                  <canvas ref={stockTakeScanCanvasRef} className="hidden" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setStockTakeScanOpen(false)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 touch-manipulation"
                  >
                    Close camera
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {stockTakeScanFabRendered}
      </div>
    );
  }

  return (
    <div className="job-card-public-wrapper fixed inset-0 flex flex-col xl:flex-row bg-gradient-to-br from-slate-100 via-white to-blue-50/30 overflow-hidden">
      {/* Desktop Sidebar - Vertical Steps */}
      <aside className="hidden xl:flex xl:flex-col xl:w-56 flex-shrink-0 bg-gradient-to-br from-blue-700 via-blue-600 to-blue-900 text-white shadow-xl z-10 overflow-y-auto overflow-x-hidden">
        <div className="p-4 pb-2 border-b border-white/20">
          <p className="text-[10px] uppercase tracking-wide text-white/75 font-semibold mb-1">
            Field service
          </p>
          <h1
            className="jobcard-app-title text-lg font-bold leading-tight text-white !text-white"
            style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
          >
            Job cards
          </h1>
          {editingMeta && (
            <p className="text-xs text-amber-100 mt-1.5 font-medium">
              Editing {editingMeta.jobCardNumber || 'saved draft'}
              {formData.heading ? ` - ${formData.heading}` : ''}
              {editingMeta.synced ? ' (already submitted)' : ''}
            </p>
          )}
          {getJobCardRecorderDisplayName() ? (
            <p className="text-[11px] text-white/95 mt-2 rounded-lg bg-black/15 px-2 py-1.5 border border-white/10">
              <span className="font-semibold text-white/80">You are signed in as</span>{' '}
              {getJobCardRecorderDisplayName()}
              <span className="block text-[10px] text-white/70 mt-0.5 font-normal">
                This is who will appear as &quot;Recorded by&quot; on the job card in the ERP.
              </span>
            </p>
          ) : null}
          <p className="text-xs text-white/85 mt-2 leading-relaxed">
            Guided steps for visits, stock, and sign-off — works offline, syncs when online.
          </p>
          <button
            type="button"
            onClick={exitToMenu}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 transition touch-manipulation"
          >
            <i className="fa-solid fa-house text-[11px]" aria-hidden />
            Back to menu
          </button>
        </div>
        <div className="flex-1 p-4 space-y-2">
          {STEP_IDS.map((stepId, idx) => (
            <StepBadge
              key={`desktop-${stepId}`}
              index={idx}
              stepId={stepId}
              active={idx === currentStep}
              complete={idx < currentStep}
              onClick={() => goToStep(idx)}
              className="w-full"
            />
          ))}
        </div>
        <div className="p-4 pt-2 border-t border-white/20 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-white/70">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span
              className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold ${
                isOnline ? 'bg-white/15 text-white' : 'bg-amber-200/90 text-amber-900'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500 animate-pulse'
                }`}
              ></span>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <button
              type="button"
              onClick={handleShareLink}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 transition"
            >
              <i className="fa-regular fa-share-from-square text-xs"></i>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile: full step ribbon always visible; stays above scrolling form (flex + CSS) */}
      <header className="job-card-mobile-wizard-ribbon xl:hidden flex-shrink-0 relative z-20 overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-blue-900 text-white shadow-sm border-b border-blue-900/20">
        <div className="relative px-3 py-2">
          <div className="max-w-4xl mx-auto space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="jobcard-app-title text-base font-bold leading-tight text-white truncate">
                  Job cards
                  {editingMeta?.jobCardNumber ? (
                    <span className="font-normal text-amber-100/95">
                      {' '}
                      · {editingMeta.jobCardNumber}
                      {formData.heading ? ` - ${formData.heading}` : ''}
                    </span>
                  ) : null}
                </h1>
              </div>
              <div className="job-card-header-toolbar relative z-10 inline-flex flex-nowrap items-center gap-0.5 shrink-0">
                <span
                  className={`job-card-online-badge inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold leading-none whitespace-nowrap ${
                    isOnline ? 'bg-white/15 text-white' : 'bg-amber-200/90 text-amber-900'
                  }`}
                >
                  <span
                    className={`h-1 w-1 flex-shrink-0 rounded-full ${
                      isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  {isOnline ? 'On' : 'Off'}
                </span>
                <button
                  type="button"
                  onClick={handleShareLink}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 touch-manipulation"
                  aria-label="Share job card link"
                >
                  <i className="fa-regular fa-share-from-square text-sm" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={exitToMenu}
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition touch-manipulation"
                  aria-label="Back to menu"
                >
                  <i className="fa-solid fa-house text-sm" aria-hidden />
                </button>
              </div>
            </div>
            {getJobCardRecorderDisplayName() ? (
              <p
                className="text-xs text-white/85 truncate"
                title={`Recorded in ERP as ${getJobCardRecorderDisplayName()}`}
              >
                {getJobCardRecorderDisplayName()}
              </p>
            ) : null}
            <div
              className="mobile-step-scroll flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden pb-0.5 -mx-0.5 px-0.5 snap-x snap-mandatory scrollbar-hide touch-pan-x"
              aria-label="Wizard steps — swipe sideways to choose a step"
            >
              {STEP_IDS.map((stepId, idx) => (
                <StepBadge
                  key={`mobile-${stepId}`}
                  variant="carousel"
                  index={idx}
                  stepId={stepId}
                  active={idx === currentStep}
                  complete={idx < currentStep}
                  onClick={() => goToStep(idx)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex-1 h-0.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums text-white/90 shrink-0">{progressPercent}%</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Scrollable Content Area - min-h-0 allows flex item to shrink and enable scroll */}
        <div
          ref={wizardScrollRef}
          className="job-card-scrollable-content flex-1 min-h-0 overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch"
        >
          <div className="job-card-scroll-inner max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 pb-28 xl:pb-6 space-y-4 sm:space-y-5">
            {stepError && (
              <div className="bg-red-50 border border-red-200/90 text-red-800 rounded-2xl px-4 py-3 flex items-start gap-3 text-sm shadow-sm">
                <i className="fas fa-exclamation-circle mt-0.5 flex-shrink-0"></i>
                <div className="leading-relaxed">{stepError}</div>
              </div>
            )}

            <form onSubmit={(event) => { event.preventDefault(); handleSave(); }} className="space-y-4 sm:space-y-5">
              {renderStepContent()}
            </form>

            {editingMeta && getJobCardAuthToken() ? (
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-4 sm:mt-5">
                <button
                  type="button"
                  onClick={() => setPriorActivityOpen(o => !o)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 touch-manipulation"
                >
                  <span className="flex items-center gap-2">
                    <i className="fa-regular fa-clock text-slate-500" aria-hidden />
                    Activity trail
                    {priorActivityLoading ? (
                      <span className="text-xs font-normal text-slate-500">(loading…)</span>
                    ) : (
                      <span className="text-xs font-normal text-slate-500">
                        ({priorLoadedActivities.length})
                      </span>
                    )}
                  </span>
                  <i className={`fa-solid fa-chevron-${priorActivityOpen ? 'up' : 'down'} text-slate-400 text-xs`} />
                </button>
                {priorActivityOpen ? (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    {priorActivityLoading && priorLoadedActivities.length === 0 ? (
                      <p className="text-sm text-slate-500 pt-3">Loading activity…</p>
                    ) : priorLoadedActivities.length === 0 ? (
                      <p className="text-sm text-slate-500 pt-3">
                        No activity events yet, or this card has not been synced to the server.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2 text-sm text-slate-800 max-h-64 overflow-y-auto">
                        {priorLoadedActivities.map(a => (
                          <li
                            key={a.id}
                            className="border-b border-slate-100 pb-2 last:border-0"
                          >
                            <span className="text-slate-500 text-xs">
                              {a.createdAt
                                ? (() => {
                                    const d = new Date(a.createdAt);
                                    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
                                  })()
                                : '—'}
                            </span>
                            {' · '}
                            <span className="font-medium text-slate-900">
                              {formatJobCardActivityAction(a.action)}
                            </span>
                            {a.actorName ? ` — ${a.actorName}` : ''}
                            {formatJobCardActivitySource(a.source) ? (
                              <span className="text-slate-500 text-xs">
                                {' '}
                                · {formatJobCardActivitySource(a.source)}
                              </span>
                            ) : null}
                            {formatJobCardActivityDetail(a.action, a.metadata) ? (
                              <div className="text-slate-500 text-xs mt-0.5 whitespace-pre-wrap break-words">
                                {formatJobCardActivityDetail(a.action, a.metadata)}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>

        {renderNavigationButtons({ placement: 'footer' })}
      </div>

      {photoLightboxUrl
        ? (() => {
            const lightbox = (
              <div
                className="job-card-photo-lightbox fixed inset-0 z-[99999] flex items-center justify-center bg-black/95 p-4 sm:p-6"
                onClick={closePhotoLightbox}
                role="dialog"
                aria-modal="true"
                aria-label="Photo preview"
              >
                <button
                  type="button"
                  className="job-card-photo-lightbox-close absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] inline-flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full bg-white/25 text-white hover:bg-white/35 touch-manipulation shadow-lg"
                  onClick={event => {
                    event.stopPropagation();
                    closePhotoLightbox();
                  }}
                  aria-label="Close photo preview"
                >
                  <i className="fa-solid fa-xmark text-lg" />
                </button>
                <img
                  src={photoLightboxUrl}
                  alt="Full-size attachment"
                  className="max-h-[88vh] max-w-[96vw] rounded-lg object-contain touch-none select-none"
                  onClick={event => event.stopPropagation()}
                />
              </div>
            );
            if (typeof window !== 'undefined' && window.ReactDOM?.createPortal) {
              return window.ReactDOM.createPortal(lightbox, document.body);
            }
            return lightbox;
          })()
        : null}

      {arrivalConfirmOpen && editingMeta?.useNewJobTimeFlow ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jobcard-arrival-confirm-title"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="jobcard-arrival-confirm-title" className="text-lg font-semibold text-gray-900">
              Arrival on site
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              Is this the correct time you arrived on site?
            </p>
            {!arrivalConfirmPickMode ? (
              <>
                <p className="mt-4 text-xl font-semibold text-gray-900 tabular-nums">
                  {formatWizardDatetimeLabel(arrivalConfirmDraft) || '—'}
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setArrivalConfirmPickMode(true)}
                    className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Change time
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmArrivalOnSite(arrivalConfirmDraft)}
                    className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Yes, this is correct
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700 mt-4 mb-2">
                  Arrival on site
                </label>
                <input
                  type="datetime-local"
                  value={arrivalConfirmDraft}
                  onChange={e => setArrivalConfirmDraft(e.target.value)}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  style={{ fontSize: '16px' }}
                />
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setArrivalConfirmPickMode(false);
                      setArrivalConfirmDraft(toDatetimeLocalInput(new Date()));
                    }}
                    className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!arrivalConfirmDraft}
                    onClick={() => confirmArrivalOnSite(arrivalConfirmDraft)}
                    className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Confirm time
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {departureConfirmOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jobcard-departure-confirm-title"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="jobcard-departure-confirm-title" className="text-lg font-semibold text-gray-900">
              Departure from site
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              Confirm the date and time you left the site before submitting this job card.
            </p>
            {formData.timeOfArrival ? (
              <p className="text-sm text-gray-500 mt-2">
                Arrival on site:{' '}
                <span className="font-medium text-gray-800">
                  {formatWizardDatetimeLabel(formData.timeOfArrival)}
                </span>
              </p>
            ) : null}
            {!departureConfirmPickMode ? (
              <>
                <p className="mt-4 text-xl font-semibold text-gray-900 tabular-nums">
                  {formatWizardDatetimeLabel(departureConfirmDraft) || '—'}
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setDepartureConfirmPickMode(true)}
                    className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Change time
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDepartureFromSite(departureConfirmDraft)}
                    className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Yes, this is correct
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700 mt-4 mb-2">
                  Departure from site
                </label>
                <input
                  type="datetime-local"
                  value={departureConfirmDraft}
                  onChange={e => setDepartureConfirmDraft(e.target.value)}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  style={{ fontSize: '16px' }}
                />
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDepartureConfirmPickMode(false);
                      setDepartureConfirmDraft(toDatetimeLocalInput(new Date()));
                    }}
                    className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!departureConfirmDraft}
                    onClick={() => confirmDepartureFromSite(departureConfirmDraft)}
                    className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Confirm time
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Map Selection Modal */}
      {showMapModal && (
        <div className="job-card-map-modal fixed inset-0 z-50 flex flex-col bg-black/60 sm:items-center sm:justify-center sm:p-4">
          <div className="job-card-map-modal__panel bg-white flex flex-col flex-1 w-full sm:flex-none sm:max-w-4xl sm:h-[90vh] sm:rounded-xl sm:shadow-xl overflow-hidden">
            <div className="job-card-map-modal__header flex flex-row items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Pick visit location</h3>
                <p className="text-sm text-gray-500 mt-0.5">Search, use GPS, or tap the map to drop a pin.</p>
              </div>
              <button
                type="button"
                onClick={handleCloseMap}
                className="shrink-0 p-2.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 touch-manipulation"
                aria-label="Close map"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>

            <div className="job-card-map-modal__toolbar px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0 space-y-2">
              <div className="flex gap-2">
                <input
                  type="search"
                  value={mapSearchQuery}
                  onChange={(e) => setMapSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleMapSearch();
                    }
                  }}
                  className="flex-1 px-3 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Search address or place…"
                  style={{ fontSize: '16px' }}
                />
                <button
                  type="button"
                  onClick={handleMapSearch}
                  disabled={mapSearching}
                  className="px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-60 touch-manipulation"
                  aria-label="Search location"
                >
                  <i className={`fas ${mapSearching ? 'fa-spinner fa-spin' : 'fa-search'}`}></i>
                </button>
              </div>
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={mapLocating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-60 font-medium touch-manipulation"
              >
                <i className={`fas ${mapLocating ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'}`}></i>
                {mapLocating ? 'Finding your location…' : 'Use my current location'}
              </button>
              {mapHint ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{mapHint}</p>
              ) : null}
            </div>

            <div className="job-card-map-modal__map flex-1 min-h-0 relative bg-slate-100">
              <div ref={mapContainerRef} className="job-card-map-modal__map-canvas absolute inset-0"></div>
            </div>

            <div className="job-card-map-modal__footer p-4 border-t border-gray-200 bg-white shrink-0 safe-area-bottom">
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 mb-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Selected</p>
                <p className="text-sm font-medium text-gray-900 mt-1 break-words">
                  {mapDraft.location || 'No location selected yet'}
                </p>
                {mapDraft.latitude && mapDraft.longitude ? (
                  <p className="text-xs text-gray-500 mt-1">
                    {Number(mapDraft.latitude).toFixed(5)}, {Number(mapDraft.longitude).toFixed(5)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={handleCloseMap}
                  className="w-full sm:w-auto px-5 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMap}
                  disabled={!mapDraft.latitude || !mapDraft.longitude}
                  className="w-full sm:w-auto px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-semibold disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  Use this location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

try {
  window.JobCardFormPublic = JobCardFormPublic;
  try {
    window.dispatchEvent(new Event('jobCardFormPublicReady'));
  } catch {
    /* ignore */
  }
  if (window.debug && !window.debug.performanceMode) {
  }
} catch (error) {
  console.error('❌ JobCardFormPublic.jsx: Error registering component:', error);
}


