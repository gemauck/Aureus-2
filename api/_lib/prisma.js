import { PrismaClient } from '@prisma/client'

let prismaGlobal

if (!global.__prisma) {
  try {
    global.__prisma = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    })
    
    // Test the connection with retry logic
    const testConnection = async () => {
      let retries = 3
      while (retries > 0) {
        try {
          await global.__prisma.$connect()
          console.log('✅ Prisma connected to database successfully')
          return
        } catch (error) {
          console.error(`❌ Prisma database connection failed (${4-retries}/3):`, error.message)
          retries--
          if (retries > 0) {
            console.log(`⏳ Retrying connection in 2 seconds...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
          } else {
            console.error('❌ Prisma database connection failed after 3 attempts')
            throw error
          }
        }
      }
    }
    
    // Test connection asynchronously without blocking
    testConnection().catch((error) => {
      console.error('❌ Prisma connection test failed:', error)
    })
    
  } catch (error) {
    console.error('❌ Failed to create Prisma client:', error)
    throw error
  }
}

prismaGlobal = global.__prisma

export const prisma = prismaGlobal

