// Admin-only migration endpoint (no auth required for one-time setup)
// Access: POST /api/admin-run-migration?key=YOUR_SECRET_KEY
// This bypasses auth for initial setup

import { prisma } from './_lib/prisma.js'
import { ok, badRequest, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'

async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return badRequest(res, 'Only POST method allowed')
  }

  // Simple security key check (you can change this)
  const secretKey = req.query?.key || req.body?.key;
  const expectedKey = process.env.MIGRATION_SECRET_KEY || 'run-migration-2024';
  
  if (secretKey !== expectedKey) {
    return badRequest(res, 'Invalid migration key. Use ?key=run-migration-2024')
  }

  try {
    
    const results = {
      steps: [],
      success: false,
      error: null
    };

    // Step 1: Add locationId column
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "InventoryItem" 
        ADD COLUMN IF NOT EXISTS "locationId" TEXT
      `);
      results.steps.push({ step: 1, action: 'Add locationId column', status: 'success' });
    } catch (error) {
      if (error.message?.includes('already exists') || error.message?.includes('duplicate column')) {
        results.steps.push({ step: 1, action: 'Add locationId column', status: 'already exists' });
      } else {
        throw error;
      }
    }

    // Step 2: Create index
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" 
        ON "InventoryItem"("locationId")
      `);
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

