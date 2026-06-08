import { describe, expect, it } from '@jest/globals'

/** Inline copies — keep aligned with mobile-rn/src/reports/constants.ts */
function normalizeReportsTab(value) {
  const normalized = String(value || '').trim().toLowerCase()
  const tabs = ['audit', 'my-queries', 'feedback']
  return tabs.includes(normalized) ? normalized : null
}

function reportsWebPath(query) {
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

function parseReportsLink(link) {
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

describe('reportsWebPath', () => {
  it('returns base path without query', () => {
    expect(reportsWebPath()).toBe('/reports')
  })

  it('builds tab and highlight query string', () => {
    expect(
      reportsWebPath({ tab: 'feedback', highlightFeedbackId: 'fb-123' })
    ).toBe('/reports?tab=feedback&highlightFeedbackId=fb-123')
  })
})

describe('parseReportsLink', () => {
  it('parses hash reports links from feedback emails', () => {
    const result = parseReportsLink('#/reports?tab=feedback&highlightFeedbackId=fb-1')
    expect(result).toEqual({ tab: 'feedback', highlightFeedbackId: 'fb-1' })
  })

  it('parses pathname reports links for mobile WebView', () => {
    const result = parseReportsLink('/reports?tab=my-queries&highlightFeedbackId=fb-2')
    expect(result).toEqual({ tab: 'my-queries', highlightFeedbackId: 'fb-2' })
  })

  it('returns empty object for non-reports paths', () => {
    expect(parseReportsLink('/manufacturing/reports')).toEqual({})
  })
})
