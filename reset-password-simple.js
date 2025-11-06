import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function resetPassword() {
  try {
    const email = 'garethm@abcotronics.co.za'
    const password = 'Welcome123!'
    
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.log('User not found')
      return
    }
    
    console.log('Found user:', user.id, user.email)
    const newHash = await bcrypt.hash(password, 10)
    console.log('New hash:', newHash.substring(0, 30) + '...')
    
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash }
    })
    
    console.log('Password updated successfully')
    
    const verify = await bcrypt.compare(password, newHash)
    console.log('Verification:', verify)
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

resetPassword()

