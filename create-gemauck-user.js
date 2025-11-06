// Create or update user gemauck@gmail.com
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createOrUpdateUser() {
  try {
    const email = 'gemauck@gmail.com'
    const password = 'GazMauck1989*'
    const name = 'Gareth Mauck'
    
    // Check if user exists
    let user = await prisma.user.findUnique({ where: { email } })
    
    const passwordHash = await bcrypt.hash(password, 10)
    
    if (user) {
      // Update existing user
      console.log('User exists, updating password...')
      user = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash }
      })
      console.log('✅ Password updated for:', user.email)
    } else {
      // Create new user
      console.log('User not found, creating...')
      user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'admin',
          status: 'active',
          provider: 'local'
        }
      })
      console.log('✅ User created:', user.email)
    }
    
    // Verify password
    const match = await bcrypt.compare(password, user.passwordHash)
    console.log('Password verification:', match ? '✅ Match' : '❌ No match')
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

createOrUpdateUser()

