// Script to check what type values exist in the Client table
import { prisma } from '../api/_lib/prisma.js'

async function checkClientTypes() {
  try {
    console.log('🔍 Checking Client table type values...\n')
    
    // Get all clients with their type values
    const allClients = await prisma.$queryRaw`
      SELECT id, name, type, "createdAt"
      FROM "Client"
      ORDER BY "createdAt" DESC
    `
    
    console.log(`Total records in Client table: ${allClients.length}\n`)
    
    // Group by type value
    const typeGroups = {}
    allClients.forEach(client => {
      const typeValue = client.type === null ? 'NULL' : (client.type === '' ? 'EMPTY_STRING' : client.type)
      if (!typeGroups[typeValue]) {
        typeGroups[typeValue] = []
      }
      typeGroups[typeValue].push({
        id: client.id,
        name: client.name
      })
    })
    
    console.log('📊 Breakdown by type value:')
    console.log('='.repeat(60))
    Object.keys(typeGroups).sort().forEach(typeValue => {
      const count = typeGroups[typeValue].length
      console.log(`\nType: ${typeValue === 'NULL' ? 'NULL' : `"${typeValue}"`} - Count: ${count}`)
      if (count <= 10) {
        console.log('  Examples:')
        typeGroups[typeValue].slice(0, 5).forEach(c => {
          console.log(`    - ${c.name} (ID: ${c.id})`)
        })
      } else {
        console.log('  Examples (first 5):')
        typeGroups[typeValue].slice(0, 5).forEach(c => {
          console.log(`    - ${c.name} (ID: ${c.id})`)
        })
      }
    })
    
    // Check what would be returned by current API filters (using raw SQL since Prisma might have schema issues)
    const clientsByApiFilter = await prisma.$queryRaw`
      SELECT id, name, type
      FROM "Client"
      WHERE (type = 'client' OR type = 'group' OR type IS NULL)
      AND type != 'lead'
    `
    
    const leadsByApiFilter = await prisma.$queryRaw`
      SELECT id, name, type
      FROM "Client"
      WHERE type = 'lead'
    `
    
    console.log('\n\n📈 What APIs would return:')
    console.log('='.repeat(60))
    console.log(`Clients API (type='client' OR type='group' OR type=NULL): ${clientsByApiFilter.length} records`)
    console.log(`Leads API (type='lead'): ${leadsByApiFilter.length} records`)
    console.log(`Total returned by APIs: ${clientsByApiFilter.length + leadsByApiFilter.length} records`)
    console.log(`Missing from APIs: ${allClients.length - (clientsByApiFilter.length + leadsByApiFilter.length)} records`)
    
    // Find records that wouldn't be returned by either API
    const allReturnedIds = new Set([
      ...clientsByApiFilter.map(c => c.id),
      ...leadsByApiFilter.map(l => l.id)
    ])
    
    const missingFromApis = allClients.filter(c => !allReturnedIds.has(c.id))
    
    if (missingFromApis.length > 0) {
      console.log('\n\n⚠️  Records NOT returned by either API:')
      console.log('='.repeat(60))
      missingFromApis.forEach(client => {
        const typeDisplay = client.type === null ? 'NULL' : (client.type === '' ? 'EMPTY_STRING' : `"${client.type}"`)
        console.log(`  - ${client.name} (ID: ${client.id}, Type: ${typeDisplay})`)
      })
    }
    
    // Check for group memberships
    try {
      const clientsWithGroups = await prisma.$queryRaw`
        SELECT c.id, c.name, c.type, COUNT(ccg.id) as group_count
        FROM "Client" c
        LEFT JOIN "ClientCompanyGroup" ccg ON ccg."clientId" = c.id
        GROUP BY c.id, c.name, c.type
        HAVING COUNT(ccg.id) > 0
        ORDER BY group_count DESC
        LIMIT 20
      `
      
      if (clientsWithGroups.length > 0) {
        console.log('\n\n👥 Clients with group memberships:')
        console.log('='.repeat(60))
        clientsWithGroups.forEach(client => {
          const typeDisplay = client.type === null ? 'NULL' : (client.type === '' ? 'EMPTY_STRING' : `"${client.type}"`)
          console.log(`  - ${client.name} (ID: ${client.id}, Type: ${typeDisplay}, Groups: ${client.group_count})`)
        })
      }
    } catch (groupError) {
      console.log('\n⚠️  Could not check group memberships:', groupError.message)
    }
    
  } catch (error) {
    console.error('❌ Error checking client types:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

checkClientTypes()
  .then(() => {
    console.log('\n✅ Check complete!')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

