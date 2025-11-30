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
    
    const results = {
      steps: [],
      success: false,
      error: null
    };

    // Step 1: Add locationId column
    try {
      await prisma.$executeRaw`
        ALTER TABLE "InventoryItem" 
        ADD COLUMN IF NOT EXISTS "locationId" TEXT
      `;
      results.steps.push({ step: 1, action: 'Add locationId column', status: 'success' });
    } catch (error) {
      if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
        results.steps.push({ step: 1, action: 'Add locationId column', status: 'already exists' });
      } else {
        throw error;
      }
    }

    // Step 2: Create index
    try {
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" 
        ON "InventoryItem"("locationId")
      `;
      results.steps.push({ step: 2, action: 'Create index', status: 'success' });
    } catch (error) {
      results.steps.push({ step: 2, action: 'Create index', status: 'warning', message: error.message });
    }

    // Step 3: Ensure Main Warehouse exists
    let mainWarehouse = await prisma.stockLocation.findFirst({
      where: { code: 'LOC001' }
    });
    
    if (!mainWarehouse) {
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
    } else {
      results.steps.push({ step: 3, action: 'Create Main Warehouse', status: 'already exists', id: mainWarehouse.id });
    }

    // Step 4: Assign existing inventory
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
    } else {
      results.steps.push({ step: 4, action: 'Assign inventory to Main Warehouse', status: 'no action needed', assigned: 0 });
    }

    results.success = true;
    
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

