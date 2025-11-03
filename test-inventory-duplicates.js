// Quick test script to check if duplicates exist and if deduplication is working
// Run with: node test-inventory-duplicates.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDuplicates() {
  try {
    console.log('🔍 Testing for duplicate inventory items...\n');

    // Get all inventory items
    const allItems = await prisma.inventoryItem.findMany({
      orderBy: [
        { sku: 'asc' },
        { locationId: 'asc' }
      ]
    });

    console.log(`📊 Total inventory items in database: ${allItems.length}\n`);

    // Group by SKU and locationId
    const grouped = {};
    for (const item of allItems) {
      const locationKey = item.locationId || 'null';
      const key = `${item.sku}::${locationKey}`;
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    }

    // Find duplicates
    const duplicates = [];
    for (const [key, items] of Object.entries(grouped)) {
      if (items.length > 1) {
        duplicates.push({ key, items });
      }
    }

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found! All items are unique by SKU+locationId.\n');
      console.log('💡 If you\'re still seeing duplicates in the UI:');
      console.log('   1. Make sure the server has been restarted to apply the API fix');
      console.log('   2. Clear your browser cache and refresh the page');
      console.log('   3. Check the server console logs for deduplication messages');
      return;
    }

    console.log(`⚠️  Found ${duplicates.length} groups of duplicates:\n`);

    for (const dup of duplicates) {
      const [sku, locKey] = dup.key.split('::');
      console.log(`SKU: ${sku}, Location: ${locKey === 'null' ? '(no location)' : locKey}, Count: ${dup.items.length}`);
      for (const item of dup.items) {
        console.log(`  - ID: ${item.id}`);
        console.log(`    Quantity: ${item.quantity || 0}`);
        console.log(`    Status: ${item.status || 'unknown'}`);
        console.log(`    LocationId: ${item.locationId || 'null'}`);
        console.log(`    Created: ${item.createdAt}`);
        console.log('');
      }
    }

    console.log('\n💡 To fix these duplicates, run:');
    console.log('   node fix-duplicate-inventory.js');

  } catch (error) {
    console.error('❌ Error testing duplicates:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testDuplicates()
  .then(() => {
    console.log('\n✨ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });


