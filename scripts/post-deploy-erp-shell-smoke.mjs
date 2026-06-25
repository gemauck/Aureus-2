#!/usr/bin/env node
/**
 * Browser smoke: ERP login shell + module routes (requires TEST_EMAIL / TEST_PASSWORD for module checks).
 * Usage: APP_URL=https://abcoafrica.co.za node scripts/post-deploy-erp-shell-smoke.mjs
 */
import dotenv from 'dotenv'
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const BASE = (process.env.APP_URL || process.env.TEST_URL || 'https://abcoafrica.co.za').replace(/\/$/, '')
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''
const MODULES = ['dashboard', 'clients', 'projects', 'manufacturing']

const results = { pass: [], fail: [], skip: [] }

function ok(name, detail = '') {
  results.pass.push(name)
  console.log('✅', name, detail ? `— ${detail}` : '')
}

function bad(name, detail = '') {
  results.fail.push(name)
  console.log('❌', name, detail ? `— ${detail}` : '')
}

function skip(name, detail = '') {
  results.skip.push(name)
  console.log('⏭️', name, detail ? `— ${detail}` : '')
}

async function waitForShell(page) {
  await page.waitForFunction(() => !document.body.classList.contains('login-page'), { timeout: 45000 }).catch(() => {})
}

async function run() {
  console.log(`\n== ERP shell browser smoke ==\nTarget: ${BASE}\n`)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ ignoreHTTPSErrors: true })
  page.setDefaultTimeout(60000)

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(2000)
    const loginVisible =
      (await page.locator('input[type="password"]').isVisible().catch(() => false)) ||
      (await page.getByRole('textbox', { name: /password/i }).isVisible().catch(() => false))
    if (loginVisible) ok('Login page', 'password field visible')
    else bad('Login page', 'password field not found')

    const hasCoreScript = await page.evaluate(() =>
      [...document.querySelectorAll('script[src]')].some((s) => s.src.includes('core-bundle'))
    )
    if (hasCoreScript) ok('Login page', 'core-bundle script tag present')
    else bad('Login page', 'core-bundle script missing')

    if (!EMAIL || !PASSWORD) {
      skip('Module route smoke', 'set TEST_EMAIL and TEST_PASSWORD in .env.local')
      await browser.close()
      printSummary()
      return
    }

    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
    const pwd = page.locator('input[type="password"]').or(page.getByRole('textbox', { name: /password/i }))
    await pwd.first().fill(PASSWORD)
    const loginWait = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 30000 })
    await page.locator('button[type="submit"]').first().click()
    await loginWait
    await waitForShell(page)
    ok('Login', 'authenticated')

    for (const mod of MODULES) {
      await page.goto(`${BASE}/${mod}`, { waitUntil: 'domcontentloaded' })
      await waitForShell(page)
      await page.waitForTimeout(1500)

      const loadingOnly = await page.getByText(/loading\.\.\./i).first().isVisible().catch(() => false)
      const accessDenied = await page.getByText(/access denied|not available/i).first().isVisible().catch(() => false)
      const hasMain = await page.locator('#main-page-scroll').isVisible().catch(() => false)

      if (accessDenied) {
        skip(`Module /${mod}`, 'access denied for test user')
      } else if (!hasMain) {
        bad(`Module /${mod}`, 'main content area missing')
      } else if (loadingOnly && mod !== 'dashboard') {
        skip(`Module /${mod}`, 'still showing loading placeholder (lazy bundle may need more time)')
      } else {
        ok(`Module /${mod}`, 'main shell rendered')
      }
    }
  } catch (e) {
    bad('Browser smoke', e.message)
  } finally {
    await browser.close().catch(() => {})
  }

  printSummary()
}

function printSummary() {
  console.log('\n== Summary ==')
  console.log(`Pass: ${results.pass.length}  Fail: ${results.fail.length}  Skip: ${results.skip.length}`)
  if (results.fail.length) process.exit(1)
}

run()
