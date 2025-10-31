#!/usr/bin/env node

/**
 * Purge All Stock Movements
 * Deletes all stock movements from the database and clears localStorage cache
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function purgeStockMovements() {
  try {
    console.log('🗑️  Starting stock movements purge...');

    // Count existing stock movements
    const count = await prisma.stockMovement.count();
    console.log(`📊 Found ${count} stock movements to delete`);

    if (count === 0) {
      console.log('✅ No stock movements found. Nothing to purge.');
      await prisma.$disconnect();
      return;
    }

    // Confirm deletion (when running interactively)
    if (process.stdin.isTTY) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        readline.question(`⚠️  Are you sure you want to delete ALL ${count} stock movements? This cannot be undone! (yes/no): `, resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Purge cancelled.');
        await prisma.$disconnect();
        return;
      }
    }

    // Delete all stock movements
    console.log('🔄 Deleting all stock movements...');
    const result = await prisma.stockMovement.deleteMany({});
    
    console.log(`✅ Successfully deleted ${result.count} stock movements`);
    console.log('\n📝 Note: You may need to clear localStorage cache manually in the browser:');
    console.log('   localStorage.removeItem("manufacturing_movements")');
    
  } catch (error) {
    console.error('❌ Error purging stock movements:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the purge
purgeStockMovements();

