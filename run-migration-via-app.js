// Run migration using the app's Prisma connection
// This works by importing the same Prisma instance the app uses

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import Prisma the same way the app does
const prismaModule = await import('./api/_lib/prisma.js');
const { prisma } = prismaModule;

async function runMigration() {
  try {
    console.log('🔧 Starting multi-location inventory migration...');
    console.log('📡 Using application database connection...\n');
    
    // Step 1: Add locationId column
    console.log('📋 Step 1: Adding locationId column...');
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "InventoryItem" 
        ADD COLUMN IF NOT EXISTS "locationId" TEXT
      `);
      console.log('✅ locationId column added/verified\n');
    } catch (error) {
      if (error.message?.includes('already exists') || error.message?.includes('duplicate column')) {
        console.log('✅ locationId column already exists\n');
      } else {
        throw error;
      }
    }

    // Step 2: Create index
    console.log('📋 Step 2: Creating index...');
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" 
        ON "InventoryItem"("locationId")
      `);
      console.log('✅ Index created\n');
    } catch (error) {
      console.log('⚠️ Index creation note (may already exist)\n');
    }

    // Step 3: Ensure Main Warehouse exists
    console.log('📋 Step 3: Ensuring Main Warehouse exists...');
    let mainWarehouse = await prisma.stockLocation.findFirst({
      where: { code: 'LOC001' }
    });
    
    if (!mainWarehouse) {
      console.log('📍 Creating Main Warehouse (LOC001)...');
      mainWarehouse = await prisma.stockLocation.create({
        data: {
          code: 'LOC001',
          name: 'Main Warehouse',
          type: 'warehouse',
          status: 'active',
          address: '',
          contactPerson: '',
          contactPhone: '',
          meta: '{}'
        }
      });
      console.log(`✅ Main Warehouse created: ${mainWarehouse.id}\n`);
    } else {
      console.log(`✅ Main Warehouse found: ${mainWarehouse.id}\n`);
    }

    // Step 4: Assign existing inventory to Main Warehouse
    console.log('📋 Step 4: Assigning existing inventory to Main Warehouse...');
    const unassignedCount = await prisma.inventoryItem.count({
      where: {
        OR: [
          { locationId: null },
          { locationId: '' }
        ]
      }
    });
    
    console.log(`📦 Found ${unassignedCount} unassigned inventory items`);
    
    if (unassignedCount > 0) {
      const updateResult = await prisma.inventoryItem.updateMany({
        where: {
          OR: [
            { locationId: null },
            { locationId: '' }
          ]
        },
        data: {
          locationId: mainWarehouse.id
        }
      });
      
      console.log(`✅ Assigned ${updateResult.count} inventory items to Main Warehouse\n`);
    } else {
      console.log('✅ All inventory items already assigned\n');
    }

    // Step 5: Verification
    console.log('📋 Step 5: Verification...');
    const totalItems = await prisma.inventoryItem.count();
    const assignedItems = await prisma.inventoryItem.count({
      where: { locationId: { not: null } }
    });
    const locationCount = await prisma.stockLocation.count();
    
    console.log(`📊 Total inventory items: ${totalItems}`);
    console.log(`📊 Assigned items: ${assignedItems}`);
    console.log(`📊 Stock locations: ${locationCount}`);
    
    console.log('\n');
    console.log('✅✅✅ Migration completed successfully! ✅✅✅');
    console.log('\n📋 Next steps:');
    console.log('   1. Restart your server (if running)');
    console.log('   2. Go to Manufacturing → Inventory Tab');
    console.log('   3. You should see a location selector dropdown');
    console.log('   4. Test filtering by different locations');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
runMigration()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

