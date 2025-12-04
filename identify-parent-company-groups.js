// Script to identify groups that were created as parent companies
// These can be safely deleted if they have no other purpose

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function identifyParentCompanyGroups() {
  try {
    console.log('🔍 Identifying groups that were used as parent companies...\n')
    
    // Find all clients that have childCompanies (were used as parent companies)
    // Note: This query will fail after migration, but useful before migration
    const parentCompanies = await prisma.$queryRaw`
      SELECT 
        c.id,
        c.name,
        c.type,
        COUNT(child.id) as child_count
      FROM "Client" c
      LEFT JOIN "Client" child ON child."parentGroupId" = c.id
      WHERE child."parentGroupId" IS NOT NULL
      GROUP BY c.id, c.name, c.type
      ORDER BY child_count DESC
    `
    
    console.log('📊 Groups/Companies that were used as parent companies:')
    console.log('=' .repeat(60))
    
    if (parentCompanies.length === 0) {
      console.log('✅ No parent companies found (all parentGroupId already null)')
    } else {
      parentCompanies.forEach((pc, index) => {
        console.log(`\n${index + 1}. ${pc.name} (${pc.type})`)
        console.log(`   ID: ${pc.id}`)
        console.log(`   Child Companies: ${pc.child_count}`)
        console.log(`   ⚠️  This group was used as a parent company`)
        console.log(`   💡 Consider deleting if it has no other purpose`)
      })
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('\n⚠️  IMPORTANT: Review the list above before deleting any groups.')
    console.log('   Only delete groups that:')
    console.log('   1. Have type="group" (not regular clients)')
    console.log('   2. Have no groupChildren (not used in group memberships)')
    console.log('   3. Have no projects, invoices, or other important data')
    console.log('\n✅ After migration, parentGroupId field will be removed from schema.')
    
  } catch (error) {
    if (error.message.includes('parentGroupId') || error.message.includes('does not exist')) {
      console.log('✅ Migration already applied - parentGroupId field no longer exists')
      console.log('   This script is no longer needed.')
    } else {
      console.error('❌ Error:', error.message)
    }
  } finally {
    await prisma.$disconnect()
  }
}

identifyParentCompanyGroups()

