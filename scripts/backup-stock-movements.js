#!/usr/bin/env node
/**
 * Full JSON backup of StockMovement rows for disaster restore.
 *
 * Usage:
 *   node scripts/backup-stock-movements.js
 *   node scripts/backup-stock-movements.js --out /custom/path.json
 *
 * Writes under reports/ by default with an ISO timestamp in the filename.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function parseArgs() {
  const argv = process.argv.slice(2)
  let out = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      out = argv[++i]
    }
  }
  return { out }
}

async function main() {
  const { out } = parseArgs()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const defaultPath = resolve(ROOT, 'reports', `stock-movements-backup-${stamp}.json`)
  const outputPath = out ? resolve(process.cwd(), out) : defaultPath

  mkdirSync(dirname(outputPath), { recursive: true })

  const rows = await prisma.stockMovement.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  })

  const payload = {
    meta: {
      createdAt: new Date().toISOString(),
      schema: 'StockMovement full row export',
      rowCount: rows.length
    },
    stockMovements: rows
  }

  writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`Wrote ${rows.length} StockMovement rows to:\n  ${outputPath}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
