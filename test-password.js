// Test password hash
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function testPassword() {
  try {
    const email = 'garethm@abcotronics.co.za'
    const testPasswords = [
      'AbcPassword123!',
      ' AbcPassword123!',
      'AbcPassword123! ',
      'AbcPassword123!\n',
      'AbcPassword123!\r',
      String.fromCharCode(0) + 'AbcPassword123!',
      'AbcPassword123!' + String.fromCharCode(0)
    ]
    
    console.log('🔍 Testing password for:', email)
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true
      }
    })
    
    if (!user) {
      console.log('❌ User not found')
      return
    }
    
    console.log('✅ User found')
    console.log('  Hash prefix:', user.passwordHash.substring(0, 30))
    console.log('  Hash length:', user.passwordHash.length)
    console.log('\n🧪 Testing passwords:\n')
    
    for (const testPwd of testPasswords) {
      const valid = await bcrypt.compare(testPwd, user.passwordHash)
      const pwdRepr = testPwd.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0')
      console.log(`  "${pwdRepr}" (length: ${testPwd.length}): ${valid ? '✅ MATCH' : '❌ no match'}`)
    }
    
    // Also check if the hash needs to be regenerated
    console.log('\n🔑 Resetting password to: AbcPassword123! (no whitespace)')
    const newHash = await bcrypt.hash('AbcPassword123!', 10)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false
      }
    })
    
    // Verify it works
    const verify = await bcrypt.compare('AbcPassword123!', newHash)
    console.log('✅ Password reset and verified:', verify)
    console.log('  New hash prefix:', newHash.substring(0, 30))
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

testPassword()

