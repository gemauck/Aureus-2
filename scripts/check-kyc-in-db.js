#!/usr/bin/env node
/**
 * One-off script to check if KYC is stored in the DB for Acme Corporation (and any client).
 * Uses same DB as the app by loading .env and .env.local.
 * Run from project root: node scripts/check-kyc-in-db.js
 */
import 'dotenv/config'
import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
if (existsSync(join(root, '.env.local'))) {
  dotenv.config({ path: join(root, '.env.local'), override: true })
}

import { prisma } from '../api/_lib/prisma.js'

async function main() {
  try {
    // Client id the browser PATCH'd when we tested (from network log)
    const testId = 'cmkuthasq000511or79vab7fn'
    const byId = await prisma.$queryRaw`
      SELECT id, name, type, industry, status, kyc, "kycJsonb"
      FROM "Client"
      WHERE id = ${testId}
    `
    console.log(`=== Client id=${testId} (Acme from browser test) ===\n`)
    if (byId.length) {
      const c = byId[0]
      const kyc = c.kycJsonb ?? (typeof c.kyc === 'string' ? (() => { try { return JSON.parse(c.kyc || '{}'); } catch (_) { return {}; } })() : {})
      console.log(`${c.name} | ${c.industry || ''} • ${c.status || ''}`)
      console.log(`  kyc.clientType: ${JSON.stringify(kyc.clientType)}`)
      console.log(`  kyc.legalEntity.registeredLegalName: ${JSON.stringify(kyc.legalEntity?.registeredLegalName)}`)
      console.log(`  kyc string length: ${(c.kyc || '').length}\n`)
    } else {
      console.log('  (not found in this DB)\n')
    }

    // Any client named Acme
    const acme = await prisma.$queryRaw`
      SELECT id, name, type, industry, status, kyc, "kycJsonb"
      FROM "Client"
      WHERE type = 'client' AND name ILIKE '%Acme%'
      ORDER BY name
    `
    console.log('=== All clients with "Acme" in name ===\n')
    for (const c of acme) {
      const kyc = c.kycJsonb ?? (typeof c.kyc === 'string' ? (() => { try { return JSON.parse(c.kyc || '{}'); } catch (_) { return {}; } })() : {})
      console.log(`${c.name} | ${c.industry || ''} • ${c.status || ''} | id=${c.id}`)
      console.log(`  kyc.clientType: ${JSON.stringify(kyc.clientType)}`)
      console.log(`  kyc.legalEntity.registeredLegalName: ${JSON.stringify(kyc.legalEntity?.registeredLegalName)}`)
      console.log(`  kyc string length: ${(c.kyc || '').length}\n`)
    }

    const clients = await prisma.$queryRaw`
      SELECT id, name, type, industry, status, kyc, "kycJsonb"
      FROM "Client"
      WHERE type = 'client'
      ORDER BY name
      LIMIT 20
    `
    console.log('KYC in DB (first 20 clients):\n')
    for (const c of clients) {
      const kycStr = c.kyc == null ? 'null' : (typeof c.kyc === 'string' ? c.kyc : JSON.stringify(c.kyc))
      const kycJsonb = c.kycJsonb == null ? 'null' : (typeof c.kycJsonb === 'object' ? JSON.stringify(c.kycJsonb) : String(c.kycJsonb))
      const hasMeaningful = (v) => {
        if (!v) return false
        const o = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch (_) { return {}; } })() : v
        return (o.clientType && String(o.clientType).trim()) || (o.legalEntity && o.legalEntity.registeredLegalName && String(o.legalEntity.registeredLegalName).trim())
      }
      const meaningful = hasMeaningful(c.kyc) || hasMeaningful(c.kycJsonb)
      console.log(`${c.name} (${c.industry || ''} • ${c.status || ''}) id=${c.id}`)
      console.log(`  kyc string length: ${kycStr.length}, has meaningful: ${meaningful}`)
      if (meaningful || kycStr.length > 4) {
        try {
          const parsed = typeof c.kycJsonb === 'object' ? c.kycJsonb : (typeof c.kyc === 'string' ? JSON.parse(c.kyc || '{}') : {})
          console.log(`  clientType: ${JSON.stringify(parsed.clientType)}`)
          console.log(`  legalEntity.registeredLegalName: ${JSON.stringify(parsed.legalEntity?.registeredLegalName)}`)
        } catch (_) {
          console.log(`  (parse err) raw kyc substr: ${kycStr.substring(0, 120)}...`)
        }
      }
      console.log('')
    }
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
