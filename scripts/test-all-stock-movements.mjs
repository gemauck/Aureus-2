#!/usr/bin/env node
/**
 * POST each manufacturing stock-movement type (receipt, transfer, adjustment, consumption, production, sale)
 * against the API in one ordered flow using a disposable SKU. Requires admin (or superadmin) for receipt + adjustment.
 * Retries transient Prisma/transaction timeouts a few times between steps (800ms spacing).
 *
 * Run: TEST_URL=http://localhost:3000 TEST_EMAIL=... TEST_PASSWORD=... node scripts/test-all-stock-movements.mjs
 * Or:  npm run test:stock-movements:all
 *
 * Flags: --dry-run — only login + list locations (no writes)
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'http://localhost:3000'
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''

const DRY = process.argv.includes('--dry-run')

const results = []

function ok(name, detail) {
  results.push({ ok: true, name, detail })
  console.log('✅', name, detail ? `— ${detail}` : '')
}

function bad(name, reason) {
  results.push({ ok: false, name, detail: reason })
  console.log('❌', name, '—', reason)
}

async function api(path, method, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
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

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? {}
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  })
  if (!res.ok) return null
  const body = await res.json()
  return body.data?.accessToken ?? body.accessToken ?? null
}

async function main() {
  console.log('Stock movement types API test —', BASE_URL)
  console.log(DRY ? '(dry-run: no POSTs)' : '(live POSTs: creates movements + disposable SKU)')
  console.log('')

  if (!EMAIL || !PASSWORD) {
    bad('Auth', 'Set TEST_EMAIL and TEST_PASSWORD')
    process.exit(1)
  }

  const token = await login()
  if (!token) {
    bad('Login', 'failed')
    process.exit(1)
  }
  ok('Login', 'token acquired')

  const locRes = await api('/api/manufacturing/locations', 'GET', null, token)
  const locations = unwrap(locRes).locations || []
  if (locRes.status !== 200 || locations.length < 2) {
    bad('Locations', `need ≥2 locations (status ${locRes.status}, count ${locations.length})`)
    process.exit(1)
  }
  const locA = locations[0]
  const locB = locations[1]
  ok('Locations', `${locA.code || locA.id} → ${locB.code || locB.id}`)

  const stamp = Date.now().toString(36).toUpperCase()
  const sku = `MOVTYPE-${stamp}`
  const itemName = `Movement smoke ${stamp}`
  const ref = (type) => `movtest-${type}-${stamp}`

  if (DRY) {
    ok('dry-run', `would use SKU ${sku}`)
    console.log('\nSummary:', results.filter((r) => r.ok).length, 'ok,', results.filter((r) => !r.ok).length, 'failed')
    process.exit(0)
  }

  const pause = (ms) => new Promise((r) => setTimeout(r, ms))
  const maxAttempts = 8
  const stepPauseMs = 1800

  /** @param {string} type @param {object} body */
  async function postMovement(type, body) {
    await pause(stepPauseMs)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await pause(2800 + 2400 * attempt)
        console.log(`   (retry ${attempt} for ${type})`)
      }
      const res = await api('/api/manufacturing/stock-movements', 'POST', body, token)
      const movement = unwrap(res).movement
      const errText = JSON.stringify(res.data || {}).toLowerCase()
      const transient =
        res.status === 500 &&
        (errText.includes('transaction') ||
          errText.includes('timeout') ||
          errText.includes('too many') ||
          errText.includes('prisma') ||
          errText.includes('unable to start'))
      if ((res.status === 200 || res.status === 201) && movement?.id) {
        ok(`POST ${type}`, `movementId=${movement.movementId || movement.id}`)
        return movement
      }
      if (transient && attempt < maxAttempts - 1) continue
      const msg =
        unwrap(res).message ||
        res.data?.error?.message ||
        res.data?.message ||
        JSON.stringify(res.data).slice(0, 400)
      bad(`POST ${type}`, `HTTP ${res.status}: ${msg}`)
      return null
    }
    return null
  }

  // 1) Receipt (+10 at loc A) — admin only
  const r1 = await postMovement('receipt', {
    type: 'receipt',
    sku,
    itemName,
    quantity: 10,
    toLocationId: locA.id,
    unitCost: 0.01,
    reference: ref('receipt')
  })
  if (!r1) process.exit(1)

  // 2) Transfer A → B
  const r2 = await postMovement('transfer', {
    type: 'transfer',
    sku,
    itemName,
    quantity: 3,
    fromLocationId: locA.id,
    toLocationId: locB.id,
    reference: ref('transfer')
  })
  if (!r2) process.exit(1)

  // 3) Adjustment (+0.001 at A)
  const r3 = await postMovement('adjustment', {
    type: 'adjustment',
    sku,
    itemName,
    quantity: 0.001,
    fromLocationId: locA.id,
    reference: ref('adjustment-up')
  })
  if (!r3) process.exit(1)

  // 4) Consumption (from A; A has 10 - 3 + 0.001 = 7.001)
  const r4 = await postMovement('consumption', {
    type: 'consumption',
    sku,
    itemName,
    quantity: 0.5,
    fromLocationId: locA.id,
    reference: ref('consumption')
  })
  if (!r4) process.exit(1)

  // 5) Production (same path as consumption in API)
  const r5 = await postMovement('production', {
    type: 'production',
    sku,
    itemName,
    quantity: 0.5,
    fromLocationId: locA.id,
    reference: ref('production')
  })
  if (!r5) process.exit(1)

  // 6) Sale
  const r6 = await postMovement('sale', {
    type: 'sale',
    sku,
    itemName,
    quantity: 0.5,
    fromLocationId: locA.id,
    reference: ref('sale')
  })
  if (!r6) process.exit(1)

  // 7) Adjustment down (leave small positive balance)
  const r7 = await postMovement('adjustment', {
    type: 'adjustment',
    sku,
    itemName,
    quantity: -1,
    fromLocationId: locA.id,
    reference: ref('adjustment-down')
  })
  if (!r7) process.exit(1)

  ok('Summary', `all six movement kinds + closing adjustment OK — test SKU: ${sku} (remove in app if desired)`)

  const failed = results.filter((r) => !r.ok)
  console.log('\nDone:', results.filter((r) => r.ok).length, 'passed,', failed.length, 'failed')
  if (failed.length) {
    for (const f of failed) console.error(' ', f.name, f.detail)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
