#!/usr/bin/env node
/**
 * Match InventoryItem rows by SKU to an Excel export (columns: sku, name, quantity).
 * Updates Item Name and applies quantity deltas via adjustment movements (same as stock count).
 *
 * By default, quantity is compared to on-hand at the PMB office only and adjustments post only
 * to that location (sheet = Pietermaritzburg physical count). Use --all-locations for legacy
 * behaviour (match company-wide total across all bins).
 *
 * Usage:
 *   node scripts/apply-stock-take-from-xlsx.mjs "/path/to/file.xlsx" [--dry-run] [--all-locations]
 *
 * Env:
 *   STOCK_TAKE_REFERENCE - label for movement reference/notes (default: Stock Take April 30 2026)
 *   STOCK_TAKE_LOCATION_CODE - stock location code when not using --all-locations (default: PMB)
 */
import dotenv from 'dotenv'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { prisma } from '../api/_lib/prisma.js'
import { applyStockCountAdjustmentTx, findCanonicalInventoryItemBySkuTx } from '../api/_lib/stockCountAdjustment.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const REFERENCE =
  process.env.STOCK_TAKE_REFERENCE?.trim() || 'Stock Take April 30 2026'

const LOCATION_CODE =
  process.env.STOCK_TAKE_LOCATION_CODE?.trim().toUpperCase() || 'PMB'

/**
 * Primary stock-take site (default PMB / Pietermaritzburg office).
 * Matches manufacturingStockLocations: code PMB, name PMB / "PMB *", or Pietermaritzburg in name.
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 */
function isPmbOfficeLocation(loc) {
  const code = String(loc.code || '').trim().toUpperCase()
  const name = String(loc.name || '').trim().toUpperCase()
  if (code === 'PMB') return true
  if (name === 'PMB') return true
  if (name.startsWith('PMB ')) return true
  if (name.includes('PIETERMARITZBURG')) return true
  return false
}

async function resolveLocationByCode(client, code) {
  const c = String(code || 'PMB').trim()
  const upper = c.toUpperCase()
  const loc = await client.stockLocation.findFirst({
    where: {
      OR: [
        { code: upper },
        { code: { equals: c, mode: 'insensitive' } },
        { name: { equals: c, mode: 'insensitive' } }
      ]
    },
    select: { id: true, code: true, name: true }
  })
  if (loc) return loc

  if (upper === 'PMB') {
    const all = await client.stockLocation.findMany({
      select: { id: true, code: true, name: true },
      orderBy: [{ code: 'asc' }]
    })
    const hit = all.find(isPmbOfficeLocation)
    if (hit) return hit
  }

  return null
}

function normalizeSku(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
}

function parseTargetQty(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v)
  const n = parseFloat(String(v).trim().replace(/,/g, ''))
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/** @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client */
async function getDefaultLocationId(client) {
  const loc = await client.stockLocation.findFirst({
    where: { OR: [{ code: 'LOC001' }, { code: { equals: 'MAIN', mode: 'insensitive' } }] },
    orderBy: { code: 'asc' },
    select: { id: true }
  })
  if (loc) return loc.id
  const any = await client.stockLocation.findFirst({ orderBy: { code: 'asc' }, select: { id: true } })
  if (!any) throw new Error('No stock locations in database')
  return any.id
}

/**
 * One Prisma interactive transaction per movement (avoids long tx + pool timeouts).
 * @param {import('@prisma/client').PrismaClient} prismaClient
 */
async function applyOneAdjustment(prismaClient, params) {
  return prismaClient.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '120s'`
      return applyStockCountAdjustmentTx(tx, params)
    },
    { timeout: 130000, maxWait: 60000 }
  )
}

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {object} params
 * @param {string | null} [params.onlyLocationId] - if set, compare sheet qty to this bin only and adjust only here (e.g. PMB).
 */
async function applyTargetQuantity(prismaClient, params) {
  const { req, sku, itemName, targetQty, reference, notes, onlyLocationId } = params
  const canonical = await findCanonicalInventoryItemBySkuTx(prismaClient, sku)
  if (!canonical) throw new Error(`SKU not found: ${sku}`)

  /** @type {number} */
  let current
  if (onlyLocationId) {
    const li = await prismaClient.locationInventory.findUnique({
      where: { locationId_sku: { locationId: onlyLocationId, sku } }
    })
    current = li?.quantity ?? 0
  } else {
    const sumRow = await prismaClient.locationInventory.aggregate({
      where: { sku },
      _sum: { quantity: true }
    })
    current = sumRow._sum.quantity ?? 0
    if (current < 0.0001 && (canonical.quantity ?? 0) > 0.0001) {
      current = canonical.quantity
    }
  }

  const delta = targetQty - current
  if (Math.abs(delta) < 0.0001) {
    return { movements: [] }
  }

  const movements = []
  const ref = String(reference || '').trim().slice(0, 500)

  if (onlyLocationId) {
    const r = await applyOneAdjustment(prismaClient, {
      req,
      sku,
      itemName,
      quantityDelta: delta,
      locationId: onlyLocationId,
      reference: ref,
      notes: `${notes} (${delta >= 0 ? '+' : ''}${delta} at stock-take location)`
    })
    if (r.movement) movements.push(r.movement)
    return { movements }
  }

  const locations = await prismaClient.locationInventory.findMany({
    where: { sku },
    orderBy: { quantity: 'desc' }
  })

  if (delta > 0) {
    const anchorId =
      locations[0]?.locationId ||
      canonical.locationId ||
      (await getDefaultLocationId(prismaClient))
    const r = await applyOneAdjustment(prismaClient, {
      req,
      sku,
      itemName,
      quantityDelta: delta,
      locationId: anchorId,
      reference: ref,
      notes: `${notes} (+${delta} to match count)`
    })
    if (r.movement) movements.push(r.movement)
    return { movements }
  }

  const toRemove = -delta
  let remaining = toRemove
  const plan = locations.map((li) => ({
    locationId: li.locationId,
    qty: li.quantity || 0
  }))

  for (const row of plan) {
    if (remaining < 0.0001) break
    const take = Math.min(row.qty, remaining)
    if (take < 0.0001) continue
    const r = await applyOneAdjustment(prismaClient, {
      req,
      sku,
      itemName,
      quantityDelta: -take,
      locationId: row.locationId,
      reference: ref,
      notes: `${notes} (-${take} at location)`
    })
    if (r.movement) movements.push(r.movement)
    remaining -= take
  }

  if (remaining > 0.0001) {
    throw new Error(
      `Cannot reduce ${sku} to ${targetQty}: need to remove ${toRemove} but only had ${toRemove - remaining} on hand`
    )
  }

  return { movements }
}

function parseRow(raw, rowIndex) {
  const sku = normalizeSku(raw.sku ?? raw.SKU ?? raw['SKU Numbers'] ?? raw['sku'])
  const name = String(raw.name ?? raw.Name ?? raw.NAME ?? '').trim()
  const targetQty = parseTargetQty(raw.quantity ?? raw.Quantity ?? raw.QTY)
  return { sku, name, targetQty, fileRow: rowIndex + 2 }
}

/**
 * Prefetch canonical inventory rows (same ordering as findCanonicalInventoryItemBySkuTx)
 * and per-SKU quantities used for dry-run comparison (all locations sum, or single location).
 * @param {string | null} onlyLocationId
 */
async function loadInventorySnapshot(skuList, onlyLocationId) {
  if (!skuList.length) {
    return { canonicalBySku: new Map(), sumBySku: new Map() }
  }
  const items = await prisma.inventoryItem.findMany({
    where: { sku: { in: skuList } },
    orderBy: [{ sku: 'asc' }, { locationId: 'asc' }, { updatedAt: 'desc' }],
    select: { id: true, sku: true, name: true, quantity: true, locationId: true }
  })
  const canonicalBySku = new Map()
  for (const item of items) {
    if (!canonicalBySku.has(item.sku)) canonicalBySku.set(item.sku, item)
  }
  if (onlyLocationId) {
    const rows = await prisma.locationInventory.findMany({
      where: { sku: { in: skuList }, locationId: onlyLocationId },
      select: { sku: true, quantity: true }
    })
    const sumBySku = new Map(rows.map((r) => [r.sku, r.quantity ?? 0]))
    return { canonicalBySku, sumBySku }
  }
  const sums = await prisma.locationInventory.groupBy({
    by: ['sku'],
    where: { sku: { in: skuList } },
    _sum: { quantity: true }
  })
  const sumBySku = new Map(sums.map((s) => [s.sku, s._sum.quantity ?? 0]))
  return { canonicalBySku, sumBySku }
}

function currentQuantityForSku(canonical, liSum, useGlobalFallback) {
  let cur = liSum
  if (
    useGlobalFallback &&
    cur < 0.0001 &&
    (canonical?.quantity ?? 0) > 0.0001
  ) {
    cur = canonical.quantity
  }
  return cur
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const dryRun = process.argv.includes('--dry-run')
  const allLocations = process.argv.includes('--all-locations')
  const fileArg = args[0]
  if (!fileArg) {
    console.error(
      'Usage: node scripts/apply-stock-take-from-xlsx.mjs "/path/to/file.xlsx" [--dry-run] [--all-locations]'
    )
    process.exit(1)
  }
  const inputPath = resolve(fileArg)
  if (!existsSync(inputPath)) {
    console.error('File not found:', inputPath)
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (check .env)')
    process.exit(1)
  }

  let workbook
  try {
    workbook = XLSX.read(readFileSync(inputPath), { type: 'buffer' })
  } catch (e) {
    console.error('Failed to read Excel:', e.message)
    process.exit(1)
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!rows.length) {
    console.error('Sheet has no rows')
    process.exit(1)
  }

  const parsed = []
  for (let i = 0; i < rows.length; i++) {
    const p = parseRow(rows[i], i)
    if (!p.sku) {
      parsed.push({ ...p, error: 'Missing sku' })
      continue
    }
    parsed.push(p)
  }

  let onlyLocationId = null
  /** @type {{ id: string, code: string, name: string } | null} */
  let resolvedLocation = null
  if (!allLocations) {
    resolvedLocation = await resolveLocationByCode(prisma, LOCATION_CODE)
    if (!resolvedLocation) {
      console.error(
        `Stock location not found for STOCK_TAKE_LOCATION_CODE / code: ${LOCATION_CODE}`
      )
      process.exit(1)
    }
    onlyLocationId = resolvedLocation.id
    console.log(
      'Quantity scope: single location',
      resolvedLocation.code,
      '—',
      resolvedLocation.name,
      `(${onlyLocationId})`
    )
  } else {
    console.log('Quantity scope: --all-locations (match system-wide total across bins)')
  }

  const skuList = [...new Set(parsed.filter((p) => p.sku && !p.error).map((p) => p.sku))]
  console.log('Loading inventory snapshot for', skuList.length, 'SKUs…')
  const { canonicalBySku, sumBySku } = await loadInventorySnapshot(
    skuList,
    onlyLocationId
  )

  const actor =
    (await prisma.user.findFirst({
      where: { role: { in: ['admin', 'administrator', 'superadmin'] } },
      select: { id: true, name: true, role: true, email: true }
    })) || (await prisma.user.findFirst({ select: { id: true, name: true, role: true, email: true } }))

  const mockReq = {
    method: 'POST',
    user: {
      sub: actor?.id || 'script',
      id: actor?.id || 'script',
      name: actor?.name || REFERENCE,
      email: actor?.email || '',
      role: actor?.role || 'admin'
    },
    headers: {},
    connection: {},
    socket: {}
  }

  const batchId = `st-${Date.now()}`
  let nameUpdates = 0
  let qtyAdjustments = 0
  let movementsCreated = 0
  let skippedQty = 0
  const missingSku = []
  const errors = []

  console.log('Reference:', REFERENCE)
  console.log('Batch id:', batchId)
  console.log('Rows in file:', rows.length)
  if (dryRun) console.log('(Dry run — no DB writes)\n')
  if (resolvedLocation) {
    console.log('(Names still update on the catalog for all sites; quantity changes only at', resolvedLocation.code + ')\n')
  }

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]
    if (p.error) {
      errors.push({ row: p.fileRow, error: p.error })
      continue
    }
    const { sku, name, targetQty, fileRow } = p

    const canonical = canonicalBySku.get(sku)
    if (!canonical) {
      missingSku.push(sku)
      continue
    }

    if (dryRun) {
      if (name && name !== canonical.name) nameUpdates++
      const cur = currentQuantityForSku(
        canonical,
        sumBySku.get(sku) ?? 0,
        allLocations
      )
      if (Math.abs(targetQty - cur) >= 0.0001) qtyAdjustments++
      else skippedQty++
      continue
    }

    try {
      if (name && name !== canonical.name) {
        await prisma.inventoryItem.updateMany({
          where: { sku },
          data: { name }
        })
        await prisma.locationInventory.updateMany({
          where: { sku },
          data: { itemName: name }
        })
        nameUpdates++
      }

      const displayName = name || canonical.name
      const { movements } = await applyTargetQuantity(prisma, {
        req: mockReq,
        sku,
        itemName: displayName,
        targetQty,
        reference: REFERENCE,
        notes: `${REFERENCE} batch=${batchId} fileRow=${fileRow}`,
        onlyLocationId
      })
      if (movements.length) {
        movementsCreated += movements.length
        qtyAdjustments++
      } else {
        skippedQty++
      }
    } catch (e) {
      errors.push({ row: fileRow, sku, error: e.message || String(e) })
    }

    if (!dryRun && (i + 1) % 50 === 0) {
      console.log(`… processed ${i + 1}/${parsed.length}`)
    }
  }

  if (!dryRun && actor) {
    void logAuditFromRequest(prisma, mockReq, {
      action: 'create',
      entity: 'manufacturing',
      entityId: batchId,
      details: {
        resource: 'stock-take-xlsx-import',
        summary: `${REFERENCE}: ${nameUpdates} name updates, ${qtyAdjustments} qty-adjusted SKUs, ${movementsCreated} movements (${skippedQty} qty unchanged)`,
        reference: REFERENCE,
        batchId,
        sourceFile: inputPath,
        quantityScope: allLocations ? 'all_locations' : 'single_location',
        stockLocationCode: resolvedLocation?.code ?? null,
        stockLocationId: resolvedLocation?.id ?? null,
        stockLocationName: resolvedLocation?.name ?? null,
        nameUpdates,
        qtyAdjustments,
        movementsCreated,
        skippedQty,
        missingSkuCount: missingSku.length,
        errorCount: errors.length
      }
    })
  }

  console.log(
    JSON.stringify(
      {
        ok: errors.length === 0,
        reference: REFERENCE,
        batchId,
        quantityScope: allLocations ? 'all_locations' : 'single_location',
        stockLocation: resolvedLocation
          ? {
              code: resolvedLocation.code,
              name: resolvedLocation.name,
              id: resolvedLocation.id
            }
          : null,
        nameUpdates,
        qtyAdjustments,
        movementsCreated,
        skippedQtyUnchanged: skippedQty,
        missingSku: missingSku.slice(0, 30),
        missingSkuTotal: missingSku.length,
        errors: errors.slice(0, 20),
        errorTotal: errors.length
      },
      null,
      2
    )
  )

  await prisma.$disconnect()
  if (errors.length) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
