// Reset password for user on server
// Run this on the server: node reset-user-password-server.js [newPassword]
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

// Create Prisma client with connection pool management
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

async function resetPassword() {
  try {
    const email = 'garethm@abcotronics.co.za'
    const newPassword = process.argv[2] || 'Abcotronics2024!'
    
    console.log('🔐 Resetting password for:', email)
    console.log('')
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true
      }
    })
    
    if (!user) {
      console.log('❌ User not found')
      process.exit(1)
    }
    
    console.log('✅ User found:')
    console.log('  Name:', user.name)
    console.log('  Email:', user.email)
    console.log('  Role:', user.role)
    console.log('  Status:', user.status)
    console.log('')
    
    // Hash the new password
    console.log('🔑 Hashing new password...')
    const passwordHash = await bcrypt.hash(newPassword, 10)
    
    // Update the user
    console.log('💾 Updating password in database...')
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false
      }
    })
    
    console.log('✅ Password reset successfully!')
    console.log('')
    console.log('📝 New password:', newPassword)
    console.log('')
    console.log('💡 The user can now login with this password')
    console.log('   They should change it after first login for security')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.code === 'P2037') {
      console.error('')
      console.error('💡 Database connection pool exhausted.')
      console.error('   This usually means too many connections are open.')
      console.error('   Try restarting the server: pm2 restart abcotronics-erp')
      console.error('   Then run this script again.')
    }
    process.exit(1)
  } finally {
    // Ensure connection is closed
    try {
      await prisma.$disconnect()
    } catch (e) {
      // Ignore disconnect errors
    }
  }
}

// Run the reset
resetPassword().catch(console.error)

