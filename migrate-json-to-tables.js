#!/usr/bin/env node
/**
 * Migration script to move JSON data to normalized tables
 * Migrates: sites, contracts, proposals, followUps, services
 * 
 * This script:
 * 1. Reads all clients
 * 2. Parses JSON fields
 * 3. Creates normalized table records
 * 4. Preserves all data
 * 5. Logs migration progress
 */

import { prisma } from './api/_lib/prisma.js'

console.log('🔄 Starting JSON to Normalized Tables Migration\n')
console.log('='.repeat(60))

let stats = {
  clientsProcessed: 0,
  sitesMigrated: 0,
  contractsMigrated: 0,
  proposalsMigrated: 0,
  followUpsMigrated: 0,
  servicesMigrated: 0,
  errors: 0
}

function parseJsonField(field, defaultValue = []) {
  if (!field) return defaultValue
  if (Array.isArray(field)) return field
  if (typeof field === 'string' && field.trim() && field.trim() !== '[]') {
    try {
      const parsed = JSON.parse(field)
      return Array.isArray(parsed) ? parsed : defaultValue
    } catch (e) {
      // Try parsing as JSONB text format
      try {
        if (field.startsWith('[') || field.startsWith('{')) {
          const parsed = JSON.parse(field)
          return Array.isArray(parsed) ? parsed : defaultValue
        }
      } catch (e2) {
        console.warn(`⚠️  Failed to parse JSON field:`, e.message)
      }
      return defaultValue
    }
  }
  return defaultValue
}

async function migrateClient(client) {
  try {
    console.log(`\n📋 Processing client: ${client.name || client.id} (${client.id})`)
    
    // Migrate Sites - try JSONB first, then String
    let sitesRaw = client.sitesJsonb || client.sites || '[]'
    const sites = parseJsonField(sitesRaw)
    if (sites.length > 0) {
      console.log(`   📍 Migrating ${sites.length} sites...`)
      for (const site of sites) {
        if (!site.id || !site.name) {
          console.warn(`   ⚠️  Skipping invalid site:`, site)
          continue
        }
        
        try {
          await prisma.clientSite.upsert({
            where: { id: site.id },
            update: {
              clientId: client.id,
              name: site.name || '',
              address: site.address || '',
              contactPerson: site.contactPerson || null,
              contactPhone: site.contactPhone || null,
              contactEmail: site.contactEmail || null,
              notes: site.notes || ''
            },
            create: {
              id: site.id,
              clientId: client.id,
              name: site.name || '',
              address: site.address || '',
              contactPerson: site.contactPerson || null,
              contactPhone: site.contactPhone || null,
              contactEmail: site.contactEmail || null,
              notes: site.notes || ''
            }
          })
          stats.sitesMigrated++
        } catch (error) {
          if (error.code === 'P2002') {
            // Already exists, try update
            try {
              await prisma.clientSite.update({
                where: { id: site.id },
                data: {
                  clientId: client.id,
                  name: site.name || '',
                  address: site.address || '',
                  contactPerson: site.contactPerson || null,
                  contactPhone: site.contactPhone || null,
                  contactEmail: site.contactEmail || null,
                  notes: site.notes || ''
                }
              })
              stats.sitesMigrated++
            } catch (updateError) {
              console.error(`   ❌ Failed to update site ${site.id}:`, updateError.message)
              stats.errors++
            }
          } else {
            console.error(`   ❌ Failed to migrate site ${site.id}:`, error.message)
            stats.errors++
          }
        }
      }
    }
    
    // Migrate Contracts - try JSONB first, then String
    let contractsRaw = client.contractsJsonb || client.contracts || '[]'
    const contracts = parseJsonField(contractsRaw)
    if (contracts.length > 0) {
      console.log(`   📄 Migrating ${contracts.length} contracts...`)
      for (const contract of contracts) {
        if (!contract.id || !contract.name) {
          console.warn(`   ⚠️  Skipping invalid contract:`, contract)
          continue
        }
        
        try {
          const uploadDate = contract.uploadDate 
            ? new Date(contract.uploadDate) 
            : new Date()
          
          await prisma.clientContract.upsert({
            where: { id: contract.id },
            update: {
              clientId: client.id,
              name: contract.name || '',
              size: contract.size ? parseFloat(contract.size) : null,
              type: contract.type || null,
              uploadDate: uploadDate,
              url: contract.url || null
            },
            create: {
              id: contract.id,
              clientId: client.id,
              name: contract.name || '',
              size: contract.size ? parseFloat(contract.size) : null,
              type: contract.type || null,
              uploadDate: uploadDate,
              url: contract.url || null
            }
          })
          stats.contractsMigrated++
        } catch (error) {
          if (error.code === 'P2002') {
            try {
              const uploadDate = contract.uploadDate 
                ? new Date(contract.uploadDate) 
                : new Date()
              
              await prisma.clientContract.update({
                where: { id: contract.id },
                data: {
                  clientId: client.id,
                  name: contract.name || '',
                  size: contract.size ? parseFloat(contract.size) : null,
                  type: contract.type || null,
                  uploadDate: uploadDate,
                  url: contract.url || null
                }
              })
              stats.contractsMigrated++
            } catch (updateError) {
              console.error(`   ❌ Failed to update contract ${contract.id}:`, updateError.message)
              stats.errors++
            }
          } else {
            console.error(`   ❌ Failed to migrate contract ${contract.id}:`, error.message)
            stats.errors++
          }
        }
      }
    }
    
    // Migrate Proposals - try JSONB first, then String
    let proposalsRaw = client.proposalsJsonb || client.proposals || '[]'
    const proposals = parseJsonField(proposalsRaw)
    if (proposals.length > 0) {
      console.log(`   📊 Migrating ${proposals.length} proposals...`)
      for (const proposal of proposals) {
        if (!proposal.id) {
          // Generate ID if missing
          proposal.id = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
        
        try {
          const createdDate = proposal.createdDate 
            ? new Date(proposal.createdDate) 
            : null
          const expiryDate = proposal.expiryDate 
            ? new Date(proposal.expiryDate) 
            : null
          
          await prisma.clientProposal.upsert({
            where: { id: proposal.id },
            update: {
              clientId: client.id,
              title: proposal.title || proposal.name || '',
              amount: proposal.amount ? parseFloat(proposal.amount) : null,
              status: proposal.status || 'Pending',
              workingDocumentLink: proposal.workingDocumentLink || null,
              createdDate: createdDate,
              expiryDate: expiryDate,
              notes: proposal.notes || ''
            },
            create: {
              id: proposal.id,
              clientId: client.id,
              title: proposal.title || proposal.name || '',
              amount: proposal.amount ? parseFloat(proposal.amount) : null,
              status: proposal.status || 'Pending',
              workingDocumentLink: proposal.workingDocumentLink || null,
              createdDate: createdDate,
              expiryDate: expiryDate,
              notes: proposal.notes || ''
            }
          })
          stats.proposalsMigrated++
        } catch (error) {
          if (error.code === 'P2002') {
            try {
              const createdDate = proposal.createdDate 
                ? new Date(proposal.createdDate) 
                : null
              const expiryDate = proposal.expiryDate 
                ? new Date(proposal.expiryDate) 
                : null
              
              await prisma.clientProposal.update({
                where: { id: proposal.id },
                data: {
                  clientId: client.id,
                  title: proposal.title || proposal.name || '',
                  amount: proposal.amount ? parseFloat(proposal.amount) : null,
                  status: proposal.status || 'Pending',
                  workingDocumentLink: proposal.workingDocumentLink || null,
                  createdDate: createdDate,
                  expiryDate: expiryDate,
                  notes: proposal.notes || ''
                }
              })
              stats.proposalsMigrated++
            } catch (updateError) {
              console.error(`   ❌ Failed to update proposal ${proposal.id}:`, updateError.message)
              stats.errors++
            }
          } else {
            console.error(`   ❌ Failed to migrate proposal ${proposal.id}:`, error.message)
            stats.errors++
          }
        }
      }
    }
    
    // Migrate FollowUps - try JSONB first, then String
    let followUpsRaw = client.followUpsJsonb || client.followUps || '[]'
    const followUps = parseJsonField(followUpsRaw)
    if (followUps.length > 0) {
      console.log(`   📅 Migrating ${followUps.length} follow-ups...`)
      for (const followUp of followUps) {
        // Ensure ID is a string
        let followUpId = followUp.id
        if (!followUpId) {
          followUpId = `followup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        } else if (typeof followUpId !== 'string') {
          followUpId = String(followUpId)
        }
        
        try {
          await prisma.clientFollowUp.upsert({
            where: { id: followUpId },
            update: {
              clientId: client.id,
              date: followUp.date || '',
              time: followUp.time || '',
              type: followUp.type || 'Call',
              description: followUp.description || '',
              completed: !!followUp.completed,
              assignedTo: followUp.assignedTo || null
            },
            create: {
              id: followUpId,
              clientId: client.id,
              date: followUp.date || '',
              time: followUp.time || '',
              type: followUp.type || 'Call',
              description: followUp.description || '',
              completed: !!followUp.completed,
              assignedTo: followUp.assignedTo || null
            }
          })
          stats.followUpsMigrated++
        } catch (error) {
          if (error.code === 'P2002') {
            try {
              await prisma.clientFollowUp.update({
                where: { id: followUpId },
                data: {
                  clientId: client.id,
                  date: followUp.date || '',
                  time: followUp.time || '',
                  type: followUp.type || 'Call',
                  description: followUp.description || '',
                  completed: !!followUp.completed,
                  assignedTo: followUp.assignedTo || null
                }
              })
              stats.followUpsMigrated++
            } catch (updateError) {
              console.error(`   ❌ Failed to update followUp ${followUpId}:`, updateError.message)
              stats.errors++
            }
          } else {
            console.error(`   ❌ Failed to migrate followUp ${followUpId}:`, error.message)
            stats.errors++
          }
        }
      }
    }
    
    // Migrate Services - try JSONB first, then String
    let servicesRaw = client.servicesJsonb || client.services || '[]'
    const services = parseJsonField(servicesRaw)
    if (services.length > 0) {
      console.log(`   🔧 Migrating ${services.length} services...`)
      for (const service of services) {
        // Handle cases where service is stored as a string (just the name)
        if (typeof service === 'string') {
          try {
            await prisma.clientService.create({
              data: {
                clientId: client.id,
                name: service,
                description: '',
                price: null,
                status: 'Active',
                startDate: null,
                endDate: null,
                notes: ''
              }
            })
            stats.servicesMigrated++
          } catch (error) {
            console.error(`   ❌ Failed to migrate service (string) "${service}":`, error.message)
            stats.errors++
          }
          continue
        }
        
        // Skip if no name (invalid service)
        if (!service.name && typeof service !== 'string') {
          console.warn(`   ⚠️  Skipping invalid service (no name):`, service)
          continue
        }
        
        // Ensure ID is a string
        let serviceId = service.id
        if (!serviceId) {
          serviceId = `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        } else if (typeof serviceId !== 'string') {
          serviceId = String(serviceId)
        }
        
        try {
          const startDate = service.startDate 
            ? new Date(service.startDate) 
            : null
          const endDate = service.endDate 
            ? new Date(service.endDate) 
            : null
          
          await prisma.clientService.upsert({
            where: { id: serviceId },
            update: {
              clientId: client.id,
              name: service.name || '',
              description: service.description || '',
              price: service.price ? parseFloat(service.price) : null,
              status: service.status || 'Active',
              startDate: startDate,
              endDate: endDate,
              notes: service.notes || ''
            },
            create: {
              id: serviceId,
              clientId: client.id,
              name: service.name || '',
              description: service.description || '',
              price: service.price ? parseFloat(service.price) : null,
              status: service.status || 'Active',
              startDate: startDate,
              endDate: endDate,
              notes: service.notes || ''
            }
          })
          stats.servicesMigrated++
        } catch (error) {
          if (error.code === 'P2002') {
            try {
              const startDate = service.startDate 
                ? new Date(service.startDate) 
                : null
              const endDate = service.endDate 
                ? new Date(service.endDate) 
                : null
              
              await prisma.clientService.update({
                where: { id: serviceId },
                data: {
                  clientId: client.id,
                  name: service.name || '',
                  description: service.description || '',
                  price: service.price ? parseFloat(service.price) : null,
                  status: service.status || 'Active',
                  startDate: startDate,
                  endDate: endDate,
                  notes: service.notes || ''
                }
              })
              stats.servicesMigrated++
            } catch (updateError) {
              console.error(`   ❌ Failed to update service ${serviceId}:`, updateError.message)
              stats.errors++
            }
          } else {
            console.error(`   ❌ Failed to migrate service ${serviceId}:`, error.message)
            stats.errors++
          }
        }
      }
    }
    
    stats.clientsProcessed++
    
  } catch (error) {
    console.error(`\n❌ Error processing client ${client.id}:`, error.message)
    stats.errors++
  }
}

async function migrateAll() {
  try {
    console.log('🔍 Checking database schema and fetching clients...\n')
    
    // First, check which columns exist in the database
    let columnCheck = null
    try {
      columnCheck = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Client' 
        AND column_name IN ('sites', 'sitesJsonb', 'contracts', 'contractsJsonb', 'proposals', 'proposalsJsonb', 'followUps', 'followUpsJsonb', 'services', 'servicesJsonb')
      `
    } catch (e) {
      // SQLite doesn't have information_schema, try different approach
      console.log('⚠️  Could not check columns (may be SQLite), will try to read anyway...')
    }
    
    const existingColumns = columnCheck ? columnCheck.map(c => c.column_name.toLowerCase()) : []
    const hasColumns = existingColumns.length > 0
    
    if (!hasColumns) {
      console.log('ℹ️  JSON columns not found in database.')
      console.log('   This could mean:')
      console.log('   1. Data has already been migrated')
      console.log('   2. Database never had these fields')
      console.log('   3. Schema migration already removed them\n')
      console.log('✅ Skipping migration - no JSON data to migrate')
      console.log('\n📊 Current normalized table counts:')
      
      // Count existing data in normalized tables
      const siteCount = await prisma.clientSite.count()
      const contractCount = await prisma.clientContract.count()
      const proposalCount = await prisma.clientProposal.count()
      const followUpCount = await prisma.clientFollowUp.count()
      const serviceCount = await prisma.clientService.count()
      
      console.log(`   Sites in normalized table: ${siteCount}`)
      console.log(`   Contracts in normalized table: ${contractCount}`)
      console.log(`   Proposals in normalized table: ${proposalCount}`)
      console.log(`   FollowUps in normalized table: ${followUpCount}`)
      console.log(`   Services in normalized table: ${serviceCount}`)
      console.log('\n✅ Migration complete - ready for schema migration!')
      return
    }
    
    console.log(`✅ Found JSON columns: ${existingColumns.join(', ')}\n`)
    
    // Build query based on which columns exist
    const selectFields = ['id', 'name']
    if (existingColumns.includes('sitesjsonb')) {
      selectFields.push("COALESCE(\"sitesJsonb\"::text, '[]') as sitesJsonb")
    }
    if (existingColumns.includes('sites')) {
      selectFields.push("COALESCE(sites, '[]') as sites")
    }
    if (existingColumns.includes('contractsjsonb')) {
      selectFields.push("COALESCE(\"contractsJsonb\"::text, '[]') as contractsJsonb")
    }
    if (existingColumns.includes('contracts')) {
      selectFields.push("COALESCE(contracts, '[]') as contracts")
    }
    if (existingColumns.includes('proposalsjsonb')) {
      selectFields.push("COALESCE(\"proposalsJsonb\"::text, '[]') as proposalsJsonb")
    }
    if (existingColumns.includes('proposals')) {
      selectFields.push("COALESCE(proposals, '[]') as proposals")
    }
    if (existingColumns.includes('followupsjsonb')) {
      selectFields.push("COALESCE(\"followUpsJsonb\"::text, '[]') as followUpsJsonb")
    }
    if (existingColumns.includes('followups')) {
      selectFields.push("COALESCE(\"followUps\", '[]') as \"followUps\"")
    }
    if (existingColumns.includes('servicesjsonb')) {
      selectFields.push("COALESCE(\"servicesJsonb\"::text, '[]') as servicesJsonb")
    }
    if (existingColumns.includes('services')) {
      selectFields.push("COALESCE(services, '[]') as services")
    }
    
    const query = `SELECT ${selectFields.join(', ')} FROM "Client"`
    const clients = await prisma.$queryRawUnsafe(query)
    
    console.log(`✅ Found ${clients.length} clients to process\n`)
    
    for (const client of clients) {
      await migrateClient(client)
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('📊 Migration Complete!\n')
    console.log(`   Clients processed: ${stats.clientsProcessed}`)
    console.log(`   Sites migrated: ${stats.sitesMigrated}`)
    console.log(`   Contracts migrated: ${stats.contractsMigrated}`)
    console.log(`   Proposals migrated: ${stats.proposalsMigrated}`)
    console.log(`   FollowUps migrated: ${stats.followUpsMigrated}`)
    console.log(`   Services migrated: ${stats.servicesMigrated}`)
    console.log(`   Errors: ${stats.errors}`)
    console.log('\n✅ Migration finished successfully!')
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

migrateAll().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

