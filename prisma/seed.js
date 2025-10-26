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

  // Create Acme Corp with test data for Calendar, Contracts, and Notes tabs
  const followUps = JSON.stringify([
    {
      id: Date.now(),
      date: '2025-10-30',
      time: '14:00',
      type: 'Call',
      description: 'Quarterly review call - discuss project progress and upcoming milestones',
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      id: Date.now() + 1,
      date: '2025-11-15',
      time: '10:00',
      type: 'Meeting',
      description: 'On-site visit to review fuel management system installation',
      completed: false,
      createdAt: new Date().toISOString()
    }
  ])

  const contracts = JSON.stringify([
    {
      id: Date.now() + 2,
      title: 'Annual Service Contract 2025',
      status: 'active',
      value: 125000,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      description: 'Comprehensive fuel management services including telemetry, audits, and optimization',
      signedDate: '2024-12-15'
    }
  ])

  const comments = JSON.stringify([
    {
      id: Date.now() + 3,
      text: 'Initial setup completed successfully. All fuel monitoring systems are online and reporting correctly.',
      createdAt: new Date().toISOString(),
      createdBy: 'System Administrator',
      tags: ['setup', 'systems'],
      attachments: []
    },
    {
      id: Date.now() + 4,
      text: 'Client has requested additional sensors for the new mining site. Preparing quote for expansion.',
      createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      createdBy: 'Sales Team',
      tags: ['expansion', 'quote'],
      attachments: []
    }
  ])

  const contacts = JSON.stringify([
    {
      id: 'acme-contact-1',
      name: 'John Smith',
      role: 'Operations Manager',
      department: 'Operations',
      email: 'john.smith@acmecorp.com',
      phone: '+27 11 555 0100',
      town: 'Johannesburg',
      isPrimary: true,
      siteId: null
    }
  ])

  const activityLog = JSON.stringify([
    {
      id: Date.now() + 5,
      type: 'Client Created',
      description: 'Acme Corp added to system',
      timestamp: new Date().toISOString(),
      user: 'System',
      relatedId: null
    }
  ])

  const client = await prisma.client.create({ 
    data: { 
      name: 'Acme Corp', 
      type: 'client', 
      ownerId: user.id,
      industry: 'Mining',
      status: 'active',
      revenue: 125000,
      address: '123 Mining Street, Johannesburg, 2001',
      website: 'https://acmecorp.com',
      notes: 'Key client in mining sector. Annual service contract for fuel management systems.',
      followUps,
      contracts,
      comments,
      contacts,
      activityLog
    } 
  })

  const project = await prisma.project.create({ data: { name: 'Initial Project', clientId: client.id, ownerId: user.id } })
  await prisma.task.create({ data: { title: 'First Task', projectId: project.id, assigneeId: user.id } })

  console.log('✅ Seed complete - Acme Corp created with test data for all tabs')
  console.log('📅 Calendar: 2 follow-ups added')
  console.log('📄 Contracts: 1 service contract added')
  console.log('📝 Notes: 2 comments added')
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
