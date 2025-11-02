// Direct migration runner using Prisma Client
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runMigration() {
  try {
    console.log('🔧 Starting multi-location inventory migration...');
    
    // Step 1: Check if locationId column exists
    console.log('📋 Step 1: Checking database schema...');
    try {
      // Try to query with locationId to see if column exists
      const test = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'InventoryItem' AND column_name = 'locationId'
      `;
      
      if (Array.isArray(test) && test.length > 0) {
        console.log('✅ locationId column already exists');
      } else {
        console.log('➕ Adding locationId column...');
        await prisma.$executeRaw`
          ALTER TABLE "InventoryItem" 
          ADD COLUMN IF NOT EXISTS "locationId" TEXT
        `;
        console.log('✅ locationId column added');
      }
    } catch (error) {
      console.log('⚠️ Column check failed, trying to add anyway...');
      try {
        await prisma.$executeRaw`
          ALTER TABLE "InventoryItem" 
          ADD COLUMN IF NOT EXISTS "locationId" TEXT
        `;
        console.log('✅ locationId column added');
      } catch (addError) {
        console.error('❌ Failed to add column:', addError.message);
        throw addError;
      }
    }

    // Step 2: Create index
    console.log('📋 Step 2: Creating index...');
    try {
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" 
        ON "InventoryItem"("locationId")
      `;
      console.log('✅ Index created');
    } catch (error) {
      console.log('⚠️ Index may already exist (this is okay)');
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
      console.log('✅ Main Warehouse created:', mainWarehouse.id);
    } else {
      console.log('✅ Main Warehouse found:', mainWarehouse.id);
    }

    // Step 4: Assign existing inventory to Main Warehouse
    console.log('📋 Step 4: Assigning existing inventory to Main Warehouse...');
    const unassignedItems = await prisma.inventoryItem.findMany({
      where: {
        OR: [
          { locationId: null },
          { locationId: '' }
        ]
      }
    });
    
    console.log(`📦 Found ${unassignedItems.length} unassigned inventory items`);
    
    if (unassignedItems.length > 0) {
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
      
      console.log(`✅ Assigned ${updateResult.count} inventory items to Main Warehouse`);
    } else {
      console.log('✅ All inventory items already assigned');
    }

    console.log('');
    console.log('✅✅✅ Migration completed successfully! ✅✅✅');
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Restart your server');
    console.log('   2. Go to Manufacturing → Inventory Tab');
    console.log('   3. Use the location selector to filter inventory');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
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
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });

