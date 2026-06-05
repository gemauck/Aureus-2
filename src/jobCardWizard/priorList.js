import { isLikelyServerJobCardId, parseStoredJsonArray } from './util.js';

export function priorListLocalSearchHay(jc) {
  if (!jc || typeof jc !== 'object') return '';
  const asJson = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  };
  const parts = [
    jc.id,
    jc.jobCardNumber,
    jc.clientId,
    jc.clientName,
    jc.siteId,
    jc.siteName,
    jc.agentName,
    jc.location,
    jc.locationLatitude,
    jc.locationLongitude,
    jc.latitude,
    jc.longitude,
    jc.vehicleUsed,
    jc.reasonForVisit,
    jc.callOutCategory,
    jc.diagnosis,
    jc.futureWorkRequired,
    jc.actionsTaken,
    jc.otherComments,
    jc.status,
    asJson(jc.otherTechnicians),
    asJson(jc.stockUsed),
    asJson(jc.materialsBought),
    asJson(jc.photos),
    asJson(jc.serviceForms)
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function getPriorCardOpenId(card) {
  if (!card || typeof card !== 'object') return '';
  const raw = card.id != null ? card.id : card.serverJobCardId;
  if (raw == null) return '';
  const s = String(raw).trim();
  return s || '';
}

/**
 * @param {Array} serverList
 * @param {Array} localPending unsynced local cards
 * @param {boolean} hasAuthToken
 */
export function buildMergedWizardJobCardRows(serverList, localPending, hasAuthToken) {
  const pending = (localPending || []).filter((j) => j && j.synced === false);
  const pendingIdSet = new Set(pending.map((j) => String(j.id)));
  const pendingServerIdSet = new Set(
    pending
      .map((j) => j.serverJobCardId || (isLikelyServerJobCardId(j.id) ? String(j.id) : ''))
      .filter(Boolean)
      .map(String)
  );
  const serverRows = (serverList || [])
    .filter(
      (jc) =>
        jc &&
        !pendingIdSet.has(String(jc.id)) &&
        !pendingServerIdSet.has(String(jc.id))
    )
    .map((jc) => ({
      ...jc,
      source: hasAuthToken ? 'server' : 'public',
      serverJobCardId: jc.id,
      synced: true
    }));
  const localRows = pending.map((jc) => ({
    ...jc,
    source: 'local',
    serverJobCardId:
      jc.serverJobCardId || (isLikelyServerJobCardId(jc.id) ? String(jc.id) : null),
    synced: false
  }));
  const priorListSortMs = (row) => new Date(row?.updatedAt || row?.createdAt || 0).getTime();
  const rows = [...localRows, ...serverRows];
  rows.sort((a, b) => {
    const tb = priorListSortMs(b);
    const ta = priorListSortMs(a);
    if (tb !== ta) return tb - ta;
    const nb = String(b.jobCardNumber || '');
    const na = String(a.jobCardNumber || '');
    return nb.localeCompare(na, undefined, { numeric: true });
  });
  return rows;
}

export { parseStoredJsonArray };
