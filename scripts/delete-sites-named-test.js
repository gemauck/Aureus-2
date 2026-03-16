#!/usr/bin/env node
/**
 * Delete all sites that look like test/demo/sample data (case-insensitive).
 * Matches names containing: test, accufarm test, demo, sample, staging, dummy, sandbox.
 * Cleans both: ClientSite table and legacy JSON (sitesJsonb, sites) on Client.
 *
 * Uses DATABASE_URL from .env. Run against the DB you use (e.g. set DATABASE_URL for production).
 *
 * Usage:
 *   npm run delete-sites-test              # delete all matching sites
 *   npm run delete-sites-test -- --dry-run # list what would be deleted, no change
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const dryRun = process.argv.includes('--dry-run')

const TEST_SITE_PATTERNS = ['test', 'accufarm test', 'demo', 'sample', 'staging', 'dummy', 'sandbox']

function isTestSiteName(name) {
  if (name == null || typeof name !== 'string') return false
  const lower = name.toLowerCase()
  return TEST_SITE_PATTERNS.some(p => lower.includes(p))
}

const testSiteWhere = {
  OR: TEST_SITE_PATTERNS.map(p => ({ name: { contains: p, mode: 'insensitive' } }))
}

async function main() {
  // 1) ClientSite table
  const sites = await prisma.clientSite.findMany({
    where: testSiteWhere,
    orderBy: [{ clientId: 'asc' }, { name: 'asc' }]
  })

  let totalDeleted = 0

  if (sites.length > 0) {
    console.log('ClientSite table – sites matching test/demo/sample/staging/dummy/sandbox:')
    sites.forEach((s, i) => console.log('  %s) id=%s clientId=%s name=%s', i + 1, s.id, s.clientId, JSON.stringify(s.name)))
    console.log('Total: %s site(s)', sites.length)

    if (!dryRun) {
      const result = await prisma.clientSite.deleteMany({ where: testSiteWhere })
      totalDeleted += result.count
      console.log('Deleted %s from ClientSite.', result.count)
    }
  } else {
    console.log('ClientSite table: no test-like sites found.')
  }

  // 2) Legacy JSON on Client (sitesJsonb, sites) – so UI stops showing test sites from old data
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, type: true, sites: true, sitesJsonb: true }
  })

  const clientsToUpdate = []
  for (const c of clients) {
    let arr = c.sitesJsonb != null && Array.isArray(c.sitesJsonb) ? c.sitesJsonb : null
    if (arr == null && typeof c.sites === 'string' && c.sites.trim()) {
      try {
        arr = JSON.parse(c.sites)
      } catch {
        arr = []
      }
    }
    if (arr == null || !Array.isArray(arr)) arr = []
    const kept = arr.filter(s => !isTestSiteName(s && s.name))
    if (kept.length !== arr.length) {
      clientsToUpdate.push({
        id: c.id,
        name: c.name,
        type: c.type,
        removed: arr.length - kept.length,
        kept
      })
    }
  }

  if (clientsToUpdate.length > 0) {
    console.log('\nLegacy JSON (sites/sitesJsonb) – clients with test sites to remove:')
    clientsToUpdate.forEach((c, i) => console.log('  %s) id=%s name=%s type=%s – remove %s site(s)', i + 1, c.id, JSON.stringify(c.name), c.type, c.removed))

    if (!dryRun) {
      for (const c of clientsToUpdate) {
        await prisma.client.update({
          where: { id: c.id },
          data: {
            sitesJsonb: c.kept,
            sites: JSON.stringify(c.kept)
          }
        })
        totalDeleted += c.removed
      }
      console.log('Cleaned test sites from %s client(s) JSON.', clientsToUpdate.length)
    }
  } else {
    console.log('\nLegacy JSON: no test-like sites in sites/sitesJsonb.')
  }

  if (dryRun) {
    console.log('\nDry run – no changes made. Run without --dry-run to delete.')
  } else {
    console.log('\nTotal sites removed: %s', totalDeleted)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
