#!/usr/bin/env node
/**
 * Apply database performance indexes
 * Run this script to create indexes that improve query performance
 * 
 * Usage:
 *   node apply-indexes.js
 * 
 * Or set DATABASE_URL environment variable:
 *   DATABASE_URL=postgresql://... node apply-indexes.js
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function applyIndexes() {
  try {
    console.log('🔧 Applying database performance indexes...')
    console.log('')
    
    // Client table indexes
    console.log('📊 Creating Client table indexes...')
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Client_createdAt_idx" ON "Client"("createdAt")`
    console.log('  ✅ Client_createdAt_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Client_type_idx" ON "Client"("type")`
    console.log('  ✅ Client_type_idx (CRITICAL for filtering clients vs leads)')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Client_status_idx" ON "Client"("status")`
    console.log('  ✅ Client_status_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Client_ownerId_idx" ON "Client"("ownerId")`
    console.log('  ✅ Client_ownerId_idx')
    
    // Project table indexes
    console.log('')
    console.log('📊 Creating Project table indexes...')
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Project_clientId_idx" ON "Project"("clientId")`
    console.log('  ✅ Project_clientId_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status")`
    console.log('  ✅ Project_status_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Project_ownerId_idx" ON "Project"("ownerId")`
    console.log('  ✅ Project_ownerId_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Project_createdAt_idx" ON "Project"("createdAt")`
    console.log('  ✅ Project_createdAt_idx')
    
    // Opportunity table indexes (CRITICAL for CRM performance)
    console.log('')
    console.log('📊 Creating Opportunity table indexes...')
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Opportunity_clientId_idx" ON "Opportunity"("clientId")`
    console.log('  ✅ Opportunity_clientId_idx (CRITICAL for loading opportunities by client)')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Opportunity_createdAt_idx" ON "Opportunity"("createdAt")`
    console.log('  ✅ Opportunity_createdAt_idx')
    
    // User table indexes (CRITICAL for users page performance)
    console.log('')
    console.log('📊 Creating User table indexes...')
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status")`
    console.log('  ✅ User_status_idx (CRITICAL for filtering active/inactive users)')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt")`
    console.log('  ✅ User_createdAt_idx (CRITICAL for sorting by date)')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_name_idx" ON "User"("name")`
    console.log('  ✅ User_name_idx (for sorting by name)')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role")`
    console.log('  ✅ User_role_idx (for filtering by role)')
    
    // Verify indexes were created
    console.log('')
    console.log('🔍 Verifying indexes...')
    const clientIndexes = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Client' AND indexname LIKE 'Client_%'
      ORDER BY indexname
    `
    
    const projectIndexes = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Project' AND indexname LIKE 'Project_%'
      ORDER BY indexname
    `
    
    const opportunityIndexes = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Opportunity' AND indexname LIKE 'Opportunity_%'
      ORDER BY indexname
    `
    
    const userIndexes = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'User' AND indexname LIKE 'User_%'
      ORDER BY indexname
    `
    
    console.log('')
    console.log(`✅ Successfully created ${clientIndexes.length} Client indexes:`)
    clientIndexes.forEach(idx => console.log(`   - ${idx.indexname}`))
    
    console.log('')
    console.log(`✅ Successfully created ${projectIndexes.length} Project indexes:`)
    projectIndexes.forEach(idx => console.log(`   - ${idx.indexname}`))
    
    console.log('')
    console.log(`✅ Successfully created ${opportunityIndexes.length} Opportunity indexes:`)
    opportunityIndexes.forEach(idx => console.log(`   - ${idx.indexname}`))
    
    console.log('')
    console.log(`✅ Successfully created ${userIndexes.length} User indexes:`)
    userIndexes.forEach(idx => console.log(`   - ${idx.indexname}`))
    
    console.log('')
    console.log('✨ Performance indexes applied successfully!')
    console.log('   Your Clients and Users pages should now load much faster.')
    
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('❌ Failed to apply indexes:', error.message)
    if (error.code === 'P1001') {
      console.error('   Database connection failed. Check your DATABASE_URL environment variable.')
    } else if (error.code === 'P2003') {
      console.error('   Database schema issue. Make sure your database is migrated.')
    } else {
      console.error('   Error details:', error)
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

applyIndexes()

