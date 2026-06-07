import { describe, expect, it } from '@jest/globals'

const MANUFACTURING_WEB_TABS = [
  'dashboard',
  'inventory',
  'purchase',
  'bom',
  'production',
  'sales',
  'movements',
  'suppliers',
  'locations',
  'reports',
  'stock-count',
  'activity'
]

function normalizeManufacturingTab(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return MANUFACTURING_WEB_TABS.includes(normalized) ? normalized : 'dashboard'
}

/** Inline copy of parseManufacturingLink — keep aligned with manufacturing/constants.ts */
function parseManufacturingLink(link) {
  const raw = String(link || '').trim()
  const pathPart = raw.includes('#') ? raw.split('#').slice(1).join('#') : raw
  const normalized = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  const qIdx = normalized.indexOf('?')
  const path = qIdx >= 0 ? normalized.slice(0, qIdx) : normalized
  const queryStr = qIdx >= 0 ? normalized.slice(qIdx + 1) : ''
  const params = new URLSearchParams(queryStr)
  const query = {}
  params.forEach((v, k) => {
    query[k] = v
  })
  const segments = path.replace(/^\//, '').split('/').filter(Boolean)
  if ((segments[0] || '').toLowerCase() !== 'manufacturing') {
    return { tab: 'dashboard', query }
  }
  return { tab: normalizeManufacturingTab(segments[1]), query }
}

describe('parseManufacturingLink', () => {
  it('parses hash manufacturing inventory links', () => {
    const result = parseManufacturingLink('#/manufacturing/inventory')
    expect(result.tab).toBe('inventory')
    expect(result.query).toEqual({})
  })

  it('parses query params on manufacturing paths', () => {
    const result = parseManufacturingLink('/manufacturing/stock-count?location=01_LOC1')
    expect(result.tab).toBe('stock-count')
    expect(result.query).toEqual({ location: '01_LOC1' })
  })

  it('defaults to dashboard tab', () => {
    const result = parseManufacturingLink('#/manufacturing')
    expect(result.tab).toBe('dashboard')
  })
})
