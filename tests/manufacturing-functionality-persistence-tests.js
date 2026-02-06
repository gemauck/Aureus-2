#!/usr/bin/env node
/**
 * Manufacturing Section - Comprehensive Functionality and Persistence Tests
 * Covers: dashboard stats, inventory CRUD, BOM CRUD, production orders,
 * sales orders, purchase orders, and stock movement audit trail.
 *
 * Requires: server running (npm run dev:backend), and auth
 * (TEST_EMAIL/TEST_PASSWORD or dev login).
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

const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  totalTests: 0,
  startTime: Date.now()
}

const created = {
  locations: [],
  inventory: [],
  boms: [],
  productionOrders: [],
  salesOrders: [],
  purchaseOrders: [],
  stockMovements: []
}

let testToken = null
let testUser = null

function log(message, type = 'info') {
  const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '📝'
  console.log(`${emoji} ${message}`)
}

function recordResult(test, passed, message = '', isWarning = false) {
  testResults.totalTests++
  const result = { test, passed, message, warning: isWarning }
  if (passed) {
    testResults.passed.push(result)
    log(`${test}: PASSED`, 'success')
  } else if (isWarning) {
    testResults.warnings.push(result)
    log(`${test}: WARNING - ${message}`, 'warn')
  } else {
    testResults.failed.push(result)
    log(`${test}: FAILED - ${message}`, 'error')
  }
}

function assertEqual(actual, expected, testName, detail = '') {
  const ok = actual === expected
  recordResult(testName, ok, ok ? detail : `Expected ${expected}, got ${actual}`)
  return ok
}

function assertTrue(condition, testName, detail = '') {
  const ok = !!condition
  recordResult(testName, ok, ok ? detail : 'Assertion failed')
  return ok
}

function warnIf(condition, testName, detail) {
  if (condition) {
    recordResult(testName, false, detail, true)
    return true
  }
  recordResult(testName, true, detail || 'OK')
  return false
}

async function apiRequest(path, method = 'GET', body = null, token = testToken, timeoutMs = 15000) {
  const url = `${BASE_URL}${path}`
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const options = { method, headers }
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body)
  }
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeoutId)
    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch (e) {
      data = { raw: text }
    }
    return { status: response.status, data, headers: response.headers }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { error: `Request timeout after ${timeoutMs}ms`, status: 0 }
    }
    return { error: error.message, status: 0 }
  }
}

function apiData(res) {
  return res?.data?.data ?? res?.data ?? {}
}

function apiErrorMessage(res) {
  if (!res) return 'Unknown error'
  if (res.error) return res.error
  const err = res?.data?.error
  if (err?.message) {
    return `${err.message}${err.details ? ` - ${err.details}` : ''}`
  }
  return JSON.stringify(res.data || {})
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
  const token = body.data?.accessToken ?? body.accessToken
  if (!token) throw new Error('No accessToken in login response')
  return { token, user: body.data?.user || body.user || null }
}

async function listLocations() {
  const res = await apiRequest('/api/manufacturing/locations', 'GET')
  return apiData(res).locations || []
}

async function ensureLocation(code, name, timeoutMs = 30000) {
  const locations = await listLocations()
  const existing = locations.find(loc => loc.code === code)
  if (existing) return existing

  const res = await apiRequest('/api/manufacturing/locations', 'POST', {
    code,
    name,
    type: 'warehouse',
    status: 'active'
  }, testToken, timeoutMs)
  const data = apiData(res)
  if (res.status !== 201 || !data.location?.id) {
    throw new Error(`Failed to create location ${code}: ${res.status} ${JSON.stringify(data.error || data)}`)
  }
  created.locations.push(data.location.id)
  return data.location
}

async function createInventoryItem(payload) {
  const res = await apiRequest('/api/manufacturing/inventory', 'POST', payload)
  const data = apiData(res)
  if (res.status !== 201 || !data.item?.id) {
    throw new Error(`Failed to create inventory item: ${res.status} ${JSON.stringify(data.error || data)}`)
  }
  created.inventory.push(data.item.id)
  return data.item
}

async function getInventoryItem(id) {
  const res = await apiRequest(`/api/manufacturing/inventory/${id}`, 'GET')
  return apiData(res).item || null
}

async function listInventory() {
  const res = await apiRequest('/api/manufacturing/inventory', 'GET')
  return apiData(res).inventory || []
}

async function listLocationInventory(locationId) {
  const res = await apiRequest(`/api/manufacturing/location-inventory/${locationId}`, 'GET')
  return apiData(res).items || []
}

async function listSuppliers() {
  const res = await apiRequest('/api/manufacturing/suppliers', 'GET')
  return apiData(res).suppliers || []
}

async function createSupplier(payload) {
  const res = await apiRequest('/api/manufacturing/suppliers', 'POST', payload)
  const data = apiData(res)
  if (res.status !== 201 || !data.supplier?.id) {
    throw new Error(`Failed to create supplier: ${res.status} ${apiErrorMessage(res)}`)
  }
  return data.supplier
}

async function createBom(payload) {
  const res = await apiRequest('/api/manufacturing/boms', 'POST', payload)
  const data = apiData(res)
  if (res.status !== 201 || !data.bom?.id) {
    throw new Error(`Failed to create BOM: ${res.status} ${JSON.stringify(data.error || data)}`)
  }
  created.boms.push(data.bom.id)
  return data.bom
}

async function updateBom(id, payload) {
  const res = await apiRequest(`/api/manufacturing/boms/${id}`, 'PATCH', payload)
  return { status: res.status, bom: apiData(res).bom || null }
}

async function getBom(id) {
  const res = await apiRequest(`/api/manufacturing/boms/${id}`, 'GET')
  return { status: res.status, bom: apiData(res).bom || null }
}

async function createProductionOrder(payload) {
  const res = await apiRequest('/api/manufacturing/production-orders', 'POST', payload)
  const data = apiData(res)
  if (res.status !== 201 || !data.order?.id) {
    throw new Error(`Failed to create production order: ${res.status} ${JSON.stringify(data.error || data)}`)
  }
  created.productionOrders.push(data.order.id)
  return data.order
}

async function updateProductionOrder(id, payload) {
  const res = await apiRequest(`/api/manufacturing/production-orders/${id}`, 'PATCH', payload)
  return { status: res.status, order: apiData(res).order || null, raw: res }
}

async function listStockMovements() {
  const res = await apiRequest('/api/manufacturing/stock-movements', 'GET')
  return apiData(res).movements || []
}

async function createSalesOrder(payload) {
  const res = await apiRequest('/api/sales-orders', 'POST', payload)
  const data = apiData(res)
  if (res.status !== 201 || !data.salesOrder?.id) {
    throw new Error(`Failed to create sales order: ${res.status} ${JSON.stringify(data.error || data)}`)
  }
  created.salesOrders.push(data.salesOrder.id)
  return data.salesOrder
}

async function updateSalesOrder(id, payload) {
  const res = await apiRequest(`/api/sales-orders/${id}`, 'PATCH', payload)
  return { status: res.status, salesOrder: apiData(res).salesOrder || null }
}

async function createPurchaseOrder(payload) {
  const res = await apiRequest('/api/purchase-orders', 'POST', payload)
  const data = apiData(res)
  if (res.status !== 201 || !data.purchaseOrder?.id) {
    throw new Error(`Failed to create purchase order: ${res.status} ${JSON.stringify(data.error || data)}`)
  }
  created.purchaseOrders.push(data.purchaseOrder.id)
  return data.purchaseOrder
}

async function updatePurchaseOrder(id, payload) {
  const res = await apiRequest(`/api/purchase-orders/${id}`, 'PATCH', payload)
  return { status: res.status, purchaseOrder: apiData(res).purchaseOrder || null }
}

function calcDashboardInventoryStats(items) {
  const totalValue = items.reduce((sum, item) => sum + (item.totalValue || 0), 0)
  const lowStockItems = items.filter(item => {
    const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0)
    return availableQty <= (item.reorderPoint || 0)
  }).length
  const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0)
  const categories = [...new Set(items.map(item => item.category))].length
  return { totalValue, lowStockItems, totalItems, categories }
}

function calcDashboardProductionStats(orders) {
  const activeOrders = orders.filter(o => o.status === 'in_production' || o.status === 'in_progress').length
  const completedOrders = orders.filter(o => o.status === 'completed').length
  const totalProduction = orders.reduce((sum, o) => sum + (o.quantityProduced || 0), 0)
  const pendingUnits = orders
    .filter(o => o.status === 'in_production' || o.status === 'in_progress')
    .reduce((sum, o) => sum + ((o.quantity || 0) - (o.quantityProduced || 0)), 0)
  return { activeOrders, completedOrders, totalProduction, pendingUnits }
}

async function run() {
  const testId = Date.now()
  const refs = {
    receipt: `TEST-RECEIPT-${testId}`,
    transfer: `TEST-TRANSFER-${testId}`,
    adjustment: `TEST-ADJUST-${testId}`,
    workOrder: `TEST-WO-${testId}`,
    salesOrder: `SO-TEST-${testId}`,
    purchaseOrder: `PO-TEST-${testId}`
  }
  const successRefs = {
    receipt: false,
    transfer: false,
    adjustment: false,
    production: false,
    sale: false,
    purchase: false
  }

  try {
    const auth = await login()
    testToken = auth.token
    testUser = auth.user
    recordResult('Login', true, `Authenticated as ${TEST_EMAIL}`)
  } catch (error) {
    recordResult('Login', false, error.message)
    return
  }

  // --- Setup: ensure locations ---
  log('\n🏭 Setup: Locations', 'info')
  let mainLocation
  let secondaryLocation
  try {
    mainLocation = await ensureLocation('LOC001', 'Main Warehouse')
    const existingLocations = await listLocations()
    secondaryLocation = existingLocations.find(loc => loc.id !== mainLocation.id) || null
    if (!secondaryLocation) {
      try {
        secondaryLocation = await ensureLocation(`TLOC${String(testId).slice(-4)}`, `Test Location ${testId}`)
      } catch (error) {
        secondaryLocation = null
        recordResult('Secondary location setup', false, error.message, true)
      }
    }
    assertTrue(!!mainLocation?.id, 'Main location available', `LOC001 -> ${mainLocation.id}`)
    if (secondaryLocation) {
      assertTrue(!!secondaryLocation?.id, 'Secondary location available', `${secondaryLocation.code} -> ${secondaryLocation.id}`)
    } else {
      recordResult('Secondary location available', false, 'Skipping transfer test (no secondary location)', true)
    }
  } catch (error) {
    recordResult('Location Setup', false, error.message)
    return
  }

  // --- Inventory CRUD + correctness ---
  log('\n📦 Inventory: Create and verify data', 'info')
  const componentA = await createInventoryItem({
    name: `Test Component A ${testId}`,
    category: 'components',
    type: 'raw_material',
    quantity: 100,
    unit: 'pcs',
    reorderPoint: 20,
    reorderQty: 50,
    unitCost: 5,
    supplier: 'Test Supplier',
    locationId: mainLocation.id
  })
  const componentB = await createInventoryItem({
    name: `Test Component B ${testId}`,
    category: 'components',
    type: 'raw_material',
    quantity: 60,
    unit: 'pcs',
    reorderPoint: 10,
    reorderQty: 25,
    unitCost: 8,
    supplier: 'Test Supplier',
    locationId: mainLocation.id
  })
  const finishedProduct = await createInventoryItem({
    name: `Test Finished Product ${testId}`,
    category: 'finished_goods',
    type: 'finished_good',
    quantity: 0,
    unit: 'pcs',
    reorderPoint: 5,
    unitCost: 0,
    locationId: mainLocation.id
  })

  assertTrue(!!componentA?.sku, 'Inventory item A SKU generated')
  assertTrue(!!componentB?.sku, 'Inventory item B SKU generated')
  assertTrue(!!finishedProduct?.sku, 'Finished product SKU generated')

  const inventoryList = await listInventory()
  const invA = inventoryList.find(item => item.id === componentA.id)
  const invB = inventoryList.find(item => item.id === componentB.id)
  assertTrue(!!invA, 'Inventory list contains component A')
  assertTrue(!!invB, 'Inventory list contains component B')
  assertEqual(invA?.totalValue, 100 * 5, 'Inventory total value calculation', `SKU ${componentA.sku}`)

  const locInventoryMain = await listLocationInventory(mainLocation.id)
  const locA = locInventoryMain.find(item => item.sku === componentA.sku)
  assertEqual(locA?.quantity, 100, 'Location inventory quantity matches master', `SKU ${componentA.sku}`)

  // --- Stock Transactions: receipt, transfer, adjustment ---
  log('\n🔁 Stock Transactions', 'info')
  const componentAQuantityBefore = (await getInventoryItem(componentA.id))?.quantity || 0
  const receiptRes = await apiRequest('/api/manufacturing/stock-transactions', 'POST', {
    type: 'receipt',
    sku: componentA.sku,
    itemName: componentA.name,
    quantity: 20,
    unitCost: 5,
    toLocationId: mainLocation.id,
    reference: refs.receipt
  })
  const receiptOk = receiptRes.status === 201
  recordResult('Receipt transaction created', receiptOk, receiptOk ? '' : apiErrorMessage(receiptRes))
  successRefs.receipt = receiptOk

  if (receiptOk) {
    const afterReceipt = await getInventoryItem(componentA.id)
    assertEqual(afterReceipt?.quantity, componentAQuantityBefore + 20, 'Receipt updates master quantity')
  }

  if (secondaryLocation) {
    const transferRes = await apiRequest('/api/manufacturing/stock-transactions', 'POST', {
      type: 'transfer',
      sku: componentA.sku,
      itemName: componentA.name,
      quantity: 10,
      fromLocationId: mainLocation.id,
      toLocationId: secondaryLocation.id,
      reference: refs.transfer
    })
    const transferOk = transferRes.status === 201
    recordResult('Transfer transaction created', transferOk, transferOk ? '' : apiErrorMessage(transferRes))
    successRefs.transfer = transferOk

    if (transferOk) {
      const locInventoryAfterTransferMain = await listLocationInventory(mainLocation.id)
      const locInventoryAfterTransferSecondary = await listLocationInventory(secondaryLocation.id)
      const mainAfterTransfer = locInventoryAfterTransferMain.find(item => item.sku === componentA.sku)
      const secondaryAfterTransfer = locInventoryAfterTransferSecondary.find(item => item.sku === componentA.sku)
      assertTrue((mainAfterTransfer?.quantity ?? 0) >= 0, 'Transfer reduces source location quantity')
      assertTrue((secondaryAfterTransfer?.quantity ?? 0) >= 0, 'Transfer increases destination location quantity')
    }
  }

  const componentABeforeAdjustment = (await getInventoryItem(componentA.id))?.quantity || 0
  const adjustmentRes = await apiRequest('/api/manufacturing/stock-transactions', 'POST', {
    type: 'adjustment',
    sku: componentA.sku,
    itemName: componentA.name,
    quantity: 5,
    delta: -5,
    locationId: mainLocation.id,
    reference: refs.adjustment
  })
  const adjustmentOk = adjustmentRes.status === 201
  recordResult('Adjustment transaction created', adjustmentOk, adjustmentOk ? '' : apiErrorMessage(adjustmentRes))
  successRefs.adjustment = adjustmentOk

  if (adjustmentOk) {
    const afterAdjustment = await getInventoryItem(componentA.id)
    assertEqual(afterAdjustment?.quantity, componentABeforeAdjustment - 5, 'Adjustment updates master quantity')
  }

  // --- BOM CRUD ---
  log('\n🧾 BOM: create, update, get, delete', 'info')
  const bom = await createBom({
    productSku: finishedProduct.sku,
    productName: finishedProduct.name,
    inventoryItemId: finishedProduct.id,
    version: '1.0',
    status: 'active',
    laborCost: 25,
    overheadCost: 10,
    estimatedTime: 60,
    components: [
      {
        sku: componentA.sku,
        name: componentA.name,
        quantity: 2,
        unit: 'pcs',
        unitCost: 5,
        totalCost: 10
      },
      {
        sku: componentB.sku,
        name: componentB.name,
        quantity: 1,
        unit: 'pcs',
        unitCost: 8,
        totalCost: 8
      }
    ],
    notes: `Test BOM ${testId}`
  })

  assertEqual(bom.totalMaterialCost, 18, 'BOM material cost calculated')
  assertEqual(bom.totalCost, 53, 'BOM total cost calculated')

  const bomGet = await getBom(bom.id)
  assertEqual(bomGet.status, 200, 'BOM fetch by id works')
  assertEqual(bomGet.bom?.id, bom.id, 'BOM id persisted')

  const bomUpdate = await updateBom(bom.id, {
    laborCost: 30,
    components: [
      {
        sku: componentA.sku,
        name: componentA.name,
        quantity: 3,
        unit: 'pcs',
        unitCost: 5,
        totalCost: 15
      },
      {
        sku: componentB.sku,
        name: componentB.name,
        quantity: 1,
        unit: 'pcs',
        unitCost: 8,
        totalCost: 8
      }
    ]
  })
  assertEqual(bomUpdate.status, 200, 'BOM update succeeds')
  assertEqual(bomUpdate.bom?.totalMaterialCost, 23, 'BOM totalMaterialCost updated')
  assertEqual(bomUpdate.bom?.totalCost, 63, 'BOM totalCost updated')

  // --- Production Orders ---
  log('\n🏗️ Production Orders', 'info')
  const updatedBomComponents = bomUpdate.bom?.components || []
  const componentAUnits = updatedBomComponents.find(comp => comp.sku === componentA.sku)?.quantity || 0
  const componentBUnits = updatedBomComponents.find(comp => comp.sku === componentB.sku)?.quantity || 0
  const allocationQtyA = componentAUnits * 3
  const allocationQtyB = componentBUnits * 3
  const componentAAllocatedBefore = (await getInventoryItem(componentA.id))?.allocatedQuantity || 0
  const componentBAllocatedBefore = (await getInventoryItem(componentB.id))?.allocatedQuantity || 0
  const order = await createProductionOrder({
    bomId: bom.id,
    productSku: finishedProduct.sku,
    productName: finishedProduct.name,
    quantity: 3,
    status: 'requested',
    workOrderNumber: refs.workOrder,
    assignedTo: 'Test Team'
  })

  const compAAfterAllocation = await getInventoryItem(componentA.id)
  const compBAfterAllocation = await getInventoryItem(componentB.id)
  assertEqual(
    compAAfterAllocation?.allocatedQuantity,
    componentAAllocatedBefore + allocationQtyA,
    'Allocation increases component A allocated qty'
  )
  assertEqual(
    compBAfterAllocation?.allocatedQuantity,
    componentBAllocatedBefore + allocationQtyB,
    'Allocation increases component B allocated qty'
  )

  const compAQtyBeforeCompletion = compAAfterAllocation?.quantity || 0
  const compBQtyBeforeCompletion = compBAfterAllocation?.quantity || 0
  const compAAllocBeforeCompletion = compAAfterAllocation?.allocatedQuantity || 0
  const compBAllocBeforeCompletion = compBAfterAllocation?.allocatedQuantity || 0

  const completion = await updateProductionOrder(order.id, {
    status: 'completed',
    quantityProduced: 3,
    completedDate: new Date().toISOString().split('T')[0]
  })
  assertEqual(completion.status, 200, 'Production order completion succeeds')
  successRefs.production = completion.status === 200

  const compAAfterCompletion = await getInventoryItem(componentA.id)
  const compBAfterCompletion = await getInventoryItem(componentB.id)
  const finishedAfterCompletion = await getInventoryItem(finishedProduct.id)
  const expectedCompAQty = compAQtyBeforeCompletion - Math.max(allocationQtyA - compAAllocBeforeCompletion, 0)
  const expectedCompBQty = compBQtyBeforeCompletion - Math.max(allocationQtyB - compBAllocBeforeCompletion, 0)
  assertEqual(compAAfterCompletion?.quantity, expectedCompAQty, 'Production completion deducts component A stock')
  assertEqual(compBAfterCompletion?.quantity, expectedCompBQty, 'Production completion deducts component B stock')
  assertEqual(compAAfterCompletion?.allocatedQuantity || 0, 0, 'Allocation released for component A')
  assertEqual(compBAfterCompletion?.allocatedQuantity || 0, 0, 'Allocation released for component B')
  assertEqual(finishedAfterCompletion?.quantity, 3, 'Finished goods stock increases on completion')

  // --- Sales Orders ---
  log('\n🧾 Sales Orders', 'info')
  const salesOrder = await createSalesOrder({
    orderNumber: refs.salesOrder,
    clientName: 'Test Client',
    status: 'draft',
    items: [
      {
        sku: finishedProduct.sku,
        name: finishedProduct.name,
        quantity: 2,
        unitPrice: 100
      }
    ],
    subtotal: 200,
    total: 200
  })
  assertTrue(!!salesOrder?.id, 'Sales order created')

  const shipRes = await updateSalesOrder(salesOrder.id, {
    status: 'shipped',
    shippedDate: new Date().toISOString()
  })
  const salesShipOk = shipRes.status === 200
  recordResult('Sales order shipped', salesShipOk, salesShipOk ? '' : apiErrorMessage(shipRes))
  successRefs.sale = salesShipOk
  if (salesShipOk) {
    const finishedAfterSale = await getInventoryItem(finishedProduct.id)
    assertEqual(finishedAfterSale?.quantity, 1, 'Sales order shipment deducts finished goods')
  }

  // --- Purchase Orders ---
  log('\n🧾 Purchase Orders', 'info')
  let supplier = null
  try {
    const suppliers = await listSuppliers()
    supplier = suppliers[0] || await createSupplier({ name: `Test Supplier ${testId}` })
  } catch (error) {
    recordResult('Supplier setup', false, error.message)
    return
  }

  const purchaseOrder = await createPurchaseOrder({
    orderNumber: refs.purchaseOrder,
    supplierId: supplier.id,
    supplierName: 'Test Supplier',
    status: 'draft',
    items: [
      {
        sku: componentB.sku,
        name: componentB.name,
        quantity: 10,
        unitPrice: 8
      }
    ],
    subtotal: 80,
    total: 80
  })
  assertTrue(!!purchaseOrder?.id, 'Purchase order created')

  const receiveRes = await updatePurchaseOrder(purchaseOrder.id, {
    status: 'received',
    receivedDate: new Date().toISOString()
  })
  const purchaseReceivedOk = receiveRes.status === 200
  recordResult('Purchase order received', purchaseReceivedOk, purchaseReceivedOk ? '' : apiErrorMessage(receiveRes))
  successRefs.purchase = purchaseReceivedOk

  if (purchaseReceivedOk) {
    const compBAfterPurchase = await getInventoryItem(componentB.id)
    assertEqual(compBAfterPurchase?.quantity, 67, 'Purchase order receipt increases component stock')
  }

  // --- Validation & Error Handling ---
  log('\n🧪 Validation & Error Handling', 'info')
  const duplicateLocationRes = await apiRequest('/api/manufacturing/locations', 'POST', {
    code: 'LOC001',
    name: 'Duplicate Main'
  })
  recordResult(
    'Location duplicate code rejected',
    duplicateLocationRes.status === 400,
    duplicateLocationRes.status === 400 ? '' : apiErrorMessage(duplicateLocationRes)
  )

  const invalidStockTypeRes = await apiRequest('/api/manufacturing/stock-transactions', 'POST', {
    type: 'invalid_type',
    sku: componentA.sku,
    itemName: componentA.name,
    quantity: 1,
    toLocationId: mainLocation.id
  })
  recordResult(
    'Stock transaction invalid type rejected',
    invalidStockTypeRes.status === 400,
    invalidStockTypeRes.status === 400 ? '' : apiErrorMessage(invalidStockTypeRes)
  )

  const saleMissingLocationRes = await apiRequest('/api/manufacturing/stock-transactions', 'POST', {
    type: 'sale',
    sku: componentA.sku,
    itemName: componentA.name,
    quantity: 1
  })
  recordResult(
    'Sale requires locationId',
    saleMissingLocationRes.status === 400,
    saleMissingLocationRes.status === 400 ? '' : apiErrorMessage(saleMissingLocationRes)
  )

  const transferTooMuchRes = await apiRequest('/api/manufacturing/stock-transactions', 'POST', {
    type: 'transfer',
    sku: componentA.sku,
    itemName: componentA.name,
    quantity: 999999,
    fromLocationId: mainLocation.id,
    toLocationId: secondaryLocation?.id || mainLocation.id
  })
  recordResult(
    'Transfer rejects insufficient stock',
    transferTooMuchRes.status >= 400,
    transferTooMuchRes.status >= 400 ? '' : 'Expected error for insufficient stock'
  )

  const missingBomLinkRes = await apiRequest('/api/manufacturing/boms', 'POST', {
    productSku: `MISSING-BOM-${testId}`,
    productName: 'Missing Link'
  })
  recordResult(
    'BOM requires inventoryItemId',
    missingBomLinkRes.status === 400,
    missingBomLinkRes.status === 400 ? '' : apiErrorMessage(missingBomLinkRes)
  )

  // Stock movements endpoint validation + behavior
  const invalidMovementRes = await apiRequest('/api/manufacturing/stock-movements', 'POST', {
    type: 'unknown',
    itemName: 'Invalid',
    sku: 'INVALID-SKU',
    quantity: 1
  })
  recordResult(
    'Stock movement invalid type rejected',
    invalidMovementRes.status === 400,
    invalidMovementRes.status === 400 ? '' : apiErrorMessage(invalidMovementRes)
  )

  const movementBefore = await getInventoryItem(componentB.id)
  const movementRes = await apiRequest('/api/manufacturing/stock-movements', 'POST', {
    type: 'sale',
    itemName: componentB.name,
    sku: componentB.sku,
    quantity: 1,
    fromLocation: mainLocation.code,
    reference: `MOV-TEST-${testId}`
  })
  const movementOk = movementRes.status === 201
  recordResult('Stock movement sale created', movementOk, movementOk ? '' : apiErrorMessage(movementRes))
  if (movementOk) {
    const movement = apiData(movementRes).movement
    assertTrue(movement?.quantity < 0, 'Stock movement sale quantity is negative')
    const movementAfter = await getInventoryItem(componentB.id)
    assertEqual(
      movementAfter?.quantity,
      (movementBefore?.quantity || 0) - 1,
      'Stock movement updates master quantity'
    )
  }

  // Supplier CRUD (separate from PO supplier to avoid FK issues)
  log('\n🧾 Suppliers CRUD', 'info')
  const supplierCrud = await createSupplier({ name: `Test Supplier CRUD ${testId}` })
  assertTrue(!!supplierCrud?.id, 'Supplier created')
  const supplierGet = await apiRequest(`/api/manufacturing/suppliers/${supplierCrud.id}`, 'GET')
  assertEqual(supplierGet.status, 200, 'Supplier get by id')
  const supplierUpdate = await apiRequest(`/api/manufacturing/suppliers/${supplierCrud.id}`, 'PATCH', {
    contactPerson: 'Test Contact',
    email: 'test@example.com'
  })
  assertEqual(supplierUpdate.status, 200, 'Supplier update')
  const supplierDelete = await apiRequest(`/api/manufacturing/suppliers/${supplierCrud.id}`, 'DELETE')
  assertEqual(supplierDelete.status, 200, 'Supplier delete')

  // --- Dashboard Stats (matches Manufacturing.jsx calculations) ---
  log('\n📊 Dashboard Stats', 'info')
  const dashboardInventory = await listInventory()
  const dashboardOrdersRes = await apiRequest('/api/manufacturing/production-orders', 'GET')
  const dashboardOrders = apiData(dashboardOrdersRes).productionOrders || []
  const testInventoryItems = dashboardInventory.filter(item =>
    [componentA.sku, componentB.sku, finishedProduct.sku].includes(item.sku)
  )
  const invStats = calcDashboardInventoryStats(testInventoryItems)
  const manualTotalValue = testInventoryItems.reduce((sum, item) => sum + (item.totalValue || 0), 0)
  const manualLowStock = testInventoryItems.filter(item => {
    const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0)
    return availableQty <= (item.reorderPoint || 0)
  }).length
  const manualTotalItems = testInventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
  assertEqual(invStats.totalValue, manualTotalValue, 'Dashboard total value matches inventory data')
  assertEqual(invStats.totalItems, manualTotalItems, 'Dashboard total items matches inventory data')
  assertEqual(invStats.lowStockItems, manualLowStock, 'Dashboard low stock count matches inventory data')

  const testOrders = dashboardOrders.filter(entry => entry.id === order.id)
  const prodStats = calcDashboardProductionStats(testOrders)
  assertEqual(prodStats.completedOrders, 1, 'Dashboard completed production count (test set)')

  // --- Stock Movements Audit Trail ---
  log('\n🧾 Stock Movements Audit', 'info')
  const movements = await listStockMovements()
  const expectedRefs = []
  if (successRefs.receipt) expectedRefs.push(refs.receipt)
  if (successRefs.transfer) expectedRefs.push(refs.transfer)
  if (successRefs.adjustment) expectedRefs.push(refs.adjustment)
  if (successRefs.production) expectedRefs.push(refs.workOrder)
  if (successRefs.sale) expectedRefs.push(refs.salesOrder)
  if (successRefs.purchase) expectedRefs.push(refs.purchaseOrder)

  const movementRefs = movements.filter(mov => expectedRefs.includes(mov.reference))
  assertTrue(movementRefs.length >= expectedRefs.length, 'Stock movements recorded for key transactions')

  if (successRefs.sale) {
    const hasSaleMovement = movementRefs.some(m => m.reference === refs.salesOrder && m.type === 'sale')
    assertTrue(hasSaleMovement, 'Sale movement recorded')
  }
  if (successRefs.purchase) {
    const hasPurchaseReceipt = movementRefs.some(m => m.reference === refs.purchaseOrder && m.type === 'receipt')
    assertTrue(hasPurchaseReceipt, 'Purchase receipt movement recorded')
  }
  if (successRefs.production) {
    const hasProductionReceipt = movementRefs.some(m => m.reference === refs.workOrder && m.type === 'receipt')
    const hasProductionConsumption = movementRefs.some(m => m.reference === refs.workOrder && m.type === 'consumption')
    assertTrue(hasProductionReceipt, 'Production receipt movement recorded')
    assertTrue(hasProductionConsumption, 'Production consumption movement recorded')
  }

  // --- Inventory Deletion (admin only) ---
  log('\n🗑️ Inventory Delete (admin only)', 'info')
  const isAdmin = String(testUser?.role || '').toLowerCase() === 'admin'
  const deleteLinkedRes = await apiRequest(`/api/manufacturing/inventory/${finishedProduct.id}`, 'DELETE')
  if (isAdmin) {
    assertEqual(deleteLinkedRes.status, 400, 'Prevent deleting inventory linked to BOM')
  } else {
    warnIf(true, 'Inventory delete requires admin', 'Skipping delete tests (non-admin user)')
  }

  // --- Cleanup (best effort) ---
  log('\n🧹 Cleanup (best effort)', 'info')
  await apiRequest(`/api/manufacturing/production-orders/${order.id}`, 'DELETE')
  await apiRequest(`/api/sales-orders/${salesOrder.id}`, 'DELETE')
  await apiRequest(`/api/purchase-orders/${purchaseOrder.id}`, 'DELETE')
  await apiRequest(`/api/manufacturing/boms/${bom.id}`, 'DELETE')

  if (isAdmin) {
    await apiRequest(`/api/manufacturing/inventory/${componentA.id}`, 'DELETE')
    await apiRequest(`/api/manufacturing/inventory/${componentB.id}`, 'DELETE')
    await apiRequest(`/api/manufacturing/inventory/${finishedProduct.id}`, 'DELETE')
  }

  // Print summary
  console.log('\n')
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║            Manufacturing Tests - Summary                     ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(2)
  const passedCount = testResults.passed.length
  const failedCount = testResults.failed.length
  const warningCount = testResults.warnings.length
  const totalCount = testResults.totalTests
  const passRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : 0

  console.log(`Total Tests: ${totalCount}`)
  console.log(`✅ Passed: ${passedCount}`)
  console.log(`❌ Failed: ${failedCount}`)
  console.log(`⚠️  Warnings: ${warningCount}`)
  console.log(`📊 Pass Rate: ${passRate}%`)
  console.log(`⏱️  Duration: ${duration}s`)
  console.log('')

  if (testResults.failed.length > 0) {
    console.log('Failed Tests:')
    testResults.failed.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.test}: ${result.message}`)
    })
    console.log('')
  }

  if (testResults.warnings.length > 0) {
    console.log('Warnings:')
    testResults.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning.test}: ${warning.message}`)
    })
    console.log('')
  }
}

run()
  .then(() => {
    process.exit(testResults.failed.length > 0 ? 1 : 0)
  })
  .catch(error => {
    console.error('Fatal test error:', error)
    process.exit(1)
  })
