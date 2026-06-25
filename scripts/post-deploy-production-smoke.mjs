#!/usr/bin/env node
/**
 * Post-deploy production smoke checks (no browser). Optional auth via TEST_EMAIL / TEST_PASSWORD.
 * Usage: APP_URL=https://abcoafrica.co.za node scripts/post-deploy-production-smoke.mjs
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const BASE = (process.env.APP_URL || process.env.TEST_URL || 'https://abcoafrica.co.za').replace(/\/$/, '')
const FIELD_HEADERS = {
  'X-Abcotronics-Client': 'field-app-v1',
  'Content-Type': 'application/json'
}
const OTA_RUNTIMES = (process.env.MOBILE_OTA_RUNTIMES || 'erp-mobile-1 erp-mobile-2 erp-mobile-3 erp-mobile-4').split(/\s+/).filter(Boolean)

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

async function fetchStatus(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: res.status, text, json, headers: res.headers }
  } catch (e) {
    return { status: 0, error: e.message, text: '', json: null, headers: null }
  }
}

async function login() {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) return null
  const res = await fetchStatus('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const token = res.json?.data?.accessToken ?? res.json?.accessToken
  if (res.status === 200 && token) return token
  bad('Auth login', `status ${res.status}`)
  return null
}

async function checkHealth() {
  const res = await fetchStatus('/health')
  if (res.status === 200 && (res.json?.status === 'ok' || res.text.includes('ok'))) {
    ok('Health endpoint', res.json?.db ? `db: ${res.json.db}` : '')
  } else {
    bad('Health endpoint', `HTTP ${res.status}`)
  }
}

async function checkVersion() {
  const res = await fetchStatus('/version')
  if (res.status === 200 && res.json?.version) {
    ok('Version endpoint', `build ${res.json.version}`)
    return res.json
  }
  bad('Version endpoint', `HTTP ${res.status}`)
  return null
}

async function checkCoreBundle(versionInfo) {
  const index = await fetchStatus('/')
  if (index.status !== 200) {
    bad('Index HTML', `HTTP ${index.status}`)
    return
  }
  const bundleMatch = index.text.match(/core-bundle\.js[^"']*/)
  if (!bundleMatch) {
    bad('Index HTML', 'core-bundle.js script tag missing')
    return
  }
  ok('Index HTML', 'references core-bundle.js')

  const bundle = await fetchStatus(`/dist/core-bundle.js?v=${versionInfo?.version || Date.now()}`)
  if (bundle.status !== 200 || bundle.text.length < 500000) {
    bad('Core bundle', `HTTP ${bundle.status}, size ${bundle.text.length}`)
    return
  }
  if (bundle.text.includes('useErpLayoutComponents') && bundle.text.includes('erpNavigationConfig')) {
    ok('Core bundle', 'contains MainLayout refactor modules')
  } else {
    bad('Core bundle', 'missing useErpLayoutComponents / erpNavigationConfig')
  }
}

async function checkPublicFieldApis() {
  const inv = await fetchStatus('/api/public/inventory?limit=1', { headers: FIELD_HEADERS })
  if (inv.status === 200) {
    ok('Public inventory (field client)', 'HTTP 200')
  } else if (inv.status === 403) {
    bad('Public inventory (field client)', '403 — check PUBLIC_FIELD_* env on server')
  } else {
    bad('Public inventory (field client)', `HTTP ${inv.status}`)
  }

  const loc = await fetchStatus('/api/public/locations', { headers: FIELD_HEADERS })
  if (loc.status === 200) {
    const rows = loc.json?.data?.locations ?? loc.json?.locations ?? []
    ok('Public locations (field client)', `${Array.isArray(rows) ? rows.length : '?'} location(s)`)
  } else {
    bad('Public locations (field client)', `HTTP ${loc.status}`)
  }
}

async function checkMobileOta() {
  for (const runtime of OTA_RUNTIMES) {
    const res = await fetchStatus('/api/public/mobile-ota/manifest', {
      headers: {
        'expo-platform': 'android',
        'expo-runtime-version': runtime,
        'expo-protocol-version': '1'
      }
    })
    if (res.status === 200 && res.headers?.get('content-type')?.includes('multipart')) {
      ok(`Mobile OTA manifest (${runtime})`, 'update available')
    } else if (res.status === 404) {
      bad(`Mobile OTA manifest (${runtime})`, 'no bundle folder on server')
    } else {
      bad(`Mobile OTA manifest (${runtime})`, `HTTP ${res.status}`)
    }
  }
}

async function checkAuthenticatedApis(token) {
  if (!token) {
    skip('Authenticated API checks', 'set TEST_EMAIL and TEST_PASSWORD')
    return
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  for (const [label, path] of [
    ['Manufacturing locations', '/api/manufacturing/locations'],
    ['Manufacturing inventory', '/api/manufacturing/inventory'],
    ['Clients list', '/api/clients?limit=1']
  ]) {
    const res = await fetchStatus(path, { headers })
    if (res.status === 200) ok(label, `HTTP 200`)
    else bad(label, `HTTP ${res.status}`)
  }
}

async function main() {
  console.log(`\n== Post-deploy production smoke ==\nTarget: ${BASE}\n`)
  await checkHealth()
  const versionInfo = await checkVersion()
  await checkCoreBundle(versionInfo)
  await checkPublicFieldApis()
  await checkMobileOta()
  const token = await login()
  await checkAuthenticatedApis(token)

  console.log('\n== Summary ==')
  console.log(`Pass: ${results.pass.length}  Fail: ${results.fail.length}  Skip: ${results.skip.length}`)
  if (results.fail.length) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
