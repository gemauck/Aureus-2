/**
 * Project tracker deep links — browser copy.
 * Keep in sync with api/_lib/projectTrackerDeepLink.js
 */

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

export function isWeeklyTrackerMetadata(o) {
  if (!o || typeof o !== 'object') return false;
  if (String(o.source || '').trim() === 'weeklyFMSReview') return true;
  if (o.docWeek != null && String(o.docWeek).trim() !== '') return true;
  if (o.weeklyWeek != null && String(o.weeklyWeek).trim() !== '') return true;
  return false;
}

export function appendTabQueryParamForSource(q, source) {
  const tab = projectTabQueryForSource(source);
  if (tab) q.push(`tab=${encodeURIComponent(tab)}`);
}

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
