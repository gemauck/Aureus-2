// Reset gregk@abcotronics.co.za password
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function resetGregkPassword() {
  try {
    const email = 'gregk@abcotronics.co.za'
    // Get password from command line, or use a default temporary password
    const newPassword = process.argv[2] || 'TempPass123!'
    
    console.log('🔐 Resetting password for:', email)
    console.log('')
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        status: true
      }
    })
    
    if (!user) {
      console.log('❌ User not found')
      return
    }
    
    console.log('✅ User found:')
    console.log('  Name:', user.name)
    console.log('  Email:', user.email)
    console.log('  Status:', user.status)
    console.log('')
    
    // Hash the new password
    const saltRounds = 10
    const passwordHash = await bcrypt.hash(newPassword, saltRounds)
    
    console.log('🔑 Hashing new password...')
    console.log('  Hash prefix:', passwordHash.substring(0, 30) + '...')
    console.log('')
    
    // Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true // Force password change on next login for security
      }
    })
    
    console.log('✅ Password reset successfully!')
    console.log('')
    console.log('📝 New Login Credentials:')
    console.log('  Email:', email)
    console.log('  Temporary Password:', newPassword)
    console.log('')
    console.log('⚠️  IMPORTANT:')
    console.log('   1. Share this password with Greg securely')
    console.log('   2. User will be required to change password on first login')
    console.log('   3. Consider using a secure channel (not email)')
    console.log('')
    console.log('💡 To set a different password, run:')
    console.log('   node reset-gregk-password.js <your-password>')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

resetGregkPassword()




