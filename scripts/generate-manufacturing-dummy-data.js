#!/usr/bin/env node
/**
 * Generate comprehensive dummy data for manufacturing section
 * 
 * This script creates:
 * - Stock Locations (Main Warehouse + 2 additional locations)
 * - Suppliers (3 suppliers)
 * - Inventory Items (10 items: 7 components, 3 finished products)
 * - BOMs (3 BOMs for finished products)
 * - Production Orders (5 orders in various states)
 * - Stock Movements (initial balances + some transactions)
 * - Sales Orders (2 orders)
 * - Purchase Orders (2 orders)
 * 
 * Best practices applied:
 * - All inventory changes tracked in stock movements
 * - Location-specific inventory (LocationInventory)
 * - Master inventory aggregate from locations
 * - Proper stock allocation and deduction
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

// Helper function to get status from quantity
function getStatusFromQuantity(quantity, reorderPoint) {
  if (quantity <= 0) return 'out_of_stock'
  if (quantity <= reorderPoint) return 'low_stock'
  return 'in_stock'
}

// Helper to create stock movement
async function createStockMovement(tx, movementData) {
  const lastMovement = await tx.stockMovement.findFirst({
    orderBy: { createdAt: 'desc' }
  })
  const nextNumber = lastMovement && lastMovement.movementId?.startsWith('MOV')
    ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
    : 1
  
  return await tx.stockMovement.create({
    data: {
      movementId: `MOV${String(nextNumber).padStart(4, '0')}`,
      date: movementData.date || new Date(),
      type: movementData.type,
      itemName: movementData.itemName,
      sku: movementData.sku,
      quantity: movementData.quantity,
      fromLocation: movementData.fromLocation || '',
      toLocation: movementData.toLocation || '',
      reference: movementData.reference || '',
      performedBy: movementData.performedBy || 'System',
      notes: movementData.notes || '',
      ownerId: null
    }
  })
}

// Helper to upsert LocationInventory
async function upsertLocationInventory(tx, locationId, sku, itemName, quantity, unitCost, reorderPoint) {
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
  
  const newQty = (li.quantity || 0) + quantity
  const status = getStatusFromQuantity(newQty, reorderPoint || 0)
  
  return await tx.locationInventory.update({
    where: { id: li.id },
    data: {
      quantity: newQty,
      unitCost: unitCost !== undefined ? unitCost : li.unitCost,
      reorderPoint: reorderPoint !== undefined ? reorderPoint : li.reorderPoint,
      status,
      itemName: itemName || li.itemName,
      lastRestocked: quantity > 0 ? new Date() : li.lastRestocked
    }
  })
}

async function generateDummyData() {
  console.log('🎨 Starting dummy data generation...\n')

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Create Stock Locations
      console.log('📍 Creating stock locations...')
      const locations = []
      
      // Main Warehouse (LOC001)
      let mainWarehouse = await tx.stockLocation.findFirst({ where: { code: 'LOC001' } })
      if (!mainWarehouse) {
        mainWarehouse = await tx.stockLocation.create({
          data: {
            code: 'LOC001',
            name: 'Main Warehouse',
            type: 'warehouse',
            status: 'active',
            address: '123 Industrial Street, Johannesburg',
            contactPerson: 'John Smith',
            contactPhone: '+27 11 123 4567'
          }
        })
      }
      locations.push(mainWarehouse)
      console.log(`   ✅ Created/found: ${mainWarehouse.name} (${mainWarehouse.code})`)

      // Secondary Warehouse
      const secondaryWarehouse = await tx.stockLocation.create({
        data: {
          code: 'LOC002',
          name: 'Secondary Warehouse',
          type: 'warehouse',
          status: 'active',
          address: '456 Distribution Ave, Cape Town',
          contactPerson: 'Sarah Johnson',
          contactPhone: '+27 21 987 6543'
        }
      })
      locations.push(secondaryWarehouse)
      console.log(`   ✅ Created: ${secondaryWarehouse.name} (${secondaryWarehouse.code})`)

      // Store Location
      const storeLocation = await tx.stockLocation.create({
        data: {
          code: 'LOC003',
          name: 'Retail Store',
          type: 'store',
          status: 'active',
          address: '789 Main Street, Durban',
          contactPerson: 'Mike Williams',
          contactPhone: '+27 31 555 1234'
        }
      })
      locations.push(storeLocation)
      console.log(`   ✅ Created: ${storeLocation.name} (${storeLocation.code})`)

      // 2. Create Suppliers
      console.log('\n🏢 Creating suppliers...')
      const suppliers = []
      const supplierData = [
        { name: 'ABC Components Ltd', email: 'orders@abccomponents.co.za', phone: '+27 11 111 1111', address: '100 Supplier Street' },
        { name: 'XYZ Manufacturing', email: 'sales@xyzmanufacturing.co.za', phone: '+27 11 222 2222', address: '200 Factory Road' },
        { name: 'Global Parts Inc', email: 'info@globalparts.co.za', phone: '+27 11 333 3333', address: '300 Industrial Park' }
      ]

      for (const data of supplierData) {
        const supplier = await tx.supplier.create({
          data: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            address: data.address,
            status: 'active',
            ownerId: null
          }
        })
        suppliers.push(supplier)
        console.log(`   ✅ Created: ${supplier.name}`)
      }

      // 3. Create Inventory Items (Components)
      console.log('\n📦 Creating inventory items (components)...')
      const components = []
      const componentData = [
        { sku: 'COMP001', name: 'Steel Plate 10mm', unit: 'pcs', unitCost: 150.00, quantity: 100, reorderPoint: 20, category: 'raw_materials' },
        { sku: 'COMP002', name: 'Aluminum Rod 5mm', unit: 'm', unitCost: 25.50, quantity: 500, reorderPoint: 100, category: 'raw_materials' },
        { sku: 'COMP003', name: 'Screws M6x20', unit: 'pcs', unitCost: 0.50, quantity: 1000, reorderPoint: 200, category: 'fasteners' },
        { sku: 'COMP004', name: 'Circuit Board V2.1', unit: 'pcs', unitCost: 75.00, quantity: 50, reorderPoint: 10, category: 'electronics' },
        { sku: 'COMP005', name: 'LED Display 7inch', unit: 'pcs', unitCost: 120.00, quantity: 30, reorderPoint: 5, category: 'electronics' },
        { sku: 'COMP006', name: 'Power Supply 12V', unit: 'pcs', unitCost: 45.00, quantity: 80, reorderPoint: 15, category: 'electronics' },
        { sku: 'COMP007', name: 'Plastic Housing', unit: 'pcs', unitCost: 35.00, quantity: 60, reorderPoint: 10, category: 'enclosures' }
      ]

      for (const data of componentData) {
        const item = await tx.inventoryItem.create({
          data: {
            sku: data.sku,
            name: data.name,
            category: data.category,
            type: 'component',
            quantity: data.quantity,
            unit: data.unit,
            reorderPoint: data.reorderPoint,
            reorderQty: data.reorderPoint * 2,
            locationId: mainWarehouse.id,
            unitCost: data.unitCost,
            totalValue: data.quantity * data.unitCost,
            status: getStatusFromQuantity(data.quantity, data.reorderPoint),
            supplier: suppliers[0].name,
            ownerId: null
          }
        })
        components.push(item)
        
        // Create LocationInventory
        await upsertLocationInventory(tx, mainWarehouse.id, item.sku, item.name, data.quantity, data.unitCost, data.reorderPoint)
        
        // Create stock movement for initial balance
        await createStockMovement(tx, {
          type: 'adjustment',
          itemName: item.name,
          sku: item.sku,
          quantity: data.quantity,
          toLocation: mainWarehouse.code,
          reference: 'INITIAL_BALANCE',
          notes: `Initial stock balance for ${item.name}`
        })
        
        console.log(`   ✅ Created: ${item.name} (${item.sku}) - ${data.quantity} ${data.unit}`)
      }

      // 4. Create Inventory Items (Finished Products)
      console.log('\n🏭 Creating inventory items (finished products)...')
      const finishedProducts = []
      const productData = [
        { sku: 'PROD001', name: 'Control Panel Standard', unit: 'pcs', unitCost: 450.00, quantity: 0, reorderPoint: 5, category: 'finished_products' },
        { sku: 'PROD002', name: 'Control Panel Premium', unit: 'pcs', unitCost: 650.00, quantity: 0, reorderPoint: 3, category: 'finished_products' },
        { sku: 'PROD003', name: 'Monitoring System', unit: 'pcs', unitCost: 1200.00, quantity: 0, reorderPoint: 2, category: 'finished_products' }
      ]

      for (const data of productData) {
        const item = await tx.inventoryItem.create({
          data: {
            sku: data.sku,
            name: data.name,
            category: data.category,
            type: 'final_product',
            quantity: data.quantity,
            unit: data.unit,
            reorderPoint: data.reorderPoint,
            reorderQty: data.reorderPoint * 2,
            locationId: mainWarehouse.id,
            unitCost: data.unitCost,
            totalValue: 0,
            status: 'out_of_stock',
            supplier: '',
            ownerId: null
          }
        })
        finishedProducts.push(item)
        
        // Create LocationInventory (even with 0 quantity)
        await upsertLocationInventory(tx, mainWarehouse.id, item.sku, item.name, 0, data.unitCost, data.reorderPoint)
        
        console.log(`   ✅ Created: ${item.name} (${item.sku})`)
      }

      // 5. Create BOMs
      console.log('\n📋 Creating BOMs...')
      const boms = []
      
      // BOM for Control Panel Standard
      const bom1 = await tx.bOM.create({
        data: {
          productSku: finishedProducts[0].sku,
          productName: finishedProducts[0].name,
          version: '1.0',
          status: 'active',
          effectiveDate: new Date(),
          inventoryItemId: finishedProducts[0].id,
          components: JSON.stringify([
            { sku: components[0].sku, name: components[0].name, quantity: 2, unitCost: components[0].unitCost },
            { sku: components[2].sku, name: components[2].name, quantity: 8, unitCost: components[2].unitCost },
            { sku: components[3].sku, name: components[3].name, quantity: 1, unitCost: components[3].unitCost },
            { sku: components[5].sku, name: components[5].name, quantity: 1, unitCost: components[5].unitCost },
            { sku: components[6].sku, name: components[6].name, quantity: 1, unitCost: components[6].unitCost }
          ]),
          totalMaterialCost: (2 * components[0].unitCost) + (8 * components[2].unitCost) + components[3].unitCost + components[5].unitCost + components[6].unitCost,
          laborCost: 50.00,
          overheadCost: 30.00,
          totalCost: (2 * components[0].unitCost) + (8 * components[2].unitCost) + components[3].unitCost + components[5].unitCost + components[6].unitCost + 50.00 + 30.00,
          estimatedTime: 120,
          notes: 'Standard control panel assembly',
          ownerId: null
        }
      })
      boms.push(bom1)
      console.log(`   ✅ Created BOM for ${finishedProducts[0].name}`)

      // BOM for Control Panel Premium
      const bom2 = await tx.bOM.create({
        data: {
          productSku: finishedProducts[1].sku,
          productName: finishedProducts[1].name,
          version: '1.0',
          status: 'active',
          effectiveDate: new Date(),
          inventoryItemId: finishedProducts[1].id,
          components: JSON.stringify([
            { sku: components[0].sku, name: components[0].name, quantity: 2, unitCost: components[0].unitCost },
            { sku: components[2].sku, name: components[2].name, quantity: 12, unitCost: components[2].unitCost },
            { sku: components[3].sku, name: components[3].name, quantity: 1, unitCost: components[3].unitCost },
            { sku: components[4].sku, name: components[4].name, quantity: 1, unitCost: components[4].unitCost },
            { sku: components[5].sku, name: components[5].name, quantity: 1, unitCost: components[5].unitCost },
            { sku: components[6].sku, name: components[6].name, quantity: 1, unitCost: components[6].unitCost }
          ]),
          totalMaterialCost: (2 * components[0].unitCost) + (12 * components[2].unitCost) + components[3].unitCost + components[4].unitCost + components[5].unitCost + components[6].unitCost,
          laborCost: 75.00,
          overheadCost: 45.00,
          totalCost: (2 * components[0].unitCost) + (12 * components[2].unitCost) + components[3].unitCost + components[4].unitCost + components[5].unitCost + components[6].unitCost + 75.00 + 45.00,
          estimatedTime: 180,
          notes: 'Premium control panel with LED display',
          ownerId: null
        }
      })
      boms.push(bom2)
      console.log(`   ✅ Created BOM for ${finishedProducts[1].name}`)

      // BOM for Monitoring System
      const bom3 = await tx.bOM.create({
        data: {
          productSku: finishedProducts[2].sku,
          productName: finishedProducts[2].name,
          version: '1.0',
          status: 'active',
          effectiveDate: new Date(),
          inventoryItemId: finishedProducts[2].id,
          components: JSON.stringify([
            { sku: components[1].sku, name: components[1].name, quantity: 5, unitCost: components[1].unitCost },
            { sku: components[2].sku, name: components[2].name, quantity: 20, unitCost: components[2].unitCost },
            { sku: components[3].sku, name: components[3].name, quantity: 2, unitCost: components[3].unitCost },
            { sku: components[4].sku, name: components[4].name, quantity: 1, unitCost: components[4].unitCost },
            { sku: components[5].sku, name: components[5].name, quantity: 2, unitCost: components[5].unitCost },
            { sku: components[6].sku, name: components[6].name, quantity: 2, unitCost: components[6].unitCost }
          ]),
          totalMaterialCost: (5 * components[1].unitCost) + (20 * components[2].unitCost) + (2 * components[3].unitCost) + components[4].unitCost + (2 * components[5].unitCost) + (2 * components[6].unitCost),
          laborCost: 150.00,
          overheadCost: 100.00,
          totalCost: (5 * components[1].unitCost) + (20 * components[2].unitCost) + (2 * components[3].unitCost) + components[4].unitCost + (2 * components[5].unitCost) + (2 * components[6].unitCost) + 150.00 + 100.00,
          estimatedTime: 300,
          notes: 'Complete monitoring system assembly',
          ownerId: null
        }
      })
      boms.push(bom3)
      console.log(`   ✅ Created BOM for ${finishedProducts[2].name}`)

      // 6. Create Production Orders
      console.log('\n🏭 Creating production orders...')
      const orders = []
      
      // Order 1: Requested (stock allocated)
      const order1 = await tx.productionOrder.create({
        data: {
          bomId: bom1.id,
          productSku: finishedProducts[0].sku,
          productName: finishedProducts[0].name,
          quantity: 5,
          quantityProduced: 0,
          status: 'requested',
          priority: 'normal',
          startDate: new Date(),
          targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          workOrderNumber: 'WO0001',
          allocationType: 'stock',
          notes: 'Standard production order',
          createdBy: 'System',
          ownerId: null
        }
      })
      orders.push(order1)
      
      // Allocate stock for order1
      const bom1Components = JSON.parse(bom1.components)
      for (const comp of bom1Components) {
        const component = components.find(c => c.sku === comp.sku)
        if (component) {
          const requiredQty = comp.quantity * order1.quantity
          await tx.inventoryItem.update({
            where: { id: component.id },
            data: {
              allocatedQuantity: { increment: requiredQty }
            }
          })
        }
      }
      console.log(`   ✅ Created order WO0001 (requested) - ${order1.productName} x${order1.quantity}`)

      // Order 2: In Production (stock deducted)
      const order2 = await tx.productionOrder.create({
        data: {
          bomId: bom1.id,
          productSku: finishedProducts[0].sku,
          productName: finishedProducts[0].name,
          quantity: 3,
          quantityProduced: 0,
          status: 'in_production',
          priority: 'high',
          startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          targetDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
          workOrderNumber: 'WO0002',
          allocationType: 'stock',
          notes: 'High priority order',
          createdBy: 'System',
          ownerId: null
        }
      })
      orders.push(order2)
      
      // Deduct stock for order2 (simulate in_production)
      for (const comp of bom1Components) {
        const component = components.find(c => c.sku === comp.sku)
        if (component) {
          const requiredQty = comp.quantity * order2.quantity
          await tx.inventoryItem.update({
            where: { id: component.id },
            data: {
              quantity: { decrement: requiredQty },
              allocatedQuantity: { decrement: requiredQty }
            }
          })
          
          // Update LocationInventory
          await upsertLocationInventory(tx, mainWarehouse.id, component.sku, component.name, -requiredQty, component.unitCost, component.reorderPoint)
          
          // Create stock movement
          await createStockMovement(tx, {
            type: 'consumption',
            itemName: component.name,
            sku: component.sku,
            quantity: -requiredQty,
            fromLocation: mainWarehouse.code,
            reference: order2.workOrderNumber,
            notes: `Production consumption for ${order2.productName}`
          })
        }
      }
      console.log(`   ✅ Created order WO0002 (in_production) - ${order2.productName} x${order2.quantity}`)

      // Order 3: Completed
      const order3 = await tx.productionOrder.create({
        data: {
          bomId: bom2.id,
          productSku: finishedProducts[1].sku,
          productName: finishedProducts[1].name,
          quantity: 2,
          quantityProduced: 2,
          status: 'completed',
          priority: 'normal',
          startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          completedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
          workOrderNumber: 'WO0003',
          allocationType: 'stock',
          notes: 'Completed order',
          createdBy: 'System',
          ownerId: null
        }
      })
      orders.push(order3)
      
      // Deduct components and add finished product
      const bom2Components = JSON.parse(bom2.components)
      for (const comp of bom2Components) {
        const component = components.find(c => c.sku === comp.sku)
        if (component) {
          const requiredQty = comp.quantity * order3.quantity
          await tx.inventoryItem.update({
            where: { id: component.id },
            data: {
              quantity: { decrement: requiredQty }
            }
          })
          
          await upsertLocationInventory(tx, mainWarehouse.id, component.sku, component.name, -requiredQty, component.unitCost, component.reorderPoint)
          
          await createStockMovement(tx, {
            type: 'consumption',
            itemName: component.name,
            sku: component.sku,
            quantity: -requiredQty,
            fromLocation: mainWarehouse.code,
            reference: order3.workOrderNumber,
            notes: `Production consumption for ${order3.productName}`
          })
        }
      }
      
      // Add finished product
      const unitCost = bom2.totalMaterialCost / order3.quantity
      await tx.inventoryItem.update({
        where: { id: finishedProducts[1].id },
        data: {
          quantity: { increment: order3.quantityProduced },
          totalValue: { increment: order3.quantityProduced * unitCost }
        }
      })
      
      await upsertLocationInventory(tx, mainWarehouse.id, finishedProducts[1].sku, finishedProducts[1].name, order3.quantityProduced, unitCost, finishedProducts[1].reorderPoint)
      
      await createStockMovement(tx, {
        type: 'receipt',
        itemName: finishedProducts[1].name,
        sku: finishedProducts[1].sku,
        quantity: order3.quantityProduced,
        toLocation: mainWarehouse.code,
        reference: order3.workOrderNumber,
        notes: `Production completion for ${finishedProducts[1].name}`
      })
      console.log(`   ✅ Created order WO0003 (completed) - ${order3.productName} x${order3.quantityProduced}`)

      // Order 4: Requested
      const order4 = await tx.productionOrder.create({
        data: {
          bomId: bom3.id,
          productSku: finishedProducts[2].sku,
          productName: finishedProducts[2].name,
          quantity: 1,
          quantityProduced: 0,
          status: 'requested',
          priority: 'normal',
          startDate: new Date(),
          targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
          workOrderNumber: 'WO0004',
          allocationType: 'stock',
          notes: 'Monitoring system order',
          createdBy: 'System',
          ownerId: null
        }
      })
      orders.push(order4)
      
      // Allocate stock
      const bom3Components = JSON.parse(bom3.components)
      for (const comp of bom3Components) {
        const component = components.find(c => c.sku === comp.sku)
        if (component) {
          const requiredQty = comp.quantity * order4.quantity
          await tx.inventoryItem.update({
            where: { id: component.id },
            data: {
              allocatedQuantity: { increment: requiredQty }
            }
          })
        }
      }
      console.log(`   ✅ Created order WO0004 (requested) - ${order4.productName} x${order4.quantity}`)

      // Order 5: Cancelled
      const order5 = await tx.productionOrder.create({
        data: {
          bomId: bom1.id,
          productSku: finishedProducts[0].sku,
          productName: finishedProducts[0].name,
          quantity: 10,
          quantityProduced: 0,
          status: 'cancelled',
          priority: 'low',
          startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          workOrderNumber: 'WO0005',
          allocationType: 'stock',
          notes: 'Cancelled order',
          createdBy: 'System',
          ownerId: null
        }
      })
      orders.push(order5)
      console.log(`   ✅ Created order WO0005 (cancelled) - ${order5.productName} x${order5.quantity}`)

      // 7. Create Sales Orders
      console.log('\n🛒 Creating sales orders...')
      const salesOrder1 = await tx.salesOrder.create({
        data: {
          orderNumber: 'SO0001',
          clientName: 'Test Client A',
          status: 'pending',
          items: JSON.stringify([
            { sku: finishedProducts[0].sku, name: finishedProducts[0].name, quantity: 1, unitPrice: 550.00, locationId: mainWarehouse.id }
          ]),
          subtotal: 550.00,
          tax: 0,
          total: 550.00,
          orderDate: new Date(),
          ownerId: null
        }
      })
      console.log(`   ✅ Created sales order SO0001 (pending)`)

      const salesOrder2 = await tx.salesOrder.create({
        data: {
          orderNumber: 'SO0002',
          clientName: 'Test Client B',
          status: 'shipped',
          items: JSON.stringify([
            { sku: finishedProducts[1].sku, name: finishedProducts[1].name, quantity: 1, unitPrice: 750.00, locationId: mainWarehouse.id }
          ]),
          subtotal: 750.00,
          tax: 0,
          total: 750.00,
          orderDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          shippedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          ownerId: null
        }
      })
      
      // Deduct stock for shipped order
      const so2Items = JSON.parse(salesOrder2.items)
      for (const item of so2Items) {
        const inventoryItem = await tx.inventoryItem.findFirst({ where: { sku: item.sku } })
        if (inventoryItem) {
          await tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: {
              quantity: { decrement: item.quantity }
            }
          })
          
          await upsertLocationInventory(tx, mainWarehouse.id, item.sku, item.name, -item.quantity, inventoryItem.unitCost, inventoryItem.reorderPoint)
          
          await createStockMovement(tx, {
            type: 'sale',
            itemName: item.name,
            sku: item.sku,
            quantity: -item.quantity,
            fromLocation: mainWarehouse.code,
            reference: salesOrder2.orderNumber,
            notes: `Sales order ${salesOrder2.orderNumber} shipped`
          })
        }
      }
      console.log(`   ✅ Created sales order SO0002 (shipped)`)

      // 8. Create Purchase Orders
      console.log('\n📋 Creating purchase orders...')
      const po1 = await tx.purchaseOrder.create({
        data: {
          orderNumber: 'PO0001',
          supplierId: suppliers[0].id,
          supplierName: suppliers[0].name,
          status: 'pending',
          items: JSON.stringify([
            { sku: components[0].sku, name: components[0].name, quantity: 50, unitPrice: 145.00 }
          ]),
          subtotal: 7250.00,
          tax: 0,
          total: 7250.00,
          orderDate: new Date(),
          expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ownerId: null
        }
      })
      console.log(`   ✅ Created purchase order PO0001 (pending)`)

      const po2 = await tx.purchaseOrder.create({
        data: {
          orderNumber: 'PO0002',
          supplierId: suppliers[1].id,
          supplierName: suppliers[1].name,
          status: 'received',
          items: JSON.stringify([
            { sku: components[3].sku, name: components[3].name, quantity: 20, unitPrice: 72.00 }
          ]),
          subtotal: 1440.00,
          tax: 0,
          total: 1440.00,
          orderDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          receivedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          ownerId: null
        }
      })
      
      // Add stock for received order
      const po2Items = JSON.parse(po2.items)
      for (const item of po2Items) {
        const inventoryItem = await tx.inventoryItem.findFirst({ where: { sku: item.sku } })
        if (inventoryItem) {
          await tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: {
              quantity: { increment: item.quantity },
              totalValue: { increment: item.quantity * item.unitPrice }
            }
          })
          
          await upsertLocationInventory(tx, mainWarehouse.id, item.sku, item.name, item.quantity, item.unitPrice, inventoryItem.reorderPoint)
          
          await createStockMovement(tx, {
            type: 'receipt',
            itemName: item.name,
            sku: item.sku,
            quantity: item.quantity,
            toLocation: mainWarehouse.code,
            reference: po2.orderNumber,
            notes: `Purchase order ${po2.orderNumber} received`
          })
        }
      }
      console.log(`   ✅ Created purchase order PO0002 (received)`)

      // 9. Recalculate master aggregates from LocationInventory
      console.log('\n🔄 Recalculating master inventory aggregates...')
      const allItems = [...components, ...finishedProducts]
      for (const item of allItems) {
        const totalAtLocations = await tx.locationInventory.aggregate({
          _sum: { quantity: true },
          where: { sku: item.sku }
        })
        const aggQty = totalAtLocations._sum.quantity || 0
        
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            quantity: aggQty,
            totalValue: aggQty * (item.unitCost || 0),
            status: getStatusFromQuantity(aggQty, item.reorderPoint || 0)
          }
        })
      }
      console.log(`   ✅ Recalculated aggregates for ${allItems.length} items`)

      console.log('\n✅ Dummy data generation complete!')
      console.log('\n📊 Summary:')
      console.log(`   - Stock Locations: ${locations.length}`)
      console.log(`   - Suppliers: ${suppliers.length}`)
      console.log(`   - Inventory Items: ${components.length + finishedProducts.length}`)
      console.log(`   - BOMs: ${boms.length}`)
      console.log(`   - Production Orders: ${orders.length}`)
      console.log(`   - Sales Orders: 2`)
      console.log(`   - Purchase Orders: 2`)
    }, {
      timeout: 60000 // 60 seconds
    })

  } catch (error) {
    console.error('❌ Error generating dummy data:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

generateDummyData()
  .then(() => {
    console.log('\n✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

