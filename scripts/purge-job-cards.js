#!/usr/bin/env node

/**
 * Purge all job cards from the database.
 * ServiceFormInstance rows are cascade-deleted when JobCards are removed.
 *
 * Usage: node scripts/purge-job-cards.js
 */

import { prisma } from '../api/_lib/prisma.js'

async function main() {
  const count = await prisma.jobCard.count()
  if (count === 0) {
    console.log('No job cards found. Nothing to delete.')
    return
  }

  const result = await prisma.jobCard.deleteMany({})
  console.log(`✅ Deleted ${result.count} job card(s). Related service form instances were cascade-deleted.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Failed to purge job cards:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
