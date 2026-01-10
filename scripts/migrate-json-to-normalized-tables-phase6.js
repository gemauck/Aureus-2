#!/usr/bin/env node
/**
 * Phase 6 Migration: Migrate sites, contracts, proposals, followUps, services
 * from JSON fields to normalized tables (ClientSite, ClientContract, ClientProposal, ClientFollowUp, ClientService)
 * 
 * This script:
 * 1. Reads existing JSON data from Client.sites, Client.contracts, Client.proposals, Client.followUps, Client.services
 * 2. Creates records in normalized tables
 * 3. Uses upsert to avoid duplicates
 * 
 * Safe to run multiple times (idempotent)
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function parseJsonField(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (e) {
      return []
    }
  }
  return []
}

async function migrateSites(client) {
  const sites = await parseJsonField(client.sitesJsonb || client.sites)
  if (!sites || sites.length === 0) return { created: 0, updated: 0, skipped: 0 }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const site of sites) {
    if (!site || !site.name) {
      skipped++
      continue
    }

    const siteData = {
      clientId: client.id,
      name: site.name || '',
      address: site.address || '',
      contactPerson: site.contactPerson || '',
      contactPhone: site.contactPhone || '',
      contactEmail: site.contactEmail || '',
      notes: site.notes || ''
    }

    try {
      if (site.id) {
        // Try to create with existing ID
        try {
          await prisma.clientSite.create({
            data: {
              id: site.id,
              ...siteData
            }
          })
          created++
        } catch (createError) {
          if (createError.code === 'P2002') {
            // Already exists, update it
            await prisma.clientSite.update({
              where: { id: site.id },
              data: siteData
            })
            updated++
          } else {
            throw createError
          }
        }
      } else {
        // Create without ID
        await prisma.clientSite.create({ data: siteData })
        created++
      }
    } catch (error) {
      console.error(`❌ Error migrating site for client ${client.id}:`, error.message)
      skipped++
    }
  }

  return { created, updated, skipped }
}

async function migrateContracts(client) {
  const contracts = await parseJsonField(client.contractsJsonb || client.contracts)
  if (!contracts || contracts.length === 0) return { created: 0, updated: 0, skipped: 0 }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const contract of contracts) {
    if (!contract || !contract.name) {
      skipped++
      continue
    }

    const contractData = {
      clientId: client.id,
      name: contract.name || '',
      size: contract.size || 0,
      type: contract.type || '',
      url: contract.url || '',
      uploadDate: contract.uploadDate ? new Date(contract.uploadDate) : new Date()
    }

    try {
      if (contract.id) {
        try {
          await prisma.clientContract.create({
            data: {
              id: contract.id,
              ...contractData
            }
          })
          created++
        } catch (createError) {
          if (createError.code === 'P2002') {
            await prisma.clientContract.update({
              where: { id: contract.id },
              data: contractData
            })
            updated++
          } else {
            throw createError
          }
        }
      } else {
        await prisma.clientContract.create({ data: contractData })
        created++
      }
    } catch (error) {
      console.error(`❌ Error migrating contract for client ${client.id}:`, error.message)
      skipped++
    }
  }

  return { created, updated, skipped }
}

async function migrateProposals(client) {
  const proposals = await parseJsonField(client.proposalsJsonb || client.proposals)
  if (!proposals || proposals.length === 0) return { created: 0, updated: 0, skipped: 0 }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const proposal of proposals) {
    if (!proposal) {
      skipped++
      continue
    }

    const proposalData = {
      clientId: client.id,
      title: proposal.title || '',
      amount: proposal.amount || 0,
      status: proposal.status || 'Pending',
      workingDocumentLink: proposal.workingDocumentLink || '',
      createdDate: proposal.createdDate ? new Date(proposal.createdDate) : null,
      expiryDate: proposal.expiryDate ? new Date(proposal.expiryDate) : null,
      notes: proposal.notes || ''
    }

    try {
      if (proposal.id) {
        try {
          await prisma.clientProposal.create({
            data: {
              id: proposal.id,
              ...proposalData
            }
          })
          created++
        } catch (createError) {
          if (createError.code === 'P2002') {
            await prisma.clientProposal.update({
              where: { id: proposal.id },
              data: proposalData
            })
            updated++
          } else {
            throw createError
          }
        }
      } else {
        await prisma.clientProposal.create({ data: proposalData })
        created++
      }
    } catch (error) {
      console.error(`❌ Error migrating proposal for client ${client.id}:`, error.message)
      skipped++
    }
  }

  return { created, updated, skipped }
}

async function migrateFollowUps(client) {
  const followUps = await parseJsonField(client.followUpsJsonb || client.followUps)
  if (!followUps || followUps.length === 0) return { created: 0, updated: 0, skipped: 0 }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const followUp of followUps) {
    if (!followUp) {
      skipped++
      continue
    }

    const followUpData = {
      clientId: client.id,
      date: followUp.date || '',
      time: followUp.time || '',
      type: followUp.type || 'Call',
      description: followUp.description || '',
      completed: !!followUp.completed,
      assignedTo: followUp.assignedTo || null
    }

    try {
      if (followUp.id) {
        try {
          await prisma.clientFollowUp.create({
            data: {
              id: followUp.id,
              ...followUpData
            }
          })
          created++
        } catch (createError) {
          if (createError.code === 'P2002') {
            await prisma.clientFollowUp.update({
              where: { id: followUp.id },
              data: followUpData
            })
            updated++
          } else {
            throw createError
          }
        }
      } else {
        await prisma.clientFollowUp.create({ data: followUpData })
        created++
      }
    } catch (error) {
      console.error(`❌ Error migrating followUp for client ${client.id}:`, error.message)
      skipped++
    }
  }

  return { created, updated, skipped }
}

async function migrateServices(client) {
  const services = await parseJsonField(client.servicesJsonb || client.services)
  if (!services || services.length === 0) return { created: 0, updated: 0, skipped: 0 }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const service of services) {
    if (!service || !service.name) {
      skipped++
      continue
    }

    const serviceData = {
      clientId: client.id,
      name: service.name || '',
      description: service.description || '',
      price: service.price || 0,
      status: service.status || 'Active',
      startDate: service.startDate ? new Date(service.startDate) : null,
      endDate: service.endDate ? new Date(service.endDate) : null,
      notes: service.notes || ''
    }

    try {
      if (service.id) {
        try {
          await prisma.clientService.create({
            data: {
              id: service.id,
              ...serviceData
            }
          })
          created++
        } catch (createError) {
          if (createError.code === 'P2002') {
            await prisma.clientService.update({
              where: { id: service.id },
              data: serviceData
            })
            updated++
          } else {
            throw createError
          }
        }
      } else {
        await prisma.clientService.create({ data: serviceData })
        created++
      }
    } catch (error) {
      console.error(`❌ Error migrating service for client ${client.id}:`, error.message)
      skipped++
    }
  }

  return { created, updated, skipped }
}

async function main() {
  console.log('🚀 Starting Phase 6 Migration: Sites, Contracts, Proposals, FollowUps, Services')
  console.log('=' .repeat(80))

  try {
    // Get all clients (both clients and leads)
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        sites: true,
        sitesJsonb: true,
        contracts: true,
        contractsJsonb: true,
        proposals: true,
        proposalsJsonb: true,
        followUps: true,
        followUpsJsonb: true,
        services: true,
        servicesJsonb: true
      }
    })

    console.log(`📊 Found ${clients.length} clients/leads to process`)

    const stats = {
      clients: { processed: 0, errors: 0 },
      sites: { created: 0, updated: 0, skipped: 0 },
      contracts: { created: 0, updated: 0, skipped: 0 },
      proposals: { created: 0, updated: 0, skipped: 0 },
      followUps: { created: 0, updated: 0, skipped: 0 },
      services: { created: 0, updated: 0, skipped: 0 }
    }

    for (const client of clients) {
      try {
        console.log(`\n📝 Processing client: ${client.name} (${client.id})`)

        // Migrate sites
        const sitesResult = await migrateSites(client)
        stats.sites.created += sitesResult.created
        stats.sites.updated += sitesResult.updated
        stats.sites.skipped += sitesResult.skipped
        if (sitesResult.created > 0 || sitesResult.updated > 0) {
          console.log(`  ✅ Sites: ${sitesResult.created} created, ${sitesResult.updated} updated, ${sitesResult.skipped} skipped`)
        }

        // Migrate contracts
        const contractsResult = await migrateContracts(client)
        stats.contracts.created += contractsResult.created
        stats.contracts.updated += contractsResult.updated
        stats.contracts.skipped += contractsResult.skipped
        if (contractsResult.created > 0 || contractsResult.updated > 0) {
          console.log(`  ✅ Contracts: ${contractsResult.created} created, ${contractsResult.updated} updated, ${contractsResult.skipped} skipped`)
        }

        // Migrate proposals
        const proposalsResult = await migrateProposals(client)
        stats.proposals.created += proposalsResult.created
        stats.proposals.updated += proposalsResult.updated
        stats.proposals.skipped += proposalsResult.skipped
        if (proposalsResult.created > 0 || proposalsResult.updated > 0) {
          console.log(`  ✅ Proposals: ${proposalsResult.created} created, ${proposalsResult.updated} updated, ${proposalsResult.skipped} skipped`)
        }

        // Migrate followUps
        const followUpsResult = await migrateFollowUps(client)
        stats.followUps.created += followUpsResult.created
        stats.followUps.updated += followUpsResult.updated
        stats.followUps.skipped += followUpsResult.skipped
        if (followUpsResult.created > 0 || followUpsResult.updated > 0) {
          console.log(`  ✅ FollowUps: ${followUpsResult.created} created, ${followUpsResult.updated} updated, ${followUpsResult.skipped} skipped`)
        }

        // Migrate services
        const servicesResult = await migrateServices(client)
        stats.services.created += servicesResult.created
        stats.services.updated += servicesResult.updated
        stats.services.skipped += servicesResult.skipped
        if (servicesResult.created > 0 || servicesResult.updated > 0) {
          console.log(`  ✅ Services: ${servicesResult.created} created, ${servicesResult.updated} updated, ${servicesResult.skipped} skipped`)
        }

        stats.clients.processed++
      } catch (error) {
        console.error(`❌ Error processing client ${client.id}:`, error.message)
        stats.clients.errors++
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('📊 Migration Summary')
    console.log('='.repeat(80))
    console.log(`Clients processed: ${stats.clients.processed}`)
    console.log(`Clients errors: ${stats.clients.errors}`)
    console.log(`\nSites: ${stats.sites.created} created, ${stats.sites.updated} updated, ${stats.sites.skipped} skipped`)
    console.log(`Contracts: ${stats.contracts.created} created, ${stats.contracts.updated} updated, ${stats.contracts.skipped} skipped`)
    console.log(`Proposals: ${stats.proposals.created} created, ${stats.proposals.updated} updated, ${stats.proposals.skipped} skipped`)
    console.log(`FollowUps: ${stats.followUps.created} created, ${stats.followUps.updated} updated, ${stats.followUps.skipped} skipped`)
    console.log(`Services: ${stats.services.created} created, ${stats.services.updated} updated, ${stats.services.skipped} skipped`)
    console.log('='.repeat(80))
    console.log('✅ Migration completed!')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

