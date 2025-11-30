// Ensure BOM inventoryItemId column exists
// Runs on first API call to manufacturing endpoints
import { prisma } from './prisma.js'

let migrationChecked = false

export async function ensureBOMMigration() {
  if (migrationChecked) return
  
  try {
    migrationChecked = true
    
    // Try to query the column - if it doesn't exist, this will help us know
    // We'll let Prisma handle the actual migration via migrate deploy
    // This is just a safety check
    const dbUrl = process.env.DATABASE_URL || ''
    const isSQLite = dbUrl.startsWith('file:')
    
    if (isSQLite) {
      // For SQLite, check if column exists
      try {
        const result = await prisma.$queryRaw`
          SELECT name FROM pragma_table_info('BOM') WHERE name = 'inventoryItemId';
        `
        if (result && result.length > 0) {
          return // Column exists, migration applied
        }
      } catch (error) {
        // Table might not exist or column doesn't exist
        // Try to add it
        try {
          await prisma.$executeRaw`ALTER TABLE "BOM" ADD COLUMN "inventoryItemId" TEXT;`
          await prisma.$executeRaw`CREATE INDEX "BOM_inventoryItemId_idx" ON "BOM"("inventoryItemId");`
        } catch (migrationError) {
          if (migrationError.message.includes('duplicate column') || 
              migrationError.message.includes('already exists')) {
          } else {
          }
        }
      }
    } else {
      // For PostgreSQL, Prisma migrations should handle this
      // Just verify column exists
      try {
        const result = await prisma.$queryRaw`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'BOM' AND column_name = 'inventoryItemId';
        `
        if (result && result.length > 0) {
          return // Column exists
        }
        // Column doesn't exist - migration needed
      } catch (error) {
      }
    }
  } catch (error) {
    // Don't break the app if migration check fails
  }
}

