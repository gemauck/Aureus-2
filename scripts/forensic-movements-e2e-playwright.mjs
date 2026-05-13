#!/usr/bin/env node
/**
 * Forensic E2E audit: disposable SKU, seed via API, record movements in the Manufacturing UI (Playwright),
 * then API-only types not in the Record Movement modal (`sale`, `production`), then DB forensic reconciliation.
 *
 * UI modal exposes (admin): receipt, consumption, transfer, adjustment — not sale/production.
 *
 * Env: TEST_URL (default http://localhost:3000), TEST_EMAIL, TEST_PASSWORD (must be admin / superadmin).
 *
 * Run: npm run audit:forensic:movements:e2e
 * Full (adds PO goods receipt, sales-order ship, production completion via API, each audited): --extended
 *   npm run audit:forensic:movements:e2e:full
 * Extra Manufacturing tab smoke (inventory, BOM, production, …) before closing the browser: --mega-ui
 * Requires: dev server (`npm run dev:backend`), `npm run build:jsx`, DB reachable via DATABASE_URL.
 */

import { chromium } from 'playwright'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runForensicSkuAudit } from './forensic-stock-movement-audit.mjs'
import { prisma } from '../api/_lib/prisma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'http://localhost:3000'
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

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

function isTransientDbPressure(res) {
  const errText = JSON.stringify(res.data || {}).toLowerCase()
  return (
    res.status === 500 &&
    (errText.includes('transaction') ||
      errText.includes('timeout') ||
      errText.includes('too many') ||
      errText.includes('prisma') ||
      errText.includes('unable to start'))
  )
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

async function postMovement(token, body) {
  const maxAttempts = 8
  const stepPauseMs = 1800
  await pause(stepPauseMs)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await pause(2800 + 2400 * attempt)
      console.log(`   (retry ${attempt} for POST ${body.type})`)
    }
    const res = await api('/api/manufacturing/stock-movements', 'POST', body, token)
    const movement = unwrap(res).movement
    if ((res.status === 200 || res.status === 201) && movement?.id) return movement
    if (isTransientDbPressure(res) && attempt < maxAttempts - 1) continue
    const msg = unwrap(res).message || JSON.stringify(res.data).slice(0, 400)
    throw new Error(`POST ${body.type} failed HTTP ${res.status}: ${msg}`)
  }
  throw new Error(`POST ${body.type} failed after ${maxAttempts} attempts`)
}

async function postJson(path, body, token) {
  const maxAttempts = 8
  const stepPauseMs = 1200
  await pause(stepPauseMs)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await pause(2800 + 2400 * attempt)
      console.log(`   (retry ${attempt} for POST ${path})`)
    }
    const res = await api(path, 'POST', body, token)
    const d = unwrap(res)
    if (res.status >= 200 && res.status < 300) return d
    if (isTransientDbPressure(res) && attempt < maxAttempts - 1) continue
    throw new Error(`POST ${path} HTTP ${res.status}: ${d.message || JSON.stringify(d).slice(0, 400)}`)
  }
  throw new Error(`POST ${path} failed after ${maxAttempts} attempts`)
}

async function patchJson(path, body, token) {
  const maxAttempts = 8
  const stepPauseMs = 1200
  await pause(stepPauseMs)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await pause(2800 + 2400 * attempt)
      console.log(`   (retry ${attempt} for PATCH ${path})`)
    }
    const res = await api(path, 'PATCH', body, token)
    const d = unwrap(res)
    if (res.status >= 200 && res.status < 300) return d
    if (isTransientDbPressure(res) && attempt < maxAttempts - 1) continue
    throw new Error(`PATCH ${path} HTTP ${res.status}: ${d.message || JSON.stringify(d).slice(0, 400)}`)
  }
  throw new Error(`PATCH ${path} failed after ${maxAttempts} attempts`)
}

async function findInventoryRow(token, sku) {
  const res = await api('/api/manufacturing/inventory', 'GET', null, token)
  const inv = unwrap(res).inventory || unwrap(res).items || []
  return inv.find((i) => String(i.sku || '').trim() === sku) || null
}

/**
 * API flows that mirror PO receipt, SO ship, and production completion (same persistence as the UIs).
 * Each flow uses its own disposable SKU(s) and ends with `runForensicSkuAudit`.
 */
async function runExtendedForensicFlows(token, locA, stamp) {
  const results = []

  async function audit(label, sku) {
    const { ok, report } = await runForensicSkuAudit(prisma, sku)
    results.push({ label, sku, ok, report })
    const mark = ok ? '✓' : '✗'
    console.log(`${mark} Extended audit [${label}] SKU=${sku} movements=${report.movementCount} ΣLI=${report.sumLocationInventory}`)
    if (!ok) {
      console.error(`   FAIL ${label}:`, JSON.stringify(report, null, 2).slice(0, 2500))
    }
    return ok
  }

  // --- Purchase order → goods_received (receipt movements, PO reference) ---
  const skuPo = `FORENSIC-PO-${stamp}`
  try {
    const supRes = await api('/api/manufacturing/suppliers', 'GET', null, token)
    const suppliers = unwrap(supRes).suppliers || []
    const supplier = suppliers[0]
    if (!supplier?.id) {
      console.warn('⏭️  Extended: skip PO (no suppliers in DB)')
    } else {
      const line = {
        sku: skuPo,
        name: `Forensic PO line ${stamp}`,
        quantity: 10,
        unitPrice: 1,
        total: 10,
        supplierPartNumber: ''
      }
      const poData = await postJson(
        '/api/purchase-orders',
        {
          supplierId: supplier.id,
          supplierName: supplier.name || 'Supplier',
          items: [line],
          subtotal: 10,
          tax: 0,
          total: 10,
          includeVat: false,
          receivingLocationId: locA.id,
          notes: `forensic-po-${stamp}`
        },
        token
      )
      const poId = poData.purchaseOrder?.id
      if (!poId) throw new Error('PO create: missing id')
      await patchJson(`/api/purchase-orders/${poId}`, { status: 'final' }, token)
      await patchJson(`/api/purchase-orders/${poId}`, { status: 'sent' }, token)
      await patchJson(
        `/api/purchase-orders/${poId}`,
        {
          status: 'goods_received',
          receivedLines: [{ sku: skuPo, quantityReceived: 4, unitPrice: 1 }]
        },
        token
      )
      console.log('✓ Extended: PO goods_received 4 units →', skuPo)
      await audit('PO goods receipt', skuPo)
    }
  } catch (e) {
    console.error('✗ Extended PO flow:', e.message)
    results.push({ label: 'PO goods receipt', sku: skuPo, ok: false, error: e.message })
  }

  // --- Sales order → shipped (sale movements) ---
  const skuSo = `FORENSIC-SO-${stamp}`
  try {
    await postMovement(token, {
      type: 'receipt',
      sku: skuSo,
      itemName: `Forensic SO seed ${stamp}`,
      quantity: 15,
      toLocationId: locA.id,
      unitCost: 0.01,
      reference: `forensic-so-seed-${stamp}`
    })
    const soData = await postJson(
      '/api/sales-orders',
      {
        clientName: `Forensic Client ${stamp}`,
        status: 'draft',
        items: [{ sku: skuSo, name: `Forensic SO line ${stamp}`, quantity: 2, locationId: locA.id }],
        subtotal: 0,
        tax: 0,
        total: 0,
        notes: `forensic-so-${stamp}`
      },
      token
    )
    const soId = soData.salesOrder?.id
    if (!soId) throw new Error('Sales order create: missing id')
    await patchJson(`/api/sales-orders/${soId}`, { status: 'shipped' }, token)
    console.log('✓ Extended: Sales order shipped −2 @', locA.code, '→', skuSo)
    await audit('Sales order ship', skuSo)
  } catch (e) {
    console.error('✗ Extended SO flow:', e.message)
    results.push({ label: 'Sales order ship', sku: skuSo, ok: false, error: e.message })
  }

  // --- Production order completion (consumption + finished-good receipt movements) ---
  const skuComp = `FORENSIC-PC-${stamp}`
  const skuFg = `FORENSIC-FG-${stamp}`
  try {
    await postMovement(token, {
      type: 'receipt',
      sku: skuComp,
      itemName: `Forensic component ${stamp}`,
      quantity: 40,
      toLocationId: locA.id,
      unitCost: 0.01,
      reference: `forensic-pc-seed-${stamp}`
    })
    await postMovement(token, {
      type: 'receipt',
      sku: skuFg,
      itemName: `Forensic finished good ${stamp}`,
      quantity: 1,
      toLocationId: locA.id,
      unitCost: 0.01,
      category: 'finished_goods',
      itemType: 'finished_good',
      reference: `forensic-fg-seed-${stamp}`
    })
    const fgRow = await findInventoryRow(token, skuFg)
    if (!fgRow?.id) throw new Error(`No inventory row for FG ${skuFg}`)

    const bomData = await postJson(
      '/api/manufacturing/boms',
      {
        productSku: skuFg,
        productName: `Forensic FG ${stamp}`,
        inventoryItemId: fgRow.id,
        components: [{ sku: skuComp, quantity: 2, name: 'Comp', unitCost: 0.01 }],
        notes: `forensic-bom-${stamp}`
      },
      token
    )
    const bomId = bomData.bom?.id
    if (!bomId) throw new Error('BOM create: missing id')

    const ordData = await postJson(
      '/api/manufacturing/production-orders',
      {
        bomId,
        productSku: skuFg,
        productName: `Forensic FG ${stamp}`,
        quantity: 1,
        quantityProduced: 1,
        status: 'in_production',
        workOrderNumber: `FORENSIC-WO-${stamp}`,
        notes: `forensic-prod-${stamp}`
      },
      token
    )
    const orderId = ordData.order?.id
    if (!orderId) throw new Error('Production order create: missing id')

    await patchJson(`/api/manufacturing/production-orders/${orderId}`, { status: 'completed' }, token)
    console.log('✓ Extended: Production order completed (BOM consumes comp, receipts FG)')

    await audit('Production completion (component)', skuComp)
    await audit('Production completion (finished good)', skuFg)
  } catch (e) {
    console.error('✗ Extended production flow:', e.message)
    results.push({ label: 'Production completion', sku: `${skuComp}/${skuFg}`, ok: false, error: e.message })
  }

  return results
}

/**
 * @param {import('playwright').Page} page
 * @param {string} sku
 */
async function openRecordModal(page) {
  const modalSel = page.getByTestId('record-stock-movement-modal')
  await modalSel.waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  await pageWait(500)
  const recordBtn = page.getByRole('button', { name: /Record Stock Movement|Record Movement/i })
  await recordBtn.first().waitFor({ state: 'visible', timeout: 45000 })
  await recordBtn.first().scrollIntoViewIfNeeded().catch(() => {})
  await recordBtn.first().click({ timeout: 45000 })
  const modal = page.getByTestId('record-stock-movement-modal')
  await modal.waitFor({ state: 'visible', timeout: 20000 })
  return modal
}

/**
 * @param {import('playwright').Locator} modal
 */
async function fillMovementForm(modal, { type, sku, quantity, reference, fromLocationId, toLocationId }) {
  const selects = modal.locator('select')
  await selects.nth(0).selectOption(type)
  await pageWait(350)
  await selects.nth(1).selectOption(sku)
  await modal.getByLabel(/Quantity/i).first().fill(String(quantity))
  if (reference) {
    await modal.getByLabel(/Reference/i).fill(reference)
  }

  const n = await selects.count()
  if (type === 'transfer') {
    if (n < 4) throw new Error(`Expected 4 selects for transfer, got ${n}`)
    await selects.nth(2).selectOption(fromLocationId)
    await selects.nth(3).selectOption(toLocationId)
  } else if (type === 'consumption' || type === 'adjustment') {
    await selects.nth(2).selectOption(fromLocationId)
  } else if (type === 'receipt') {
    await selects.nth(2).selectOption(toLocationId)
  }
}

function pageWait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function submitRecordModal(modal, page) {
  await modal.getByRole('button', { name: 'Record Movement' }).click()
  await page.getByTestId('record-stock-movement-modal').waitFor({ state: 'hidden', timeout: 90000 })
  await pageWait(800)
}

async function main() {
  const extended = process.argv.includes('--extended')
  const megaUi = process.argv.includes('--mega-ui')
  console.log(
    'Forensic movements E2E —',
    BASE_URL,
    [extended && '+ --extended', megaUi && '+ --mega-ui'].filter(Boolean).join(' ')
  )
  if (!EMAIL || !PASSWORD) {
    console.error('Set TEST_EMAIL and TEST_PASSWORD (admin) for UI + API seed.')
    process.exit(1)
  }

  const token = await login()
  if (!token) {
    console.error('Login failed')
    process.exit(1)
  }
  console.log('✓ Login')

  const locRes = await api('/api/manufacturing/locations', 'GET', null, token)
  const locations = unwrap(locRes).locations || []
  if (locations.length < 2) {
    console.error('Need at least 2 stock locations')
    process.exit(1)
  }
  const locA = locations[0]
  const locB = locations[1]
  console.log('✓ Locations', locA.code, '→', locB.code)

  const stamp = Date.now().toString(36).toUpperCase()
  const sku = `FORENSIC-E2E-${stamp}`
  const name = `Forensic E2E ${stamp}`

  await postMovement(token, {
    type: 'receipt',
    sku,
    itemName: name,
    quantity: 22,
    toLocationId: locA.id,
    unitCost: 0.01,
    reference: `forensic-seed-${stamp}`
  })
  console.log('✓ API seed receipt +22 @', locA.code, 'SKU', sku)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(90000)
  page.on('dialog', (d) => {
    try {
      d.accept()
    } catch {
      /* ignore */
    }
  })

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first()
    await emailInput.waitFor({ state: 'visible', timeout: 30000 })
    await emailInput.fill(EMAIL)
    await passwordInput.fill(PASSWORD)
    const loginWait = page.waitForResponse(
      (res) => res.url().includes('/api/auth/login') && res.status() === 200,
      { timeout: 30000 }
    )
    await page.locator('button[type="submit"]').first().click()
    await loginWait
    await page
      .waitForFunction(() => !document.body.classList.contains('login-page'), { timeout: 45000 })
      .catch(() => {})

    await page.goto(`${BASE_URL}/manufacturing/inventory`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.getByTestId('manufacturing-app-header').waitFor({ state: 'visible', timeout: 90000 }).catch(() => {})
    await page.goto(`${BASE_URL}/manufacturing/movements`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.getByTestId('manufacturing-app-header').waitFor({ state: 'visible', timeout: 90000 }).catch(() => {})

    // --- UI: transfer ---
    let modal = await openRecordModal(page)
    await fillMovementForm(modal, {
      type: 'transfer',
      sku,
      quantity: 5,
      reference: `forensic-ui-transfer-${stamp}`,
      fromLocationId: locA.id,
      toLocationId: locB.id
    })
    await submitRecordModal(modal, page)
    console.log('✓ UI transfer 5')

    // --- UI: adjustment +0.5 @ A ---
    modal = await openRecordModal(page)
    await fillMovementForm(modal, {
      type: 'adjustment',
      sku,
      quantity: 0.5,
      reference: `forensic-ui-adj-${stamp}`,
      fromLocationId: locA.id
    })
    await submitRecordModal(modal, page)
    console.log('✓ UI adjustment +0.5 @', locA.code)

    // --- UI: consumption ---
    modal = await openRecordModal(page)
    await fillMovementForm(modal, {
      type: 'consumption',
      sku,
      quantity: 1,
      reference: `forensic-ui-cons-${stamp}`,
      fromLocationId: locA.id
    })
    await submitRecordModal(modal, page)
    console.log('✓ UI consumption 1')

    // --- UI: receipt +2 @ A ---
    modal = await openRecordModal(page)
    await fillMovementForm(modal, {
      type: 'receipt',
      sku,
      quantity: 2,
      reference: `forensic-ui-receipt-${stamp}`,
      toLocationId: locA.id
    })
    await submitRecordModal(modal, page)
    console.log('✓ UI receipt +2')

    if (megaUi) {
      console.log('\n--- MEGA UI: Manufacturing surface routes (best-effort per tab) ---')
      const header = page.getByTestId('manufacturing-app-header')
      const surface = [
        ['/manufacturing/inventory', 'inventory'],
        ['/manufacturing/bom', 'bom'],
        ['/manufacturing/production', 'production'],
        ['/manufacturing/locations', 'locations'],
        ['/manufacturing/purchase', 'purchase'],
        ['/manufacturing/dashboard', 'dashboard']
      ]
      for (const [path, label] of surface) {
        try {
          await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
          await header.waitFor({ state: 'visible', timeout: 45000 })
          const okHeader = await header.isVisible().catch(() => false)
          if (!okHeader) throw new Error('manufacturing-app-header not visible')
          console.log(`✓ MEGA UI ${label} (${path})`)
        } catch (e) {
          console.warn(`⚠️ MEGA UI ${label} (${path}):`, e.message || e)
        }
      }
      await page.goto(`${BASE_URL}/manufacturing/movements`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await header.waitFor({ state: 'visible', timeout: 45000 }).catch(() => {})
      const refreshBtn = page.getByRole('button', { name: /Refresh/i })
      if (await refreshBtn.first().isVisible().catch(() => false)) {
        await refreshBtn.first().click()
        await pageWait(1500)
        console.log('✓ MEGA UI Stock Movements → Refresh')
      }
    }

    await browser.close()
  } catch (e) {
    console.error('Playwright error:', e.message)
    await browser.close().catch(() => {})
    process.exit(1)
  }

  // API-only movement kinds (not in Record Movement dropdown)
  await postMovement(token, {
    type: 'sale',
    sku,
    itemName: name,
    quantity: 0.5,
    fromLocationId: locA.id,
    reference: `forensic-api-sale-${stamp}`
  })
  console.log('✓ API sale 0.5')

  await postMovement(token, {
    type: 'production',
    sku,
    itemName: name,
    quantity: 0.5,
    fromLocationId: locA.id,
    reference: `forensic-api-prod-${stamp}`
  })
  console.log('✓ API production 0.5')

  const { ok, report } = await runForensicSkuAudit(prisma, sku)
  console.log('\n--- Forensic audit (DB) ---')
  console.log('Movements:', report.movementCount)
  console.log('Σ LI:', report.sumLocationInventory, '| combined net:', report.combinedMovementNet)
  console.log('Catalog:', report.catalogQuantity)
  for (const row of report.perLocationAudit) {
    const mark = row.reconciled ? '✓' : '✗'
    console.log(`${mark} ${row.locationCode || row.locationId} hand=${row.recordedOnHand} netMov=${row.netFromMovements}`)
  }

  if (!ok) {
    console.log('\nFAIL detail:', JSON.stringify(report, null, 2).slice(0, 4000))
  } else {
    console.log('\n=== FORENSIC AUDIT PASS (core SKU) ===')
    console.log('Disposable SKU (remove in app if desired):', sku)
  }

  let extendedOk = true
  if (extended && ok) {
    console.log('\n--- Extended flows (PO / SO / production) ---')
    const extResults = await runExtendedForensicFlows(token, locA, stamp)
    extendedOk = !extResults.some((r) => r.ok === false)
  }

  await prisma.$disconnect().catch(() => {})
  process.exit(ok && extendedOk ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
