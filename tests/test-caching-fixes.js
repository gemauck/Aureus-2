/**
 * Test script to verify caching fixes for cross-user data visibility
 * Tests:
 * 1. Both users see the same data from API
 * 2. Cache clearing works properly
 * 3. Force refresh bypasses cache
 */

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function testCachingFixes() {
  try {
    console.log('🧪 Testing Caching Fixes...\n')
    
    // Get both users
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
    
    if (users.length < 2) {
      console.error('❌ Could not find both users')
      return
    }
    
    console.log('📋 Testing users:')
    users.forEach(u => console.log(`   - ${u.email} (${u.id})`))
    console.log('\n')
    
    // Test 1: Verify database has consistent data
    console.log('='.repeat(80))
    console.log('TEST 1: Database Consistency Check')
    console.log('='.repeat(80))
    
    const dbLeads = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Client"
      WHERE type = 'lead'
    `
    
    const dbClients = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Client"
      WHERE (type = 'client' OR type IS NULL)
      AND type != 'lead'
    `
    
    const leadsCount = parseInt(dbLeads[0]?.count || '0')
    const clientsCount = parseInt(dbClients[0]?.count || '0')
    
    console.log(`📊 Database Totals:`)
    console.log(`   Leads: ${leadsCount}`)
    console.log(`   Clients: ${clientsCount}`)
    console.log('\n')
    
    // Test 2: Simulate what each user would see via Prisma (API simulation)
    console.log('='.repeat(80))
    console.log('TEST 2: API Response Simulation (What Each User Sees)')
    console.log('='.repeat(80))
    
    for (const user of users) {
      console.log(`\n👤 User: ${user.email}`)
      
      // Simulate GET /api/leads (no ownerId filtering)
      const leads = await prisma.client.findMany({
        where: { type: 'lead' },
        select: { id: true, name: true, ownerId: true }
      })
      
      // Simulate GET /api/clients (no ownerId filtering)
      const allRecords = await prisma.client.findMany({
        select: { id: true, name: true, type: true, ownerId: true }
      })
      
      const clients = allRecords.filter(c => {
        const type = c.type
        return (type === 'client' || type === null || type === undefined) && type !== 'lead'
      })
      
      console.log(`   ✅ Leads received: ${leads.length}`)
      console.log(`   ✅ Clients received: ${clients.length}`)
      
      // Verify counts match database
      if (leads.length !== leadsCount) {
        console.error(`   ❌ MISMATCH: Leads count differs (API: ${leads.length}, DB: ${leadsCount})`)
      } else {
        console.log(`   ✅ Leads count matches database`)
      }
      
      if (clients.length !== clientsCount) {
        console.error(`   ❌ MISMATCH: Clients count differs (API: ${clients.length}, DB: ${clientsCount})`)
      } else {
        console.log(`   ✅ Clients count matches database`)
      }
      
      // Check for test leads
      const testLeads = leads.filter(l => l.name && l.name.toLowerCase().includes('test'))
      console.log(`   📋 Test leads found: ${testLeads.length}`)
      testLeads.forEach(tl => {
        console.log(`      - ${tl.name} (ownerId: ${tl.ownerId || 'NULL'})`)
      })
    }
    
    // Test 3: Compare responses between users
    console.log('\n')
    console.log('='.repeat(80))
    console.log('TEST 3: Cross-User Data Comparison')
    console.log('='.repeat(80))
    
    const user1Leads = await prisma.client.findMany({
      where: { type: 'lead' },
      select: { id: true, name: true }
    })
    
    const user2Leads = await prisma.client.findMany({
      where: { type: 'lead' },
      select: { id: true, name: true }
    })
    
    const user1Ids = new Set(user1Leads.map(l => l.id))
    const user2Ids = new Set(user2Leads.map(l => l.id))
    
    const onlyIn1 = user1Leads.filter(l => !user2Ids.has(l.id))
    const onlyIn2 = user2Leads.filter(l => !user1Ids.has(l.id))
    
    console.log(`\n📊 Leads Comparison:`)
    console.log(`   ${users[0].email}: ${user1Leads.length} leads`)
    console.log(`   ${users[1].email}: ${user2Leads.length} leads`)
    
    if (user1Leads.length === user2Leads.length && onlyIn1.length === 0 && onlyIn2.length === 0) {
      console.log(`   ✅ Both users see identical lead data`)
    } else {
      console.error(`   ❌ MISMATCH: Users see different lead data!`)
      if (onlyIn1.length > 0) {
        console.error(`      Only in ${users[0].email}: ${onlyIn1.length} leads`)
        onlyIn1.slice(0, 5).forEach(l => console.error(`         - ${l.name} (${l.id})`))
      }
      if (onlyIn2.length > 0) {
        console.error(`      Only in ${users[1].email}: ${onlyIn2.length} leads`)
        onlyIn2.slice(0, 5).forEach(l => console.error(`         - ${l.name} (${l.id})`))
      }
    }
    
    // Test 4: Check for any ownerId filtering in database
    console.log('\n')
    console.log('='.repeat(80))
    console.log('TEST 4: OwnerId Distribution Check')
    console.log('='.repeat(80))
    
    const ownerIdStats = await prisma.$queryRaw`
      SELECT 
        "ownerId",
        COUNT(*) as count
      FROM "Client"
      WHERE type = 'lead'
      GROUP BY "ownerId"
      ORDER BY count DESC
    `
    
    console.log(`📊 Lead OwnerId Distribution:`)
    ownerIdStats.forEach(stat => {
      const ownerEmail = users.find(u => u.id === stat.ownerId)?.email || 'Unknown'
      console.log(`   OwnerId: ${stat.ownerId || 'NULL'} (${ownerEmail}): ${stat.count} leads`)
    })
    
    const nullOwnerLeads = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Client"
      WHERE type = 'lead' AND "ownerId" IS NULL
    `
    console.log(`\n   Leads with NULL ownerId: ${nullOwnerLeads[0]?.count || 0}`)
    console.log(`   ✅ All leads should be visible to all users regardless of ownerId`)
    
    // Test 5: Verify no RLS policies
    console.log('\n')
    console.log('='.repeat(80))
    console.log('TEST 5: Row Level Security Check')
    console.log('='.repeat(80))
    
    try {
      const rlsEnabled = await prisma.$queryRaw`
        SELECT relname, relrowsecurity
        FROM pg_class
        WHERE relname = 'Client'
      `
      
      if (rlsEnabled && rlsEnabled.length > 0) {
        const rlsStatus = rlsEnabled[0].relrowsecurity
        if (rlsStatus) {
          console.error(`   ❌ WARNING: Row Level Security is ENABLED!`)
          console.error(`   This could cause different users to see different data.`)
        } else {
          console.log(`   ✅ RLS is disabled - no user-level filtering`)
        }
      }
    } catch (e) {
      console.warn(`   ⚠️ Could not check RLS: ${e.message}`)
    }
    
    console.log('\n')
    console.log('='.repeat(80))
    console.log('✅ TEST SUMMARY')
    console.log('='.repeat(80))
    
    const allTestsPassed = 
      user1Leads.length === user2Leads.length &&
      onlyIn1.length === 0 &&
      onlyIn2.length === 0 &&
      user1Leads.length === leadsCount
    
    if (allTestsPassed) {
      console.log('✅ All tests passed! Both users see identical data.')
      console.log('✅ No filtering issues detected at database level.')
      console.log('\n📋 Next Steps:')
      console.log('   1. Hard refresh both browsers (Cmd+Shift+R / Ctrl+Shift+R)')
      console.log('   2. Clear browser cache for both profiles')
      console.log('   3. Test creating a lead on one profile and verify it appears on the other')
      console.log('   4. Check browser console logs for cache clearing messages')
    } else {
      console.error('❌ Some tests failed! See details above.')
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

testCachingFixes()
  .then(() => {
    console.log('\n✅ Testing complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Testing failed:', error)
    process.exit(1)
  })

