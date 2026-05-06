#!/usr/bin/env node
/**
 * Set PMB on-hand for a fixed list of SKUs (adjustment movements + optional name sync).
 * Edit LINES below or duplicate this script for another small batch.
 *
 * Usage:
 *   node scripts/set-pmb-skus-from-list.mjs --dry-run
 *   node scripts/set-pmb-skus-from-list.mjs --execute
 *
 * Env:
 *   STOCK_TAKE_LOCATION_CODE - default PMB (same resolution as other stock scripts)
 */
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../api/_lib/prisma.js'
import {
  applyStockCountAdjustmentTx,
  findCanonicalInventoryItemBySkuTx
} from '../api/_lib/stockCountAdjustment.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const LOCATION_CODE =
  process.env.STOCK_TAKE_LOCATION_CODE?.trim().toUpperCase() || 'PMB'

const REFERENCE = 'Manual PMB line items sync'

/** @type {Array<{ sku: string, name: string, qty: number }>} */
const LINES = [
  { sku: 'SKU0418', name: 'DUAL CAR CHARGER PD USB 30W', qty: 9 },
  { sku: 'SKU0422', name: 'BEACONS - A TRACK', qty: 36 },
  { sku: 'SKU0423', name: 'SOLDERING IRON', qty: 4 },
  { sku: 'SKU0482', name: 'PHONE - SCREEN PROTECTOR (P30)', qty: 10 },
  { sku: 'SKU0483', name: 'PNEUMATICS - SOLENOID VALVE 1 INCH', qty: 0 }
]

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

async function applyOneAdjustment(prismaClient, params) {
  return prismaClient.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '120s'`
      return applyStockCountAdjustmentTx(tx, params)
    },
    { timeout: 130000, maxWait: 60000 }
  )
}

async function main() {
  const execute = process.argv.includes('--execute')
  const dryRun = process.argv.includes('--dry-run') || !execute

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const pmb = await resolveLocationByCode(prisma, LOCATION_CODE)
  if (!pmb) {
    console.error(`Stock location not found: ${LOCATION_CODE}`)
    process.exit(1)
  }

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

  const batchId = `pmb-lines-${Date.now()}`
  console.log('PMB:', pmb.code, '—', pmb.name)
  console.log('Mode:', dryRun ? 'DRY RUN' : 'EXECUTE')
  console.log('Lines:', LINES.length)
  console.log('')

  let nameUpdates = 0
  let qtyMoves = 0
  const errors = []

  for (const line of LINES) {
    const sku = String(line.sku).trim().toUpperCase()
    const targetQty = Number(line.qty) || 0
    const newName = String(line.name || '').trim()

    try {
      const canonical = await findCanonicalInventoryItemBySkuTx(prisma, sku)
      if (!canonical) {
        errors.push({ sku, error: 'No inventory catalog item for SKU' })
        console.log(sku, 'SKIP — no catalog item')
        continue
      }

      const li = await prisma.locationInventory.findUnique({
        where: { locationId_sku: { locationId: pmb.id, sku } }
      })
      const currentPmb = li?.quantity ?? 0

      if (newName && newName !== canonical.name) {
        console.log(sku, 'name:', JSON.stringify(canonical.name), '→', JSON.stringify(newName))
        if (!dryRun) {
          await prisma.inventoryItem.updateMany({ where: { sku }, data: { name: newName } })
          await prisma.locationInventory.updateMany({
            where: { sku },
            data: { itemName: newName }
          })
          nameUpdates++
        }
      }

      const displayName = newName || canonical.name
      const delta = targetQty - currentPmb
      console.log(
        sku,
        '| PMB now:',
        currentPmb,
        '| target:',
        targetQty,
        '| delta:',
        delta === 0 ? '0' : (delta > 0 ? '+' : '') + delta
      )

      if (Math.abs(delta) < 0.0001) continue

      if (dryRun) {
        qtyMoves++
        continue
      }

      const r = await applyOneAdjustment(prisma, {
        req: mockReq,
        sku,
        itemName: displayName,
        quantityDelta: delta,
        locationId: pmb.id,
        reference: REFERENCE,
        notes: `${REFERENCE} batch=${batchId} sku=${sku}`
      })
      if (r.movement) qtyMoves++
    } catch (e) {
      errors.push({ sku, error: e.message || String(e) })
    }
  }

  if (!dryRun && actor) {
    void logAuditFromRequest(prisma, mockReq, {
      action: 'update',
      entity: 'manufacturing',
      entityId: batchId,
      details: {
        resource: 'pmb-skus-manual-sync',
        summary: `${REFERENCE}: ${nameUpdates} name updates, ${qtyMoves} qty adjustments`,
        reference: REFERENCE,
        batchId,
        stockLocationId: pmb.id,
        stockLocationCode: pmb.code,
        nameUpdates,
        movementsApplied: qtyMoves,
        lineCount: LINES.length
      }
    })
  }

  console.log('')
  console.log(
    JSON.stringify(
      {
        ok: errors.length === 0,
        dryRun,
        batchId,
        nameUpdates,
        qtyAdjustments: qtyMoves,
        errors
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
