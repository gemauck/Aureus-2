#!/usr/bin/env node
/**
 * Reclassify one StockMovement from receipt → adjustment (metadata only; no LI / master qty change).
 * Moves location from toLocation → fromLocation per stock-count / Option B adjustment convention.
 *
 * Usage:
 *   node scripts/convert-receipt-stock-movement-to-adjustment.js --movement MOV-MP1I7SMW-MDXSY0
 *   node scripts/convert-receipt-stock-movement-to-adjustment.js --movement MOV-MP1I7SMW-MDXSY0 --write
 */

import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma } from '../api/_lib/prisma.js'

const EPS = 0.001

function parseArgs() {
  const argv = process.argv.slice(2)
  const get = (flag) => {
    const i = argv.indexOf(flag)
    if (i === -1) return null
    return argv[i + 1] || null
  }
  return {
    movementId: get('--movement'),
    write: argv.includes('--write'),
    force: argv.includes('--force')
  }
}

function companyWideDelta(m) {
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') return 0
  if (t === 'receipt') return Math.abs(qty)
  if (t === 'production') return -Math.abs(qty)
  if (t === 'consumption' || t === 'sale') return -Math.abs(qty)
  if (t === 'issue') return -Math.abs(qty)
  return qty
}

function siteScopedDelta(m, locId, locCode) {
  const matches = (loc) => !!loc && (loc === locId || (!!locCode && loc === locCode))
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') {
    const qtyAbs = Math.abs(qty)
    const fromHere = matches(m.fromLocation)
    const toHere = matches(m.toLocation)
    if (toHere && !fromHere) return qtyAbs
    if (fromHere && !toHere) return -qtyAbs
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

/**
 * @param {import('@prisma/client').StockMovement} movement
 */
function buildAdjustmentPatch(movement) {
  const t = String(movement.type || '').toLowerCase()
  if (t !== 'receipt') {
    return { error: `Expected type=receipt, got "${movement.type}"` }
  }

  const qty = parseFloat(movement.quantity) || 0
  if (qty <= 0) {
    return { error: `Expected positive receipt quantity, got ${movement.quantity}` }
  }

  const fromRaw = String(movement.fromLocation || '').trim()
  const toRaw = String(movement.toLocation || '').trim()
  let locationId = ''

  if (toRaw && !fromRaw) {
    locationId = toRaw
  } else if (fromRaw && !toRaw) {
    locationId = fromRaw
  } else if (toRaw && fromRaw) {
    return {
      error:
        'Receipt has both fromLocation and toLocation set; resolve manually before converting.'
    }
  } else {
    return { error: 'Receipt has no location on fromLocation or toLocation; cannot map to adjustment.' }
  }

  const positiveQty = Math.abs(qty)

  return {
    patch: {
      type: 'adjustment',
      quantity: positiveQty,
      fromLocation: locationId,
      toLocation: ''
    },
    locationId,
    positiveQty
  }
}

function isAlreadyConverted(movement) {
  const t = String(movement.type || '').toLowerCase()
  if (t !== 'adjustment') return false
  const fromRaw = String(movement.fromLocation || '').trim()
  const toRaw = String(movement.toLocation || '').trim()
  const qty = parseFloat(movement.quantity) || 0
  return qty > 0 && !!fromRaw && !toRaw
}

async function resolveLocationLabel(locationId) {
  if (!locationId) return null
  const loc = await prisma.stockLocation.findFirst({
    where: { OR: [{ id: locationId }, { code: locationId }] },
    select: { id: true, code: true, name: true }
  })
  if (!loc) return { id: locationId, code: null, name: null }
  return { id: loc.id, code: loc.code, name: loc.name }
}

async function main() {
  const { movementId, write, force } = parseArgs()
  if (!movementId) {
    console.error(
      'Usage: node scripts/convert-receipt-stock-movement-to-adjustment.js --movement MOV-... [--write] [--force]'
    )
    process.exit(1)
  }

  const movement = await prisma.stockMovement.findFirst({
    where: { movementId: String(movementId).trim() }
  })
  if (!movement) {
    console.error(`No stock movement found with movementId "${movementId}".`)
    process.exit(1)
  }

  if (isAlreadyConverted(movement)) {
    console.log(JSON.stringify({ ok: true, alreadyConverted: true, movementId: movement.movementId }, null, 2))
    process.exit(0)
  }

  const built = buildAdjustmentPatch(movement)
  if (built.error) {
    console.error(built.error)
    process.exit(1)
  }

  const { patch, locationId } = built
  const locMeta = await resolveLocationLabel(locationId)
  const locCode = locMeta?.code || ''

  const before = {
    companyDelta: companyWideDelta(movement),
    siteDelta: siteScopedDelta(movement, locationId, locCode)
  }

  const afterMovement = { ...movement, ...patch }
  const after = {
    companyDelta: companyWideDelta(afterMovement),
    siteDelta: siteScopedDelta(afterMovement, locationId, locCode)
  }

  const ledgerUnchanged =
    Math.abs(before.companyDelta - after.companyDelta) <= EPS &&
    Math.abs(before.siteDelta - after.siteDelta) <= EPS

  if (!ledgerUnchanged) {
    console.error(
      'Abort: conversion would change ledger math for this SKU/location.',
      JSON.stringify({ before, after, sku: movement.sku, locationId }, null, 2)
    )
    process.exit(1)
  }

  const summary = {
    mode: write ? 'write' : 'dry-run',
    movementId: movement.movementId,
    id: movement.id,
    sku: movement.sku,
    itemName: movement.itemName,
    location: locMeta,
    before: {
      type: movement.type,
      quantity: movement.quantity,
      fromLocation: movement.fromLocation,
      toLocation: movement.toLocation,
      reference: movement.reference,
      date: movement.date,
      performedBy: movement.performedBy,
      notes: movement.notes
    },
    after: {
      ...patch,
      reference: movement.reference,
      date: movement.date,
      performedBy: movement.performedBy,
      notes: movement.notes
    },
    ledgerCheck: { before, after, unchanged: ledgerUnchanged }
  }

  if (!write) {
    console.log(JSON.stringify(summary, null, 2))
    console.log('\nDry run only. Re-run with --write to apply.')
    process.exit(0)
  }

  if (String(movement.type || '').toLowerCase() === 'adjustment' && !force) {
    console.error('Movement is already type=adjustment but not in expected shape. Use --force to overwrite.')
    process.exit(1)
  }

  await mkdir('reports', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    'reports',
    `convert-receipt-to-adjustment-${movement.movementId}-${stamp}.json`
  )
  await writeFile(
    backupPath,
    JSON.stringify({ movement, patch, summary }, null, 2),
    'utf8'
  )

  const updated = await prisma.stockMovement.update({
    where: { id: movement.id },
    data: patch
  })

  console.log(
    JSON.stringify(
      {
        ok: true,
        backupPath,
        movementId: updated.movementId,
        id: updated.id,
        type: updated.type,
        quantity: updated.quantity,
        fromLocation: updated.fromLocation,
        toLocation: updated.toLocation
      },
      null,
      2
    )
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
