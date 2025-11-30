import { prisma } from './_lib/prisma.js'
import bcrypt from 'bcryptjs'

async function createDefaultUser() {
  try {
    
    const existingUser = await prisma.user.findUnique({
      where: { email: 'admin@abcotronics.com' }
    })
    
    if (existingUser) {
      return existingUser
    }
    
    
    const passwordHash = await bcrypt.hash('admin123', 10)
    
    const user = await prisma.user.create({
      data: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash,
        role: 'ADMIN'
      }
    })
    
    
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
