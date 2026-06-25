#!/usr/bin/env node
/**
 * API-level stock-take flow smoke (mirrors mobile-rn field checklist without a device).
 * Requires TEST_EMAIL / TEST_PASSWORD (automation user).
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const BASE = (process.env.APP_URL || process.env.TEST_URL || 'https://abcoafrica.co.za').replace(/\/$/, '')
const FIELD_HEADERS = {
  'X-Abcotronics-Client': 'field-app-v1',
  'Content-Type': 'application/json'
}

const results = { pass: [], fail: [], skip: [] }

function ok(name, detail = '') {
  results.pass.push(name)
  console.log('✅', name, detail ? `— ${detail}` : '')
}

function bad(name, detail = '') {
  results.fail.push(name)
  console.log('❌', name, detail ? `— ${detail}` : '')
}

async function jsonFetch(path, { method = 'GET', headers = {}, body = null } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { status: res.status, data }
}

async function login(email, password) {
  const res = await jsonFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email, password }
  })
  const token = res.data?.data?.accessToken ?? res.data?.accessToken
  if (res.status === 200 && token) return token
  bad('Login', `HTTP ${res.status}`)
  return null
}

function unwrap(data, key) {
  if (Array.isArray(data)) return data
  const inner = data?.data ?? data
  if (Array.isArray(inner?.[key])) return inner[key]
  if (Array.isArray(inner)) return inner
  return []
}

async function main() {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) {
    console.error('TEST_EMAIL and TEST_PASSWORD required')
    process.exit(1)
  }

  console.log(`\n== Stock-take API smoke ==\nTarget: ${BASE}\n`)

  const token = await login(email, password)
  if (!token) process.exit(1)
  ok('Login', 'automation user')

  const auth = { Authorization: `Bearer ${token}`, ...FIELD_HEADERS }

  const locRes = await jsonFetch('/api/public/locations', { headers: FIELD_HEADERS })
  const locations = unwrap(locRes.data, 'locations')
  if (locRes.status !== 200 || !locations.length) {
    bad('Load locations', `HTTP ${locRes.status}, count ${locations.length}`)
    process.exit(1)
  }
  const location = locations[0]
  ok('Load locations', `${locations.length} total, using ${location.code || location.name || location.id}`)

  const locId = location.id
  const invRes = await jsonFetch(`/api/public/inventory?locationId=${encodeURIComponent(locId)}&limit=50`, {
    headers: FIELD_HEADERS
  })
  const items = unwrap(invRes.data, 'items').length ? unwrap(invRes.data, 'items') : unwrap(invRes.data, 'inventory')
  if (invRes.status !== 200) {
    bad('Load location inventory', `HTTP ${invRes.status}`)
    process.exit(1)
  }
  ok('Load location inventory', `${items.length} item(s)`)

  if (!items.length) {
    bad('Stock-take session', 'no inventory rows at location')
    process.exit(1)
  }

  const createRes = await jsonFetch('/api/manufacturing/stock-take-submissions', {
    method: 'POST',
    headers: auth,
    body: {
      mode: 'session',
      locationId: locId,
      startedAt: new Date().toISOString(),
      notes: 'automation smoke — safe to delete'
    }
  })
  const submission = createRes.data?.data?.submission ?? createRes.data?.submission
  const sessionId = submission?.id
  if (createRes.status !== 201 && createRes.status !== 200) {
    bad('Create stock-take session', `HTTP ${createRes.status} ${JSON.stringify(createRes.data?.error || createRes.data?.message || '').slice(0, 120)}`)
    process.exit(1)
  }
  ok('Create stock-take session', sessionId)

  const sampleLines = (submission?.lines || items).slice(0, 3)
  const linePatches = sampleLines.map((row, i) => {
    const sku = String(row.sku || items[i]?.sku || '').trim()
    const systemQty = Number(row.systemQty ?? row.quantity ?? items[i]?.quantity ?? 0)
    const lineId = row.id
    const patch = { sku, countedQty: systemQty + 1 }
    if (lineId) patch.id = lineId
    return patch
  }).filter((p) => p.sku)

  if (!linePatches.length) {
    bad('Patch counts', 'no line patches built')
    process.exit(1)
  }

  const patchRes = await jsonFetch(`/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: auth,
    body: { linePatches, sessionRevision: submission?.sessionRevision ?? 1 }
  })
  if (patchRes.status !== 200) {
    bad('Save draft counts', `HTTP ${patchRes.status}`)
    process.exit(1)
  }
  ok('Save draft counts', `${linePatches.length} line(s)`)

  const getRes = await jsonFetch(`/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  })
  const restored = getRes.data?.data?.submission ?? getRes.data?.submission
  if (getRes.status === 200 && restored?.id) {
    ok('Reload session', `status ${restored.status}`)
  } else {
    bad('Reload session', `HTTP ${getRes.status}`)
  }

  const submitRes = await jsonFetch(
    `/api/manufacturing/stock-take-submissions/${encodeURIComponent(sessionId)}/submit-for-review`,
    { method: 'POST', headers: auth, body: {} }
  )
  if (submitRes.status !== 200 && submitRes.status !== 201) {
    bad('Submit for review', `HTTP ${submitRes.status}`)
    process.exit(1)
  }
  ok('Submit for review', 'queued for admin review (not applied to ledger)')

  const emptySubmit = await jsonFetch('/api/manufacturing/stock-take-submissions', {
    method: 'POST',
    headers: auth,
    body: { mode: 'session', locationId: '', startedAt: new Date().toISOString() }
  })
  if (emptySubmit.status === 400) {
    ok('Validation: missing location', 'HTTP 400')
  } else {
    bad('Validation: missing location', `expected 400, got ${emptySubmit.status}`)
  }

  console.log('\n== Summary ==')
  console.log(`Pass: ${results.pass.length}  Fail: ${results.fail.length}`)
  if (results.fail.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
