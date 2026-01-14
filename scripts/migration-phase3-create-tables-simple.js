#!/usr/bin/env node
/**
 * Phase 3: Create normalized tables - Simple approach
 * Creates tables one at a time with proper error handling
 */

import { prisma } from '../api/_lib/prisma.js'

async function createTables() {
  console.log('🔄 Phase 3: Creating normalized tables\n')
  console.log('='.repeat(60))
  
  try {
    // Step 1: Create ClientContact table
    console.log('\n📋 Step 1: Creating ClientContact table...')
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ClientContact" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "clientId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "email" TEXT,
          "phone" TEXT,
          "mobile" TEXT,
          "role" TEXT,
          "title" TEXT,
          "isPrimary" BOOLEAN NOT NULL DEFAULT false,
          "notes" TEXT NOT NULL DEFAULT '',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") 
            REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `)
      console.log('   ✅ ClientContact table created\n')
    } catch (error) {
      if (error.message.includes('already exists') || error.code === '42P07') {
        console.log('   ⚠️  ClientContact table already exists (skipping)\n')
      } else {
        throw error
      }
    }
    
    // Step 2: Create ClientComment table
    console.log('📋 Step 2: Creating ClientComment table...')
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ClientComment" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "clientId" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "authorId" TEXT,
          "author" TEXT NOT NULL DEFAULT '',
          "userName" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "ClientComment_clientId_fkey" FOREIGN KEY ("clientId") 
            REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "ClientComment_authorId_fkey" FOREIGN KEY ("authorId") 
            REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
      `)
      console.log('   ✅ ClientComment table created\n')
    } catch (error) {
      if (error.message.includes('already exists') || error.code === '42P07') {
        console.log('   ⚠️  ClientComment table already exists (skipping)\n')
      } else {
        throw error
      }
    }
    
    // Step 3: Create indexes for ClientContact
    console.log('📋 Step 3: Creating indexes for ClientContact...')
    const contactIndexes = [
      { name: 'ClientContact_clientId_idx', sql: 'CREATE INDEX IF NOT EXISTS "ClientContact_clientId_idx" ON "ClientContact"("clientId")' },
      { name: 'ClientContact_email_idx', sql: 'CREATE INDEX IF NOT EXISTS "ClientContact_email_idx" ON "ClientContact"("email")' },
      { name: 'ClientContact_phone_idx', sql: 'CREATE INDEX IF NOT EXISTS "ClientContact_phone_idx" ON "ClientContact"("phone")' },
      { name: 'ClientContact_mobile_idx', sql: 'CREATE INDEX IF NOT EXISTS "ClientContact_mobile_idx" ON "ClientContact"("mobile")' },
      { name: 'ClientContact_isPrimary_idx', sql: 'CREATE INDEX IF NOT EXISTS "ClientContact_isPrimary_idx" ON "ClientContact"("isPrimary")' }
    ]
    
    for (const idx of contactIndexes) {
      try {
        await prisma.$executeRawUnsafe(idx.sql)
        console.log(`   ✅ Index ${idx.name} created`)
      } catch (error) {
        if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42710') {
          console.log(`   ⚠️  Index ${idx.name} already exists (skipping)`)
        } else {
          console.warn(`   ⚠️  Error creating ${idx.name}: ${error.message}`)
        }
      }
    }
    
    // Step 4: Create indexes for ClientComment
    console.log('\n📋 Step 4: Creating indexes for ClientComment...')
    const commentIndexes = [
      { name: 'ClientComment_clientId_idx', sql: 'CREATE INDEX IF NOT EXISTS "ClientComment_clientId_idx" ON "ClientComment"("clientId")' },
      { name: 'ClientComment_createdAt_idx', sql: 'CREATE INDEX IF NOT EXISTS "ClientComment_createdAt_idx" ON "ClientComment"("createdAt")' },
      { name: 'ClientComment_authorId_idx', sql: 'CREATE INDEX IF NOT EXISTS "ClientComment_authorId_idx" ON "ClientComment"("authorId")' }
    ]
    
    for (const idx of commentIndexes) {
      try {
        await prisma.$executeRawUnsafe(idx.sql)
        console.log(`   ✅ Index ${idx.name} created`)
      } catch (error) {
        if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42710') {
          console.log(`   ⚠️  Index ${idx.name} already exists (skipping)`)
        } else {
          console.warn(`   ⚠️  Error creating ${idx.name}: ${error.message}`)
        }
      }
    }
    
    // Verify tables were created
    console.log('\n🔍 Verifying tables...\n')
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('ClientContact', 'ClientComment')
      ORDER BY table_name
    `
    
    if (tables.length === 2) {
      console.log('✅ Both tables exist:')
      tables.forEach(table => {
        console.log(`   • ${table.table_name}`)
      })
    } else {
      console.warn(`⚠️  Only ${tables.length}/2 tables found`)
      tables.forEach(table => {
        console.log(`   • ${table.table_name}`)
      })
    }
    
    // Count indexes
    const indexes = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (indexname LIKE 'ClientContact%' OR indexname LIKE 'ClientComment%')
    `
    
    console.log(`\n✅ Found ${indexes[0].count} indexes for normalized tables`)
    console.log('\n✅ Phase 3 Step 1 complete: Tables and indexes created!')
    console.log('\n📋 Next step: Run migration-phase3-populate-tables.js to migrate data')
    
  } catch (error) {
    console.error(`\n❌ Error:`, error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

createTables().catch(console.error)












