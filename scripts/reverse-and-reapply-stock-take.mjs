#!/usr/bin/env node
/**
 * 1) Reverses movements from scripts/apply-stock-take-from-xlsx.mjs (see reverse-stock-take-xlsx-import.mjs).
 * 2) Re-runs the same workbook through apply-stock-take-from-xlsx.mjs (PMB-only by default).
 *
 * Usage:
 *   node scripts/reverse-and-reapply-stock-take.mjs "/path/to/file.xlsx" [--execute]
 *
 * Without --execute: both steps run in dry-run / no-write mode (safe preview).
 * With --execute: reverses for real, then imports for real.
 *
 * Env:
 *   STOCK_TAKE_REFERENCE - must match the original import (default: Stock Take April 30 2026)
 */
import { spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const argv = process.argv.slice(2)
const execute = argv.includes('--execute')
const excelPathArg = argv.find((a) => !a.startsWith('--'))

if (!excelPathArg) {
  console.error(
    'Usage: node scripts/reverse-and-reapply-stock-take.mjs "/path/to/file.xlsx" [--execute]'
  )
  console.error('  (omit --execute for dry-run: list reversals + import preview)')
  process.exit(1)
}

const excelPath = resolve(excelPathArg)

function runNode(scriptRelative, extraArgs) {
  const scriptPath = resolve(__dirname, scriptRelative)
  const r = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  })
  return r.status ?? 1
}

function main() {
  console.log(
    execute
      ? 'Mode: EXECUTE (will reverse import movements, then re-import to PMB)\n'
      : 'Mode: DRY RUN (no database changes)\n'
  )

  console.log('=== Step 1: reverse prior stock-take xlsx import ===\n')
  const revArgs = execute ? ['--execute'] : []
  const code1 = runNode('reverse-stock-take-xlsx-import.mjs', revArgs)
  if (code1 !== 0) {
    process.exit(code1)
  }

  if (!execute) {
    console.log(
      '\nNote: Step 2 preview uses the current database (reversal was not applied).\n' +
        'After you run with --execute, optional: `node scripts/apply-stock-take-from-xlsx.mjs "' +
        excelPath +
        '" --dry-run` to verify PMB deltas.\n'
    )
  }

  console.log('\n=== Step 2: apply workbook (PMB office scope) ===\n')
  const applyArgs = [excelPath, ...(execute ? [] : ['--dry-run'])]
  const code2 = runNode('apply-stock-take-from-xlsx.mjs', applyArgs)
  process.exit(code2 ?? 0)
}

main()
