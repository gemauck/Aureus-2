import { prisma } from './_lib/prisma.js'
import bcrypt from 'bcryptjs'

async function createDefaultUser() {
  try {
    console.log('🔍 Checking for existing admin user...')
    
    const existingUser = await prisma.user.findUnique({
      where: { email: 'admin@abcotronics.com' }
    })
    
    if (existingUser) {
      console.log('✅ Admin user already exists')
      return existingUser
    }
    
    console.log('👤 Creating default admin user...')
    
    const passwordHash = await bcrypt.hash('admin123', 10)
    
    const user = await prisma.user.create({
      data: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash,
        role: 'ADMIN'
      }
    })
    
    console.log('✅ Admin user created successfully!')
    console.log('📧 Email: admin@abcotronics.com')
    console.log('🔑 Password: admin123')
    
    return user
  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    throw error
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createDefaultUser()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}

export default createDefaultUser
