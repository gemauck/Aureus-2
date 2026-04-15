/**
 * Node: node --test tests/document-collection-email-routing.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'

// Inline copies of regex behavior (keep in sync with api/inbound/document-request-reply.js)
function extractRequestNumbersFromText(blob) {
  if (!blob || typeof blob !== 'string') return []
  const out = new Set()
  const bracket = /\[(?:Req|REQ)\s+([A-Za-z0-9-]+)\]/gi
  let m
  while ((m = bracket.exec(blob)) !== null) {
    if (m[1]) out.add(m[1].trim())
  }
  const plain = /\b(DOC-\d{4}-[A-Za-z0-9]+)\b/gi
  while ((m = plain.exec(blob)) !== null) {
    if (m[1]) out.add(m[1].trim())
  }
  return [...out]
}

function parseXDocReqFromRaw(rawText) {
  if (!rawText || typeof rawText !== 'string') return null
  const mm = rawText.match(/x-abcotronics-doc-req:\s*([^\r\n]+)/i)
  if (mm && mm[1]) return mm[1].trim().replace(/^<|>$/g, '').trim()
  return null
}

/** Keep in sync with api/inbound/document-request-reply.js extractProjectNameFromAbcoSubject */
function extractProjectNameFromAbcoSubject(subject) {
  const raw = String(subject || '')
  const m = raw.match(/Document\s*\/\s*Data\s*request:\s*(.+)/i)
  if (!m || !m[1]) return null
  const rest = m[1]
    .replace(/^(?:\s*Re:)+/i, '')
    .trim()
  const parts = rest.split(/\s*[–—]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const project = parts[0]
  return project.length > 0 && project.length < 400 ? project : null
}

describe('document collection routing helpers', () => {
  it('extracts bracket and DOC- tokens', () => {
    const t = 'Re: Hi [Req DOC-2026-A1B2C3D4] tail DOC-2026-FFFFFFFF'
    const ids = extractRequestNumbersFromText(t)
    assert.ok(ids.includes('DOC-2026-A1B2C3D4'))
    assert.ok(ids.includes('DOC-2026-FFFFFFFF'))
  })

  it('parses X-Abcotronics-Doc-Req from raw eml', () => {
    const raw = 'X-Abcotronics-Doc-Req: DOC-2026-ABCDEF12\r\n\r\nbody'
    assert.strictEqual(parseXDocReqFromRaw(raw), 'DOC-2026-ABCDEF12')
  })

  it('extracts project name from Abco data-request subject', () => {
    const subj =
      'Re: Abco Document / Data request: Mondi Mzfube – Section A – CIPC registration – January 2026'
    assert.strictEqual(extractProjectNameFromAbcoSubject(subj), 'Mondi Mzfube')
  })

  it('returns null when data-request template missing', () => {
    assert.strictEqual(extractProjectNameFromAbcoSubject('Re: random subject – January 2026'), null)
  })
})
