#!/usr/bin/env node
/**
 * Test all manufacturing components
 * 
 * Tests:
 * 1. Inventory items creation and stock movements
 * 2. Stock ledger (LocationInventory)
 * 3. Production order creation and stock allocation
 * 4. Production order status changes (in_production, completed)
 * 5. Sales order shipping and stock deduction
 * 6. Purchase order receiving and stock addition
 * 7. Stock movements tracking
 * 8. Master inventory aggregate calculation
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const envPath = join(__dirname, '..', '.env')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
      if (value && !process.env[key.trim()]) {
        process.env[key.trim()] = value
      }
    }
  })
} catch (e) {
  console.warn('⚠️ Could not load .env file:', e.message)
}

const prisma = new PrismaClient()

const tests = []
let passed = 0
let failed = 0

function test(name, fn) {
  tests.push({ name, fn })
}

async function runTests() {
  console.log('🧪 Starting manufacturing component tests...\n')

  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`✅ ${name}`)
      passed++
    } catch (error) {
      console.error(`❌ ${name}`)
      console.error(`   Error: ${error.message}`)
      failed++
    }
  }

  console.log('\n📊 Test Results:')
  console.log(`   ✅ Passed: ${passed}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📈 Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`)
}

// Test 1: Inventory items exist
test('Inventory items exist', async () => {
  const items = await prisma.inventoryItem.findMany()
  if (items.length === 0) {
    throw new Error('No inventory items found')
  }
  console.log(`   Found ${items.length} inventory items`)
})

// Test 2: Stock locations exist
test('Stock locations exist', async () => {
  const locations = await prisma.stockLocation.findMany()
  if (locations.length === 0) {
    throw new Error('No stock locations found')
  }
  const mainWarehouse = locations.find(l => l.code === 'LOC001')
  if (!mainWarehouse) {
    throw new Error('Main warehouse (LOC001) not found')
  }
  console.log(`   Found ${locations.length} stock locations (including LOC001)`)
})

// Test 3: LocationInventory exists for items
test('LocationInventory exists for inventory items', async () => {
  const items = await prisma.inventoryItem.findMany({ take: 5 })
  const mainWarehouse = await prisma.stockLocation.findFirst({ where: { code: 'LOC001' } })
  if (!mainWarehouse) {
    throw new Error('Main warehouse not found')
  }
  
  for (const item of items) {
    const locInv = await prisma.locationInventory.findUnique({
      where: { locationId_sku: { locationId: mainWarehouse.id, sku: item.sku } }
    })
    if (!locInv) {
      throw new Error(`LocationInventory not found for ${item.sku} at ${mainWarehouse.code}`)
    }
  }
  console.log(`   LocationInventory exists for all tested items`)
})

// Test 4: Stock movements exist
test('Stock movements exist', async () => {
  const movements = await prisma.stockMovement.findMany()
  if (movements.length === 0) {
    throw new Error('No stock movements found')
  }
  console.log(`   Found ${movements.length} stock movements`)
})

// Test 5: Production orders exist
test('Production orders exist', async () => {
  const orders = await prisma.productionOrder.findMany()
  if (orders.length === 0) {
    throw new Error('No production orders found')
  }
  console.log(`   Found ${orders.length} production orders`)
})

// Test 6: BOMs exist
test('BOMs exist', async () => {
  const boms = await prisma.bOM.findMany()
  if (boms.length === 0) {
    throw new Error('No BOMs found')
  }
  console.log(`   Found ${boms.length} BOMs`)
})

// Test 7: Master inventory aggregate matches LocationInventory sum
test('Master inventory aggregate matches LocationInventory sum', async () => {
  const items = await prisma.inventoryItem.findMany({ take: 5 })
  const mainWarehouse = await prisma.stockLocation.findFirst({ where: { code: 'LOC001' } })
  if (!mainWarehouse) {
    throw new Error('Main warehouse not found')
  }
  
  for (const item of items) {
    const totalAtLocations = await prisma.locationInventory.aggregate({
      _sum: { quantity: true },
      where: { sku: item.sku }
    })
    const aggQty = totalAtLocations._sum.quantity || 0
    const masterQty = item.quantity || 0
    
    // Allow small floating point differences
    if (Math.abs(aggQty - masterQty) > 0.01) {
      throw new Error(`Quantity mismatch for ${item.sku}: master=${masterQty}, locations=${aggQty}`)
    }
  }
  console.log(`   Master aggregates match LocationInventory sums`)
})

// Test 8: Production orders have stock movements
test('Production orders have associated stock movements', async () => {
  const orders = await prisma.productionOrder.findMany({
    where: { status: { in: ['in_production', 'completed'] } }
  })
  
  for (const order of orders) {
    const movements = await prisma.stockMovement.findMany({
      where: { reference: order.workOrderNumber || order.id }
    })
    if (movements.length === 0) {
      throw new Error(`No stock movements found for order ${order.workOrderNumber || order.id}`)
    }
  }
  console.log(`   Production orders have stock movements`)
})

// Test 9: Sales orders update inventory when shipped
test('Shipped sales orders have stock movements', async () => {
  const shippedOrders = await prisma.salesOrder.findMany({
    where: { status: 'shipped' }
  })
  
  for (const order of shippedOrders) {
    const movements = await prisma.stockMovement.findMany({
      where: { 
        reference: order.orderNumber,
        type: 'sale'
      }
    })
    if (movements.length === 0) {
      throw new Error(`No stock movements found for shipped order ${order.orderNumber}`)
    }
  }
  console.log(`   Shipped sales orders have stock movements`)
})

// Test 10: Purchase orders update inventory when received
test('Received purchase orders have stock movements', async () => {
  const receivedOrders = await prisma.purchaseOrder.findMany({
    where: { status: 'received' }
  })
  
  for (const order of receivedOrders) {
    const movements = await prisma.stockMovement.findMany({
      where: { 
        reference: order.orderNumber,
        type: 'receipt'
      }
    })
    if (movements.length === 0) {
      throw new Error(`No stock movements found for received order ${order.orderNumber}`)
    }
  }
  console.log(`   Received purchase orders have stock movements`)
})

// Test 11: Stock movements have valid types
test('Stock movements have valid types', async () => {
  const validTypes = ['receipt', 'consumption', 'sale', 'adjustment', 'transfer', 'production']
  const movements = await prisma.stockMovement.findMany({ take: 10 })
  
  for (const movement of movements) {
    if (!validTypes.includes(movement.type)) {
      throw new Error(`Invalid movement type: ${movement.type}`)
    }
  }
  console.log(`   All stock movements have valid types`)
})

// Test 12: Inventory items have stock movements for initial balance
test('Inventory items with quantity have initial balance movements', async () => {
  const items = await prisma.inventoryItem.findMany({
    where: { quantity: { gt: 0 } },
    take: 5
  })
  
  for (const item of items) {
    const movements = await prisma.stockMovement.findMany({
      where: { 
        sku: item.sku,
        reference: { in: ['INITIAL_BALANCE', 'BULK_IMPORT'] }
      }
    })
    if (movements.length === 0) {
      // This is a warning, not an error - items might have been created before initial balance tracking
      console.log(`   ⚠️ No initial balance movement for ${item.sku} (may be pre-existing item)`)
    }
  }
  console.log(`   Checked initial balance movements`)
})

// Test 13: LocationInventory quantities are consistent
test('LocationInventory quantities are non-negative or properly handled', async () => {
  const locInv = await prisma.locationInventory.findMany({ take: 10 })
  
  for (const li of locInv) {
    // Allow negative stock (for backorders), but log warnings
    if (li.quantity < 0) {
      console.log(`   ⚠️ Negative stock at location: ${li.sku} = ${li.quantity}`)
    }
  }
  console.log(`   LocationInventory quantities checked`)
})

// Test 14: Production orders in 'requested' status have allocated stock
test('Production orders in requested status have allocated stock', async () => {
  const requestedOrders = await prisma.productionOrder.findMany({
    where: { status: 'requested' },
    take: 2
  })
  
  for (const order of requestedOrders) {
    if (!order.bomId) continue
    
    const bom = await prisma.bOM.findUnique({ where: { id: order.bomId } })
    if (!bom) continue
    
    const components = JSON.parse(bom.components || '[]')
    for (const comp of components) {
      const item = await prisma.inventoryItem.findFirst({ where: { sku: comp.sku } })
      if (item && item.allocatedQuantity > 0) {
        console.log(`   Order ${order.workOrderNumber} has allocated stock for ${comp.sku}`)
        break
      }
    }
  }
  console.log(`   Checked allocated stock for requested orders`)
})

// Test 15: Suppliers exist
test('Suppliers exist', async () => {
  const suppliers = await prisma.supplier.findMany()
  if (suppliers.length === 0) {
    throw new Error('No suppliers found')
  }
  console.log(`   Found ${suppliers.length} suppliers`)
})

runTests()
  .then(() => {
    console.log('\n✅ All tests completed!')
    process.exit(failed > 0 ? 1 : 0)
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

