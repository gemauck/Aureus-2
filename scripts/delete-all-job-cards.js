/**
 * Deletes every row in JobCard. ServiceFormInstance rows cascade from Prisma schema.
 * Usage (from repo root): node scripts/delete-all-job-cards.js
 * Requires DATABASE_URL (same as the app).
 */
import { prisma } from '../api/_lib/prisma.js'

async function main() {
  const result = await prisma.jobCard.deleteMany({})
  console.log(`Deleted ${result.count} job card(s).`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
