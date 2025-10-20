import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createAdminUser() {
  try {
    console.log('🔍 Checking for existing admin user...')
    
    const existingUser = await prisma.user.findUnique({
      where: { email: 'admin@abcotronics.com' }
    })
    
    if (existingUser) {
      console.log('✅ Admin user already exists')
      console.log('📧 Email: admin@abcotronics.com')
      console.log('🔑 Password: admin123')
      console.log('👤 User ID:', existingUser.id)
      return existingUser
    }
    
    console.log('👤 Creating admin user...')
    
    const passwordHash = await bcrypt.hash('admin123', 10)
    
    const user = await prisma.user.create({
      data: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash,
        role: 'ADMIN',
        status: 'active'
      }
    })
    
    console.log('✅ Admin user created successfully!')
    console.log('📧 Email: admin@abcotronics.com')
    console.log('🔑 Password: admin123')
    console.log('👤 User ID:', user.id)
    
    return user
  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createAdminUser()
    .then(() => {
      console.log('🎉 Admin user setup completed!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Admin user setup failed:', error)
      process.exit(1)
    })
}

export default createAdminUser
