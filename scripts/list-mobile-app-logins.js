#!/usr/bin/env node
/** List users who logged into the React Native mobile app (SecurityEvent mobile_login_success). */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.securityEvent.findMany({
    where: { eventType: 'mobile_login_success' },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      ipAddress: true,
      details: true,
      user: { select: { id: true, name: true, email: true } }
    }
  })

  const byUser = new Map()
  for (const row of rows) {
    const id = row.user.id
    let platform = 'unknown'
    try {
      const details = row.details ? JSON.parse(row.details) : {}
      platform = details.platform || platform
    } catch {
      /* ignore */
    }

    const existing = byUser.get(id)
    if (!existing) {
      byUser.set(id, {
        name: row.user.name,
        email: row.user.email,
        platform,
        loginCount: 1,
        lastLoginAt: row.createdAt,
        firstLoginAt: row.createdAt,
        lastIp: row.ipAddress
      })
      continue
    }

    existing.loginCount += 1
    if (row.createdAt > existing.lastLoginAt) {
      existing.lastLoginAt = row.createdAt
      existing.lastIp = row.ipAddress
      existing.platform = platform
    }
    if (row.createdAt < existing.firstLoginAt) {
      existing.firstLoginAt = row.createdAt
    }
  }

  const users = [...byUser.values()].sort(
    (a, b) => new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime()
  )

  if (!users.length) {
    console.log('No mobile app logins recorded yet.')
    return
  }

  console.log(`Mobile app logins (${users.length} user(s)):\n`)
  for (const u of users) {
    console.log(
      `- ${u.name || u.email} (${u.email}) | platform: ${u.platform} | logins: ${u.loginCount} | last: ${u.lastLoginAt.toISOString()}`
    )
  }
}

main()
  .catch((e) => {
    console.error(e.message || e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
