/**
 * Comprehensive Purchase Order Testing Script
 * Tests all purchase order functionality including stock updates
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Test configuration
const TEST_CONFIG = {
  supplierName: 'Test Supplier Inc',
  supplierId: null, // Will be created or found
  testSku1: 'TEST-PO-001',
  testSku2: 'TEST-PO-002',
  locationCode: 'LOC001'
}

let testResults = {
  passed: 0,
  failed: 0,
  errors: []
}

function logTest(name, passed, error = null) {
  const status = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${status}: ${name}`)
  if (passed) {
    testResults.passed++
  } else {
    testResults.failed++
    if (error) {
      testResults.errors.push({ test: name, error: error.message || error })
      console.error(`   Error: ${error.message || error}`)
    }
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...')
  try {
    // Delete test purchase orders
    await prisma.purchaseOrder.deleteMany({
      where: {
        OR: [
          { supplierName: { contains: 'Test' } },
          { orderNumber: { startsWith: 'PO-TEST' } }
        ]
      }
    })
    
    // Delete test inventory items
    await prisma.inventoryItem.deleteMany({
      where: {
        sku: { startsWith: 'TEST-PO-' }
      }
    })
    
    // Delete test stock movements
    await prisma.stockMovement.deleteMany({
      where: {
        OR: [
          { sku: { startsWith: 'TEST-PO-' } },
          { reference: { startsWith: 'PO-TEST' } }
        ]
      }
    })
    
    console.log('✅ Cleanup complete')
  } catch (error) {
    console.error('⚠️ Cleanup error:', error.message)
  }
}

async function setup() {
  console.log('\n🔧 Setting up test environment...')
  
  try {
    // Ensure main warehouse exists
    let mainWarehouse = await prisma.stockLocation.findFirst({
      where: { code: TEST_CONFIG.locationCode }
    })
    
    if (!mainWarehouse) {
      mainWarehouse = await prisma.stockLocation.create({
        data: {
          code: TEST_CONFIG.locationCode,
          name: 'Main Warehouse',
          type: 'warehouse',
          status: 'active'
        }
      })
      console.log(`✅ Created ${TEST_CONFIG.locationCode}`)
    }
    
    // Find or create test supplier
    let supplier = await prisma.supplier.findFirst({
      where: { name: TEST_CONFIG.supplierName }
    })
    
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: TEST_CONFIG.supplierName,
          code: 'TEST-SUP',
          status: 'active'
        }
      })
      console.log(`✅ Created test supplier: ${TEST_CONFIG.supplierName}`)
    }
    
    TEST_CONFIG.supplierId = supplier.id
    
    // Clean up any existing test inventory items
    await prisma.inventoryItem.deleteMany({
      where: {
        sku: { in: [TEST_CONFIG.testSku1, TEST_CONFIG.testSku2] }
      }
    })
    
    console.log('✅ Setup complete\n')
  } catch (error) {
    console.error('❌ Setup failed:', error)
    throw error
  }
}

async function test1_CreatePurchaseOrder() {
  console.log('\n📝 Test 1: Create Purchase Order')
  
  try {
    const purchaseOrderData = {
      supplierId: TEST_CONFIG.supplierId,
      supplierName: TEST_CONFIG.supplierName,
      status: 'draft',
      priority: 'normal',
      orderDate: new Date(),
      subtotal: 1000,
      tax: 150,
      total: 1150,
      items: [
        {
          sku: TEST_CONFIG.testSku1,
          name: 'Test Component 1',
          quantity: 10,
          unitPrice: 50,
          total: 500
        },
        {
          sku: TEST_CONFIG.testSku2,
          name: 'Test Component 2',
          quantity: 10,
          unitPrice: 50,
          total: 500
        }
      ],
      notes: 'Test purchase order'
    }
    
    const order = await prisma.purchaseOrder.create({
      data: {
        orderNumber: `PO-TEST-${Date.now()}`,
        supplierId: purchaseOrderData.supplierId,
        supplierName: purchaseOrderData.supplierName,
        status: purchaseOrderData.status,
        priority: purchaseOrderData.priority,
        orderDate: purchaseOrderData.orderDate,
        subtotal: purchaseOrderData.subtotal,
        tax: purchaseOrderData.tax,
        total: purchaseOrderData.total,
        items: JSON.stringify(purchaseOrderData.items)
      }
    })
    
    const hasOrderNumber = !!order.orderNumber
    const hasItems = order.items && JSON.parse(order.items).length === 2
    const correctTotal = order.total === 1150
    
    logTest('Create Purchase Order', hasOrderNumber && hasItems && correctTotal)
    
    return order
  } catch (error) {
    logTest('Create Purchase Order', false, error)
    return null
  }
}

async function test2_GetPurchaseOrders() {
  console.log('\n📋 Test 2: Get Purchase Orders')
  
  try {
    const orders = await prisma.purchaseOrder.findMany({
      where: {
        supplierName: TEST_CONFIG.supplierName
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
    
    const hasResults = Array.isArray(orders)
    const canParseItems = orders.length === 0 || (orders[0].items && typeof JSON.parse(orders[0].items) === 'object')
    
    logTest('Get Purchase Orders', hasResults && canParseItems)
    
    return orders
  } catch (error) {
    logTest('Get Purchase Orders', false, error)
    return []
  }
}

async function test3_UpdatePurchaseOrderStatus(testOrder) {
  console.log('\n🔄 Test 3: Update Purchase Order Status to Received')
  
  if (!testOrder) {
    logTest('Update Purchase Order Status', false, new Error('No test order available'))
    return null
  }
  
  try {
    // Get initial inventory counts
    const initialInventory1 = await prisma.inventoryItem.findFirst({
      where: { sku: TEST_CONFIG.testSku1 }
    })
    const initialInventory2 = await prisma.inventoryItem.findFirst({
      where: { sku: TEST_CONFIG.testSku2 }
    })
    
    const initialQty1 = initialInventory1?.quantity || 0
    const initialQty2 = initialInventory2?.quantity || 0
    
    // Update order status to 'received'
    const items = JSON.parse(testOrder.items)
    const mainWarehouse = await prisma.stockLocation.findFirst({
      where: { code: TEST_CONFIG.locationCode }
    })
    
    // Get last movement ID BEFORE transaction
    const lastMovement = await prisma.stockMovement.findFirst({
      orderBy: { createdAt: 'desc' }
    })
    let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
      ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
      : 1
    
    await prisma.$transaction(async (tx) => {
      const now = new Date()
      
      // Helper function
      async function upsertLocationInventory(locationId, sku, itemName, quantityDelta, unitCost, reorderPoint) {
        if (!locationId) return null
        
        let li = await tx.locationInventory.findUnique({ 
          where: { locationId_sku: { locationId, sku } } 
        })
        
        if (!li) {
          li = await tx.locationInventory.create({ 
            data: {
              locationId,
              sku,
              itemName,
              quantity: 0,
              unitCost: unitCost || 0,
              reorderPoint: reorderPoint || 0,
              status: 'out_of_stock'
            }
          })
        }
        
        const newQty = (li.quantity || 0) + quantityDelta
        const status = newQty > (li.reorderPoint || reorderPoint || 0) ? 'in_stock' : (newQty > 0 ? 'low_stock' : 'out_of_stock')
        
        return await tx.locationInventory.update({
          where: { id: li.id },
          data: {
            quantity: newQty,
            unitCost: unitCost !== undefined ? unitCost : li.unitCost,
            reorderPoint: reorderPoint !== undefined ? reorderPoint : li.reorderPoint,
            status,
            itemName: itemName || li.itemName,
            lastRestocked: quantityDelta > 0 ? now : li.lastRestocked
          }
        })
      }
      
      // Process each item
      for (const item of items) {
        if (!item.sku || !item.quantity || item.quantity <= 0) continue
        
        const unitCost = parseFloat(item.unitPrice) || 0
        const quantity = parseFloat(item.quantity)
        
        // Create stock movement
        await tx.stockMovement.create({
          data: {
            movementId: `MOV${String(seq++).padStart(4, '0')}`,
            date: now,
            type: 'receipt',
            itemName: item.name || item.sku,
            sku: item.sku,
            quantity: quantity,
            fromLocation: '',
            toLocation: mainWarehouse?.code || '',
            reference: testOrder.orderNumber,
            performedBy: 'Test System',
            notes: `Stock received from purchase order ${testOrder.orderNumber}`
          }
        })
        
        // Update or create inventory item
        let inventoryItem = await tx.inventoryItem.findFirst({
          where: { sku: item.sku }
        })
        
        if (!inventoryItem) {
          const totalValue = quantity * unitCost
          inventoryItem = await tx.inventoryItem.create({
            data: {
              sku: item.sku,
              name: item.name || item.sku,
              category: 'components',
              type: 'raw_material',
              quantity: quantity,
              unit: 'pcs',
              reorderPoint: 0,
              reorderQty: 0,
              unitCost: unitCost,
              totalValue: totalValue,
              status: quantity > 0 ? 'in_stock' : 'out_of_stock',
              lastRestocked: now,
              locationId: mainWarehouse?.id || null
            }
          })
        } else {
          const newQuantity = (inventoryItem.quantity || 0) + quantity
          const newUnitCost = unitCost > 0 ? unitCost : (inventoryItem.unitCost || 0)
          const totalValue = newQuantity * newUnitCost
          const reorderPoint = inventoryItem.reorderPoint || 0
          const status = newQuantity > reorderPoint ? 'in_stock' : (newQuantity > 0 ? 'low_stock' : 'out_of_stock')
          
          await tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: {
              quantity: newQuantity,
              unitCost: newUnitCost,
              totalValue: totalValue,
              status: status,
              lastRestocked: now
            }
          })
        }
        
        // Update LocationInventory
        if (mainWarehouse) {
          await upsertLocationInventory(
            mainWarehouse.id,
            item.sku,
            item.name || item.sku,
            quantity,
            unitCost,
            inventoryItem?.reorderPoint || 0
          )
          
          // Recalculate master aggregate
          const totalAtLocations = await tx.locationInventory.aggregate({ 
            _sum: { quantity: true }, 
            where: { sku: item.sku } 
          })
          const aggQty = totalAtLocations._sum.quantity || 0
          
          await tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: {
              quantity: aggQty,
              totalValue: aggQty * (inventoryItem.unitCost || 0),
              status: aggQty > (inventoryItem.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
            }
          })
        }
      }
      
      // Update purchase order
      await tx.purchaseOrder.update({
        where: { id: testOrder.id },
        data: {
          status: 'received',
          receivedDate: now
        }
      })
    }, {
      timeout: 30000 // 30 second timeout
    })
    
    // Verify inventory was updated
    const updatedInventory1 = await prisma.inventoryItem.findFirst({
      where: { sku: TEST_CONFIG.testSku1 }
    })
    const updatedInventory2 = await prisma.inventoryItem.findFirst({
      where: { sku: TEST_CONFIG.testSku2 }
    })
    
    const qty1Increased = (updatedInventory1?.quantity || 0) === (initialQty1 + 10)
    const qty2Increased = (updatedInventory2?.quantity || 0) === (initialQty2 + 10)
    
    // Verify stock movements were created
    const movements = await prisma.stockMovement.findMany({
      where: {
        reference: testOrder.orderNumber,
        type: 'receipt'
      }
    })
    
    const movementsCreated = movements.length === 2
    
    // Verify order status was updated
    const updatedOrder = await prisma.purchaseOrder.findUnique({
      where: { id: testOrder.id }
    })
    const statusUpdated = updatedOrder?.status === 'received'
    
    const allPassed = qty1Increased && qty2Increased && movementsCreated && statusUpdated
    
    logTest('Update Purchase Order Status to Received', allPassed, 
      allPassed ? null : new Error(`Qty1: ${qty1Increased}, Qty2: ${qty2Increased}, Movements: ${movementsCreated}, Status: ${statusUpdated}`))
    
    return updatedOrder
  } catch (error) {
    logTest('Update Purchase Order Status to Received', false, error)
    return null
  }
}

async function test4_VerifyStockMovements(testOrder) {
  console.log('\n📦 Test 4: Verify Stock Movements Created')
  
  if (!testOrder) {
    logTest('Verify Stock Movements', false, new Error('No test order available'))
    return
  }
  
  try {
    const movements = await prisma.stockMovement.findMany({
      where: {
        reference: testOrder.orderNumber
      },
      orderBy: { createdAt: 'desc' }
    })
    
    const hasMovements = movements.length >= 2
    const allReceipts = movements.every(m => m.type === 'receipt')
    const correctQuantities = movements.every(m => m.quantity > 0)
    const hasCorrectReference = movements.every(m => m.reference === testOrder.orderNumber)
    
    const allPassed = hasMovements && allReceipts && correctQuantities && hasCorrectReference
    
    logTest('Verify Stock Movements Created', allPassed)
    
    if (movements.length > 0) {
      console.log(`   Found ${movements.length} stock movement(s)`)
      movements.forEach(m => {
        console.log(`   - ${m.movementId}: ${m.sku} x${m.quantity} (${m.type})`)
      })
    }
  } catch (error) {
    logTest('Verify Stock Movements Created', false, error)
  }
}

async function test5_VerifyInventoryUpdate() {
  console.log('\n📊 Test 5: Verify Inventory Items Updated')
  
  try {
    const inventory1 = await prisma.inventoryItem.findFirst({
      where: { sku: TEST_CONFIG.testSku1 }
    })
    const inventory2 = await prisma.inventoryItem.findFirst({
      where: { sku: TEST_CONFIG.testSku2 }
    })
    
    const item1Exists = !!inventory1
    const item2Exists = !!inventory2
    const item1HasStock = inventory1 && inventory1.quantity >= 10
    const item2HasStock = inventory2 && inventory2.quantity >= 10
    const item1HasCost = inventory1 && inventory1.unitCost > 0
    const item2HasCost = inventory2 && inventory2.unitCost > 0
    
    const allPassed = item1Exists && item2Exists && item1HasStock && item2HasStock && item1HasCost && item2HasCost
    
    logTest('Verify Inventory Items Updated', allPassed)
    
    if (inventory1) {
      console.log(`   ${inventory1.sku}: ${inventory1.quantity} units @ R${inventory1.unitCost}/unit`)
    }
    if (inventory2) {
      console.log(`   ${inventory2.sku}: ${inventory2.quantity} units @ R${inventory2.unitCost}/unit`)
    }
  } catch (error) {
    logTest('Verify Inventory Items Updated', false, error)
  }
}

async function test6_VerifyLocationInventory() {
  console.log('\n📍 Test 6: Verify Location Inventory Updated')
  
  try {
    const mainWarehouse = await prisma.stockLocation.findFirst({
      where: { code: TEST_CONFIG.locationCode }
    })
    
    if (!mainWarehouse) {
      logTest('Verify Location Inventory Updated', false, new Error('Main warehouse not found'))
      return
    }
    
    const locationInv1 = await prisma.locationInventory.findUnique({
      where: {
        locationId_sku: {
          locationId: mainWarehouse.id,
          sku: TEST_CONFIG.testSku1
        }
      }
    })
    
    const locationInv2 = await prisma.locationInventory.findUnique({
      where: {
        locationId_sku: {
          locationId: mainWarehouse.id,
          sku: TEST_CONFIG.testSku2
        }
      }
    })
    
    const loc1Exists = !!locationInv1
    const loc2Exists = !!locationInv2
    const loc1HasStock = locationInv1 && locationInv1.quantity >= 10
    const loc2HasStock = locationInv2 && locationInv2.quantity >= 10
    
    const allPassed = loc1Exists && loc2Exists && loc1HasStock && loc2HasStock
    
    logTest('Verify Location Inventory Updated', allPassed)
    
    if (locationInv1) {
      console.log(`   ${locationInv1.sku} @ ${mainWarehouse.name}: ${locationInv1.quantity} units`)
    }
    if (locationInv2) {
      console.log(`   ${locationInv2.sku} @ ${mainWarehouse.name}: ${locationInv2.quantity} units`)
    }
  } catch (error) {
    logTest('Verify Location Inventory Updated', false, error)
  }
}

async function runAllTests() {
  console.log('🧪 PURCHASE ORDER COMPREHENSIVE TEST SUITE')
  console.log('=' .repeat(50))
  
  try {
    await setup()
    
    // Test 1: Create Purchase Order
    const testOrder = await test1_CreatePurchaseOrder()
    
    // Test 2: Get Purchase Orders
    await test2_GetPurchaseOrders()
    
    // Test 3: Update Purchase Order Status to Received
    const updatedOrder = await test3_UpdatePurchaseOrderStatus(testOrder)
    
    // Test 4: Verify Stock Movements
    await test4_VerifyStockMovements(testOrder || updatedOrder)
    
    // Test 5: Verify Inventory Update
    await test5_VerifyInventoryUpdate()
    
    // Test 6: Verify Location Inventory
    await test6_VerifyLocationInventory()
    
    // Print summary
    console.log('\n' + '='.repeat(50))
    console.log('📊 TEST SUMMARY')
    console.log('='.repeat(50))
    console.log(`✅ Passed: ${testResults.passed}`)
    console.log(`❌ Failed: ${testResults.failed}`)
    console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`)
    
    if (testResults.errors.length > 0) {
      console.log('\n❌ ERRORS:')
      testResults.errors.forEach((err, idx) => {
        console.log(`   ${idx + 1}. ${err.test}: ${err.error}`)
      })
    }
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error)
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }
}

// Run tests
runAllTests().catch(console.error)

