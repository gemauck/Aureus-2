#!/usr/bin/env node
/**
 * Apply database performance indexes for User table
 * Run this script to create indexes that dramatically improve users page performance
 * 
 * Usage:
 *   node apply-user-indexes.js
 * 
 * Or set DATABASE_URL environment variable:
 *   DATABASE_URL=postgresql://... node apply-user-indexes.js
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function applyUserIndexes() {
  try {
    console.log('🔧 Applying User table performance indexes...')
    console.log('')
    
    console.log('📊 Creating User table indexes...')
    
    // Index for ordering by creation date (most common query)
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt")`
    console.log('  ✅ User_createdAt_idx (for ordering users by creation date)')
    
    // Index for filtering by role
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role")`
    console.log('  ✅ User_role_idx (for filtering by role)')
    
    // Index for filtering by status
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status")`
    console.log('  ✅ User_status_idx (for filtering by status)')
    
    // Index for filtering by department
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_department_idx" ON "User"("department")`
    console.log('  ✅ User_department_idx (for filtering by department)')
    
    // Index for last seen queries (online status checks)
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "User_lastSeenAt_idx" ON "User"("lastSeenAt")`
    console.log('  ✅ User_lastSeenAt_idx (for online status checks)')
    
    console.log('')
    console.log('📊 Creating Invitation table indexes...')
    
    // Index for ordering invitations by creation date
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Invitation_createdAt_idx" ON "Invitation"("createdAt")`
    console.log('  ✅ Invitation_createdAt_idx (for ordering invitations)')
    
    // Index for filtering invitations by status
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Invitation_status_idx" ON "Invitation"("status")`
    console.log('  ✅ Invitation_status_idx (for filtering by status)')
    
    console.log('')
    console.log('✅ All User and Invitation table indexes applied successfully!')
    console.log('')
    console.log('📈 Performance Impact:')
    console.log('  - Users page queries should be 10-100x faster')
    console.log('  - Sorting by creation date is now indexed')
    console.log('  - Filtering by role/status/department is optimized')
    console.log('')
    
  } catch (error) {
    console.error('❌ Error applying User indexes:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

applyUserIndexes()

