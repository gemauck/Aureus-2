// Script to find and fix duplicate inventory items
// Run with: node fix-duplicate-inventory.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findAndFixDuplicates() {
  try {
    console.log('🔍 Searching for duplicate inventory items...\n');

    // Get all inventory items grouped by SKU and locationId
    const allItems = await prisma.inventoryItem.findMany({
      orderBy: [
        { sku: 'asc' },
        { locationId: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    console.log(`📊 Total inventory items: ${allItems.length}\n`);

    // Group by SKU and locationId to find duplicates
    const grouped = {};
    const duplicates = [];

    for (const item of allItems) {
      // Use locationId or 'null' as key
      const locationKey = item.locationId || 'null';
      const key = `${item.sku}::${locationKey}`;
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    }

    // Find groups with more than one item (duplicates)
    for (const [key, items] of Object.entries(grouped)) {
      if (items.length > 1) {
        duplicates.push({
          key,
          sku: items[0].sku,
          locationId: items[0].locationId,
          count: items.length,
          items
        });
      }
    }

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found! All inventory items are unique.\n');
      return;
    }

    console.log(`⚠️  Found ${duplicates.length} groups of duplicate items:\n`);

    // Display duplicates
    for (const dup of duplicates) {
      console.log(`SKU: ${dup.sku}, Location: ${dup.locationId || 'null'}, Count: ${dup.count}`);
      for (const item of dup.items) {
        console.log(`  - ID: ${item.id}, Qty: ${item.quantity}, Status: ${item.status}, Created: ${item.createdAt}`);
      }
      console.log('');
    }

    // Strategy: Keep the item with:
    // 1. Non-zero quantity (if any)
    // 2. Valid locationId (not null, if any)
    // 3. Most recent updatedAt
    // 4. Delete the rest

    console.log('\n🔧 Fixing duplicates...\n');

    let totalDeleted = 0;
    let totalMerged = 0;

    for (const dup of duplicates) {
      const items = dup.items;
      
      // Sort items by priority:
      // 1. Non-zero quantity first
      // 2. Valid locationId first
      // 3. Most recent updatedAt first
      items.sort((a, b) => {
        // Priority 1: Prefer non-zero quantity
        if (a.quantity > 0 && b.quantity === 0) return -1;
        if (a.quantity === 0 && b.quantity > 0) return 1;
        
        // Priority 2: Prefer valid locationId
        if (a.locationId && !b.locationId) return -1;
        if (!a.locationId && b.locationId) return 1;
        
        // Priority 3: Prefer most recent
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });

      const keepItem = items[0];
      const deleteItems = items.slice(1);

      // Merge quantities and other values from duplicates into the kept item
      let mergedQuantity = keepItem.quantity;
      let mergedAllocated = keepItem.allocatedQuantity || 0;
      let mergedTotalValue = keepItem.totalValue || 0;
      let hasNonZeroQty = keepItem.quantity > 0;

      for (const delItem of deleteItems) {
        // Only merge if the item being deleted has quantity
        if (delItem.quantity > 0 && !hasNonZeroQty) {
          mergedQuantity = delItem.quantity;
          mergedAllocated = delItem.allocatedQuantity || 0;
          mergedTotalValue = delItem.totalValue || 0;
          hasNonZeroQty = true;
        } else if (delItem.quantity > 0) {
          // Add to existing quantity
          mergedQuantity += delItem.quantity;
          mergedAllocated += (delItem.allocatedQuantity || 0);
          mergedTotalValue += (delItem.totalValue || 0);
        }

        // Merge metadata if missing
        if (!keepItem.thumbnail && delItem.thumbnail) {
          keepItem.thumbnail = delItem.thumbnail;
        }
        if (!keepItem.supplier && delItem.supplier) {
          keepItem.supplier = delItem.supplier;
        }
        if (!keepItem.location && delItem.location) {
          keepItem.location = delItem.location;
        }
      }

      // Update the kept item with merged values
      if (mergedQuantity !== keepItem.quantity || 
          mergedAllocated !== (keepItem.allocatedQuantity || 0) ||
          mergedTotalValue !== (keepItem.totalValue || 0)) {
        
        await prisma.inventoryItem.update({
          where: { id: keepItem.id },
          data: {
            quantity: mergedQuantity,
            allocatedQuantity: mergedAllocated,
            totalValue: mergedTotalValue,
            thumbnail: keepItem.thumbnail,
            supplier: keepItem.supplier,
            location: keepItem.location,
            status: mergedQuantity === 0 ? 'out_of_stock' : 
                   mergedQuantity < (keepItem.reorderPoint || 0) ? 'low_stock' : 'in_stock'
          }
        });
        
        totalMerged++;
        console.log(`✅ Merged ${deleteItems.length} duplicates of SKU ${dup.sku} into item ${keepItem.id}`);
        console.log(`   Final quantity: ${mergedQuantity}, Allocated: ${mergedAllocated}`);
      }

      // Delete duplicate items
      for (const delItem of deleteItems) {
        await prisma.inventoryItem.delete({
          where: { id: delItem.id }
        });
        totalDeleted++;
      }
    }

    console.log(`\n✅ Fix complete!`);
    console.log(`   - Merged: ${totalMerged} groups`);
    console.log(`   - Deleted: ${totalDeleted} duplicate items`);

    // Verify no more duplicates
    const remainingItems = await prisma.inventoryItem.findMany();
    const remainingGrouped = {};
    for (const item of remainingItems) {
      const locationKey = item.locationId || 'null';
      const key = `${item.sku}::${locationKey}`;
      if (!remainingGrouped[key]) {
        remainingGrouped[key] = [];
      }
      remainingGrouped[key].push(item);
    }

    const remainingDuplicates = Object.values(remainingGrouped).filter(group => group.length > 1);
    if (remainingDuplicates.length > 0) {
      console.log(`\n⚠️  Warning: ${remainingDuplicates.length} groups still have duplicates (this may indicate a database constraint issue)`);
    } else {
      console.log(`\n✅ Verified: No duplicates remaining`);
    }

  } catch (error) {
    console.error('❌ Error fixing duplicates:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
findAndFixDuplicates()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });


