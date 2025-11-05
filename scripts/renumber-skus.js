// Script to renumber SKUs starting from SKU0001
// Run with: node scripts/renumber-skus.js

import dotenv from 'dotenv'
dotenv.config()

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function renumberSKUs() {
  try {
    console.log('🔍 Finding all inventory items with SKU prefix...')
    
    // Get all inventory items with SKU starting with "SKU", sorted by creation date
    const items = await prisma.inventoryItem.findMany({
      where: {
        sku: { startsWith: 'SKU' }
      },
      orderBy: {
        createdAt: 'asc' // Oldest first
      },
      select: {
        id: true,
        sku: true,
        name: true,
        createdAt: true
      }
    })

    if (items.length === 0) {
      console.log('⚠️  No inventory items found with SKU prefix')
      return
    }

    console.log(`\n📦 Found ${items.length} inventory items to renumber:`)
    items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.sku} - ${item.name}`)
    })

    console.log('\n🔄 Starting renumbering process...')
    
    // Create mapping of old SKU to new SKU
    const skuMapping = {}
    items.forEach((item, index) => {
      const newSku = `SKU${String(index + 1).padStart(4, '0')}`
      skuMapping[item.sku] = newSku
    })

    // Show mapping
    console.log('\n📋 SKU Mapping:')
    Object.entries(skuMapping).forEach(([oldSku, newSku]) => {
      console.log(`   ${oldSku} → ${newSku}`)
    })

    // Use a transaction to ensure all updates succeed or fail together
    // We use a two-phase approach: first rename to temporary SKUs, then to final SKUs
    // This avoids conflicts when renumbering (e.g., SKU0002 -> SKU0001 conflicts with existing SKU0001)
    await prisma.$transaction(async (tx) => {
      // Phase 1: Rename all SKUs to temporary values
      console.log('\n🔄 Phase 1: Renaming to temporary SKUs...')
      const tempMapping = {}
      for (let i = 0; i < items.length; i++) {
        const oldSku = items[i].sku
        const tempSku = `SKU_TEMP_${i + 1}`
        tempMapping[oldSku] = tempSku
      }

      // Update InventoryItem SKUs to temp
      for (const [oldSku, tempSku] of Object.entries(tempMapping)) {
        await tx.inventoryItem.updateMany({
          where: { sku: oldSku },
          data: { sku: tempSku }
        })
      }

      // Update StockMovement SKUs to temp
      for (const [oldSku, tempSku] of Object.entries(tempMapping)) {
        await tx.stockMovement.updateMany({
          where: { sku: oldSku },
          data: { sku: tempSku }
        })
      }

      // Update LocationInventory SKUs to temp
      for (const [oldSku, tempSku] of Object.entries(tempMapping)) {
        await tx.locationInventory.updateMany({
          where: { sku: oldSku },
          data: { sku: tempSku }
        })
      }

      // Update BOM productSku to temp
      for (const [oldSku, tempSku] of Object.entries(tempMapping)) {
        await tx.bOM.updateMany({
          where: { productSku: oldSku },
          data: { productSku: tempSku }
        })
      }

      // Update ProductionOrder productSku to temp
      for (const [oldSku, tempSku] of Object.entries(tempMapping)) {
        await tx.productionOrder.updateMany({
          where: { productSku: oldSku },
          data: { productSku: tempSku }
        })
      }

      // Phase 2: Rename from temp SKUs to final SKUs
      console.log('\n🔄 Phase 2: Renaming to final SKUs...')
      
      // Create reverse mapping: tempSku -> newSku
      const finalMapping = {}
      for (let i = 0; i < items.length; i++) {
        const tempSku = `SKU_TEMP_${i + 1}`
        const newSku = `SKU${String(i + 1).padStart(4, '0')}`
        finalMapping[tempSku] = newSku
      }

      // Update InventoryItem SKUs from temp to final
      for (const [tempSku, newSku] of Object.entries(finalMapping)) {
        await tx.inventoryItem.updateMany({
          where: { sku: tempSku },
          data: { sku: newSku }
        })
        console.log(`   ✅ Updated ${tempSku} → ${newSku}`)
      }

      // Update StockMovement SKUs from temp to final
      for (const [tempSku, newSku] of Object.entries(finalMapping)) {
        const updated = await tx.stockMovement.updateMany({
          where: { sku: tempSku },
          data: { sku: newSku }
        })
        if (updated.count > 0) {
          console.log(`   ✅ Updated ${updated.count} stock movement(s) for ${tempSku} → ${newSku}`)
        }
      }

      // Update LocationInventory SKUs from temp to final
      for (const [tempSku, newSku] of Object.entries(finalMapping)) {
        const updated = await tx.locationInventory.updateMany({
          where: { sku: tempSku },
          data: { sku: newSku }
        })
        if (updated.count > 0) {
          console.log(`   ✅ Updated ${updated.count} location inventory record(s) for ${tempSku} → ${newSku}`)
        }
      }

      // Update BOM productSku from temp to final
      for (const [tempSku, newSku] of Object.entries(finalMapping)) {
        const updated = await tx.bOM.updateMany({
          where: { productSku: tempSku },
          data: { productSku: newSku }
        })
        if (updated.count > 0) {
          console.log(`   ✅ Updated ${updated.count} BOM(s) for ${tempSku} → ${newSku}`)
        }
      }

      // Update ProductionOrder productSku from temp to final
      for (const [tempSku, newSku] of Object.entries(finalMapping)) {
        const updated = await tx.productionOrder.updateMany({
          where: { productSku: tempSku },
          data: { productSku: newSku }
        })
        if (updated.count > 0) {
          console.log(`   ✅ Updated ${updated.count} production order(s) for ${tempSku} → ${newSku}`)
        }
      }
    })

    console.log('\n✅ SKU renumbering completed successfully!')
    console.log('\n📊 Summary:')
    console.log(`   • Renumbered ${items.length} inventory items`)
    console.log(`   • SKUs now start from SKU0001`)

  } catch (error) {
    console.error('\n❌ Error renumbering SKUs:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

renumberSKUs()
  .then(() => {
    console.log('\n🎉 Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

