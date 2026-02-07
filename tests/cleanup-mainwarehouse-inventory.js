#!/usr/bin/env node
/**
 * Delete all inventory items from Main Warehouse,
 * leaving PMB stock location items intact.
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'http://localhost:3000'
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@example.com'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123'

let token = null

async function apiRequest(path, method = 'GET', body = null) {
  const url = `${BASE_URL}${path}`
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const options = { method, headers }
  if (body && method !== 'GET') options.body = JSON.stringify(body)
  const res = await fetch(url, options)
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { status: res.status, data }
}

function apiData(res) {
  return res?.data?.data ?? res?.data ?? {}
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Login failed: ${res.status} ${text}`)
  }
  const body = await res.json()
  token = body.data?.accessToken ?? body.accessToken
  if (!token) throw new Error('No access token returned')
}

async function run() {
  await login()

  const locationsRes = await apiRequest('/api/manufacturing/locations', 'GET')
  const locations = apiData(locationsRes).locations || []
  const mainWarehouse = locations.find(loc =>
    loc.code === 'LOC001' || (loc.name || '').toLowerCase().includes('main warehouse')
  )
  const pmbLocation = locations.find(loc =>
    (loc.code || '').toUpperCase().includes('PMB') || (loc.name || '').toUpperCase().includes('PMB')
  )

  if (!mainWarehouse) {
    console.log('Main Warehouse location not found. Nothing to delete.')
    return
  }
  if (!pmbLocation) {
    console.log('PMB location not found. Proceeding with Main Warehouse cleanup only.')
  }

  const invRes = await apiRequest(`/api/manufacturing/inventory?locationId=${mainWarehouse.id}`, 'GET')
  const inventory = apiData(invRes).inventory || []

  let deleted = 0
  let failed = 0

  for (const item of inventory) {
    const del = await apiRequest(`/api/manufacturing/inventory/${item.id}`, 'DELETE')
    if (del.status === 200) {
      deleted++
    } else {
      failed++
    }
  }

  console.log('\n🧹 Main Warehouse inventory cleanup complete')
  console.log({
    mainWarehouse: { id: mainWarehouse.id, code: mainWarehouse.code, name: mainWarehouse.name },
    pmbLocation: pmbLocation ? { id: pmbLocation.id, code: pmbLocation.code, name: pmbLocation.name } : null,
    deleted,
    failed
  })
}

run().catch((error) => {
  console.error('Cleanup failed:', error.message)
  process.exit(1)
})
