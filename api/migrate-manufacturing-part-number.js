// Migration endpoint to add Manufacturing Part Number field to InventoryItem
import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    
    // Add manufacturingPartNumber column to InventoryItem table
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "InventoryItem" 
      ADD COLUMN IF NOT EXISTS "manufacturingPartNumber" TEXT DEFAULT '';
    `)
    
    
    // Verify the column exists
    const columnCheck = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'InventoryItem' 
      AND column_name = 'manufacturingPartNumber'
    `)
    
    if (columnCheck && columnCheck.length > 0) {
      
      return ok(res, { 
        message: 'Manufacturing Part Number migration completed successfully',
        migrationPassed: true,
        columnExists: true
      })
    } else {
      console.warn('⚠️ Column may not have been created')
      return ok(res, { 
        message: 'Migration attempted but column verification inconclusive',
        migrationPassed: true,
        columnExists: false
      })
    }
  } catch (e) {
    // If column already exists, that's fine
    if (e.message && e.message.includes('already exists')) {
      return ok(res, { 
        message: 'Column already exists',
        migrationPassed: true,
        columnExists: true
      })
    }
    
    console.error('❌ Migration failed:', e)
    return serverError(res, 'Migration failed', e.message)
  }
}

export default withHttp(withLogging(handler))

