#!/usr/bin/env node
/**
 * Targeted cleanup of manufacturing test artifacts.
 * Deletes only records created by test suites (by name/reference prefixes).
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
  try {
    const res = await fetch(url, options)
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
    return { status: res.status, data }
  } catch (error) {
    return { status: 0, error: error.message }
  }
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

const isTestLocation = (loc) =>
  (loc?.code || '').startsWith('TLOC') ||
  (loc?.name || '').startsWith('Test Location')

const isTestInventory = (item) =>
  (item?.name || '').startsWith('Test Component') ||
  (item?.name || '').startsWith('Test Finished Product')

const isTestBom = (bom) =>
  (bom?.notes || '').startsWith('Test BOM') ||
  (bom?.productName || '').startsWith('Test Finished Product')

const isTestProductionOrder = (order) =>
  (order?.workOrderNumber || '').startsWith('TEST-WO')

const isTestSalesOrder = (order) =>
  (order?.orderNumber || '').startsWith('SO-TEST') ||
  (order?.orderNumber || '').startsWith('SO-INSUFFICIENT')

const isTestPurchaseOrder = (order) =>
  (order?.orderNumber || '').startsWith('PO-TEST')

const isTestSupplier = (supplier) =>
  (supplier?.name || '').startsWith('Test Supplier')

const isTestMovement = (movement) => {
  const ref = movement?.reference || ''
  return ref.startsWith('TEST-') || ref.startsWith('MOV-TEST') || ref.startsWith('SO-TEST') || ref.startsWith('PO-TEST')
}

async function run() {
  await login()

  const summary = {
    stockMovements: 0,
    productionOrders: 0,
    salesOrders: 0,
    purchaseOrders: 0,
    boms: 0,
    inventory: 0,
    suppliers: 0,
    locations: 0
  }

  // Stock movements
  const movementsRes = await apiRequest('/api/manufacturing/stock-movements', 'GET')
  const movements = apiData(movementsRes).movements || []
  for (const movement of movements.filter(isTestMovement)) {
    const del = await apiRequest(`/api/manufacturing/stock-movements/${movement.id}`, 'DELETE')
    if (del.status === 200) summary.stockMovements++
  }

  // Production orders
  const prodRes = await apiRequest('/api/manufacturing/production-orders', 'GET')
  const prodOrders = apiData(prodRes).productionOrders || []
  for (const order of prodOrders.filter(isTestProductionOrder)) {
    const del = await apiRequest(`/api/manufacturing/production-orders/${order.id}`, 'DELETE')
    if (del.status === 200) summary.productionOrders++
  }

  // Sales orders
  const salesRes = await apiRequest('/api/sales-orders', 'GET')
  const salesOrders = apiData(salesRes).salesOrders || []
  for (const order of salesOrders.filter(isTestSalesOrder)) {
    const del = await apiRequest(`/api/sales-orders/${order.id}`, 'DELETE')
    if (del.status === 200) summary.salesOrders++
  }

  // Purchase orders
  const purchaseRes = await apiRequest('/api/purchase-orders', 'GET')
  const purchaseOrders = apiData(purchaseRes).purchaseOrders || []
  for (const order of purchaseOrders.filter(isTestPurchaseOrder)) {
    const del = await apiRequest(`/api/purchase-orders/${order.id}`, 'DELETE')
    if (del.status === 200) summary.purchaseOrders++
  }

  // BOMs
  const bomRes = await apiRequest('/api/manufacturing/boms', 'GET')
  const boms = apiData(bomRes).boms || []
  for (const bom of boms.filter(isTestBom)) {
    const del = await apiRequest(`/api/manufacturing/boms/${bom.id}`, 'DELETE')
    if (del.status === 200) summary.boms++
  }

  // Inventory
  const invRes = await apiRequest('/api/manufacturing/inventory', 'GET')
  const inventory = apiData(invRes).inventory || []
  for (const item of inventory.filter(isTestInventory)) {
    const del = await apiRequest(`/api/manufacturing/inventory/${item.id}`, 'DELETE')
    if (del.status === 200) summary.inventory++
  }

  // Suppliers
  const supplierRes = await apiRequest('/api/manufacturing/suppliers', 'GET')
  const suppliers = apiData(supplierRes).suppliers || []
  for (const supplier of suppliers.filter(isTestSupplier)) {
    const del = await apiRequest(`/api/manufacturing/suppliers/${supplier.id}`, 'DELETE')
    if (del.status === 200) summary.suppliers++
  }

  // Locations (only test locations, and only after inventory cleanup)
  const locRes = await apiRequest('/api/manufacturing/locations', 'GET')
  const locations = apiData(locRes).locations || []
  for (const loc of locations.filter(isTestLocation)) {
    const del = await apiRequest(`/api/manufacturing/locations/${loc.id}`, 'DELETE')
    if (del.status === 200) summary.locations++
  }

  console.log('\n🧹 Targeted cleanup complete')
  console.log(summary)
}

run().catch((error) => {
  console.error('Cleanup failed:', error.message)
  process.exit(1)
})
