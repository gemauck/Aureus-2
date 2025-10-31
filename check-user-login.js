// Check user login status
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function checkUser() {
  try {
    const email = 'garethm@abcotronics.co.za'
    console.log('🔍 Checking user:', email)
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        passwordHash: true,
        role: true,
        mustChangePassword: true
      }
    })
    
    if (!user) {
      console.log('❌ User not found in database')
      return
    }
    
    console.log('✅ User found:')
    console.log('  ID:', user.id)
    console.log('  Name:', user.name)
    console.log('  Email:', user.email)
    console.log('  Role:', user.role)
    console.log('  Status:', user.status)
    console.log('  Has password hash:', !!user.passwordHash)
    console.log('  Password hash length:', user.passwordHash?.length || 0)
    console.log('  Password hash prefix:', user.passwordHash?.substring(0, 20) || 'N/A')
    console.log('  Must change password:', user.mustChangePassword)
    
    // Test password comparison if hash exists
    if (user.passwordHash) {
      const testPassword = 'test123' // Replace with actual password to test
      console.log('\n🔑 Testing password comparison...')
      console.log('  Test password:', testPassword)
      const valid = await bcrypt.compare(testPassword, user.passwordHash)
      console.log('  Password match:', valid)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

checkUser()
