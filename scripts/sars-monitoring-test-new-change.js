/**
 * Test SARS monitoring: mark a recent change as "new" so it appears in the UI
 * and optionally send the summary email to the Compliance team.
 *
 * Usage:
 *   node scripts/sars-monitoring-test-new-change.js              # mark one as new, no email
 *   node scripts/sars-monitoring-test-new-change.js --email     # mark one as new and send summary email
 */

import 'dotenv/config'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const sendEmail = process.argv.includes('--email')

async function main() {
  let change = await prisma.sarsWebsiteChange.findFirst({
    orderBy: { publishedAt: 'desc' },
    take: 1
  })

  if (!change) {
    console.log('No existing SARS changes in DB. Creating one trial change...')
    change = await prisma.sarsWebsiteChange.create({
      data: {
        url: 'https://www.sars.gov.za/latest-news/',
        pageTitle: 'Latest News | South African Revenue Service',
        changeType: 'new',
        title: '[Trial] SARS website monitoring test – recent update',
        description: 'This is a trial change to test the SARS Monitoring tab and summary email.',
        publishedAt: new Date(),
        isNew: true,
        isRead: false,
        priority: 'Normal',
        category: 'General',
        metadata: JSON.stringify({ sourceUrl: 'https://www.sars.gov.za/latest-news/', test: true })
      }
    })
    console.log('Created trial change:', change.id, change.title)
  } else {
    await prisma.sarsWebsiteChange.update({
      where: { id: change.id },
      data: { isNew: true, isRead: false }
    })
    console.log('Marked as new (trial):', change.id, change.title)
  }

  const payload = [
    {
      id: change.id,
      title: change.title,
      url: change.url,
      priority: change.priority,
      category: change.category,
      publishedAt: change.publishedAt
    }
  ]

  if (sendEmail) {
    try {
      const sendModule = await import(pathToFileURL(join(__dirname, '..', 'api', 'sars-monitoring', 'sendSummaryEmail.js')).href)
      await sendModule.sendSarsSummaryEmail(payload, { skipFirstRun: false })
      console.log('Summary email sent to Compliance team.')
    } catch (e) {
      console.error('Failed to send email:', e.message)
    }
  } else {
    console.log('Skipping email (run with --email to send the summary email).')
  }

  console.log('Done. Open Teams → Compliance → SARS Monitoring to see the change.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
