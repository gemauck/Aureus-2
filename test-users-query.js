// Test users query directly
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

async function testQuery() {
  try {
    console.log('🔍 Testing users query...')
    
    // Test 1: Count all users
    const totalCount = await prisma.user.count()
    console.log(`✅ Total users in database: ${totalCount}`)
    
    // Test 2: Get all users (admin query)
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })
    console.log(`✅ Users found: ${allUsers.length}`)
    console.log('First 5 users:', allUsers.slice(0, 5).map(u => ({ email: u.email, name: u.name, role: u.role })))
    
    // Test 3: Check status distribution
    const byStatus = await prisma.user.groupBy({
      by: ['status'],
      _count: true
    })
    console.log('Users by status:', byStatus)
    
    // Test 4: Check if any have inactive status
    const inactive = await prisma.user.findMany({
      where: { status: 'inactive' },
      select: { email: true, status: true }
    })
    console.log(`Inactive users: ${inactive.length}`)
    
    // Test 5: Clients count
    const clientsCount = await prisma.client.count()
    console.log(`✅ Total clients in database: ${clientsCount}`)
    
    // Test 6: Projects count
    const projectsCount = await prisma.project.count()
    console.log(`✅ Total projects in database: ${projectsCount}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

testQuery()

