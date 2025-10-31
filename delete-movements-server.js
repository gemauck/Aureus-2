#!/usr/bin/env node

/**
 * Delete Specific Stock Movements by ID - Server-side script
 * Uses Prisma directly to delete from database
 * 
 * Usage: node delete-movements-server.js id1 id2 id3
 * Example: node delete-movements-server.js cmhekkpro0003rbqgof3r5c4i cmhekkoc50001rbqgfbtjwhp4
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteStockMovements() {
  const movementIds = process.argv.slice(2);
  
  if (movementIds.length === 0) {
    console.log('Usage: node delete-movements-server.js <id1> <id2> ...');
    console.log('Example: node delete-movements-server.js cmhekkpro0003rbqgof3r5c4i cmhekkoc50001rbqgfbtjwhp4');
    process.exit(1);
  }

  try {
    console.log(`🗑️  Deleting ${movementIds.length} stock movement(s)...`);
    console.log('📋 IDs:', movementIds);
    console.log('');

    const results = [];
    
    for (const id of movementIds) {
      try {
        console.log(`🔄 Deleting movement: ${id}...`);
        
        // Check if movement exists first
        const exists = await prisma.stockMovement.findUnique({
          where: { id }
        });
        
        if (!exists) {
          console.log(`⚠️  Movement ${id} not found in database`);
          results.push({ success: false, id, error: 'Not found' });
          continue;
        }
        
        // Delete the movement
        await prisma.stockMovement.delete({
          where: { id }
        });
        
        results.push({ success: true, id });
        console.log(`✅ Successfully deleted: ${id}`);
      } catch (error) {
        console.error(`❌ Failed to delete ${id}:`, error.message);
        results.push({ success: false, id, error: error.message });
      }
      console.log('');
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('📊 Summary:');
    console.log(`   ✅ Successfully deleted: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed IDs:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.id}: ${r.error}`);
      });
    }

    if (successful > 0) {
      console.log('\n✅ Deletion complete!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
deleteStockMovements();

