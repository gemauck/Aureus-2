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

  // Seed teams from hardcoded Teams.jsx data
  const teamsData = [
    { 
      id: 'management', 
      name: 'Management', 
      icon: 'fa-user-tie', 
      color: 'blue',
      description: 'Executive leadership and strategic planning',
      permissions: [
        'Approve capital expenditure, budgets, and strategic initiatives',
        'Assign cross-team priorities and override departmental escalations',
        'Access organization-wide executive dashboards and audit summaries'
      ]
    },
    { 
      id: 'technical', 
      name: 'Technical', 
      icon: 'fa-tools', 
      color: 'purple',
      description: 'Technical operations and system maintenance',
      permissions: [
        'Deploy production releases and manage infrastructure integrations',
        'Configure APIs, webhooks, and security credentials for services',
        'View system diagnostics, error logs, and performance telemetry'
      ]
    },
    { 
      id: 'support', 
      name: 'Support', 
      icon: 'fa-headset', 
      color: 'green',
      description: 'Customer support and service delivery',
      permissions: [
        'Manage customer tickets, escalations, and service level agreements',
        'Access unified communication channels and contact history',
        'Publish and update customer-facing knowledge base documentation'
      ]
    },
    { 
      id: 'data-analytics', 
      name: 'Data Analytics', 
      icon: 'fa-chart-line', 
      color: 'indigo',
      description: 'Data analysis and business intelligence',
      permissions: [
        'Query governed datasets and schedule BI dashboard refreshes',
        'Export aggregated analytics for leadership and finance reviews',
        'Define metric definitions, KPIs, and reporting taxonomies'
      ]
    },
    { 
      id: 'finance', 
      name: 'Finance', 
      icon: 'fa-coins', 
      color: 'yellow',
      description: 'Financial management and accounting',
      permissions: [
        'Approve invoices, purchase orders, and payment runs',
        'Access ledgers, balance sheets, and sensitive financial statements',
        'Manage payroll configurations and tax compliance filings'
      ]
    },
    { 
      id: 'business-development', 
      name: 'Business Development', 
      icon: 'fa-rocket', 
      color: 'pink',
      description: 'Growth strategies and new opportunities',
      permissions: [
        'Create and negotiate partnership and channel opportunity records',
        'Access competitive intelligence and pipeline analytics',
        'Approve pricing proposals and bespoke commercial terms'
      ]
    },
    { 
      id: 'commercial', 
      name: 'Commercial', 
      icon: 'fa-handshake', 
      color: 'orange',
      description: 'Sales and commercial operations',
      permissions: [
        'Manage quotes, contracts, and sales order fulfilment tasks',
        'Update product catalogues, pricing tiers, and discount rules',
        'View customer credit status and contract renewal schedules'
      ]
    },
    { 
      id: 'compliance', 
      name: 'Compliance', 
      icon: 'fa-shield-alt', 
      color: 'red',
      description: 'Regulatory compliance and risk management',
      permissions: [
        'Review audit trails, exception reports, and attestation evidence',
        'Manage regulatory documentation, policies, and control mappings',
        'Enforce policy acknowledgment and training completion workflows'
      ]
    }
  ]

  // Create or update teams with permissions
  for (const teamData of teamsData) {
    const { permissions, ...teamFields } = teamData
    
    const team = await prisma.team.upsert({
      where: { id: teamData.id },
      update: {
        name: teamFields.name,
        icon: teamFields.icon,
        color: teamFields.color,
        description: teamFields.description,
        isActive: true
      },
      create: {
        id: teamFields.id,
        name: teamFields.name,
        icon: teamFields.icon,
        color: teamFields.color,
        description: teamFields.description,
        isActive: true
      }
    })

    // Update team permissions (delete existing and create new)
    await prisma.teamPermission.deleteMany({
      where: { teamId: team.id }
    })

    if (permissions && permissions.length > 0) {
      await prisma.teamPermission.createMany({
        data: permissions.map(permission => ({
          teamId: team.id,
          permission: String(permission)
        }))
      })
    }
  }

  // Add admin user to management team
  const managementTeam = await prisma.team.findUnique({
    where: { id: 'management' }
  })

  if (managementTeam) {
    await prisma.membership.upsert({
      where: { userId_teamId: { userId: user.id, teamId: managementTeam.id } },
      update: { role: 'admin' },
      create: { userId: user.id, teamId: managementTeam.id, role: 'admin' }
    })
  }

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
