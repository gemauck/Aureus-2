#!/usr/bin/env node
/**
 * Mark open mobile-app auto-reports as done when they are transient DNS/network noise
 * (OTA sync + auth token refresh while offline). Dry-run by default.
 *
 *   node scripts/close-mobile-transient-network-feedback.js
 *   node scripts/close-mobile-transient-network-feedback.js --write
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const write = process.argv.includes('--write')

const TRANSIENT_PATTERNS = [
  /unable to resolve host/i,
  /no address associated with hostname/i,
  /network request failed/i,
  /failed to connect/i,
  /timed out/i,
  /host unreachable/i
]

const CONTEXT_PATTERNS = [/ota sync/i, /authrefresh/i, /auth keepalive/i, /loadsession/i]

function parseMeta(meta) {
  if (!meta) return null
  try {
    return typeof meta === 'string' ? JSON.parse(meta) : meta
  } catch {
    return null
  }
}

function isTransientMobileNetworkReport(item) {
  if (item.section !== 'mobile-app' || item.status !== 'open') return false
  const message = String(item.message || '')
  if (!TRANSIENT_PATTERNS.some((re) => re.test(message))) return false

  const meta = parseMeta(item.meta)
  const context = String(meta?.context || '')
  if (CONTEXT_PATTERNS.some((re) => re.test(context))) return true

  // Fallback: message body mentions OTA manifest or mobile refresh endpoint.
  return (
    /mobile-ota\/manifest/i.test(message) ||
    /\/api\/auth\/mobile\/refresh/i.test(message)
  )
}

async function main() {
  const open = await prisma.feedback.findMany({
    where: { section: 'mobile-app', status: 'open' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, message: true, meta: true, section: true, status: true, createdAt: true }
  })

  const matches = open.filter(isTransientMobileNetworkReport)
  console.log(`Found ${matches.length} open transient mobile network report(s) (of ${open.length} open mobile-app).`)

  for (const row of matches) {
    const meta = parseMeta(row.meta)
    console.log(
      `  - ${row.id} · ${row.createdAt.toISOString()} · ${meta?.context || '—'} · ${String(row.message).slice(0, 100)}…`
    )
  }

  if (!matches.length) return

  if (!write) {
    console.log('\nDry run — pass --write to mark these as done.')
    return
  }

  const result = await prisma.feedback.updateMany({
    where: { id: { in: matches.map((m) => m.id) } },
    data: { status: 'done' }
  })
  console.log(`\nMarked ${result.count} report(s) as done.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
