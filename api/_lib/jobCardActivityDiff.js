/**
 * Build accurate before/after snapshots for JobCardActivity.metadata.changes
 * without storing huge base64 blobs (photos) or megabyte JSON.
 */

const MAX_TEXT_PREVIEW = 800
const MAX_JSON_CHARS = 2000

function parseJsonLoose(str, fallback = null) {
  if (str == null || str === '') return fallback
  if (typeof str !== 'string') {
    if (Array.isArray(str) || typeof str === 'object') return str
    return fallback
  }
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

/**
 * @param {unknown} raw — DB string or already-parsed
 */
export function summarizePhotosForActivity(raw) {
  const arr = Array.isArray(raw) ? raw : parseJsonLoose(raw, [])
  if (!Array.isArray(arr)) return String(raw || '').slice(0, MAX_TEXT_PREVIEW)
  let bytes = 0
  for (const p of arr) {
    const u = typeof p === 'string' ? p : p?.url
    if (typeof u === 'string') bytes += u.length
  }
  return `${arr.length} item(s)${bytes > 50000 ? `, ~${Math.round(bytes / 1024)}KB data` : ''}`
}

function summarizeJsonArrayField(raw, labelSingular) {
  const arr = Array.isArray(raw) ? raw : parseJsonLoose(raw, [])
  if (!Array.isArray(arr)) {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw)
    return s.length > MAX_JSON_CHARS ? `${s.slice(0, MAX_JSON_CHARS)}…` : s
  }
  if (arr.length === 0) return '(empty)'
  try {
    const json = JSON.stringify(arr)
    return json.length <= MAX_JSON_CHARS
      ? json
      : `${json.slice(0, MAX_JSON_CHARS)}… (${arr.length} ${labelSingular})`
  } catch {
    return `${arr.length} ${labelSingular}`
  }
}

/**
 * @param {unknown} val
 * @param {string} key prisma field name
 * @returns {string}
 */
export function valueForActivitySnapshot(val, key) {
  if (val === null || val === undefined) return '(empty)'
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return '(invalid date)'
    return val.toISOString()
  }
  if (typeof val === 'number') {
    if (Number.isFinite(val) && key === 'travelKilometers') return `${val} km`
    if (key === 'totalMaterialsCost') return `R ${Number(val).toFixed(2)}`
    return String(val)
  }
  if (typeof val === 'boolean') return val ? 'yes' : 'no'

  if (key === 'photos') {
    return summarizePhotosForActivity(val)
  }
  if (key === 'stockUsed' || key === 'materialsBought') {
    return summarizeJsonArrayField(val, 'lines')
  }
  if (key === 'otherTechnicians') {
    if (typeof val === 'string') {
      const p = parseJsonLoose(val, [])
      return Array.isArray(p) ? p.join(', ') || '(empty)' : val.slice(0, MAX_TEXT_PREVIEW)
    }
    if (Array.isArray(val)) return val.join(', ') || '(empty)'
    return String(val).slice(0, MAX_TEXT_PREVIEW)
  }

  if (typeof val === 'string') {
    if (val.length > MAX_TEXT_PREVIEW) return `${val.slice(0, MAX_TEXT_PREVIEW)}…`
    return val
  }

  try {
    const s = JSON.stringify(val)
    return s.length > MAX_JSON_CHARS ? `${s.slice(0, MAX_JSON_CHARS)}…` : s
  } catch {
    return String(val).slice(0, MAX_TEXT_PREVIEW)
  }
}

function snapshotsEqual(a, b) {
  return String(a) === String(b)
}

/**
 * @param {Record<string, unknown>} existing — prisma jobCard row (before)
 * @param {Record<string, unknown>} updateData — prisma `data` payload (after)
 * @returns {{ field: string, from: string, to: string }[]}
 */
export function buildJobCardUpdateChanges(existing, updateData) {
  if (!existing || !updateData) return []
  const changes = []
  for (const key of Object.keys(updateData)) {
    if (key === 'updatedAt') continue
    const prev = Object.prototype.hasOwnProperty.call(existing, key) ? existing[key] : undefined
    const next = updateData[key]
    const from = valueForActivitySnapshot(prev, key)
    const to = valueForActivitySnapshot(next, key)
    if (snapshotsEqual(from, to)) continue
    changes.push({ field: key, from, to })
  }
  return changes
}

/**
 * Service form instance PATCH — answers JSON can be large; store truncated JSON snapshots.
 * @param {Record<string, unknown>} existing — prisma ServiceFormInstance row
 * @param {Record<string, unknown>} data — prisma update payload
 * @returns {{ field: string, from: string, to: string }[]}
 */
export function buildServiceFormInstanceChanges(existing, data) {
  if (!existing || !data) return []
  const changes = []
  for (const key of Object.keys(data)) {
    if (key === 'updatedAt') continue
    const prev = existing[key]
    const next = data[key]
    let from
    let to
    if (key === 'answers') {
      const p = typeof prev === 'string' ? prev : JSON.stringify(prev ?? [])
      const n = typeof next === 'string' ? next : JSON.stringify(next ?? [])
      from = p.length > MAX_JSON_CHARS ? `${p.slice(0, MAX_JSON_CHARS)}…` : p
      to = n.length > MAX_JSON_CHARS ? `${n.slice(0, MAX_JSON_CHARS)}…` : n
    } else {
      from = valueForActivitySnapshot(prev, key)
      to = valueForActivitySnapshot(next, key)
    }
    if (snapshotsEqual(from, to)) continue
    changes.push({ field: key, from, to })
  }
  return changes
}
