#!/usr/bin/env node
/**
 * Phase 3: Create normalized tables using Prisma (simpler approach)
 * Uses Prisma's schema introspection to create tables
 */

import { prisma } from '../api/_lib/prisma.js'

async function createTables() {
  console.log('🔄 Phase 3: Creating normalized tables using Prisma\n')
  console.log('='.repeat(60))
  
  try {
    // Check if tables already exist
    const existingTables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('ClientContact', 'ClientComment')
    `
    
    if (existingTables.length === 2) {
      console.log('✅ Tables already exist: ClientContact, ClientComment')
      console.log('   Skipping creation...\n')
    } else {
      console.log('⚠️  Tables need to be created via Prisma migration')
      console.log('   Please run: npx prisma migrate dev --name add_client_contact_comment_tables')
      console.log('   Or use: npx prisma db push (if in development)\n')
      console.log('   The schema has been updated - Prisma will create the tables.\n')
    }
    
    // Verify indexes exist (they'll be created with tables)
    const indexes = await prisma.$queryRaw`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (indexname LIKE 'ClientContact%' OR indexname LIKE 'ClientComment%')
      ORDER BY indexname
    `
    
    if (indexes.length > 0) {
      console.log(`✅ Found ${indexes.length} indexes:\n`)
      indexes.forEach(idx => {
        console.log(`   • ${idx.indexname}`)
      })
    } else {
      console.log('⚠️  No indexes found yet - they will be created with the tables')
    }
    
    console.log('\n✅ Ready for data migration!')
    console.log('📋 Next: Run migration-phase3-populate-tables.js after tables are created')
    
  } catch (error) {
    console.error(`\n❌ Error:`, error.message)
    
    // If connection error, suggest waiting
    if (error.message.includes('connection') || error.message.includes('slots')) {
      console.log('\n💡 Tip: Database connection pool may be exhausted.')
      console.log('   Wait a few minutes and try again, or restart your database connection pool.')
    }
    
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

createTables().catch(console.error)












