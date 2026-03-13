#!/usr/bin/env node
/**
 * One-off script: delete the site "SITE 1" from the database.
 * Uses DATABASE_URL from .env (e.g. point at production to delete there).
 *
 * Usage:
 *   npm run delete-site-site1              # find and delete any site named "SITE 1"
 *   npm run delete-site-site1 -- --dry-run  # show what would be deleted, no change
 *   node scripts/delete-site-site1.js <clientId> <siteId>   # delete by IDs
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const TARGET_NAME = 'SITE 1'
const args = process.argv.slice(2).filter(a => a !== '--dry-run')
const dryRun = process.argv.includes('--dry-run')
const clientId = args[0]
const siteId = args[1]

async function main() {
  let existing

  if (clientId && siteId) {
    existing = await prisma.clientSite.findFirst({
      where: { id: siteId, clientId }
    })
    if (!existing) {
      console.error('Site not found for clientId=%s siteId=%s', clientId, siteId)
      process.exit(1)
    }
  } else {
    const sites = await prisma.clientSite.findMany({
      where: { name: { equals: TARGET_NAME, mode: 'insensitive' } }
    })
    if (sites.length === 0) {
      console.error('No site named "%s" found in DB.', TARGET_NAME)
      process.exit(1)
    }
    if (sites.length > 1) {
      console.log('Multiple sites named "%s":', TARGET_NAME)
      sites.forEach((s, i) => console.log('  %s) id=%s clientId=%s', i + 1, s.id, s.clientId))
      console.error('Run with: node scripts/delete-site-site1.js <clientId> <siteId>')
      process.exit(1)
    }
    existing = sites[0]
  }

  console.log('%s site: %s (id: %s, clientId: %s)', dryRun ? 'Would delete' : 'Deleting', existing.name, existing.id, existing.clientId)
  if (dryRun) {
    console.log('Dry run – no changes made. Run without --dry-run to delete.')
    return
  }
  await prisma.clientSite.delete({ where: { id: existing.id } })
  console.log('Done. Site "%s" removed from DB.', existing.name)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
