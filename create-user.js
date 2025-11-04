// Create user account
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function createUser() {
  try {
    const email = 'garethm@abcotronics.co.za'
    const name = 'Gareth M' // Update with actual name if needed
    const role = 'admin' // or 'user', 'manager', etc.
    const tempPassword = 'TempPass123!' // Change this to a secure password
    
    console.log('🔍 Checking if user exists:', email)
    
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    })
    
    if (existing) {
      console.log('❌ User already exists!')
      console.log('  ID:', existing.id)
      console.log('  Name:', existing.name)
      console.log('  Status:', existing.status)
      console.log('')
      console.log('💡 To reset the password, use: node check-and-fix-user.js --fix')
      return
    }
    
    console.log('✅ User does not exist, creating...')
    console.log('')
    
    // Hash password
    const passwordHash = await bcrypt.hash(tempPassword, 10)
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role,
        status: 'active',
        provider: 'local',
        mustChangePassword: true // Force password change on first login
      }
    })
    
    console.log('✅ User created successfully!')
    console.log('')
    console.log('📋 User details:')
    console.log('  ID:', user.id)
    console.log('  Name:', user.name)
    console.log('  Email:', user.email)
    console.log('  Role:', user.role)
    console.log('  Status:', user.status)
    console.log('')
    console.log('🔑 Temporary password:', tempPassword)
    console.log('')
    console.log('⚠️  IMPORTANT:')
    console.log('   1. Share this password with the user securely')
    console.log('   2. User will be required to change password on first login')
    console.log('   3. Consider using a password manager or secure channel')
    console.log('')
    console.log('✅ User can now login with:')
    console.log('   Email:', email)
    console.log('   Password:', tempPassword)
    
  } catch (error) {
    console.error('❌ Error creating user:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

createUser()

