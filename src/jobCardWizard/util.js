import {
  JOB_CARD_SYNC_REQUEST_TIMEOUT_MS,
  JOB_CARD_SYNC_RETRY_ATTEMPTS
} from './constants.js';

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function estimateJsonBytes(value) {
  try {
    const raw = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(raw).length;
    }
    return raw.length;
  } catch {
    return 0;
  }
}

export function isLikelyServerJobCardId(id) {
  if (id == null || id === '') return false;
  const s = String(id);
  if (/^c[a-z0-9]{24}$/i.test(s)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export function generateClientDraftId() {
  return `jc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function parseStoredJsonArray(val, fallback = []) {
  if (val == null) return fallback;
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function toDatetimeLocalInput(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatWizardDatetimeLabel(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return d.toLocaleString();
  }
}

export function dataUrlApproxBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const idx = dataUrl.indexOf(',');
  if (idx < 0) return 0;
  const b64 = dataUrl.slice(idx + 1).replace(/\s/g, '');
  if (!b64) return 0;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

export function shouldRetryHttpStatus(status) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export function isRetryableFetchError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    error?.name === 'AbortError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('timeout')
  );
}

export async function fetchWithRetry(url, options = {}, config = {}) {
  const attempts = Number(config.attempts || JOB_CARD_SYNC_RETRY_ATTEMPTS);
  const timeoutMs = Number(config.timeoutMs || JOB_CARD_SYNC_REQUEST_TIMEOUT_MS);
  const baseDelayMs = Number(config.baseDelayMs || 700);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (response.ok || !shouldRetryHttpStatus(response.status) || attempt >= attempts) {
        return response;
      }
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (!isRetryableFetchError(error) || attempt >= attempts) {
        throw error;
      }
    }
    const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 3000);
    await sleepMs(delay);
  }
  throw lastError || new Error('Network request failed');
}

export function parseJobCardSyncFailureMessage(status, text) {
  if (status === 413) return 'Payload too large. Remove some media and retry.';
  if (status === 429) return 'Too many requests. Please retry in a moment.';
  if (status === 502 || status === 503 || status === 504) {
    return 'Server temporarily unreachable. Please retry in a few moments.';
  }
  if (!text) return `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text);
    return (
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.data?.message ||
      String(text).slice(0, 280)
    );
  } catch {
    return String(text).slice(0, 280);
  }
}
