export type ReportsTabId = 'audit' | 'my-queries' | 'feedback'

export type ReportsWebQuery = {
  tab?: ReportsTabId | string
  highlightFeedbackId?: string
}

const REPORTS_TABS: ReportsTabId[] = ['audit', 'my-queries', 'feedback']

export function normalizeReportsTab(value: string | null | undefined): ReportsTabId | null {
  const normalized = String(value || '').trim().toLowerCase()
  return REPORTS_TABS.includes(normalized as ReportsTabId) ? (normalized as ReportsTabId) : null
}

export function reportsWebPath(query?: ReportsWebQuery): string {
  const base = '/reports'
  if (!query) return base
  const params = new URLSearchParams()
  const tab = normalizeReportsTab(query.tab)
  if (tab) params.set('tab', tab)
  if (query.highlightFeedbackId) {
    params.set('highlightFeedbackId', query.highlightFeedbackId)
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function parseReportsLink(link: string): ReportsWebQuery {
  const raw = String(link || '').trim()
  if (!raw) return {}

  const hashPart = raw.includes('#') ? raw.split('#').slice(1).join('#') : raw
  const normalized = hashPart.startsWith('/') ? hashPart : `/${hashPart}`
  const qIdx = normalized.indexOf('?')
  const path = qIdx >= 0 ? normalized.slice(0, qIdx) : normalized
  const queryStr =
    qIdx >= 0
      ? normalized.slice(qIdx + 1)
      : raw.includes('?') && !raw.includes('#')
        ? raw.split('?').slice(1).join('?')
        : ''

  const segments = path.replace(/^\//, '').split('/').filter(Boolean)
  if ((segments[0] || '').toLowerCase() !== 'reports') {
    return {}
  }

  const params = new URLSearchParams(queryStr)
  const tab = normalizeReportsTab(params.get('tab'))
  const highlightFeedbackId = params.get('highlightFeedbackId') || undefined
  return {
    ...(tab ? { tab } : {}),
    ...(highlightFeedbackId ? { highlightFeedbackId } : {})
  }
}
