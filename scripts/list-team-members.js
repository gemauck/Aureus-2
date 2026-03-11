#!/usr/bin/env node
/**
 * List all team members from the Membership table.
 * Run from project root: node scripts/list-team-members.js
 * Requires DATABASE_URL in .env
 */
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

async function main() {
  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } }
        }
      }
    }
  })

  if (teams.length === 0) {
    console.log('No teams found.')
    return
  }

  console.log('Team members (from Membership table)\n')
  for (const team of teams) {
    console.log(`Team: ${team.name} (id: ${team.id})`)
    if (team.memberships.length === 0) {
      console.log('  (no members in Membership table)')
    } else {
      for (const m of team.memberships) {
        const u = m.user
        console.log(`  - ${u?.name || '?'} <${u?.email || '?'}> (${m.role})`)
      }
    }
    console.log('')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
