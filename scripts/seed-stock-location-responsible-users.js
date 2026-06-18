#!/usr/bin/env node
/**
 * Seed StockLocation.responsibleUserId for PMB/Alana, Ethan Bakkie/Ethan, Nathan Bakkie/Nathan.
 * Dry-run by default; pass --write to persist.
 */
import { prisma } from '../api/_lib/prisma.js'

const WRITE = process.argv.includes('--write')

const LOCATION_HINTS = [
  { label: 'PMB', locMatch: (l) => /pmb|pieter/i.test(l.code) || /pmb|pieter/i.test(l.name), userKeywords: ['Alana'] },
  { label: 'Ethan Bakkie', locMatch: (l) => /ethan/i.test(l.code) || /ethan/i.test(l.name), userKeywords: ['Ethan'] },
  { label: 'Nathan Bakkie', locMatch: (l) => /nathan/i.test(l.code) || /nathan/i.test(l.name), userKeywords: ['Nathan'] }
]

async function findUserByKeywords(keywords) {
  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      AND: keywords.map((part) => ({
        OR: [
          { name: { contains: part, mode: 'insensitive' } },
          { email: { contains: part, mode: 'insensitive' } }
        ]
      }))
    },
    select: { id: true, name: true, email: true },
    take: 5
  })
  if (users.length === 1) return users[0]
  if (users.length > 1) {
    console.warn('Ambiguous user match for', keywords, '→', users.map((u) => u.email).join(', '))
    return users[0]
  }
  return null
}

async function main() {
  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true, name: true, responsibleUserId: true }
  })

  const plan = []
  for (const hint of LOCATION_HINTS) {
    const loc = locations.find(hint.locMatch)
    if (!loc) {
      console.warn(`No location matched: ${hint.label}`)
      continue
    }
    const user = await findUserByKeywords(hint.userKeywords)
    if (!user) {
      console.warn(`No user matched: ${hint.userKeywords.join(' ')} for ${hint.label}`)
      continue
    }
    plan.push({
      hint: hint.label,
      location: loc,
      user,
      unchanged: loc.responsibleUserId === user.id
    })
  }

  if (!plan.length) {
    console.log('Nothing to seed.')
    return
  }

  for (const row of plan) {
    console.log(
      `${WRITE ? 'APPLY' : 'DRY-RUN'}: ${row.hint} → ${row.location.code} (${row.location.name}) responsibleUser=${row.user.name || row.user.email} (${row.user.id})${row.unchanged ? ' [already set]' : ''}`
    )
    if (WRITE && !row.unchanged) {
      await prisma.stockLocation.update({
        where: { id: row.location.id },
        data: { responsibleUserId: row.user.id }
      })
    }
  }

  if (!WRITE) console.log('\nPass --write to persist changes.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
