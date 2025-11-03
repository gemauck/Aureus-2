// Migrate user from old SQLite database to PostgreSQL
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrateUser() {
  try {
    // The user data from SQLite
    const userData = {
      id: 'cmh04ruv20000hqimthx2gjcp',
      email: 'admin@abcotronics.com',
      name: 'Admin User',
      passwordHash: '$2a$10$xM2j4k.7ADbObqcbECHbH.ulbCl9RgYxiJtWhrVBzJANfIq46ruGi',
      role: 'admin',
      status: 'active',
      provider: 'local'
    }

    console.log('🔍 Checking if user already exists...')
    
    const existing = await prisma.user.findUnique({
      where: { email: userData.email }
    })

    if (existing) {
      console.log('✅ User already exists:', existing.email)
      console.log('📧 Email:', existing.email)
      console.log('👤 Name:', existing.name)
      console.log('🔐 Role:', existing.role)
      return
    }

    console.log('✨ Creating user in PostgreSQL...')
    
    const user = await prisma.user.create({
      data: userData
    })

    console.log('✅ User migrated successfully!')
    console.log('📧 Email: admin@abcotronics.com')
    console.log('🔑 Password: [from old database]')
    console.log('👤 Name:', user.name)
    console.log('🔐 Role:', user.role)
    
  } catch (error) {
    console.error('❌ Error migrating user:', error)
  } finally {
    await prisma.$disconnect()
  }
}

migrateUser()

