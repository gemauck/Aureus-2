#!/usr/bin/env node
/**
 * Restore Project.weeklyFMSReviewSections from WeeklyFMSReviewSection table data.
 * Use this to undo a clear-weekly-fms-sections run if the table had data.
 * Usage:
 *   node scripts/restore-weekly-fms-sections-from-table.js <projectId>
 *   PROJECT_ID=xxx node scripts/restore-weekly-fms-sections-from-table.js
 */
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const projectId = process.env.PROJECT_ID || process.argv[2]

if (!projectId) {
  console.error('Usage: node scripts/restore-weekly-fms-sections-from-table.js <projectId>')
  console.error('   or: PROJECT_ID=xxx node scripts/restore-weekly-fms-sections-from-table.js')
  process.exit(1)
}

async function main() {
  const sections = await prisma.weeklyFMSReviewSection.findMany({
    where: { projectId },
    orderBy: [{ year: 'asc' }, { order: 'asc' }],
    include: {
      items: {
        orderBy: { order: 'asc' },
        include: {
          statuses: true,
          comments: true
        }
      }
    }
  })

  if (sections.length === 0) {
    console.error('No WeeklyFMSReviewSection rows found for project', projectId)
    console.error('Cannot restore – table was empty (data existed only in JSON which was cleared).')
    process.exit(1)
  }

  // Build JSON shape: { "2024": [ { name, description, documents: [ ... ] } ], ... }
  const byYear = {}
  for (const sec of sections) {
    const yearStr = String(sec.year)
    if (!byYear[yearStr]) byYear[yearStr] = []

    const documents = (sec.items || []).map((item) => {
      const collectionStatus = {}
      const commentsByKey = {}
      for (const st of item.statuses || []) {
        const key = `${st.year}-${st.month}`
        collectionStatus[key] = st.status || 'pending'
      }
      for (const c of item.comments || []) {
        const key = `${c.year}-${c.month}`
        if (!commentsByKey[key]) commentsByKey[key] = []
        commentsByKey[key].push({
          text: c.text,
          author: c.author || '',
          authorId: c.authorId || null
        })
      }
      return {
        id: item.id,
        name: item.name || '',
        description: item.description || '',
        required: item.required || false,
        order: item.order,
        collectionStatus,
        comments: commentsByKey
      }
    })

    byYear[yearStr].push({
      id: sec.id,
      name: sec.name || '',
      description: sec.description || '',
      documents
    })
  }

  const payload = JSON.stringify(byYear)
  await prisma.project.update({
    where: { id: projectId },
    data: { weeklyFMSReviewSections: payload }
  })

  console.log('Restored weeklyFMSReviewSections for project', projectId)
  console.log('Sections per year:', Object.fromEntries(
    Object.entries(byYear).map(([y, arr]) => [y, arr.length])
  ))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
