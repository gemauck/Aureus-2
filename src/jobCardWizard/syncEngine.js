import { JOB_CARD_SYNC_HARD_PAYLOAD_BYTES } from './constants.js';
import {
  estimateJsonBytes,
  fetchWithRetry,
  isLikelyServerJobCardId,
  parseJobCardSyncFailureMessage
} from './util.js';

/**
 * @param {object} deps
 * @param {() => string|null} deps.getToken
 * @param {() => boolean} deps.isOnline
 * @param {(id: string) => void|Promise<void>} deps.removeLocalPending
 * @param {(id: string) => void} [deps.rememberPriorId]
 * @param {(serverId: string, events: Array) => Promise<void>} [deps.flushActivity]
 * @param {() => void} [deps.onSaved]
 * @param {string} [deps.apiBase] e.g. '' for relative or 'https://host'
 * @param {object} [deps.fetchRetryConfig] passed to fetchWithRetry (e.g. fetchFn for auth refresh)
 */
export function createSyncEngine(deps) {
  const apiBase = deps.apiBase || '';
  const fetchRetryConfig = deps.fetchRetryConfig || {};

  async function flushJobCardActivityQueue(serverJobCardId, events) {
    if (deps.flushActivity) {
      await deps.flushActivity(serverJobCardId, events);
      return;
    }
    const token = deps.getToken();
    if (!serverJobCardId || !Array.isArray(events) || events.length === 0 || !token) return;
    try {
      const res = await fetch(
        `${apiBase}/api/jobcards/${encodeURIComponent(serverJobCardId)}/activity/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            events: events.map((e) => ({
              action: e.action,
              metadata: e.metadata,
              source: e.source || 'mobile'
            }))
          })
        }
      );
      if (!res.ok) {
        console.warn('jobCardWizard: activity sync HTTP', res.status);
      }
    } catch (e) {
      console.warn('jobCardWizard: activity sync failed', e);
    }
  }

  async function syncOneLocalPendingJobCardToServer(draftCard) {
    if (!draftCard || draftCard.id == null) {
      return { ok: false, serverId: null, errorText: 'Invalid draft' };
    }
    const token = deps.getToken();
    if (!token) {
      return { ok: false, serverId: null, errorText: 'Sign in is required to sync this job card.' };
    }
    if (!deps.isOnline()) {
      return { ok: false, serverId: null, errorText: 'Offline' };
    }

    const localId = String(draftCard.id);
    const serverJobCardId =
      draftCard.serverJobCardId || (isLikelyServerJobCardId(localId) ? localId : null);
    const payloadObj = { ...draftCard };
    delete payloadObj.activityQueue;
    delete payloadObj.synced;
    delete payloadObj.source;
    delete payloadObj.serverJobCardId;

    const payloadJson = JSON.stringify(payloadObj);
    const patchBytes = estimateJsonBytes(payloadObj);
    if (patchBytes > JOB_CARD_SYNC_HARD_PAYLOAD_BYTES) {
      return {
        ok: false,
        serverId: null,
        errorText: 'Upload payload is too large for reliable sync. Remove some media and retry.'
      };
    }

    let synced = false;
    let resolvedServerId = serverJobCardId ? String(serverJobCardId) : null;
    let errorText = '';

    if (serverJobCardId) {
      const forceOverwrite = Boolean(draftCard.forceOverwrite);
      const syncBaseUpdatedAt = draftCard.syncBaseUpdatedAt
        ? String(draftCard.syncBaseUpdatedAt)
        : '';

      if (syncBaseUpdatedAt && !forceOverwrite) {
        try {
          const getRes = await fetchWithRetry(
            `${apiBase}/api/jobcards/${encodeURIComponent(serverJobCardId)}`,
            {
              method: 'GET',
              headers: { Authorization: `Bearer ${token}` }
            },
            fetchRetryConfig
          );
          if (getRes.ok) {
            const getData = await getRes.json().catch(() => ({}));
            const serverJc = getData?.data?.jobCard || getData?.jobCard;
            const serverUpdatedAt = serverJc?.updatedAt ? String(serverJc.updatedAt) : '';
            if (
              serverUpdatedAt &&
              new Date(serverUpdatedAt).getTime() > new Date(syncBaseUpdatedAt).getTime()
            ) {
              return {
                ok: false,
                serverId: String(serverJobCardId),
                conflict: true,
                serverJobCard: serverJc,
                errorText:
                  'Someone else updated this job card on the server after you opened your copy.'
              };
            }
          }
        } catch {
          /* proceed with PATCH if conflict check fails */
        }
      }

      try {
        const patchRes = await fetchWithRetry(
          `${apiBase}/api/jobcards/${encodeURIComponent(serverJobCardId)}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: payloadJson
          },
          fetchRetryConfig
        );
        if (patchRes.ok) {
          synced = true;
          const patchData = await patchRes.json().catch(() => ({}));
          const patchedJobCard = patchData?.data?.jobCard || patchData?.jobCard;
          if (patchedJobCard?.id) resolvedServerId = String(patchedJobCard.id);
        } else if (patchRes.status !== 404) {
          const text = await patchRes.text().catch(() => '');
          errorText = parseJobCardSyncFailureMessage(patchRes.status, text);
        }
      } catch (e) {
        errorText = e?.message || 'Network error';
      }
    }

    if (!synced && !errorText) {
      const createPayload = { ...payloadObj };
      delete createPayload.id;
      createPayload.clientDraftId = localId;
      const createBytes = estimateJsonBytes(createPayload);
      if (createBytes > JOB_CARD_SYNC_HARD_PAYLOAD_BYTES) {
        return {
          ok: false,
          serverId: null,
          errorText: 'Upload payload is too large for reliable sync. Remove some media and retry.'
        };
      }
      try {
        const createRes = await fetchWithRetry(
          `${apiBase}/api/jobcards`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(createPayload)
          },
          fetchRetryConfig
        );
        if (createRes.ok) {
          synced = true;
          const createText = await createRes.text().catch(() => '');
          let createData = {};
          try {
            createData = createText ? JSON.parse(createText) : {};
          } catch {
            createData = {};
          }
          const createdJobCard = createData?.data?.jobCard || createData?.jobCard;
          if (createdJobCard?.id) {
            resolvedServerId = String(createdJobCard.id);
            deps.rememberPriorId?.(resolvedServerId);
          }
        } else {
          const text = await createRes.text().catch(() => '');
          errorText = parseJobCardSyncFailureMessage(createRes.status, text);
        }
      } catch (e) {
        errorText = e?.message || 'Network error';
      }
    }

    if (!synced) {
      return { ok: false, serverId: null, errorText: errorText || 'Sync failed' };
    }

    if (
      resolvedServerId &&
      Array.isArray(draftCard.activityQueue) &&
      draftCard.activityQueue.length > 0
    ) {
      await flushJobCardActivityQueue(resolvedServerId, draftCard.activityQueue);
    }
    const removeResult = deps.removeLocalPending(localId);
    if (removeResult != null && typeof removeResult.then === 'function') {
      await removeResult;
    }
    deps.onSaved?.(resolvedServerId);
    return { ok: true, serverId: resolvedServerId, errorText: '' };
  }

  async function runAutoSyncPendingJobCards(pendingCards, { onProgress } = {}) {
    let synced = 0;
    let failed = 0;
    for (const card of pendingCards) {
      onProgress?.(String(card.id));
      const result = await syncOneLocalPendingJobCardToServer(card);
      if (result.ok) synced += 1;
      else failed += 1;
    }
    onProgress?.('');
    return { synced, failed };
  }

  return {
    syncOneLocalPendingJobCardToServer,
    runAutoSyncPendingJobCards,
    flushJobCardActivityQueue
  };
}
