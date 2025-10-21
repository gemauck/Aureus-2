import { PrismaClient } from '@prisma/client'

let prismaGlobal

if (!global.__prisma) {
  try {
    global.__prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    })
    
    // Test the connection
    global.__prisma.$connect().then(() => {
      console.log('✅ Prisma connected to database successfully')
    }).catch((error) => {
      console.error('❌ Prisma database connection failed:', error)
    })
  } catch (error) {
    console.error('❌ Failed to create Prisma client:', error)
    throw error
  }
}

prismaGlobal = global.__prisma

export const prisma = prismaGlobal

