#!/usr/bin/env node
/**
 * Upsert a dedicated automation user for production smoke tests (run on server with DATABASE_URL).
 * Prints JSON { email, password } to stdout for the orchestrator to capture.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

dotenv.config({ quiet: true })

const EMAIL = (process.env.AUTOMATION_SMOKE_EMAIL || 'erp-smoke-automation@abcoafrica.co.za').trim().toLowerCase()
const prisma = new PrismaClient()

async function main() {
  const password = String(process.env.AUTOMATION_SMOKE_PASSWORD || '').trim() || crypto.randomBytes(18).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      name: 'ERP Smoke Automation',
      role: 'admin',
      passwordHash,
      status: 'active'
    },
    create: {
      email: EMAIL,
      name: 'ERP Smoke Automation',
      role: 'admin',
      passwordHash,
      status: 'active'
    }
  })
  process.stdout.write(JSON.stringify({ email: EMAIL, password }))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
