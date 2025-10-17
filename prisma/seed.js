import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)
  const user = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', name: 'Admin', role: 'admin', passwordHash }
  })

  const team = await prisma.team.upsert({
    where: { id: 'seed-team' },
    update: {},
    create: { id: 'seed-team', name: 'Default Team' }
  })

  await prisma.membership.upsert({
    where: { userId_teamId: { userId: user.id, teamId: team.id } },
    update: {},
    create: { userId: user.id, teamId: team.id, role: 'admin' }
  })

  const client = await prisma.client.create({ data: { name: 'Acme Corp', ownerId: user.id } })
  const project = await prisma.project.create({ data: { name: 'Initial Project', clientId: client.id, ownerId: user.id } })
  await prisma.task.create({ data: { title: 'First Task', projectId: project.id, assigneeId: user.id } })

  console.log('Seed complete')
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })

