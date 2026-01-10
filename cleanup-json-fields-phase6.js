#!/usr/bin/env node
/**
 * Cleanup JSON Fields After Phase 6 Migration
 * Removes data from JSON fields that has been migrated to normalized tables
 * This prevents potential duplication issues in the UI
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function cleanupJSONFields() {
  console.log('🧹 Cleaning up JSON fields after Phase 6 migration...')
  console.log('='.repeat(80))
  
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
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
  
  let cleaned = 0
  let skipped = 0
  
  for (const client of clients) {
    let needsUpdate = false
    const updateData = {}
    
    // Check sites
    const normalizedSites = await prisma.clientSite.findMany({
      where: { clientId: client.id },
      select: { id: true }
    })
    
    if (normalizedSites.length > 0) {
      const sitesJson = typeof client.sites === 'string' 
        ? JSON.parse(client.sites || '[]') 
        : (client.sitesJsonb || [])
      
      if (sitesJson.length > 0) {
        const jsonSiteIds = sitesJson.map(s => s?.id).filter(Boolean)
        const normalizedSiteIds = normalizedSites.map(s => s.id)
        const matchingIds = jsonSiteIds.filter(id => normalizedSiteIds.includes(id))
        
        if (matchingIds.length > 0) {
          // Clear JSON field since data is in normalized table
          updateData.sites = '[]'
          updateData.sitesJsonb = []
          needsUpdate = true
        }
      }
    }
    
    // Check contracts
    const normalizedContracts = await prisma.clientContract.findMany({
      where: { clientId: client.id },
      select: { id: true }
    })
    
    if (normalizedContracts.length > 0) {
      const contractsJson = typeof client.contracts === 'string'
        ? JSON.parse(client.contracts || '[]')
        : (client.contractsJsonb || [])
      
      if (contractsJson.length > 0) {
        const jsonContractIds = contractsJson.map(c => c?.id).filter(Boolean)
        const normalizedContractIds = normalizedContracts.map(c => c.id)
        const matchingIds = jsonContractIds.filter(id => normalizedContractIds.includes(id))
        
        if (matchingIds.length > 0) {
          updateData.contracts = '[]'
          updateData.contractsJsonb = []
          needsUpdate = true
        }
      }
    }
    
    // Check proposals
    const normalizedProposals = await prisma.clientProposal.findMany({
      where: { clientId: client.id },
      select: { id: true }
    })
    
    if (normalizedProposals.length > 0) {
      const proposalsJson = typeof client.proposals === 'string'
        ? JSON.parse(client.proposals || '[]')
        : (client.proposalsJsonb || [])
      
      if (proposalsJson.length > 0) {
        const jsonProposalIds = proposalsJson.map(p => p?.id).filter(Boolean)
        const normalizedProposalIds = normalizedProposals.map(p => p.id)
        const matchingIds = jsonProposalIds.filter(id => normalizedProposalIds.includes(id))
        
        if (matchingIds.length > 0) {
          updateData.proposals = '[]'
          updateData.proposalsJsonb = []
          needsUpdate = true
        }
      }
    }
    
    // Check followUps
    const normalizedFollowUps = await prisma.clientFollowUp.findMany({
      where: { clientId: client.id },
      select: { id: true }
    })
    
    if (normalizedFollowUps.length > 0) {
      const followUpsJson = typeof client.followUps === 'string'
        ? JSON.parse(client.followUps || '[]')
        : (client.followUpsJsonb || [])
      
      if (followUpsJson.length > 0) {
        const jsonFollowUpIds = followUpsJson.map(f => String(f?.id)).filter(Boolean)
        const normalizedFollowUpIds = normalizedFollowUps.map(f => String(f.id))
        const matchingIds = jsonFollowUpIds.filter(id => normalizedFollowUpIds.includes(id))
        
        if (matchingIds.length > 0) {
          updateData.followUps = '[]'
          updateData.followUpsJsonb = []
          needsUpdate = true
        }
      }
    }
    
    // Check services
    const normalizedServices = await prisma.clientService.findMany({
      where: { clientId: client.id },
      select: { id: true }
    })
    
    if (normalizedServices.length > 0) {
      const servicesJson = typeof client.services === 'string'
        ? JSON.parse(client.services || '[]')
        : (client.servicesJsonb || [])
      
      if (servicesJson.length > 0) {
        const jsonServiceIds = servicesJson.map(s => s?.id).filter(Boolean)
        const normalizedServiceIds = normalizedServices.map(s => s.id)
        const matchingIds = jsonServiceIds.filter(id => normalizedServiceIds.includes(id))
        
        if (matchingIds.length > 0) {
          updateData.services = '[]'
          updateData.servicesJsonb = []
          needsUpdate = true
        }
      }
    }
    
    if (needsUpdate) {
      try {
        await prisma.client.update({
          where: { id: client.id },
          data: updateData
        })
        cleaned++
        console.log(`✅ Cleaned up JSON fields for: ${client.name}`)
      } catch (error) {
        console.error(`❌ Error cleaning up ${client.name}:`, error.message)
        skipped++
      }
    } else {
      skipped++
    }
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('📊 Cleanup Summary')
  console.log('='.repeat(80))
  console.log(`✅ Cleaned: ${cleaned} clients`)
  console.log(`⏭️  Skipped: ${skipped} clients`)
  console.log('='.repeat(80))
}

async function main() {
  try {
    await cleanupJSONFields()
    console.log('\n✅ Cleanup completed!')
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

