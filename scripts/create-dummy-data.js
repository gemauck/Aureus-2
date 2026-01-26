import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
import { join } from 'path'
import { existsSync } from 'fs'

// Load .env.local if it exists
if (existsSync(join(process.cwd(), '.env.local'))) {
  config({ path: join(process.cwd(), '.env.local'), override: true })
  console.log('✅ Loaded .env.local')
}

const prisma = new PrismaClient()

async function main() {
  console.log('🎨 Creating dummy data for local development...\n')

  // Create users
  console.log('👥 Creating users...')
  const passwordHash = await bcrypt.hash('password123', 10)
  
  const users = []
  const userData = [
    { email: 'admin@example.com', name: 'Admin User', role: 'admin' },
    { email: 'manager@example.com', name: 'Manager User', role: 'manager' },
    { email: 'user@example.com', name: 'Regular User', role: 'user' },
    { email: 'sales@example.com', name: 'Sales Rep', role: 'user' }
  ]

  for (const userInfo of userData) {
    const user = await prisma.user.upsert({
      where: { email: userInfo.email },
      update: {},
      create: {
        ...userInfo,
        passwordHash,
        status: 'active'
      }
    })
    users.push(user)
    console.log(`   ✅ Created user: ${userInfo.email}`)
  }

  const adminUser = users[0]

  // Create clients
  console.log('\n🏢 Creating clients...')
  const clients = []
  const clientData = [
    {
      name: 'Acme Corporation',
      type: 'client',
      industry: 'Mining',
      status: 'active',
      revenue: 250000,
      address: '123 Mining Street, Johannesburg, 2001',
      website: 'https://acmecorp.com',
      notes: 'Key client in mining sector. Annual service contract.'
    },
    {
      name: 'Tech Solutions Ltd',
      type: 'client',
      industry: 'Technology',
      status: 'active',
      revenue: 180000,
      address: '456 Tech Avenue, Cape Town, 8001',
      website: 'https://techsolutions.co.za',
      notes: 'Technology consulting firm. Quarterly maintenance contract.'
    },
    {
      name: 'Global Logistics Inc',
      type: 'client',
      industry: 'Logistics',
      status: 'active',
      revenue: 320000,
      address: '789 Transport Road, Durban, 4001',
      website: 'https://globallogistics.com',
      notes: 'Large logistics company. Multiple service locations.'
    },
    {
      name: 'Manufacturing Co',
      type: 'client',
      industry: 'Manufacturing',
      status: 'active',
      revenue: 150000,
      address: '321 Factory Lane, Port Elizabeth, 6001',
      website: 'https://manufacturing.co.za',
      notes: 'Manufacturing company. Fuel management system installed.'
    },
    {
      name: 'Retail Group SA',
      type: 'client',
      industry: 'Retail',
      status: 'active',
      revenue: 200000,
      address: '654 Shopping Mall, Pretoria, 0001',
      website: 'https://retailgroup.co.za',
      notes: 'Retail chain. Multiple store locations.'
    },
    {
      name: 'Solar Energy Africa',
      type: 'client',
      industry: 'Energy',
      status: 'active',
      revenue: 275000,
      address: '100 Green Park, Stellenbosch, 7600',
      website: 'https://solarenergyafrica.co.za',
      notes: 'Solar installation and maintenance. Fleet fuel tracking integration.'
    },
    {
      name: 'MediCare Holdings',
      type: 'client',
      industry: 'Healthcare',
      status: 'active',
      revenue: 190000,
      address: '55 Hospital Drive, Bloemfontein, 9301',
      website: 'https://medicareholdings.co.za',
      notes: 'Healthcare group. Diesel backup generators and fuel management.'
    },
    {
      name: 'AgriPro Farms',
      type: 'client',
      industry: 'Agriculture',
      status: 'active',
      revenue: 165000,
      address: '22 Farm Road, Nelspruit, 1200',
      website: 'https://agriprofarms.co.za',
      notes: 'Agricultural operations. Bulk fuel and equipment tracking.'
    },
    {
      name: 'BuildRight Construction',
      type: 'client',
      industry: 'Construction',
      status: 'active',
      revenue: 310000,
      address: '88 Site Avenue, Centurion, 0157',
      website: 'https://buildright.co.za',
      notes: 'Construction company. Multiple site fuel and vehicle fleet.'
    },
    {
      name: 'SecureFlow Courier',
      type: 'client',
      industry: 'Logistics',
      status: 'active',
      revenue: 145000,
      address: '12 Depot Street, East London, 5201',
      website: 'https://secureflow.co.za',
      notes: 'Courier and last-mile delivery. Fleet fuel optimisation.'
    }
  ]

  for (const clientInfo of clientData) {
    const client = await prisma.client.create({
      data: {
        ...clientInfo,
        ownerId: adminUser.id,
        followUps: JSON.stringify([]),
        contracts: JSON.stringify([]),
        comments: JSON.stringify([]),
        contacts: JSON.stringify([]),
        activityLog: JSON.stringify([])
      }
    })
    clients.push(client)
    console.log(`   ✅ Created client: ${clientInfo.name}`)
  }

  // Create leads
  console.log('\n📋 Creating leads...')
  const leads = []
  const leadData = [
    {
      name: 'New Mining Company',
      type: 'lead',
      industry: 'Mining',
      status: 'new',
      address: '111 Prospect Street, Johannesburg',
      notes: 'Interested in fuel management solutions. Initial inquiry.'
    },
    {
      name: 'Startup Tech Firm',
      type: 'lead',
      industry: 'Technology',
      status: 'contacted',
      address: '222 Innovation Drive, Cape Town',
      notes: 'Follow-up scheduled for next week.'
    },
    {
      name: 'Transport Services',
      type: 'lead',
      industry: 'Transport',
      status: 'qualified',
      address: '333 Highway Road, Durban',
      notes: 'Qualified lead. Proposal sent.'
    }
  ]

  for (const leadInfo of leadData) {
    const lead = await prisma.client.create({
      data: {
        ...leadInfo,
        ownerId: adminUser.id,
        followUps: JSON.stringify([]),
        contracts: JSON.stringify([]),
        comments: JSON.stringify([]),
        contacts: JSON.stringify([]),
        activityLog: JSON.stringify([])
      }
    })
    leads.push(lead)
    console.log(`   ✅ Created lead: ${leadInfo.name}`)
  }

  // Create projects
  console.log('\n📁 Creating projects...')
  const projects = []
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i]
    const projectNames = [
      'Fuel Management System Installation',
      'System Maintenance & Support',
      'Quarterly Review Project',
      'Upgrade Project',
      'New Site Deployment'
    ]
    
    const projectName = projectNames[i % projectNames.length]
    const project = await prisma.project.create({
      data: {
        name: projectName,
        clientId: client.id,
        ownerId: adminUser.id,
        status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'planning' : 'completed'
      }
    })
    projects.push(project)
    console.log(`   ✅ Created project: ${projectName} for ${client.name}`)
  }

  // Create tasks
  console.log('\n✅ Creating tasks...')
  const taskTitles = [
    'Initial client meeting',
    'System requirements analysis',
    'Installation planning',
    'Hardware procurement',
    'System installation',
    'Testing and validation',
    'User training',
    'Documentation',
    'Go-live support',
    'Post-installation review'
  ]

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i]
    const numTasks = 3 + (i % 3) // 3-5 tasks per project
    
    for (let j = 0; j < numTasks; j++) {
      const taskTitle = taskTitles[(i * numTasks + j) % taskTitles.length]
      const assignee = users[(i + j) % users.length]
      
      await prisma.task.create({
        data: {
          title: `${taskTitle} - ${project.name}`,
          projectId: project.id,
          assigneeId: assignee.id,
          status: j === 0 ? 'completed' : j === 1 ? 'in_progress' : 'todo',
          priority: j % 3 === 0 ? 'high' : j % 3 === 1 ? 'medium' : 'low'
        }
      })
    }
    console.log(`   ✅ Created ${numTasks} tasks for project: ${project.name}`)
  }

  console.log('\n✅ Dummy data creation complete!')
  console.log(`\n📊 Summary:`)
  console.log(`   - ${users.length} users created`)
  console.log(`   - ${clients.length} clients created`)
  console.log(`   - ${leads.length} leads created`)
  console.log(`   - ${projects.length} projects created`)
  console.log(`   - Multiple tasks created`)
  console.log(`\n🔑 Login credentials:`)
  console.log(`   Email: admin@example.com`)
  console.log(`   Password: password123`)
  console.log(`\n   (Same password works for all users)`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Error creating dummy data:', e)
    await prisma.$disconnect()
    process.exit(1)
  })

