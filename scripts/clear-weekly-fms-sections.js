#!/usr/bin/env node
/**
 * Clear or list Project.weeklyFMSReviewSections directly in the database.
 * Usage:
 *   node scripts/clear-weekly-fms-sections.js <projectId>           # clear all sections
 *   node scripts/clear-weekly-fms-sections.js <projectId> --list   # show current sections
 *   PROJECT_ID=xxx node scripts/clear-weekly-fms-sections.js        # use env var
 */
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const projectId = process.env.PROJECT_ID || process.argv[2]
const listOnly = process.argv.includes('--list')

if (!projectId) {
  console.error('Usage: node scripts/clear-weekly-fms-sections.js <projectId> [--list]')
  console.error('   or: PROJECT_ID=xxx node scripts/clear-weekly-fms-sections.js')
  process.exit(1)
}

async function main() {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, weeklyFMSReviewSections: true }
  })
  if (!project) {
    console.error('Project not found:', projectId)
    process.exit(1)
  }

  if (listOnly) {
    const raw = project.weeklyFMSReviewSections || '{}'
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
    console.log('Project:', project.name, project.id)
    console.log('weeklyFMSReviewSections:', JSON.stringify(parsed, null, 2))
    return
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { weeklyFMSReviewSections: '{}' }
  })
  console.log('Cleared weeklyFMSReviewSections for project', projectId, project.name)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
