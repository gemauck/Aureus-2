#!/usr/bin/env node
/**
 * Stock count template import (same logic as Manufacturing → Stock count → Excel upload).
 *
 * Usage:
 *   node scripts/import-stock-count-template.mjs "/path/to/template.xlsx" [--dry-run] [--force-duplicate] [--include-zero-new]
 *
 * Mode:
 *   - If STOCK_COUNT_IMPORT_EMAIL + STOCK_COUNT_IMPORT_PASSWORD (or TEST_EMAIL / TEST_PASSWORD)
 *     are set, calls the live API (server must be running).
 *   - Otherwise uses DATABASE_URL from .env and imports directly (no HTTP).
 *
 * Optional: APP_URL (default http://localhost:PORT), PORT (default 3000)
 */
import dotenv from 'dotenv'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')))
const dryRun = flags.has('--dry-run')
const forceDup = flags.has('--force-duplicate')
const includeZeroNew = flags.has('--include-zero-new')

const filePath =
  args[0] ||
  resolve(
    process.env.HOME || '',
    'Downloads/Copy of stock-count-template-2026-04-16 (2)_ERP.xlsx'
  )

const PORT = process.env.PORT || '3000'
const BASE = (process.env.APP_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '')
const EMAIL = process.env.STOCK_COUNT_IMPORT_EMAIL || process.env.TEST_EMAIL || ''
const PASSWORD = process.env.STOCK_COUNT_IMPORT_PASSWORD || process.env.TEST_PASSWORD || ''

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Login: non-JSON response (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(body?.message || body?.error || `Login failed (${res.status})`)
  }
  const data = body.data ?? body
  const token = data?.accessToken
  const role = data?.user?.role
  if (!token) throw new Error('Login: no accessToken in response')
  return { token, role }
}

async function importViaApi(buf) {
  const { token, role } = await login()
  const adminish =
    role &&
    [
      'admin',
      'administrator',
      'superadmin',
      'super-admin',
      'super_admin',
      'super_administrator',
      'super_user',
      'system_admin'
    ].includes(String(role).trim().toLowerCase().replace(/\s+/g, '_'))
  if (!adminish) {
    throw new Error(`User role is not an admin role: ${role}`)
  }

  const dataUrl =
    'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' +
    buf.toString('base64')

  const res = await fetch(`${BASE}/api/manufacturing/stock-count/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      file: { name: filePath.split(/[/\\]/).pop(), dataUrl },
      dryRun,
      forceCreateDuplicate: forceDup,
      includeZeroNewItems: includeZeroNew
    })
  })
  const text = await res.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response: ${res.status} ${text.slice(0, 500)}`)
  }

  if (!res.ok) {
    throw new Error(payload?.message || payload?.error || text || `HTTP ${res.status}`)
  }

  return payload.data ?? payload
}

async function importDirectDb(buf) {
  const { runStockCountTemplateImport } = await import('../api/_lib/stockCountTemplateImport.js')
  const { prisma } = await import('../api/_lib/prisma.js')

  const actor =
    (await prisma.user.findFirst({
      where: { role: { in: ['admin', 'administrator', 'superadmin'] } },
      select: { id: true, name: true, role: true }
    })) ||
    (await prisma.user.findFirst({ select: { id: true, name: true, role: true } }))

  const mockReq = {
    method: 'POST',
    url: '/api/manufacturing/stock-count/import',
    user: actor
      ? {
          sub: actor.id,
          id: actor.id,
          name: actor.name || 'Stock count CLI',
          role: actor.role || 'admin'
        }
      : {
          sub: 'cli-stock-count-import',
          id: 'cli-stock-count-import',
          name: 'Stock count CLI',
          role: 'admin'
        },
    headers: {}
  }

  const outcome = await runStockCountTemplateImport(
    prisma,
    buf,
    { dryRun, forceCreateDuplicate: forceDup, includeZeroNewItems: includeZeroNew },
    mockReq
  )

  if (outcome.kind === 'badRequest') {
    throw new Error(outcome.message)
  }
  if (outcome.kind === 'dry') {
    return outcome.payload
  }
  if (actor) {
    void logAuditFromRequest(prisma, mockReq, {
      action: 'create',
      entity: 'manufacturing',
      entityId: outcome.data.batchId,
      details: {
        resource: 'stock-count-import',
        summary: `Stock count import ${outcome.data.movementsCreated} movements, ${outcome.data.skipped} skipped`,
        movementsCreated: outcome.data.movementsCreated,
        skipped: outcome.data.skipped,
        appliedCount: outcome.data.applied?.length ?? 0
      }
    })
  }
  return outcome.data
}

async function main() {
  if (!existsSync(filePath)) {
    console.error('File not found:', filePath)
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in .env')
    process.exit(1)
  }

  const buf = readFileSync(filePath)

  let data
  if (EMAIL && PASSWORD) {
    console.error('Using API at', BASE)
    data = await importViaApi(buf)
  } else {
    console.error('No STOCK_COUNT_IMPORT_EMAIL/TEST_EMAIL in .env — using direct DB import')
    data = await importDirectDb(buf)
  }

  console.log(JSON.stringify(data, null, 2))
  if (dryRun) {
    const n = data.movementsWouldCreate
    console.error('\n(Dry run — no database changes. Re-run without --dry-run to apply.)')
    if (n != null) console.error('Movements that would be created:', n)
  } else {
    console.error('\nApplied. Movements created:', data.movementsCreated ?? '—')
  }

  if (!dryRun) {
    const { prisma } = await import('../api/_lib/prisma.js')
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
