/**
 * Server-side script to compare what different users see
 * This simulates API calls for both users and compares results
 */

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function compareUserViews() {
  try {
    console.log('🔍 Comparing User Views...\n')
    
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
      console.log('Found users:', users)
      return
    }
    
    console.log('📋 Found users:')
    users.forEach(u => console.log(`   - ${u.email} (${u.id})`))
    console.log('\n')
    
    // Get ALL leads from database directly (baseline)
    console.log('='.repeat(80))
    console.log('BASELINE: Direct Database Query (No User Context)')
    console.log('='.repeat(80))
    
    const allLeadsRaw = await prisma.$queryRaw`
      SELECT id, name, type, "ownerId", "createdAt"
      FROM "Client"
      WHERE type = 'lead'
      ORDER BY "createdAt" DESC
    `
    
    const allClientsRaw = await prisma.$queryRaw`
      SELECT id, name, type, "ownerId", "createdAt"
      FROM "Client"
      WHERE (type = 'client' OR type IS NULL)
      AND type != 'lead'
      ORDER BY "createdAt" DESC
    `
    
    console.log(`📊 Direct SQL Query Results:`)
    console.log(`   Leads: ${allLeadsRaw.length}`)
    console.log(`   Clients: ${allClientsRaw.length}`)
    console.log(`   Lead IDs:`, allLeadsRaw.map(l => l.id).slice(0, 10))
    console.log(`   Lead Names:`, allLeadsRaw.map(l => l.name).slice(0, 10))
    console.log(`   Lead OwnerIds:`, allLeadsRaw.map(l => l.ownerId || 'NULL').slice(0, 10))
    console.log('\n')
    
    // Test Prisma queries (what the API would return)
    console.log('='.repeat(80))
    console.log('TEST: Prisma Query (What API Returns)')
    console.log('='.repeat(80))
    
    const prismaLeads = await prisma.client.findMany({
      where: { type: 'lead' },
      select: { 
        id: true, 
        name: true, 
        type: true, 
        ownerId: true, 
        createdAt: true 
      },
      orderBy: { createdAt: 'desc' }
    })
    
    // Get all records and filter in memory (Prisma doesn't handle null in OR well)
    const allRecords = await prisma.client.findMany({
      select: { 
        id: true, 
        name: true, 
        type: true, 
        ownerId: true, 
        createdAt: true 
      },
      orderBy: { createdAt: 'desc' }
    })
    
    const prismaClients = allRecords.filter(c => {
      const type = c.type
      return (type === 'client' || type === null || type === undefined) && type !== 'lead'
    })
    
    console.log(`📊 Prisma Query Results:`)
    console.log(`   Leads: ${prismaLeads.length}`)
    console.log(`   Clients: ${prismaClients.length}`)
    console.log(`   Lead IDs:`, prismaLeads.map(l => l.id).slice(0, 10))
    console.log(`   Lead Names:`, prismaLeads.map(l => l.name).slice(0, 10))
    console.log(`   Lead OwnerIds:`, prismaLeads.map(l => l.ownerId || 'NULL').slice(0, 10))
    
    // Compare counts
    const leadsMatch = allLeadsRaw.length === prismaLeads.length
    const clientsMatch = allClientsRaw.length === prismaClients.length
    
    console.log(`\n✅ Leads count match: ${leadsMatch} (SQL: ${allLeadsRaw.length}, Prisma: ${prismaLeads.length})`)
    console.log(`✅ Clients count match: ${clientsMatch} (SQL: ${allClientsRaw.length}, Prisma: ${prismaClients.length})`)
    
    if (!leadsMatch) {
      console.error(`\n❌ MISMATCH DETECTED: Leads count differs!`)
      const sqlIds = new Set(allLeadsRaw.map(l => l.id))
      const prismaIds = new Set(prismaLeads.map(l => l.id))
      const missing = [...sqlIds].filter(id => !prismaIds.has(id))
      const extra = [...prismaIds].filter(id => !sqlIds.has(id))
      if (missing.length > 0) {
        console.error(`   Missing in Prisma: ${missing.length} leads`)
        missing.slice(0, 10).forEach(id => {
          const lead = allLeadsRaw.find(l => l.id === id)
          console.error(`     - ${lead?.name} (${id}, ownerId: ${lead?.ownerId || 'NULL'})`)
        })
      }
      if (extra.length > 0) {
        console.error(`   Extra in Prisma: ${extra.length} leads`)
        extra.slice(0, 10).forEach(id => {
          const lead = prismaLeads.find(l => l.id === id)
          console.error(`     - ${lead?.name} (${id}, ownerId: ${lead?.ownerId || 'NULL'})`)
        })
      }
    }
    
    if (!clientsMatch) {
      console.error(`\n❌ MISMATCH DETECTED: Clients count differs!`)
      const sqlIds = new Set(allClientsRaw.map(c => c.id))
      const prismaIds = new Set(prismaClients.map(c => c.id))
      const missing = [...sqlIds].filter(id => !prismaIds.has(id))
      const extra = [...prismaIds].filter(id => !sqlIds.has(id))
      if (missing.length > 0) {
        console.error(`   Missing in Prisma: ${missing.length} clients`)
        missing.slice(0, 10).forEach(id => {
          const client = allClientsRaw.find(c => c.id === id)
          console.error(`     - ${client?.name} (${id}, ownerId: ${client?.ownerId || 'NULL'})`)
        })
      }
      if (extra.length > 0) {
        console.error(`   Extra in Prisma: ${extra.length} clients`)
        extra.slice(0, 10).forEach(id => {
          const client = prismaClients.find(c => c.id === id)
          console.error(`     - ${client?.name} (${id}, ownerId: ${client?.ownerId || 'NULL'})`)
        })
      }
    }
    
    console.log('\n')
    
    // Check ownerId distribution
    console.log('='.repeat(80))
    console.log('OWNER ID DISTRIBUTION ANALYSIS')
    console.log('='.repeat(80))
    
    const ownerIdStats = await prisma.$queryRaw`
      SELECT 
        "ownerId",
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE type = 'lead') as lead_count,
        COUNT(*) FILTER (WHERE type = 'client' OR type IS NULL) as client_count
      FROM "Client"
      GROUP BY "ownerId"
      ORDER BY total_count DESC
    `
    
    console.log(`📊 OwnerId Distribution:`)
    ownerIdStats.forEach(stat => {
      const ownerEmail = users.find(u => u.id === stat.ownerId)?.email || 'Unknown'
      console.log(`   OwnerId: ${stat.ownerId || 'NULL'} (${ownerEmail})`)
      console.log(`      Total: ${stat.total_count}, Leads: ${stat.lead_count}, Clients: ${stat.client_count}`)
    })
    
    const nullOwnerCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Client"
      WHERE "ownerId" IS NULL
    `
    console.log(`\n   Records with NULL ownerId: ${nullOwnerCount[0]?.count || 0}`)
    
    // Check for specific test leads
    console.log('\n')
    console.log('='.repeat(80))
    console.log('TEST LEAD ANALYSIS')
    console.log('='.repeat(80))
    
    const testLeads = allLeadsRaw.filter(l => 
      l.name && l.name.toLowerCase().includes('test')
    )
    
    console.log(`📋 Found ${testLeads.length} test leads:`)
    testLeads.forEach(lead => {
      console.log(`   - ${lead.name} (ID: ${lead.id}, OwnerId: ${lead.ownerId || 'NULL'})`)
    })
    
    // Check if test leads are in Prisma results
    const testLeadIds = new Set(testLeads.map(l => l.id))
    const prismaTestLeads = prismaLeads.filter(l => testLeadIds.has(l.id))
    console.log(`\n   Test leads in Prisma results: ${prismaTestLeads.length}/${testLeads.length}`)
    
    if (prismaTestLeads.length < testLeads.length) {
      console.error(`   ❌ MISSING TEST LEADS IN PRISMA RESULTS!`)
      testLeads.forEach(lead => {
        const found = prismaLeads.find(l => l.id === lead.id)
        if (!found) {
          console.error(`      Missing: ${lead.name} (${lead.id}, ownerId: ${lead.ownerId || 'NULL'})`)
        }
      })
    }
    
    console.log('\n')
    
    // Check for RLS policies
    console.log('='.repeat(80))
    console.log('ROW LEVEL SECURITY CHECK')
    console.log('='.repeat(80))
    
    try {
      const rlsEnabled = await prisma.$queryRaw`
        SELECT relname, relrowsecurity
        FROM pg_class
        WHERE relname = 'Client'
      `
      
      if (rlsEnabled && rlsEnabled.length > 0) {
        const rlsStatus = rlsEnabled[0].relrowsecurity
        console.log(`   RLS Enabled: ${rlsStatus}`)
        
        if (rlsStatus) {
          console.error(`   ❌ WARNING: Row Level Security is ENABLED on Client table!`)
          console.error(`   This could cause different users to see different data.`)
          
          const policies = await prisma.$queryRaw`
            SELECT 
              policyname,
              cmd,
              roles,
              qual::text,
              with_check::text
            FROM pg_policies
            WHERE tablename = 'Client'
          `
          
          if (policies.length > 0) {
            console.error(`\n   Found ${policies.length} RLS policies:`)
            policies.forEach(policy => {
              console.error(`     Policy: ${policy.policyname}`)
              console.error(`       Command: ${policy.cmd}`)
              console.error(`       Roles: ${policy.roles}`)
              console.error(`       Qual: ${policy.qual}`)
            })
          }
        } else {
          console.log(`   ✅ RLS is disabled - no user-level filtering`)
        }
      }
    } catch (e) {
      console.warn(`   ⚠️ Could not check RLS (may require superuser): ${e.message}`)
    }
    
    console.log('\n')
    console.log('='.repeat(80))
    console.log('DATABASE CONNECTION INFO')
    console.log('='.repeat(80))
    
    const dbInfo = await prisma.$queryRaw`
      SELECT 
        current_database() as db_name,
        current_user as db_user,
        session_user as session_user
    `
    
    console.log(`   Database: ${dbInfo[0]?.db_name}`)
    console.log(`   User: ${dbInfo[0]?.db_user}`)
    console.log(`   Session User: ${dbInfo[0]?.session_user}`)
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL?.substring(0, 60)}...`)
    
    console.log('\n')
    console.log('='.repeat(80))
    console.log('✅ COMPARISON COMPLETE')
    console.log('='.repeat(80))
    
  } catch (error) {
    console.error('❌ Comparison failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

compareUserViews()
  .then(() => {
    console.log('\n✅ Analysis complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Analysis failed:', error)
    process.exit(1)
  })

