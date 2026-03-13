#!/usr/bin/env node
/**
 * Clear sites from a lead's JSON fields (sitesJsonb, sites) so the UI stops
 * showing "SITE 1" when it's not in the ClientSite table. Run against the DB
 * that serves the app (e.g. production).
 *
 * Usage:
 *   node scripts/clear-lead-json-sites.js <clientId>
 *   node scripts/clear-lead-json-sites.js "African Exploration"   # find lead by name, then clear
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: node scripts/clear-lead-json-sites.js <clientId>')
    console.error('   or: node scripts/clear-lead-json-sites.js "Partial name"')
    process.exit(1)
  }

  let client
  const trimmed = arg.trim()
  if (trimmed.length >= 20 && !trimmed.includes(' ')) {
    client = await prisma.client.findUnique({ where: { id: trimmed } })
  } else {
    const leads = await prisma.client.findMany({
      where: {
        type: 'lead',
        name: { contains: trimmed, mode: 'insensitive' }
      },
      take: 5
    })
    if (leads.length === 0) {
      console.error('No lead found matching:', trimmed)
      process.exit(1)
    }
    if (leads.length > 1) {
      console.log('Multiple leads:')
      leads.forEach((c, i) => console.log('  ', i + 1, c.id, c.name))
      client = leads[0]
      console.log('Using first:', client.name, client.id)
    } else {
      client = leads[0]
    }
  }

  if (!client) {
    console.error('Client not found:', arg)
    process.exit(1)
  }

  const before = (client.sitesJsonb != null && Array.isArray(client.sitesJsonb))
    ? client.sitesJsonb.length
    : (typeof client.sites === 'string' ? (JSON.parse(client.sites || '[]').length) : 0)
  if (before === 0) {
    console.log('Lead already has no sites in JSON:', client.name, client.id)
    return
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      sitesJsonb: [],
      sites: '[]'
    }
  })
  console.log('Cleared JSON sites for lead:', client.name, 'id:', client.id, '(was', before, 'sites)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
