/**
 * Seed additional dummy data: Industries, Opportunities, Invoices, SalesOrders,
 * CalendarNotes, Notifications. Run after create-dummy-data.js (or seed.js).
 * Uses .env.local if present.
 */
import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { join } from 'path'
import { existsSync } from 'fs'

if (existsSync(join(process.cwd(), '.env.local'))) {
  config({ path: join(process.cwd(), '.env.local'), override: true })
}

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding additional dummy data...\n')

  const users = await prisma.user.findMany({ take: 5 })
  const clients = await prisma.client.findMany({ where: { type: 'client' }, take: 8 })
  const projects = await prisma.project.findMany({ take: 5 })
  const adminUser = users[0]
  if (!adminUser || !clients.length) {
    console.log('⚠️ Run create-dummy-data.js or seed.js first (need users and clients).')
    return
  }

  // Industries
  console.log('📂 Creating industries...')
  const industryNames = ['Mining', 'Technology', 'Logistics', 'Manufacturing', 'Retail', 'Energy', 'Healthcare', 'Agriculture', 'Construction', 'Transport', 'Other']
  for (const name of industryNames) {
    await prisma.industry.upsert({
      where: { name },
      update: {},
      create: { name }
    })
  }
  console.log(`   ✅ ${industryNames.length} industries`)

  // Opportunities (only if we have few)
  const oppCount = await prisma.opportunity.count()
  if (oppCount < 6) {
    console.log('\n💼 Creating opportunities...')
    const stages = ['Awareness', 'Consideration', 'Proposal', 'Negotiation', 'Won']
    for (let i = oppCount; i < Math.min(6, clients.length); i++) {
      await prisma.opportunity.create({
        data: {
          clientId: clients[i].id,
          title: `Opportunity - ${clients[i].name}`,
          stage: stages[i % stages.length],
          value: 50000 + i * 25000,
          ownerId: adminUser.id,
          status: i % 2 === 0 ? 'Potential' : 'Active'
        }
      })
    }
    console.log('   ✅ Opportunities')
  } else {
    console.log('\n💼 Opportunities already seeded')
  }

  // Invoices (upsert by invoiceNumber so re-runs don't fail)
  console.log('\n📄 Creating invoices...')
  for (let i = 0; i < Math.min(5, clients.length); i++) {
    const invNum = `INV-2025-${1000 + i}`
    const total = 15000 + i * 5000
    await prisma.invoice.upsert({
      where: { invoiceNumber: invNum },
      update: {},
      create: {
        clientId: clients[i].id,
        projectId: projects[i]?.id ?? null,
        invoiceNumber: invNum,
        clientName: clients[i].name,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: i % 3 === 0 ? 'Draft' : i % 3 === 1 ? 'Sent' : 'Paid',
        subtotal: total / 1.15,
        tax: total - total / 1.15,
        total,
        balance: i % 3 === 2 ? 0 : total,
        items: JSON.stringify([{ description: 'Service fee', quantity: 1, unitPrice: total / 1.15 }]),
        ownerId: adminUser.id
      }
    })
  }
  console.log('   ✅ 5 invoices')

  // Sales orders (upsert by orderNumber)
  console.log('\n🛒 Creating sales orders...')
  for (let i = 0; i < Math.min(4, clients.length); i++) {
    const orderNum = `SO-2025-${2000 + i}`
    const total = 20000 + i * 10000
    await prisma.salesOrder.upsert({
      where: { orderNumber: orderNum },
      update: {},
      create: {
        orderNumber: orderNum,
        clientId: clients[i].id,
        clientName: clients[i].name,
        status: i % 2 === 0 ? 'draft' : 'confirmed',
        orderDate: new Date(),
        subtotal: total,
        tax: 0,
        total,
        ownerId: adminUser.id
      }
    })
  }
  console.log('   ✅ 4 sales orders')

  // Calendar notes
  console.log('\n📅 Creating calendar notes...')
  for (const user of users.slice(0, 3)) {
    for (let d = 0; d < 5; d++) {
      const date = new Date()
      date.setDate(date.getDate() + d)
      date.setHours(0, 0, 0, 0)
      await prisma.calendarNote.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: {},
        create: {
          userId: user.id,
          date,
          note: `Dummy note for ${date.toISOString().slice(0, 10)} - ${user.name || user.email}`
        }
      })
    }
  }
  console.log('   ✅ Calendar notes for 3 users')

  // Notifications
  console.log('\n🔔 Creating notifications...')
  const notifTypes = [
    { type: 'task', title: 'Task assigned', message: 'You were assigned a new task.' },
    { type: 'comment', title: 'New comment', message: 'Someone commented on a client.' },
    { type: 'invoice', title: 'Invoice sent', message: 'Invoice INV-2025-1001 was sent.' },
    { type: 'system', title: 'System update', message: 'Scheduled maintenance completed.' }
  ]
  for (const user of users.slice(0, 4)) {
    for (let n = 0; n < 3; n++) {
      const t = notifTypes[n % notifTypes.length]
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: t.type,
          title: t.title,
          message: t.message,
          read: n === 0,
          link: '/'
        }
      })
    }
  }
  console.log('   ✅ Notifications for 4 users')

  // System settings (ensure one exists)
  console.log('\n⚙️ Ensuring system settings...')
  await prisma.systemSettings.upsert({
    where: { id: 'system' },
    update: {},
    create: {
      id: 'system',
      companyName: 'Abcotronics',
      timezone: 'Africa/Johannesburg',
      currency: 'ZAR'
    }
  })
  console.log('   ✅ System settings')

  // Leave balances (for first user)
  const year = new Date().getFullYear()
  const existingLeave = await prisma.leaveBalance.findFirst({ where: { userId: adminUser.id, year } })
  if (!existingLeave) {
    console.log('\n📋 Creating leave balances...')
    await prisma.leaveBalance.create({
      data: {
        userId: adminUser.id,
        leaveType: 'Annual',
        year,
        available: 21,
        used: 2,
        balance: 19
      }
    })
    console.log('   ✅ Leave balance for admin')
  }

  // Time entries (for projects)
  console.log('\n⏱️ Creating time entries...')
  for (let i = 0; i < Math.min(8, projects.length); i++) {
    const proj = projects[i]
    const clientName = clients.find((c) => c.id === proj.clientId)?.name ?? 'Client'
    await prisma.timeEntry.create({
      data: {
        projectId: proj.id,
        projectName: proj.name,
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        hours: 2 + (i % 4),
        task: `Task ${i + 1}`,
        description: `Dummy time entry for ${proj.name}`,
        employee: adminUser.name ?? adminUser.email,
        billable: true,
        rate: 500,
        ownerId: adminUser.id
      }
    })
  }
  console.log('   ✅ 8 time entries')

  // Helpdesk tickets (upsert by ticketNumber)
  console.log('\n🎫 Creating helpdesk tickets...')
  const ticketTitles = ['Login issue', 'Report not loading', 'Password reset request', 'Feature request', 'Bug: calendar sync']
  for (let i = 0; i < ticketTitles.length; i++) {
    const tktNum = `TKT-2025-${3000 + i}`
    await prisma.ticket.upsert({
      where: { ticketNumber: tktNum },
      update: {},
      create: {
        ticketNumber: tktNum,
        title: ticketTitles[i],
        description: `Dummy ticket: ${ticketTitles[i]}. Created for testing.`,
        status: i % 3 === 0 ? 'open' : i % 3 === 1 ? 'in_progress' : 'resolved',
        priority: i % 2 === 0 ? 'medium' : 'low',
        category: 'general',
        type: 'internal',
        createdById: adminUser.id,
        assignedToId: users[1]?.id ?? adminUser.id,
        clientId: clients[i % clients.length]?.id ?? null
      }
    })
  }
  console.log('   ✅ 5 helpdesk tickets')

  console.log('\n✅ Additional dummy data complete.')
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌', e)
    prisma.$disconnect()
    process.exit(1)
  })
