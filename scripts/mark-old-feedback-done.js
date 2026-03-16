#!/usr/bin/env node
/**
 * One-time script: mark all feedback older than 1 week as Done.
 * Run: node scripts/mark-old-feedback-done.js
 * Uses DATABASE_URL from .env.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const result = await prisma.feedback.updateMany({
    where: {
      createdAt: { lt: sevenDaysAgo },
      status: 'open'
    },
    data: { status: 'done' }
  })
  console.log(`Marked ${result.count} feedback item(s) older than 1 week as Done.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
