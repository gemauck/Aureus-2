// Test script to verify groups are returned in production API
import fetch from 'node-fetch'

const PRODUCTION_URL = 'https://abcoafrica.co.za'

async function testGroupsInProduction() {
  console.log('🧪 Testing Groups in Production API...\n')
  console.log(`📍 Testing: ${PRODUCTION_URL}\n`)
  
  try {
    // Test 1: Check health endpoint
    console.log('1️⃣  Testing health endpoint...')
    const healthResponse = await fetch(`${PRODUCTION_URL}/api/health`)
    const healthData = await healthResponse.json()
    console.log(`   ✅ Health: ${healthData.status || 'ok'}`)
    console.log(`   ✅ Database: ${healthData.database || 'unknown'}\n`)
    
    // Test 2: Check clients API (requires auth, but we can check the response structure)
    console.log('2️⃣  Testing clients API endpoint...')
    const clientsResponse = await fetch(`${PRODUCTION_URL}/api/clients`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (clientsResponse.status === 401) {
      console.log('   ⚠️  Authentication required (expected)')
      console.log('   ℹ️  This is normal - the endpoint exists and requires login\n')
    } else if (clientsResponse.ok) {
      const clientsData = await clientsResponse.json()
      const clients = Array.isArray(clientsData) ? clientsData : (clientsData.data || clientsData.clients || [])
      
      // Count by type
      const typeCounts = {}
      clients.forEach(client => {
        const type = client.type || 'null'
        typeCounts[type] = (typeCounts[type] || 0) + 1
      })
      
      console.log(`   ✅ Clients API returned ${clients.length} records`)
      console.log('   📊 Breakdown by type:')
      Object.keys(typeCounts).sort().forEach(type => {
        console.log(`      - ${type}: ${typeCounts[type]}`)
      })
      
      // Check for groups
      const groups = clients.filter(c => c.type === 'group')
      if (groups.length > 0) {
        console.log(`\n   ✅ SUCCESS: Found ${groups.length} groups!`)
        console.log('   📋 Groups found:')
        groups.forEach(group => {
          console.log(`      - ${group.name} (ID: ${group.id})`)
        })
      } else {
        console.log('\n   ⚠️  No groups found in response')
      }
    } else {
      console.log(`   ⚠️  Unexpected status: ${clientsResponse.status}`)
    }
    
    // Test 3: Check debug endpoint if available
    console.log('\n3️⃣  Testing debug endpoint...')
    const debugResponse = await fetch(`${PRODUCTION_URL}/api/debug-leads-clients`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (debugResponse.ok) {
      const debugData = await debugResponse.json()
      console.log('   ✅ Debug endpoint accessible')
      console.log(`   📊 Clients count: ${debugData.clients?.prismaCount || 'N/A'}`)
      console.log(`   📊 Leads count: ${debugData.leads?.prismaCount || 'N/A'}`)
      
      if (debugData.clients?.rawSqlDetails) {
        const groupClients = debugData.clients.rawSqlDetails.filter(c => c.type === 'group')
        if (groupClients.length > 0) {
          console.log(`\n   ✅ Found ${groupClients.length} groups in database:`)
          groupClients.forEach(g => {
            console.log(`      - ${g.name}`)
          })
        }
      }
    } else if (debugResponse.status === 401) {
      console.log('   ⚠️  Authentication required (expected)')
    } else {
      console.log(`   ⚠️  Debug endpoint not available (status: ${debugResponse.status})`)
    }
    
    console.log('\n✅ Testing complete!')
    console.log('\n💡 To fully test, you need to:')
    console.log('   1. Log in to the production site')
    console.log('   2. Navigate to the Clients page')
    console.log('   3. Verify that groups appear in the list')
    console.log('   4. Check that all 5 groups are visible:')
    console.log('      - Samancor Group')
    console.log('      - Seriti Group')
    console.log('      - Afarak Group')
    console.log('      - Thungela Group')
    console.log('      - Exxaro Group')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    throw error
  }
}

testGroupsInProduction()
  .then(() => {
    console.log('\n✅ All tests completed!')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error)
    process.exit(1)
  })

