#!/usr/bin/env node
/**
 * Delete `LocationInventory` rows for a stock location where quantity is effectively zero.
 *
 * Why: `verify-ledger-per-location.js` evaluates **every** LI row. Sites you emptied (qty 0) but
 * with movement history still "fail" for that row. Removing zero-qty rows stops that site from
 * being checked for those SKUs (combined totals unchanged — they contributed 0 to sums).
 *
 * Does NOT delete rows with qty > 0 (refuses unless you transfer stock away first).
 *
 * Usage:
 *   node scripts/delete-zero-qty-location-inventory.mjs --location-code=02_LOC2
 *   node scripts/delete-zero-qty-location-inventory.mjs --location-code=02_LOC2 --write
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../api/_lib/prisma.js'

const EPS = 0.0001

async function resolveActorId() {
  const envId = String(process.env.ERP_SCRIPT_ACTOR_ID || '').trim()
  if (envId) {
    const u = await prisma.user.findUnique({ where: { id: envId }, select: { id: true } })
    if (u) return u.id
  }
  const admin = await prisma.user.findFirst({
    where: { role: { in: ['admin', 'super_admin'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  })
  if (admin) return admin.id
  const any = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  return any?.id || null
}

async function audit(prisma, actorId, summary, details) {
  if (!actorId) return
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'delete',
        entity: 'manufacturing',
        entityId: 'location-inventory-zero-cleanup',
        diff: JSON.stringify({
          user: 'delete-zero-qty-location-inventory.mjs',
          userId: actorId,
          details: { resource: 'location-inventory', summary, ...details },
          success: true
        })
      }
    })
  } catch {
    /* non-fatal */
  }
}

async function main() {
  const write = process.argv.includes('--write')
  const locCode =
    process.argv.find((a) => a.startsWith('--location-code='))?.slice('--location-code='.length)?.trim() ||
    '02_LOC2'

  const loc = await prisma.stockLocation.findFirst({
    where: { code: locCode },
    select: { id: true, code: true, name: true }
  })
  if (!loc) {
    console.error(JSON.stringify({ ok: false, error: 'location not found', locCode }, null, 2))
    process.exit(1)
  }

  const positive = await prisma.locationInventory.count({
    where: {
      locationId: loc.id,
      OR: [{ quantity: { gt: EPS } }, { quantity: { lt: -EPS } }]
    }
  })
  if (positive > 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: `Refusing: ${positive} row(s) have non-zero quantity. Transfer stock out first.`,
          location: loc
        },
        null,
        2
      )
    )
    process.exit(1)
  }

  const zeroRows = await prisma.locationInventory.findMany({
    where: {
      locationId: loc.id,
      AND: [{ quantity: { lte: EPS } }, { quantity: { gte: -EPS } }]
    },
    select: { id: true, sku: true, quantity: true }
  })

  const report = {
    dryRun: !write,
    location: loc,
    rowsToDelete: zeroRows.length,
    sampleSkus: zeroRows.slice(0, 30).map((r) => r.sku)
  }

  if (!write) {
    console.log(
      JSON.stringify(
        {
          ...report,
          hint: 'Re-run with --write to delete these zero-qty LocationInventory rows.'
        },
        null,
        2
      )
    )
    await prisma.$disconnect()
    return
  }

  const del = await prisma.locationInventory.deleteMany({
    where: {
      locationId: loc.id,
      AND: [{ quantity: { lte: EPS } }, { quantity: { gte: -EPS } }]
    }
  })

  const actorId = await resolveActorId()
  void audit(prisma, actorId, `Deleted ${del.count} zero-qty LI rows`, {
    locationId: loc.id,
    locationCode: loc.code,
    deletedCount: del.count
  })

  const outDir = path.join(process.cwd(), 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(
    outDir,
    `delete-zero-li-${loc.code}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  )
  fs.writeFileSync(
    outFile,
    JSON.stringify({ ...report, deletedCount: del.count, reportFile: outFile }, null, 2),
    'utf8'
  )

  console.log(JSON.stringify({ ok: true, deletedCount: del.count, location: loc, reportFile: outFile }, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
