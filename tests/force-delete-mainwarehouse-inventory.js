#!/usr/bin/env node
/**
 * Force delete Main Warehouse inventory items:
 * - delete BOMs linked to those items
 * - delete inventory items
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

  const locRes = await apiRequest('/api/manufacturing/locations', 'GET')
  const locations = apiData(locRes).locations || []
  const mainWarehouse = locations.find(loc =>
    loc.code === 'LOC001' || (loc.name || '').toLowerCase().includes('main warehouse')
  )

  if (!mainWarehouse) {
    console.log('Main Warehouse not found. Nothing to delete.')
    return
  }

  const invRes = await apiRequest(`/api/manufacturing/inventory?locationId=${mainWarehouse.id}`, 'GET')
  const inventory = apiData(invRes).inventory || []

  const bomRes = await apiRequest('/api/manufacturing/boms', 'GET')
  const boms = apiData(bomRes).boms || []
  const itemIds = new Set(inventory.map(item => item.id))
  const bomIdsToDelete = boms.filter(bom => itemIds.has(bom.inventoryItemId)).map(bom => bom.id)

  let deletedBoms = 0
  let failedBoms = 0
  for (const bomId of bomIdsToDelete) {
    const del = await apiRequest(`/api/manufacturing/boms/${bomId}`, 'DELETE')
    if (del.status === 200) deletedBoms++
    else failedBoms++
  }

  let deletedItems = 0
  let failedItems = 0
  for (const item of inventory) {
    const del = await apiRequest(`/api/manufacturing/inventory/${item.id}`, 'DELETE')
    if (del.status === 200) deletedItems++
    else failedItems++
  }

  console.log('\n🧹 Main Warehouse force delete complete')
  console.log({
    mainWarehouse: { id: mainWarehouse.id, code: mainWarehouse.code, name: mainWarehouse.name },
    inventoryCount: inventory.length,
    bomDeleted: deletedBoms,
    bomFailed: failedBoms,
    inventoryDeleted: deletedItems,
    inventoryFailed: failedItems
  })
}

run().catch((error) => {
  console.error('Force delete failed:', error.message)
  process.exit(1)
})
