#!/usr/bin/env node
/**
 * Dry-run analysis: mobile Stock step payload sizes per location (allSkus vs on-hand only).
 * Usage: node scripts/analyze-mobile-stock-payload.mjs
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { catalogUnitCostForSku } from '../api/_lib/inventoryCatalogUnitCost.js'

const prisma = new PrismaClient()

const TEMPLATE_SELECT = {
  id: true,
  sku: true,
  name: true,
  thumbnail: true,
  unitCost: true,
  unit: true,
  category: true,
  type: true,
  status: true,
  quantity: true
}

function thumbnailFieldsForList(template, { compact }) {
  const raw = String(template?.thumbnail || '').trim()
  if (!raw) return { thumbnail: '', hasThumbnail: false }
  if (!compact) return { thumbnail: raw, hasThumbnail: true }
  if (/^https?:\/\//i.test(raw)) return { thumbnail: raw, hasThumbnail: true }
  return { thumbnail: '', hasThumbnail: true }
}

async function loadGlobalActiveInventoryTemplatesBySku() {
  const items = await prisma.inventoryItem.findMany({
    where: { status: { not: 'inactive' } },
    select: TEMPLATE_SELECT,
    orderBy: { updatedAt: 'desc' }
  })
  const bySku = new Map()
  for (const item of items) {
    const sku = item.sku?.trim()
    if (!sku) continue
    if (!bySku.has(sku)) bySku.set(sku, item)
  }
  return bySku
}

async function inventoryForLocation(locationId, options = {}) {
  const includeZero = options.includeZero === true || options.allSystemSkus === true
  const allSystemSkus = options.allSystemSkus === true
  if (!locationId) return []

  const records = await prisma.locationInventory.findMany({
    where: { locationId },
    orderBy: { itemName: 'asc' }
  })

  const catalogAtLocation = await prisma.inventoryItem.findMany({
    where: { locationId, status: { not: 'inactive' } },
    select: TEMPLATE_SELECT,
    orderBy: { updatedAt: 'desc' }
  })

  const skuList = [...new Set(records.map((r) => r.sku).filter(Boolean))]
  const templates = skuList.length
    ? await prisma.inventoryItem.findMany({
        where: { sku: { in: skuList } },
        select: TEMPLATE_SELECT,
        orderBy: { updatedAt: 'desc' }
      })
    : []

  const bySku = new Map()
  for (const t of catalogAtLocation) {
    if (t?.sku && !bySku.has(t.sku)) bySku.set(t.sku, t)
  }
  for (const t of templates) {
    if (!bySku.has(t.sku)) bySku.set(t.sku, t)
  }

  const bySkuAggregate = new Map()
  const locationInventorySkuSet = new Set(records.map((record) => record.sku).filter(Boolean))

  for (const item of catalogAtLocation) {
    if (!item?.sku || locationInventorySkuSet.has(item.sku)) continue
    bySkuAggregate.set(item.sku, {
      template: item,
      sku: item.sku,
      quantity: Number(item.quantity) || 0,
      unitCost: catalogUnitCostForSku(item),
      name: item.name || item.sku,
      status: item.status || 'in_stock'
    })
  }

  for (const record of records) {
    const sku = record.sku
    if (!sku) continue
    const template = bySku.get(sku) || {}
    if (template.status === 'inactive') continue
    const currentQty = Number(record.quantity) || 0
    const existing = bySkuAggregate.get(sku)
    if (!existing) {
      bySkuAggregate.set(sku, {
        template,
        sku,
        quantity: currentQty,
        unitCost: catalogUnitCostForSku(template),
        name: template.name || record.itemName || sku,
        status: template.status || record.status || 'in_stock'
      })
      continue
    }
    existing.quantity += currentQty
  }

  if (allSystemSkus) {
    const globalTemplates = await loadGlobalActiveInventoryTemplatesBySku()
    for (const [sku, template] of globalTemplates) {
      if (bySkuAggregate.has(sku)) continue
      bySkuAggregate.set(sku, {
        template,
        sku,
        quantity: 0,
        unitCost: catalogUnitCostForSku(template),
        name: template.name || sku,
        status: template.status || 'in_stock'
      })
    }
  }

  const out = []
  for (const aggregate of bySkuAggregate.values()) {
    if (!includeZero && (Number(aggregate.quantity) || 0) <= 0) continue
    const thumbFields = thumbnailFieldsForList(aggregate.template, { compact: allSystemSkus })
    out.push({
      ...aggregate.template,
      id: `${aggregate.sku}-${locationId}`,
      sku: aggregate.sku,
      name: aggregate.name,
      quantity: aggregate.quantity,
      unitCost: aggregate.unitCost,
      locationId,
      thumbnail: thumbFields.thumbnail,
      hasThumbnail: thumbFields.hasThumbnail
    })
  }
  out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  return out
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

async function main() {
  const locations = await prisma.stockLocation.findMany({
    where: { status: { not: 'inactive' } },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' }
  })

  const globalSkuCount = (await loadGlobalActiveInventoryTemplatesBySku()).size

  console.log('=== Mobile Stock Step Payload Analysis ===\n')
  console.log(`Active stock locations: ${locations.length}`)
  console.log(`Global active catalog SKUs: ${globalSkuCount}\n`)

  const rows = []
  let totalAllSkusBytes = 0
  let totalOnHandBytes = 0

  for (const loc of locations) {
    const allSkus = await inventoryForLocation(loc.id, { allSystemSkus: true, includeZero: true })
    const onHandOnly = await inventoryForLocation(loc.id, { allSystemSkus: false, includeZero: false })
    const allBytes = Buffer.byteLength(JSON.stringify(allSkus), 'utf8')
    const onHandBytes = Buffer.byteLength(JSON.stringify(onHandOnly), 'utf8')
    const onHandQty = allSkus.filter((r) => (Number(r.quantity) || 0) > 0).length
    totalAllSkusBytes += allBytes
    totalOnHandBytes += onHandBytes
    rows.push({
      name: loc.name || loc.code || loc.id,
      code: loc.code,
      allSkus: allSkus.length,
      onHandQty,
      onHandOnly: onHandOnly.length,
      allBytes,
      onHandBytes,
      savingsPct: allBytes ? Math.round((1 - onHandBytes / allBytes) * 100) : 0
    })
  }

  rows.sort((a, b) => b.allBytes - a.allBytes)

  console.log('Per location (sorted by allSkus payload size):')
  console.log(
    'Location'.padEnd(36) +
      'allSkus'.padStart(8) +
      'onHand>0'.padStart(10) +
      'pickList'.padStart(10) +
      'allSkus KB'.padStart(12) +
      'onHand KB'.padStart(12) +
      ' save%'.padStart(7)
  )
  console.log('-'.repeat(95))

  for (const r of rows) {
    console.log(
      r.name.slice(0, 35).padEnd(36) +
        String(r.allSkus).padStart(8) +
        String(r.onHandQty).padStart(10) +
        String(r.onHandOnly).padStart(10) +
        fmtBytes(r.allBytes).padStart(12) +
        fmtBytes(r.onHandBytes).padStart(12) +
        `${r.savingsPct}%`.padStart(7)
    )
  }

  const ranger = rows.find((r) => /ranger|gb67/i.test(r.name) || /ranger|gb67/i.test(r.code || ''))
  console.log('\n--- Ford Ranger match (screenshot) ---')
  if (ranger) {
    console.log(JSON.stringify(ranger, null, 2))
  } else {
    console.log('No location name/code matching ranger/gb67 — top 3 by SKU count:')
    rows.slice(0, 3).forEach((r) => console.log(`  ${r.name}: ${r.allSkus} SKUs`))
  }

  console.log('\n--- Prefetch impact (mobile StockStep prefetches ALL locations) ---')
  console.log(`Parallel fetch total (allSkus):     ${fmtBytes(totalAllSkusBytes)}`)
  console.log(`Parallel fetch total (on-hand only): ${fmtBytes(totalOnHandBytes)}`)
  console.log(`AsyncStorage disk cache (allSkus):   ~${fmtBytes(totalAllSkusBytes)} (one JSON blob per location key)`)

  const memEstimate = totalAllSkusBytes * 2
  console.log(`Rough in-memory estimate (cache + React state): ~${fmtBytes(memEstimate)}`)

  if (memEstimate > 8 * 1024 * 1024) {
    console.log('\n⚠️  WARNING: Combined prefetch likely exceeds safe memory on low-RAM Android devices (2–4 GB).')
  } else if (memEstimate > 4 * 1024 * 1024) {
    console.log('\n⚠️  CAUTION: Prefetch may cause jank on mid-range devices.')
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
