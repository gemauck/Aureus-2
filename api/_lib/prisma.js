import { PrismaClient } from '@prisma/client'

let prismaGlobal

if (!global.__prisma) {
  global.__prisma = new PrismaClient()
}

prismaGlobal = global.__prisma

export const prisma = prismaGlobal

