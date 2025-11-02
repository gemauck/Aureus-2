// Migration script: Assign existing inventory items to Main Warehouse (LOC001)
// Run this after adding locationId column to InventoryItem table

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function assignInventoryToMainWarehouse() {
  try {
    console.log('🔧 Starting migration: Assigning inventory to Main Warehouse...');
    
    // Find or create Main Warehouse (LOC001)
    let mainWarehouse = await prisma.stockLocation.findFirst({
      where: { code: 'LOC001' }
    });
    
    if (!mainWarehouse) {
      console.log('📍 Main Warehouse (LOC001) not found. Creating...');
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
      console.log('✅ Main Warehouse found:', mainWarehouse.id, mainWarehouse.name);
    }
    
    // Get all inventory items without locationId
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        OR: [
          { locationId: null },
          { locationId: '' }
        ]
      }
    });
    
    console.log(`📦 Found ${inventoryItems.length} inventory items without location assignment`);
    
    if (inventoryItems.length === 0) {
      console.log('✅ All inventory items are already assigned to locations');
      return;
    }
    
    // Update all items to link to Main Warehouse
    let updatedCount = 0;
    for (const item of inventoryItems) {
      try {
        await prisma.inventoryItem.update({
          where: { id: item.id },
          data: { locationId: mainWarehouse.id }
        });
        updatedCount++;
      } catch (error) {
        console.error(`❌ Failed to update item ${item.id} (${item.sku}):`, error.message);
      }
    }
    
    console.log(`✅ Successfully assigned ${updatedCount} inventory items to Main Warehouse`);
    console.log(`📊 Main Warehouse now has ${updatedCount} inventory items`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
assignInventoryToMainWarehouse()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });

