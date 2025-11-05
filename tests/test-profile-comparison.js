/**
 * Test script to compare what different users see from the API
 * This will help identify if the issue is at the API level or database level
 */

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function testProfileComparison() {
  try {
    console.log('🔍 Testing Profile Comparison...\n')
    
    // Get user IDs from database
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: ['gemauck@gmail.com', 'garethm@abcotronics.co.za']
        }
      },
      select: {
        id: true,
        email: true
      }
    })
    
    console.log('📋 Found users:', users.map(u => ({ id: u.id, email: u.email })))
    console.log('\n')
    
    // Test 1: Direct database query (should be same for both)
    console.log('='.repeat(60))
    console.log('TEST 1: Direct Database Query (No API)')
    console.log('='.repeat(60))
    
    const dbLeads = await prisma.$queryRaw`
      SELECT id, name, type, "ownerId", "createdAt"
      FROM "Client"
      WHERE type = 'lead'
      ORDER BY "createdAt" DESC
    `
    
    const dbClients = await prisma.$queryRaw`
      SELECT id, name, type, "ownerId", "createdAt"
      FROM "Client"
      WHERE (type = 'client' OR type IS NULL)
      AND type != 'lead'
      ORDER BY "createdAt" DESC
    `
    
    console.log(`📊 Database Direct Query Results:`)
    console.log(`   Leads: ${dbLeads.length}`)
    console.log(`   Clients: ${dbClients.length}`)
    console.log(`   Lead IDs:`, dbLeads.map(l => l.id).slice(0, 10), '...')
    console.log(`   Client IDs:`, dbClients.map(c => c.id).slice(0, 10), '...')
    console.log('\n')
    
    // Test 2: Prisma query (should match direct query)
    console.log('='.repeat(60))
    console.log('TEST 2: Prisma Query (No API)')
    console.log('='.repeat(60))
    
    const prismaLeads = await prisma.client.findMany({
      where: { type: 'lead' },
      select: { id: true, name: true, type: true, ownerId: true, createdAt: true }
    })
    
    const prismaClients = await prisma.client.findMany({
      where: {
        OR: [
          { type: 'client' },
          { type: null }
        ]
      },
      select: { id: true, name: true, type: true, ownerId: true, createdAt: true }
    })
    
    console.log(`📊 Prisma Query Results:`)
    console.log(`   Leads: ${prismaLeads.length}`)
    console.log(`   Clients: ${prismaClients.length}`)
    console.log(`   Lead IDs:`, prismaLeads.map(l => l.id).slice(0, 10), '...')
    console.log(`   Client IDs:`, prismaClients.map(c => c.id).slice(0, 10), '...')
    
    // Compare
    const leadsMatch = dbLeads.length === prismaLeads.length &&
      dbLeads.every((l, i) => l.id === prismaLeads[i]?.id)
    const clientsMatch = dbClients.length === prismaClients.length &&
      dbClients.every((c, i) => c.id === prismaClients[i]?.id)
    
    console.log(`\n✅ Leads match: ${leadsMatch}`)
    console.log(`✅ Clients match: ${clientsMatch}`)
    
    if (!leadsMatch) {
      console.error(`❌ MISMATCH: Leads count differs!`)
      const dbIds = new Set(dbLeads.map(l => l.id))
      const prismaIds = new Set(prismaLeads.map(l => l.id))
      const missing = [...dbIds].filter(id => !prismaIds.has(id))
      const extra = [...prismaIds].filter(id => !dbIds.has(id))
      if (missing.length > 0) console.error(`   Missing in Prisma: ${missing.join(', ')}`)
      if (extra.length > 0) console.error(`   Extra in Prisma: ${extra.join(', ')}`)
    }
    
    if (!clientsMatch) {
      console.error(`❌ MISMATCH: Clients count differs!`)
      const dbIds = new Set(dbClients.map(c => c.id))
      const prismaIds = new Set(prismaClients.map(c => c.id))
      const missing = [...dbIds].filter(id => !prismaIds.has(id))
      const extra = [...prismaIds].filter(id => !dbIds.has(id))
      if (missing.length > 0) console.error(`   Missing in Prisma: ${missing.join(', ')}`)
      if (extra.length > 0) console.error(`   Extra in Prisma: ${extra.join(', ')}`)
    }
    
    console.log('\n')
    
    // Test 3: Check for any ownerId distribution
    console.log('='.repeat(60))
    console.log('TEST 3: OwnerId Distribution Analysis')
    console.log('='.repeat(60))
    
    const ownerIdStats = await prisma.$queryRaw`
      SELECT 
        "ownerId",
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE type = 'lead') as lead_count,
        COUNT(*) FILTER (WHERE type = 'client' OR type IS NULL) as client_count
      FROM "Client"
      GROUP BY "ownerId"
      ORDER BY count DESC
    `
    
    console.log(`📊 OwnerId Distribution:`)
    ownerIdStats.forEach(stat => {
      console.log(`   OwnerId: ${stat.ownerId || 'NULL'} - Total: ${stat.count}, Leads: ${stat.lead_count}, Clients: ${stat.client_count}`)
    })
    
    const nullOwnerCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Client"
      WHERE "ownerId" IS NULL
    `
    console.log(`\n   Records with NULL ownerId: ${nullOwnerCount[0]?.count || 0}`)
    
    console.log('\n')
    
    // Test 4: Check for any database-level RLS policies
    console.log('='.repeat(60))
    console.log('TEST 4: Checking for Row Level Security (RLS) Policies')
    console.log('='.repeat(60))
    
    try {
      const rlsPolicies = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          policyname,
          permissive,
          roles,
          cmd,
          qual,
          with_check
        FROM pg_policies
        WHERE tablename = 'Client'
      `
      
      if (rlsPolicies.length === 0) {
        console.log('✅ No RLS policies found on Client table')
      } else {
        console.error(`❌ FOUND ${rlsPolicies.length} RLS POLICIES ON Client TABLE!`)
        rlsPolicies.forEach(policy => {
          console.error(`   Policy: ${policy.policyname}`)
          console.error(`   Command: ${policy.cmd}`)
          console.error(`   Roles: ${policy.roles}`)
          console.error(`   Qual: ${policy.qual}`)
        })
      }
    } catch (e) {
      console.warn(`⚠️ Could not check RLS policies (may require superuser): ${e.message}`)
    }
    
    console.log('\n')
    
    // Test 5: Check database connection info
    console.log('='.repeat(60))
    console.log('TEST 5: Database Connection Info')
    console.log('='.repeat(60))
    
    const dbInfo = await prisma.$queryRaw`
      SELECT 
        current_database() as db_name,
        current_user as db_user,
        session_user as session_user,
        inet_server_addr() as server_addr,
        inet_server_port() as server_port
    `
    
    console.log(`📊 Database Info:`, dbInfo[0])
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL?.substring(0, 50)}...`)
    
    console.log('\n')
    console.log('='.repeat(60))
    console.log('✅ Profile Comparison Test Complete')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

testProfileComparison()
  .then(() => {
    console.log('\n✅ All tests completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error)
    process.exit(1)
  })

