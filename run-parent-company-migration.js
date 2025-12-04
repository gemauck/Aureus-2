// Migration script to remove parent company concept
// This script cleans up parentGroupId data and then runs Prisma migration

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const prisma = new PrismaClient()

async function runMigration() {
  try {
    console.log('🚀 Starting parent company removal migration...\n')
    
    // Step 1: Clean up parentGroupId data
    console.log('📝 Step 1: Cleaning up parentGroupId data...')
    const result = await prisma.$executeRaw`
      UPDATE "Client" SET "parentGroupId" = NULL WHERE "parentGroupId" IS NOT NULL
    `
    console.log(`✅ Updated ${result} client(s) - set parentGroupId to NULL\n`)
    
    // Step 2: Verify cleanup
    console.log('🔍 Step 2: Verifying cleanup...')
    const countResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "Client" WHERE "parentGroupId" IS NOT NULL
    `
    const count = countResult[0]?.count || 0
    if (count === 0) {
      console.log('✅ Verification passed - no clients with parentGroupId remaining\n')
    } else {
      console.log(`⚠️  Warning: ${count} client(s) still have parentGroupId\n`)
    }
    
    // Step 3: Run Prisma migration
    console.log('📦 Step 3: Running Prisma migration...')
    console.log('   This will remove parentGroupId field, parentGroup relation, and childCompanies relation\n')
    
    try {
      // Check if we're in a git repo and have uncommitted changes
      const hasUncommittedChanges = execSync('git status --porcelain', { encoding: 'utf-8', stdio: 'pipe' }).trim().length > 0
      
      if (hasUncommittedChanges) {
        console.log('⚠️  Warning: You have uncommitted changes in your git repository')
        console.log('   It\'s recommended to commit your changes before running migrations\n')
      }
      
      // Run Prisma migrate dev
      console.log('   Running: npx prisma migrate dev --name remove_parent_company')
      execSync('npx prisma migrate dev --name remove_parent_company', {
        stdio: 'inherit',
        cwd: __dirname
      })
      
      console.log('\n✅ Prisma migration completed successfully!')
      console.log('   The parentGroupId field, parentGroup relation, and childCompanies relation have been removed from the schema.\n')
      
    } catch (migrationError) {
      console.error('\n❌ Prisma migration failed:', migrationError.message)
      console.log('\n💡 You may need to run the migration manually:')
      console.log('   npx prisma migrate dev --name remove_parent_company\n')
      throw migrationError
    }
    
    // Step 4: Regenerate Prisma client
    console.log('🔄 Step 4: Regenerating Prisma client...')
    try {
      execSync('npx prisma generate', {
        stdio: 'inherit',
        cwd: __dirname
      })
      console.log('✅ Prisma client regenerated successfully!\n')
    } catch (generateError) {
      console.error('❌ Failed to regenerate Prisma client:', generateError.message)
      console.log('💡 Run manually: npx prisma generate\n')
    }
    
    console.log('🎉 Migration completed successfully!')
    console.log('\n📋 Summary:')
    console.log('   ✅ Cleaned up parentGroupId data')
    console.log('   ✅ Removed parentGroupId field from schema')
    console.log('   ✅ Removed parentGroup relation from schema')
    console.log('   ✅ Removed childCompanies relation from schema')
    console.log('   ✅ Regenerated Prisma client')
    console.log('\n✨ The parent company concept has been completely removed from your database and codebase!')
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    console.error('   Error details:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the migration
runMigration()

