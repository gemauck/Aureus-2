#!/usr/bin/env node
/**
 * Ledger reconstruction after a stock-take cutover:
 *
 * 1. Optionally removes prior baseline rows from a previous run (reference prefix).
 * 2. Deletes StockMovement rows — either before cutoff only (default), or **all** rows with
 *    `--delete-all-movements` (drops post–April history too; baselines become full current on-hand).
 * 3. Inserts "adjustment" movements dated at the stock-take anchor. Behavior depends on mode:
 *    - **Default / cutoff / `--delete-all-movements`:** implied opening per `LocationInventory` row
 *      from retained movements (same rules as Manufacturing per-site detail).
 *    - **`--mismatch-only`:** deletes all movements for mismatched SKUs, then inserts **exactly one**
 *      baseline per SKU: `fromLocation` = **main office only** (`01_LOC1`, else `LOC001`, else first
 *      site), `quantity` = **total** on-hand (Σ `LocationInventory` or catalog when no LI rows).
 *      References look like `LEDGER_BASELINE_…:SKUxxxx:<mainOfficeId>`. Use transfers afterward for
 *      per-warehouse movement truth (see `plan:location-ledger-rebalance`).
 *
 * Does NOT change LocationInventory or InventoryItem quantities — ledger-only fix so movement
 * history matches **current** on-hand at run time. Product rule elsewhere: ongoing corrections
 * should use stock take / `applyStockCountAdjustmentTx` (movements + LI in one transaction).
 * If LI is edited without new movements after this script, variance vs movements will return.
 *
 * Usage:
 *   node scripts/ledger-cutover-after-stocktake.js --dry-run --mismatch-only
 *   node scripts/backup-stock-movements.js
 *   node scripts/ledger-cutover-after-stocktake.js --write --mismatch-only [--backup-out reports/backup.json]
 *
 * Options:
 *   --dry-run          Print counts and sample baselines; no DB writes.
 *   --write            Execute delete + inserts (destructive).
 *   --cutoff=ISO       Default: 2026-05-01T00:00:00.000Z (delete movements strictly before this; keep this instant onward).
 *   --delete-all-movements  Delete **every** StockMovement row, then insert baselines = current on-hand only (no retained history).
 *   --mismatch-only         Only SKUs where combined ledger net ≠ recorded on-hand (Manufacturing “All locations” check).
 *                           Deletes **all** movements for those SKUs and inserts **one** baseline per SKU at **main office only**
 *                           (`01_LOC1` / `LOC001`), quantity = **total** on-hand (Σ locations). Reconciled SKUs unchanged. Incompatible with `--delete-all-movements`.
 *   --opening-date=ISO Default: 2026-04-30T23:59:59.999Z (movement date for new baseline rows).
 *   --backup-out=PATH  If used with --write, writes the same JSON backup as backup-stock-movements.js first.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { LEDGER_BASELINE_REF_PREFIX } from '../api/_lib/ledgerBaselinePrefix.js'
import { buildMovementId } from '../api/_lib/stockCountAdjustment.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const REF_PREFIX = LEDGER_BASELINE_REF_PREFIX

function parseArgs() {
  const argv = process.argv.slice(2)
  const out = {
    dryRun: argv.includes('--dry-run'),
    write: argv.includes('--write'),
    deleteAllMovements: argv.includes('--delete-all-movements'),
    mismatchOnly: argv.includes('--mismatch-only'),
    cutoff: null,
    openingDate: null,
    backupOut: ''
  }
  for (const a of argv) {
    if (a.startsWith('--cutoff=')) out.cutoff = a.slice('--cutoff='.length)
    if (a.startsWith('--opening-date=')) out.openingDate = a.slice('--opening-date='.length)
    if (a.startsWith('--backup-out=')) out.backupOut = a.slice('--backup-out='.length)
  }
  if (!out.cutoff) out.cutoff = '2026-05-01T00:00:00.000Z'
  if (!out.openingDate) out.openingDate = '2026-04-30T23:59:59.999Z'
  return out
}

function effectiveMovementDate(m) {
  const d = m.date ? new Date(m.date) : new Date(m.createdAt)
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

function normalizeAtLocation(m, locId, locCode) {
  const matches = (loc) => !!loc && (loc === locId || (!!locCode && loc === locCode))
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') {
    const qtyAbs = Math.abs(qty)
    const fromHere = matches(m.fromLocation)
    const toHere = matches(m.toLocation)
    if (toHere && !fromHere) return qtyAbs
    if (fromHere && !toHere) return -qtyAbs
    if (fromHere && toHere) return 0
    return 0
  }
  const touches = matches(m.fromLocation) || matches(m.toLocation)
  if (!touches) return 0
  if (t === 'receipt') return Math.abs(qty)
  if (t === 'production') return -Math.abs(qty)
  if (t === 'consumption' || t === 'sale') return -Math.abs(qty)
  if (t === 'issue') return -Math.abs(qty)
  return qty
}

function normalizeCombined(m) {
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') return 0
  if (t === 'receipt') return Math.abs(qty)
  if (t === 'production') return -Math.abs(qty)
  if (t === 'consumption' || t === 'sale') return -Math.abs(qty)
  if (t === 'issue') return -Math.abs(qty)
  return qty
}

async function loadCanonicalBySku() {
  const rows = await prisma.inventoryItem.findMany({
    orderBy: [{ sku: 'asc' }, { locationId: 'asc' }, { updatedAt: 'desc' }]
  })
  /** @type {Map<string, object>} */
  const map = new Map()
  for (const row of rows) {
    const k = String(row.sku || '').trim()
    if (!k || map.has(k)) continue
    map.set(k, row)
  }
  return map
}

const EPS = 0.0001

/** Prefer main office / legacy main warehouse code when catalog-only SKU has no LI row. */
function defaultCatalogLocationId(locations) {
  const list = locations || []
  return (
    list.find((l) => String(l.code || '').trim() === '01_LOC1')?.id ||
    list.find((l) => String(l.code || '').trim() === 'LOC001')?.id ||
    list[0]?.id ||
    null
  )
}

/**
 * Same combined ledger vs stock check as Manufacturing inventory detail (all locations).
 * @returns {{ mismatched: string[], recordedCombined: (sku: string) => number, movementCountBySku: Map<string, number> }}
 */
async function findMismatchedSkus() {
  const liRows = await prisma.locationInventory.findMany({
    include: { location: { select: { id: true, code: true } } }
  })
  const liSumBySku = new Map()
  const liCountBySku = new Map()
  for (const r of liRows) {
    const sku = String(r.sku || '').trim()
    if (!sku) continue
    liSumBySku.set(sku, (liSumBySku.get(sku) || 0) + (r.quantity ?? 0))
    liCountBySku.set(sku, (liCountBySku.get(sku) || 0) + 1)
  }

  const movements = await prisma.stockMovement.findMany({
    select: { sku: true, quantity: true, type: true, reference: true }
  })
  const netBySku = new Map()
  const movementCountBySku = new Map()
  for (const m of movements) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    netBySku.set(sku, (netBySku.get(sku) || 0) + normalizeCombined(m))
    movementCountBySku.set(sku, (movementCountBySku.get(sku) || 0) + 1)
  }

  const canonicalBySku = await loadCanonicalBySku()

  const allSkus = new Set([...netBySku.keys(), ...canonicalBySku.keys()])
  for (const r of liRows) {
    const s = String(r.sku || '').trim()
    if (s) allSkus.add(s)
  }

  function recordedCombined(sku) {
    if ((liCountBySku.get(sku) || 0) > 0) return liSumBySku.get(sku) || 0
    return parseFloat(canonicalBySku.get(sku)?.quantity) || 0
  }

  const mismatched = []
  for (const sku of allSkus) {
    const rec = recordedCombined(sku)
    const net = netBySku.get(sku) || 0
    if (Math.abs(net - rec) > EPS) mismatched.push(sku)
  }
  mismatched.sort()

  return { mismatched, recordedCombined, movementCountBySku, canonicalBySku, liRows }
}

/**
 * `--mismatch-only` repair: one baseline per SKU, always at main office (`defaultCatalogLocationId`),
 * quantity = combined on-hand (`recordedCombined` — same rule as the mismatch detector).
 */
function buildMismatchOnlyBaselinesAnchoredAtMainOffice(
  mismatchedSet,
  liRows,
  canonicalBySku,
  locations,
  recordedCombined
) {
  const mainLocId = defaultCatalogLocationId(locations)
  if (!mainLocId) return []

  const itemNameBySku = new Map()
  for (const r of liRows) {
    const k = String(r.sku || '').trim()
    if (k && !itemNameBySku.has(k) && r.itemName) itemNameBySku.set(k, r.itemName)
  }

  const baselines = []
  for (const sku of mismatchedSet) {
    const total = recordedCombined(sku)
    if (Math.abs(total) <= EPS) continue
    const item = canonicalBySku.get(sku)
    baselines.push({
      sku,
      locationId: mainLocId,
      quantity: total,
      itemName: item?.name || itemNameBySku.get(sku) || sku,
      current: total,
      netSinceCutoff: 0,
      repair: true
    })
  }

  return baselines
}

async function writeBackupIfRequested(backupOutPath) {
  const rows = await prisma.stockMovement.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  })
  const payload = {
    meta: {
      createdAt: new Date().toISOString(),
      schema: 'StockMovement full row export',
      rowCount: rows.length,
      note: 'Automatic backup before ledger-cutover-after-stocktake.js --write'
    },
    stockMovements: rows
  }
  const abs = resolve(process.cwd(), backupOutPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`Backup wrote ${rows.length} rows to ${abs}`)
}

async function main() {
  const args = parseArgs()
  if (!args.dryRun && !args.write) {
    console.error('Specify --dry-run or --write')
    process.exit(1)
  }
  if (args.dryRun && args.write) {
    console.error('Use only one of --dry-run or --write')
    process.exit(1)
  }

  const CUTOFF = new Date(args.cutoff)
  const OPENING_DATE = new Date(args.openingDate)
  if (Number.isNaN(CUTOFF.getTime()) || Number.isNaN(OPENING_DATE.getTime())) {
    console.error('Invalid cutoff or opening-date')
    process.exit(1)
  }

  if (args.mismatchOnly && args.deleteAllMovements) {
    console.error('Use either --mismatch-only or --delete-all-movements, not both.')
    process.exit(1)
  }

  if (args.mismatchOnly) {
    const locations = await prisma.stockLocation.findMany({
      select: { id: true, code: true, name: true }
    })
    const { mismatched, movementCountBySku, canonicalBySku, liRows, recordedCombined } =
      await findMismatchedSkus()
    const mismatchedSet = new Set(mismatched)
    const baselines = buildMismatchOnlyBaselinesAnchoredAtMainOffice(
      mismatchedSet,
      liRows,
      canonicalBySku,
      locations,
      recordedCombined
    )

    const anchorId = defaultCatalogLocationId(locations)
    if (!anchorId) {
      console.error(
        'ERROR: No StockLocation for mismatch baseline anchor. Create a site with code 01_LOC1 or LOC001.'
      )
      await prisma.$disconnect()
      process.exit(1)
    }

    let movementsToDelete = 0
    for (const sku of mismatched) {
      movementsToDelete += movementCountBySku.get(sku) || 0
    }

    console.log(
      JSON.stringify(
        {
          mode: 'mismatch-only',
          openingMovementDate: OPENING_DATE.toISOString(),
          baselineAnchorLocationId: anchorId,
          mismatchedSkuCount: mismatched.length,
          movementsToDeleteForThoseSkus: movementsToDelete,
          baselineAdjustmentsToInsert: baselines.length,
          sampleMismatchedSkus: mismatched.slice(0, 40),
          sampleBaselines: baselines.slice(0, 15)
        },
        null,
        2
      )
    )

    if (args.dryRun) {
      console.log('\nDry run. Write: node scripts/ledger-cutover-after-stocktake.js --write --mismatch-only')
      await prisma.$disconnect()
      return
    }

    if (args.backupOut) {
      await writeBackupIfRequested(args.backupOut)
    }

    let deletedMovements = 0
    let inserted = 0

    await prisma.$transaction(
      async (tx) => {
        const del = await tx.stockMovement.deleteMany({
          where: { sku: { in: mismatched } }
        })
        deletedMovements = del.count

        for (const b of baselines) {
          await tx.stockMovement.create({
            data: {
              movementId: buildMovementId(),
              date: OPENING_DATE,
              type: 'adjustment',
              itemName: String(b.itemName || b.sku).slice(0, 500),
              sku: b.sku,
              quantity: b.quantity,
              fromLocation: b.locationId,
              toLocation: '',
              reference: `${REF_PREFIX}:${b.sku}:${b.locationId}`.slice(0, 500),
              performedBy: 'ledger-cutover-after-stocktake.js',
              notes: `Mismatch repair: ledger cleared for SKU; baseline = total on-hand ${b.current} (all locations) anchored at main office (01_LOC1 / LOC001) only.`.slice(
                0,
                2000
              ),
              ownerId: null
            }
          })
          inserted++
        }
      },
      { maxWait: 60000, timeout: 180000 }
    )

    console.log(JSON.stringify({ deletedMovements, insertedBaselines: inserted }, null, 2))
    await prisma.$disconnect()
    return
  }

  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true, name: true }
  })
  const codeById = new Map(locations.map((l) => [l.id, String(l.code || '').trim()]))

  const allMovements = await prisma.stockMovement.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  })

  const movementsSinceCutoff = args.deleteAllMovements
    ? []
    : allMovements.filter((m) => effectiveMovementDate(m) >= CUTOFF)

  /** @type {Map<string, Map<string, number>} */
  const netBySkuLocation = new Map()
  function addNet(sku, locId, delta) {
    const k = String(sku || '').trim()
    if (!k || !locId) return
    if (!netBySkuLocation.has(k)) netBySkuLocation.set(k, new Map())
    const inner = netBySkuLocation.get(k)
    inner.set(locId, (inner.get(locId) || 0) + delta)
  }

  for (const m of movementsSinceCutoff) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    for (const loc of locations) {
      const n = normalizeAtLocation(m, loc.id, codeById.get(loc.id) || '')
      addNet(sku, loc.id, n)
    }
  }

  const liRows = await prisma.locationInventory.findMany({
    include: { location: { select: { id: true, code: true } } }
  })

  const canonicalBySku = await loadCanonicalBySku()

  const baselines = []

  for (const li of liRows) {
    const sku = String(li.sku || '').trim()
    const locId = li.locationId
    if (!sku || !locId) continue
    const net = netBySkuLocation.get(sku)?.get(locId) || 0
    const current = parseFloat(li.quantity) || 0
    const opening = current - net
    if (Math.abs(opening) <= EPS) continue
    const item = canonicalBySku.get(sku)
    baselines.push({
      sku,
      locationId: locId,
      quantity: opening,
      itemName: item?.name || li.itemName || sku,
      unitCost: item?.unitCost ?? 0,
      current,
      netSinceCutoff: net
    })
  }

  const liSkus = new Set(liRows.map((r) => String(r.sku || '').trim()).filter(Boolean))

  const orphanSkus = new Set()
  const invSkuRows = await prisma.inventoryItem.findMany({ select: { sku: true } })
  for (const row of invSkuRows) {
    if (row.sku && !liSkus.has(row.sku)) orphanSkus.add(row.sku)
  }
  for (const m of movementsSinceCutoff) {
    const s = String(m.sku || '').trim()
    if (s && !liSkus.has(s)) orphanSkus.add(s)
  }

  for (const sku of orphanSkus) {
    if (!sku || liSkus.has(sku)) continue
    const item = canonicalBySku.get(sku)
    if (!item) continue
    const combinedNet = movementsSinceCutoff
      .filter((m) => String(m.sku || '').trim() === sku)
      .reduce((s, m) => s + normalizeCombined(m), 0)
    const current = parseFloat(item.quantity) || 0
    const opening = current - combinedNet
    if (Math.abs(opening) <= EPS) continue
    const locId = item.locationId || defaultCatalogLocationId(locations)
    if (!locId) continue
    baselines.push({
      sku,
      locationId: locId,
      quantity: opening,
      itemName: item.name || sku,
      unitCost: item.unitCost || 0,
      current,
      netSinceCutoff: combinedNet,
      catalogOnly: true
    })
  }

  const toDeleteCount = args.deleteAllMovements
    ? allMovements.length
    : allMovements.filter((m) => {
        if (String(m.reference || '').startsWith(REF_PREFIX)) return false
        return effectiveMovementDate(m) < CUTOFF
      }).length

  const priorBaselineRemoval = await prisma.stockMovement.count({
    where: { reference: { startsWith: REF_PREFIX } }
  })

  console.log(
    JSON.stringify(
      {
        mode: args.deleteAllMovements ? 'delete-all-movements' : 'delete-before-cutoff-only',
        cutoff: CUTOFF.toISOString(),
        openingMovementDate: OPENING_DATE.toISOString(),
        movementsInDb: allMovements.length,
        movementsKeptSinceCutoff: movementsSinceCutoff.length,
        movementsToDelete: toDeleteCount,
        priorBaselineRowsToStrip: priorBaselineRemoval,
        baselineAdjustmentsToInsert: baselines.length,
        sampleBaselines: baselines.slice(0, 15)
      },
      null,
      2
    )
  )

  if (args.dryRun) {
    console.log(
      '\nDry run only. Run backup then: node scripts/ledger-cutover-after-stocktake.js --write' +
        (args.deleteAllMovements ? ' --delete-all-movements' : '')
    )
    await prisma.$disconnect()
    return
  }

  if (args.backupOut) {
    await writeBackupIfRequested(args.backupOut)
  }

  let deletedBaselines = 0
  let deletedOld = 0
  let inserted = 0

  await prisma.$transaction(async (tx) => {
    if (args.deleteAllMovements) {
      const rAll = await tx.stockMovement.deleteMany({})
      deletedOld = rAll.count
      deletedBaselines = 0
    } else {
      const r0 = await tx.stockMovement.deleteMany({
        where: { reference: { startsWith: REF_PREFIX } }
      })
      deletedBaselines = r0.count

      const r1 = await tx.stockMovement.deleteMany({
        where: {
          date: { lt: CUTOFF },
          NOT: { reference: { startsWith: REF_PREFIX } }
        }
      })
      deletedOld = r1.count
    }

    for (const b of baselines) {
      await tx.stockMovement.create({
        data: {
          movementId: buildMovementId(),
          date: OPENING_DATE,
          type: 'adjustment',
          itemName: String(b.itemName || b.sku).slice(0, 500),
          sku: b.sku,
          quantity: b.quantity,
          fromLocation: b.locationId,
          toLocation: '',
          reference: `${REF_PREFIX}:${b.sku}:${b.locationId}`.slice(0, 500),
          performedBy: 'ledger-cutover-after-stocktake.js',
          notes:
            (args.deleteAllMovements
              ? `Full ledger reset: baseline = current on-hand ${b.current} (all prior movements removed).`
              : `Baseline after cutover: recorded on-hand ${b.current}, net since cutoff ${b.netSinceCutoff}, implied opening ${b.quantity}.`
            ).slice(0, 2000),
          ownerId: null
        }
      })
      inserted++
    }
  })

  console.log(
    JSON.stringify(
      {
        deletedPriorBaselines: deletedBaselines,
        deletedMovements: deletedOld,
        insertedBaselines: inserted
      },
      null,
      2
    )
  )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
