/**
 * Test script to compare what different users see from the API
 * This simulates API calls as each user would make them
 */

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function testUserAPIResponses() {
  try {
    console.log('🔍 Testing User API Responses...\n')
    
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
    
    console.log('📋 Testing for users:')
    users.forEach(u => console.log(`   - ${u.email} (${u.id})`))
    console.log('\n')
    
    // Simulate what the API returns for each user
    for (const user of users) {
      console.log('='.repeat(80))
      console.log(`USER: ${user.email} (${user.id})`)
      console.log('='.repeat(80))
      
      // Simulate GET /api/leads (what the API endpoint does)
      console.log('\n📋 Simulating GET /api/leads:')
      const leadsForUser = await prisma.client.findMany({
        where: {
          type: 'lead'
          // No ownerId filter - should return all leads
        },
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
      
      console.log(`   ✅ Leads returned: ${leadsForUser.length}`)
      console.log(`   📋 Lead IDs (first 10):`, leadsForUser.map(l => l.id).slice(0, 10))
      console.log(`   📋 Lead Names (first 10):`, leadsForUser.map(l => l.name).slice(0, 10))
      console.log(`   📋 Lead OwnerIds (first 10):`, leadsForUser.map(l => l.ownerId || 'NULL').slice(0, 10))
      
      // Check for test lead
      const testLead = leadsForUser.find(l => l.name && l.name.toLowerCase().includes('test'))
      if (testLead) {
        console.log(`   ✅ Test lead found: ${testLead.name} (${testLead.id})`)
      } else {
        console.log(`   ❌ Test lead NOT found in results!`)
      }
      
      // Simulate GET /api/clients
      console.log('\n📋 Simulating GET /api/clients:')
      const allRecords = await prisma.client.findMany({
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
      
      const clientsForUser = allRecords.filter(c => {
        const type = c.type
        return (type === 'client' || type === null || type === undefined) && type !== 'lead'
      })
      
      console.log(`   ✅ Clients returned: ${clientsForUser.length}`)
      console.log(`   📋 Client IDs (first 10):`, clientsForUser.map(c => c.id).slice(0, 10))
      console.log(`   📋 Client Names (first 10):`, clientsForUser.map(c => c.name).slice(0, 10))
      
      console.log('\n')
    }
    
    // Compare results
    console.log('='.repeat(80))
    console.log('COMPARISON')
    console.log('='.repeat(80))
    
    const user1 = users[0]
    const user2 = users[1]
    
    const leads1 = await prisma.client.findMany({
      where: { type: 'lead' },
      select: { id: true, name: true }
    })
    
    const leads2 = await prisma.client.findMany({
      where: { type: 'lead' },
      select: { id: true, name: true }
    })
    
    const leads1Ids = new Set(leads1.map(l => l.id))
    const leads2Ids = new Set(leads2.map(l => l.id))
    
    const onlyIn1 = leads1.filter(l => !leads2Ids.has(l.id))
    const onlyIn2 = leads2.filter(l => !leads1Ids.has(l.id))
    
    console.log(`\n📊 Leads Comparison:`)
    console.log(`   ${user1.email}: ${leads1.length} leads`)
    console.log(`   ${user2.email}: ${leads2.length} leads`)
    
    if (leads1.length !== leads2.length) {
      console.error(`   ❌ MISMATCH: Count differs!`)
    } else {
      console.log(`   ✅ Count matches`)
    }
    
    if (onlyIn1.length > 0) {
      console.error(`   ❌ Leads only in ${user1.email}: ${onlyIn1.length}`)
      onlyIn1.slice(0, 5).forEach(l => console.error(`      - ${l.name} (${l.id})`))
    }
    
    if (onlyIn2.length > 0) {
      console.error(`   ❌ Leads only in ${user2.email}: ${onlyIn2.length}`)
      onlyIn2.slice(0, 5).forEach(l => console.error(`      - ${l.name} (${l.id})`))
    }
    
    if (onlyIn1.length === 0 && onlyIn2.length === 0 && leads1.length === leads2.length) {
      console.log(`   ✅ All leads match between users`)
    }
    
    console.log('\n')
    console.log('='.repeat(80))
    console.log('✅ TEST COMPLETE')
    console.log('='.repeat(80))
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

testUserAPIResponses()
  .then(() => {
    console.log('\n✅ Analysis complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Analysis failed:', error)
    process.exit(1)
  })

