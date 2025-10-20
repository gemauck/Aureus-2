import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createAminUser() {
  try {
    console.log('🔍 Checking for existing amin user...')
    
    const existingUser = await prisma.user.findUnique({
      where: { email: 'amin@abcotronics.com' }
    })
    
    if (existingUser) {
      console.log('✅ Amin user already exists')
      console.log('📧 Email: amin@abcotronics.com')
      console.log('👤 User ID:', existingUser.id)
      console.log('🔑 Has password hash:', !!existingUser.passwordHash)
      return existingUser
    }
    
    console.log('👤 Creating amin user...')
    
    const passwordHash = await bcrypt.hash('password123', 10)
    
    const user = await prisma.user.create({
      data: {
        email: 'amin@abcotronics.com',
        name: 'Amin User',
        passwordHash,
        role: 'ADMIN',
        status: 'active'
      }
    })
    
    console.log('✅ Amin user created successfully!')
    console.log('📧 Email: amin@abcotronics.com')
    console.log('🔑 Password: password123')
    console.log('👤 User ID:', user.id)
    
    return user
  } catch (error) {
    console.error('❌ Error creating amin user:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createAminUser()
    .then(() => {
      console.log('🎉 Amin user setup completed!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Amin user setup failed:', error)
      process.exit(1)
    })
}

export default createAminUser
