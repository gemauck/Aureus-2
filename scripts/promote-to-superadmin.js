// Promote garethm@abcotronics.co.za to SuperAdmin
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function promoteToSuperAdmin() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'garethm@abcotronics.co.za' }
    })
    if (!user) {
      console.log('❌ User garethm@abcotronics.co.za not found')
      return
    }
    await prisma.user.update({
      where: { email: 'garethm@abcotronics.co.za' },
      data: { role: 'superadmin' }
    })
    console.log('✅ garethm@abcotronics.co.za promoted to SuperAdmin')
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

promoteToSuperAdmin()
