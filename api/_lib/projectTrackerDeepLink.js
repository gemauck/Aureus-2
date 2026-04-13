/**
 * Project tracker deep links (Document Collection, Monthly FMS, Data Review, Compliance, Weekly FMS).
 * Keep in sync with src/utils/projectTrackerDeepLink.js
 */

/** @param {string|undefined|null} source */
export function projectTabQueryForSource(source) {
  const s = String(source || '').trim();
  const map = {
    documentCollection: 'documentCollection',
    monthlyFMSReview: 'monthlyFMSReview',
    monthlyDataReview: 'monthlyDataReview',
    complianceReview: 'complianceReview'
  };
  return map[s] || null;
}

/**
 * Weekly FMS uses docWeek in the URL, not tab=.
 * Do not treat docMonth-style metadata as weekly.
 * @param {Record<string, unknown>} o
 */
export function isWeeklyTrackerMetadata(o) {
  if (!o || typeof o !== 'object') return false;
  if (String(o.source || '').trim() === 'weeklyFMSReview') return true;
  if (o.docWeek != null && String(o.docWeek).trim() !== '') return true;
  if (o.weeklyWeek != null && String(o.weeklyWeek).trim() !== '') return true;
  return false;
}

/** @param {string[]} q — query string parts (already encoded values) */
export function appendTabQueryParamForSource(q, source) {
  const tab = projectTabQueryForSource(source);
  if (tab) q.push(`tab=${encodeURIComponent(tab)}`);
}

/**
 * Human-readable section for notification emails (📍 Where line under Projects).
 * @param {string|undefined|null} source
 */
export function emailTrackerSectionLabel(source) {
  const s = String(source || '').trim();
  switch (s) {
    case 'weeklyFMSReview':
      return 'Weekly FMS review';
    case 'monthlyFMSReview':
      return 'Monthly FMS review';
    case 'documentCollection':
      return 'Document Collection';
    case 'monthlyDataReview':
      return 'Monthly Data Review';
    case 'complianceReview':
      return 'Compliance Review';
    default:
      return null;
  }
}
