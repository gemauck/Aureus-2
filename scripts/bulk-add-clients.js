// Bulk Add Clients to Production Database
// This script adds 73 clients to the production database

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

const clients = [
  { name: 'ABCO ELECTRONICS.', industry: 'Electronics' },
  { name: 'AccuFarm (Pty) Ltd', industry: 'Agriculture' },
  { name: 'ACR Innovations (PTY) Ltd', industry: 'Technology' },
  { name: 'Airless Pivot Wheels (Pty) Ltd', industry: 'Manufacturing' },
  { name: 'Benhaus Mining Services (Pty) Ltd', industry: 'Mining' },
  { name: 'Blue Farming (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Broadview Farm CC', industry: 'Agriculture' },
  { name: 'Burlington Farming (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Cash', industry: 'General' },
  { name: 'Chiro 4 Fours', industry: 'Automotive' },
  { name: 'CHJ Mining O and M Gurus (Pty) Ltd', industry: 'Mining' },
  { name: 'Chromex Mining Company (Pty) Ltd', industry: 'Mining' },
  { name: 'Colbourne Farming (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Defacto Investements 255 (Pty) Ltd', industry: 'General' },
  { name: 'Dikwena Chrome (Pty) Ltd', industry: 'Mining' },
  { name: 'Ekhamanzi Transport (Pty) Ltd', industry: 'Transport' },
  { name: 'Em Bonsma', industry: 'General' },
  { name: 'Emseni Farming (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Fifehead Dairy Co.', industry: 'Agriculture' },
  { name: 'Forest Lodge Estate (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Frederica Sugar Estate (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Friedenheim Landgoed', industry: 'Agriculture' },
  { name: 'GP Joubert - Eastfield', industry: 'Agriculture' },
  { name: 'GRW Farming (PTY) Ltd', industry: 'Agriculture' },
  { name: 'Helmsley Farm (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Hendrick Dibakoane', industry: 'General' },
  { name: 'Hillary Hart', industry: 'General' },
  { name: 'Ice Dew Trading (PTY) LTD', industry: 'Trading' },
  { name: 'Ikwezi Mining', industry: 'Mining' },
  { name: 'Imperial LLP - DP World', industry: 'Logistics' },
  { name: 'InsightWare (Pty) Ltd', industry: 'Technology' },
  { name: 'IQ Plant Hire', industry: 'Construction' },
  { name: 'J & B Citrus (Pty) Ltd', industry: 'Agriculture' },
  { name: 'KK Agri (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Koodoolake Trust', industry: 'General' },
  { name: 'LC Rorich', industry: 'General' },
  { name: 'Lead Logistics (Pty) Ltd', industry: 'Logistics' },
  { name: 'Leigh Higgs', industry: 'General' },
  { name: 'Liberty Coal', industry: 'Mining' },
  { name: 'Mattison Farms (Pty) Ltd', industry: 'Agriculture' },
  { name: 'McCain (Pty) Ltd', industry: 'Food & Beverage' },
  { name: 'Michele Lafontaine', industry: 'General' },
  { name: 'Mandi Umfolazi Area', industry: 'General' },
  { name: 'Ndiza Poultry Rearing (Pty) Ltd', industry: 'Agriculture' },
  { name: 'New Age Forest Solutions', industry: 'Forestry' },
  { name: 'New Kingstonvale Farm', industry: 'Agriculture' },
  { name: 'Normandien Farms (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Ntshovelo Mining Resources (Pty) Ltd', industry: 'Mining' },
  { name: 'Potential Customer', industry: 'General' },
  { name: 'RCL Foods Consumer (Pty) Ltd', industry: 'Food & Beverage' },
  { name: 'Redcliffe Farming', industry: 'Agriculture' },
  { name: 'Samancor', industry: 'Mining' },
  { name: 'Sample Customer', industry: 'General' },
  { name: 'Sandy Hill (Pty) Ltd', industry: 'Agriculture' },
  { name: 'SARS Customer', industry: 'General' },
  { name: 'Sclanders Transport', industry: 'Transport' },
  { name: 'Servseta - E12504', industry: 'Services' },
  { name: 'Streeff Farming CC', industry: 'Agriculture' },
  { name: 'The Puckree Group (Pty) Ltd', industry: 'General' },
  { name: 'The Schroder Group t/a Boiling Fountain Farm', industry: 'Agriculture' },
  { name: 'Tshedza Mining Resources (Pty) Ltd', industry: 'Mining' },
  { name: 'Warrigal cc', industry: 'General' },
  { name: 'Watermead Farming (Pty) Ltd', industry: 'Agriculture' },
  { name: 'Windham Hill (Pty) Ltd', industry: 'Agriculture' },
  { name: 'WJ Rorich', industry: 'General' },
  { name: 'Zee Auditing (Pty) Ltd', industry: 'Services' },
  { name: 'Zee Fuel Management (Pty) Ltd - Barberton Mines', industry: 'Mining' },
  { name: 'Zee Fuel Management (Pty) Ltd - New Largo Coal', industry: 'Mining' },
  { name: 'Zee Fuel Management (Pty) Ltd - Sun City Resort', industry: 'Hospitality' },
  { name: 'Zee Global (Pty) Ltd', industry: 'General' },
  { name: 'Zee Global (Pty) Ltd:Zee Global - Thungela Operations', industry: 'Mining' },
  { name: 'Zee Global (Pty) Ltd:Zee Global - Thungela Zibulo', industry: 'Mining' },
  { name: 'Zee Global Suncity', industry: 'Hospitality' },
]

async function bulkAddClients() {
  console.log('🌱 Starting bulk client import...')
  
  try {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable is not set!')
      console.log('Please set DATABASE_URL before running this script.')
      console.log('For production, use: DATABASE_URL="postgresql://..." node scripts/bulk-add-clients.js')
      process.exit(1)
    }

    console.log('✅ Database URL found')
    console.log('📊 Connecting to database...')
    
    // Connect to database
    await prisma.$connect()
    console.log('✅ Connected to database')

    // Check existing clients
    const existingClients = await prisma.client.findMany({
      select: { name: true }
    })
    console.log(`📋 Found ${existingClients.length} existing clients in database`)
    
    const existingNames = new Set(existingClients.map(c => c.name))
    
    // Filter out clients that already exist
    const newClients = clients.filter(client => !existingNames.has(client.name))
    
    if (newClients.length === 0) {
      console.log('✅ All clients already exist in the database')
      return
    }

    console.log(`➕ Adding ${newClients.length} new clients (skipping ${clients.length - newClients.length} duplicates)`)

    let successCount = 0
    let errorCount = 0

    // Add clients one by one
    for (const client of newClients) {
      try {
        await prisma.client.create({
          data: {
            name: client.name,
            type: 'client',
            industry: client.industry || 'Other',
            status: 'active',
            revenue: 0,
            value: 0,
            probability: 100,
            lastContact: new Date(),
            address: '',
            website: '',
            notes: '',
            contacts: '[]',
            followUps: '[]',
            projectIds: '[]',
            comments: '[]',
            sites: '[]',
            contracts: '[]',
            activityLog: JSON.stringify([{
              id: Date.now(),
              type: 'Client Created',
              description: `${client.name} added via bulk import`,
              timestamp: new Date().toISOString(),
              user: 'System'
            }]),
            billingTerms: JSON.stringify({
              paymentTerms: 'Net 30',
              billingFrequency: 'Monthly',
              currency: 'ZAR',
              retainerAmount: 0,
              taxExempt: false,
              notes: ''
            }),
            proposals: '[]'
          }
        })
        console.log(`✅ Added: ${client.name}`)
        successCount++
      } catch (error) {
        console.error(`❌ Failed to add ${client.name}:`, error.message)
        errorCount++
      }
    }

    console.log('')
    console.log('📊 Import Summary:')
    console.log(`  ✅ Successfully added: ${successCount} clients`)
    console.log(`  ❌ Failed: ${errorCount} clients`)
    console.log(`  ⏭️  Skipped (duplicates): ${clients.length - newClients.length} clients`)
    console.log(`  📋 Total in database now: ${existingClients.length + successCount} clients`)

  } catch (error) {
    console.error('❌ Error during bulk import:', error)
  } finally {
    await prisma.$disconnect()
    console.log('👋 Disconnected from database')
  }
}

// Run the import
bulkAddClients()

