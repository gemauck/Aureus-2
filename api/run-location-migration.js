// API endpoint to run the multi-location inventory migration
// Access: POST /api/run-location-migration
// This runs the migration through the application's database connection

import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, badRequest, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'

async function handler(req, res) {
  // Only allow POST and require admin role
  if (req.method !== 'POST') {
    return badRequest(res, 'Only POST method allowed')
  }

  // Check if user is admin
  if (req.user?.role?.toLowerCase() !== 'admin') {
    return badRequest(res, 'Admin access required')
  }

  try {
    console.log('🔧 Running multi-location inventory migration via API...');
    
    const results = {
      steps: [],
      success: false,
      error: null
    };

    // Step 1: Add locationId column
    try {
      console.log('📋 Step 1: Adding locationId column...');
      await prisma.$executeRaw`
        ALTER TABLE "InventoryItem" 
        ADD COLUMN IF NOT EXISTS "locationId" TEXT
      `;
      results.steps.push({ step: 1, action: 'Add locationId column', status: 'success' });
      console.log('✅ Step 1 complete');
    } catch (error) {
      if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
        results.steps.push({ step: 1, action: 'Add locationId column', status: 'already exists' });
        console.log('⚠️ Column may already exist (continuing...)');
      } else {
        throw error;
      }
    }

    // Step 2: Create index
    try {
      console.log('📋 Step 2: Creating index...');
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" 
        ON "InventoryItem"("locationId")
      `;
      results.steps.push({ step: 2, action: 'Create index', status: 'success' });
      console.log('✅ Step 2 complete');
    } catch (error) {
      results.steps.push({ step: 2, action: 'Create index', status: 'warning', message: error.message });
      console.log('⚠️ Index creation warning (may already exist)');
    }

    // Step 3: Ensure Main Warehouse exists
    console.log('📋 Step 3: Ensuring Main Warehouse exists...');
    let mainWarehouse = await prisma.stockLocation.findFirst({
      where: { code: 'LOC001' }
    });
    
    if (!mainWarehouse) {
      console.log('📍 Creating Main Warehouse...');
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
      results.steps.push({ step: 3, action: 'Create Main Warehouse', status: 'success', created: true });
      console.log('✅ Main Warehouse created');
    } else {
      results.steps.push({ step: 3, action: 'Create Main Warehouse', status: 'already exists', id: mainWarehouse.id });
      console.log('✅ Main Warehouse already exists');
    }

    // Step 4: Assign existing inventory
    console.log('📋 Step 4: Assigning existing inventory...');
    const unassignedCount = await prisma.inventoryItem.count({
      where: {
        OR: [
          { locationId: null },
          { locationId: '' }
        ]
      }
    });
    
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
      
      results.steps.push({ 
        step: 4, 
        action: 'Assign inventory to Main Warehouse', 
        status: 'success', 
        assigned: updateResult.count 
      });
      console.log(`✅ Assigned ${updateResult.count} items`);
    } else {
      results.steps.push({ step: 4, action: 'Assign inventory to Main Warehouse', status: 'no action needed', assigned: 0 });
      console.log('✅ All items already assigned');
    }

    results.success = true;
    console.log('✅✅✅ Migration completed successfully via API!');
    
    return ok(res, {
      message: 'Migration completed successfully',
      results
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    return serverError(res, 'Migration failed', error.message);
  }
}

export default withHttp(handler);

