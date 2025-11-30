#!/usr/bin/env node
/**
 * Purge all manufacturing data
 * 
 * This script deletes all data from:
 * - StockMovement
 * - ProductionOrder
 * - SalesOrder (affects inventory)
 * - PurchaseOrder
 * - Supplier
 * - LocationInventory
 * - BOM
 * - InventoryItem
 * - StockLocation
 * 
 * WARNING: This is a destructive operation and cannot be undone!
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
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value
      }
    }
  })
} catch (e) {
  console.warn('⚠️ Could not load .env file, using environment variables')
}

const prisma = new PrismaClient()

async function purgeManufacturingData() {
  console.log('🗑️  Starting manufacturing data purge...')
  console.log('⚠️  WARNING: This will delete ALL manufacturing data!')
  
  try {
    // Start transaction with increased timeout (60 seconds)
    await prisma.$transaction(async (tx) => {
      // 1. Delete Stock Movements (no dependencies)
      console.log('📦 Deleting stock movements...')
      await tx.stockMovement.deleteMany({})
      console.log(`   ✅ Deleted stock movements`)

      // 2. Delete Production Orders (no dependencies on manufacturing models)
      console.log('🏭 Deleting production orders...')
      await tx.productionOrder.deleteMany({})
      console.log(`   ✅ Deleted production orders`)

      // 3. Delete Sales Orders (affects inventory via stock movements)
      console.log('🛒 Deleting sales orders...')
      await tx.salesOrder.deleteMany({})
      console.log(`   ✅ Deleted sales orders`)

      // 4. Delete Purchase Orders (depends on Supplier)
      console.log('📋 Deleting purchase orders...')
      await tx.purchaseOrder.deleteMany({})
      console.log(`   ✅ Deleted purchase orders`)

      // 5. Delete Suppliers (no dependencies after PurchaseOrders are deleted)
      console.log('🏢 Deleting suppliers...')
      await tx.supplier.deleteMany({})
      console.log(`   ✅ Deleted suppliers`)

      // 6. Delete Location Inventory (depends on StockLocation)
      console.log('📍 Deleting location inventory...')
      await tx.locationInventory.deleteMany({})
      console.log(`   ✅ Deleted location inventory records`)

      // 7. Delete BOMs (depends on InventoryItem, but we'll handle the foreign key)
      console.log('📋 Deleting BOMs...')
      // First, remove the foreign key relationship
      await tx.bOM.updateMany({
        data: { inventoryItemId: null }
      })
      // Then delete all BOMs
      await tx.bOM.deleteMany({})
      console.log(`   ✅ Deleted BOMs`)

      // 8. Delete Inventory Items (depends on StockLocation and BOM)
      console.log('📦 Deleting inventory items...')
      // First, remove the foreign key relationship to StockLocation
      await tx.inventoryItem.updateMany({
        data: { locationId: null }
      })
      // Then delete all inventory items
      await tx.inventoryItem.deleteMany({})
      console.log(`   ✅ Deleted inventory items`)

      // 9. Delete Stock Locations (depends on InventoryItem and LocationInventory, both now deleted)
      console.log('🏢 Deleting stock locations...')
      await tx.stockLocation.deleteMany({})
      console.log(`   ✅ Deleted stock locations`)

      console.log('\n✅ All manufacturing data purged successfully!')
    }, {
      timeout: 60000 // 60 seconds
    })

    // Verify deletion
    console.log('\n📊 Verification:')
    const counts = {
      stockMovements: await prisma.stockMovement.count(),
      productionOrders: await prisma.productionOrder.count(),
      salesOrders: await prisma.salesOrder.count(),
      purchaseOrders: await prisma.purchaseOrder.count(),
      suppliers: await prisma.supplier.count(),
      locationInventory: await prisma.locationInventory.count(),
      boms: await prisma.bOM.count(),
      inventoryItems: await prisma.inventoryItem.count(),
      stockLocations: await prisma.stockLocation.count()
    }

    console.log('   Stock Movements:', counts.stockMovements)
    console.log('   Production Orders:', counts.productionOrders)
    console.log('   Sales Orders:', counts.salesOrders)
    console.log('   Purchase Orders:', counts.purchaseOrders)
    console.log('   Suppliers:', counts.suppliers)
    console.log('   Location Inventory:', counts.locationInventory)
    console.log('   BOMs:', counts.boms)
    console.log('   Inventory Items:', counts.inventoryItems)
    console.log('   Stock Locations:', counts.stockLocations)

    const totalRemaining = Object.values(counts).reduce((sum, count) => sum + count, 0)
    if (totalRemaining === 0) {
      console.log('\n✅ All manufacturing data successfully purged!')
    } else {
      console.log(`\n⚠️  Warning: ${totalRemaining} records still remain`)
    }

  } catch (error) {
    console.error('❌ Error purging manufacturing data:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the purge
purgeManufacturingData()
  .then(() => {
    console.log('\n✅ Purge complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Purge failed:', error)
    process.exit(1)
  })

