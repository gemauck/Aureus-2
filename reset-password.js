// Reset user password
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function resetPassword() {
  try {
    const email = 'garethm@abcotronics.co.za'
    const newPassword = process.argv[2] || 'TempPassword123!' // Get password from command line
    
    console.log('🔐 Resetting password for:', email)
    
    const user = await prisma.user.findUnique({
      where: { email }
    })
    
    if (!user) {
      console.log('❌ User not found')
      return
    }
    
    console.log('✅ User found:', user.name)
    
    // Hash the new password
    const saltRounds = 10
    const passwordHash = await bcrypt.hash(newPassword, saltRounds)
    
    console.log('🔑 Hashing new password...')
    console.log('  Hash:', passwordHash.substring(0, 30) + '...')
    
    // Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false // Clear the must change password flag
      }
    })
    
    console.log('✅ Password reset successfully!')
    console.log('  New password:', newPassword)
    console.log('  mustChangePassword cleared')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

resetPassword()

