#!/usr/bin/env node

/**
 * Purge all manufacturing-related tables.
 * This wipes inventory, locations, BOMs, production orders, suppliers, etc.
 */

import { PrismaClient } from '@prisma/client';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const prisma = new PrismaClient();

// Ordered by dependencies - delete child records first, then parent records
const RESOURCES = [
  { label: 'Production Orders', model: 'productionOrder' }, // References BOM
  { label: 'Stock Movements', model: 'stockMovement' }, // References SKUs but no FK
  { label: 'Purchase Orders', model: 'purchaseOrder' }, // References Supplier
  { label: 'Bills of Materials (BOMs)', model: 'bOM' }, // References InventoryItem
  { label: 'Location Inventory', model: 'locationInventory' }, // References StockLocation
  { label: 'Inventory Items', model: 'inventoryItem' }, // References StockLocation
  { label: 'Stock Locations', model: 'stockLocation' }, // Parent table
  { label: 'Suppliers', model: 'supplier' } // Parent table
];

async function confirmOrAbort(summary) {
  // Allow non-interactive mode via environment variable
  if (process.env.NON_INTERACTIVE === 'true' || !process.stdin.isTTY) {
    return true;
  }

  const rl = readline.createInterface({ input, output });
  console.log('\n⚠️  You are about to permanently delete:');
  summary.forEach(({ label, count }) => {
    console.log(`   • ${label}: ${count}`);
  });

  const answer = await rl.question('\nType "purge manufacturing" to continue: ');
  rl.close();
  return answer.trim().toLowerCase() === 'purge manufacturing';
}

async function main() {
  console.log('🧹 Manufacturing purge starting...\n');

  const counts = {};
  for (const resource of RESOURCES) {
    counts[resource.model] = await prisma[resource.model].count();
  }

  const summary = RESOURCES.map(({ label, model }) => ({
    label,
    count: counts[model]
  }));

  const totalRecords = summary.reduce((sum, item) => sum + item.count, 0);
  if (totalRecords === 0) {
    console.log('✅ Manufacturing tables are already empty. Nothing to purge.');
    return;
  }

  const confirmed = await confirmOrAbort(summary);
  if (!confirmed) {
    console.log('❌ Purge cancelled.');
    return;
  }

  console.log('\n🔄 Deleting data (in dependency-safe order)...');
  for (const resource of RESOURCES) {
    if (counts[resource.model] === 0) {
      continue;
    }
    const result = await prisma[resource.model].deleteMany();
    console.log(`   • Removed ${result.count.toLocaleString()} ${resource.label.toLowerCase()}`);
  }

  console.log('\n✅ Manufacturing data purged successfully.');
  console.log('📝 Reminder: clear browser caches if needed (localStorage "manufacturing_*").');
}

main()
  .catch((error) => {
    console.error('❌ Manufacturing purge failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



