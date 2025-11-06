// Debug login issue
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error']
})

async function debugLogin() {
  try {
    const email = 'garethm@abcotronics.co.za'
    const password = 'Welcome123!'
    
    console.log('🔍 Step 1: Finding user by email:', email)
    const user = await prisma.user.findUnique({ 
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        status: true
      }
    })
    
    if (!user) {
      console.log('❌ User not found')
      return
    }
    
    console.log('✅ User found:')
    console.log('   ID:', user.id)
    console.log('   Email:', user.email)
    console.log('   Name:', user.name)
    console.log('   Hash prefix:', user.passwordHash?.substring(0, 30) + '...')
    console.log('   Hash length:', user.passwordHash?.length)
    
    console.log('\n🔍 Step 2: Testing password:', password)
    const match = await bcrypt.compare(password, user.passwordHash)
    console.log('✅ Password match:', match)
    
    if (!match) {
      console.log('\n🔍 Step 3: Checking hash format...')
      const hashFormatValid = !!user.passwordHash.match(/^\$2[ayb]\$.{56}$/)
      console.log('   Hash format valid:', hashFormatValid)
      console.log('   Password length:', password.length)
      console.log('   Password type:', typeof password)
      
      console.log('\n🔍 Step 4: Trying to reset password...')
      const newHash = await bcrypt.hash(password, 10)
      console.log('   New hash:', newHash.substring(0, 30) + '...')
      
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash }
      })
      console.log('✅ Password updated for:', updated.email)
      
      const verifyNew = await bcrypt.compare(password, newHash)
      console.log('✅ New hash verification:', verifyNew)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

debugLogin()

