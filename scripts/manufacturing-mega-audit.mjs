#!/usr/bin/env node
/**
 * Manufacturing mega audit — largest bundled check for this area:
 *
 * 1. API: all stock movement types (receipt, transfer, adjustment, consumption, production, sale) — disposable MOVTYPE-* SKU
 * 2. API: manufacturing integration GETs (+ optional POST) — tests/manufacturing-api-integration-tests.js
 * 3. UI + API: Playwright Record Movement flows + --extended (PO goods receipt, SO ship, production completion) + per-SKU forensic DB audits
 * 4. UI: --mega-ui surface pass (inventory, BOM, production, locations, purchase, dashboard, movements Refresh)
 * 5. DB: company combined + per-location ledger verify (--quiet)
 * 6. Static: node --check on movement audit scripts
 *
 * Requires: TEST_URL, TEST_EMAIL, TEST_PASSWORD (admin), DATABASE_URL (for Prisma phases), dev server on TEST_URL.
 *
 *   npm run audit:manufacturing:mega
 *
 * Flags (skip phases):
 *   --skip-api-movements   Skip MOVTYPE API smoke (phase 1)
 *   --skip-api-smoke       Skip manufacturing-api-integration-tests (phase 2)
 *   --skip-ui              Skip Playwright + extended + mega-ui (phase 3–4)
 *   --skip-ledger          Skip verify:ledger scripts (phase 5)
 *   --skip-static          Skip audit:manufacturing:static (phase 6)
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
dotenv.config({ path: path.join(root, '.env.local') })
dotenv.config({ path: path.join(root, '.env') })

function run(label, cmd, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ ${label}\n   ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env },
      shell: process.platform === 'win32'
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label} failed (exit ${code})`))
    })
    child.on('error', reject)
  })
}

async function main() {
  const argv = process.argv.slice(2)
  const skipApiMovements = argv.includes('--skip-api-movements')
  const skipApiSmoke = argv.includes('--skip-api-smoke')
  const skipUi = argv.includes('--skip-ui')
  const skipLedger = argv.includes('--skip-ledger')
  const skipStatic = argv.includes('--skip-static')

  if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
    console.error('MEGA AUDIT requires TEST_EMAIL and TEST_PASSWORD (admin), e.g. in .env.local')
    process.exit(1)
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║  MANUFACTURING MEGA AUDIT (DB movements + UI + ledger)          ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')
  console.log('BASE:', process.env.TEST_URL || process.env.APP_URL || 'http://localhost:3000')

  const completed = []

  try {
    if (!skipApiMovements) {
      await run('Phase 1 — API stock movement types', 'npm', ['run', 'test:stock-movements:all'])
      completed.push('api-movements')
    }

    if (!skipApiSmoke) {
      await new Promise((r) => setTimeout(r, 2500))
      await run('Phase 2 — Manufacturing API integration', 'node', ['tests/manufacturing-api-integration-tests.js'])
      completed.push('api-integration')
    }

    if (!skipUi) {
      await run('Phase 3–4 — Playwright UI + extended flows + mega-ui surface', 'node', [
        'scripts/forensic-movements-e2e-playwright.mjs',
        '--extended',
        '--mega-ui'
      ])
      completed.push('ui-forensic-extended-mega')
    }

    if (!skipLedger) {
      await run('Phase 5a — Ledger combined', 'npm', ['run', 'verify:ledger', '--', '--quiet'])
      await run('Phase 5b — Ledger per-location', 'npm', ['run', 'verify:ledger:locations', '--', '--quiet'])
      completed.push('ledger')
    }

    if (!skipStatic) {
      await run('Phase 6 — Static script syntax', 'npm', ['run', 'audit:manufacturing:static'])
      completed.push('static')
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗')
    console.log('║  MEGA AUDIT PASSED                                             ║')
    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log('Completed:', completed.join(', '))
    console.log('\nDisposable data: MOVTYPE-* from phase 1; FORENSIC-* from UI phase — remove in app if desired.\n')
  } catch (e) {
    console.error('\n╔════════════════════════════════════════════════════════════════╗')
    console.error('║  MEGA AUDIT FAILED                                             ║')
    console.error('╚════════════════════════════════════════════════════════════════╝')
    console.error(e.message || e)
    console.error('\nCompleted before failure:', completed.join(', ') || '(none)')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
