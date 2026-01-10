#!/usr/bin/env node
/**
 * Check for Data Duplication Issues in Phase 6 Migration
 * - Checks for duplicate records in normalized tables
 * - Checks for data existing in both JSON and normalized tables
 * - Simulates UI data flow to detect potential duplication
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

let issues = []

function logIssue(severity, message, details = {}) {
  const issue = { severity, message, details }
  issues.push(issue)
  const icon = severity === 'ERROR' ? '❌' : severity === 'WARNING' ? '⚠️' : 'ℹ️'
  console.log(`${icon} ${severity}: ${message}`)
  if (Object.keys(details).length > 0) {
    console.log(`   Details:`, details)
  }
}

async function checkDuplicateNormalizedRecords() {
  console.log('\n🔍 Checking for Duplicate Records in Normalized Tables...')
  
  // Check for duplicate IDs
  const siteIds = await prisma.clientSite.findMany({
    select: { id: true }
  })
  const uniqueSiteIds = new Set(siteIds.map(s => s.id))
  if (siteIds.length !== uniqueSiteIds.size) {
    const duplicates = siteIds.filter((id, index) => siteIds.indexOf(id) !== index)
    logIssue('ERROR', 'Duplicate site IDs found', { count: siteIds.length - uniqueSiteIds.size, duplicates })
  }
  
  // Check for duplicate clientId + name combinations (should be unique per client)
  const siteGroups = await prisma.clientSite.groupBy({
    by: ['clientId', 'name'],
    _count: true,
    having: {
      name: {
        _count: {
          gt: 1
        }
      }
    }
  })
  
  if (siteGroups.length > 0) {
    logIssue('WARNING', 'Sites with duplicate name per client found', { count: siteGroups.length })
    for (const group of siteGroups.slice(0, 5)) {
      const duplicates = await prisma.clientSite.findMany({
        where: {
          clientId: group.clientId,
          name: group.name
        },
        select: { id: true, name: true, clientId: true }
      })
      logIssue('WARNING', `  Client ${group.clientId}: ${group.name} appears ${group._count} times`, { ids: duplicates.map(d => d.id) })
    }
  }
  
  // Similar checks for other tables
  const contractGroups = await prisma.clientContract.groupBy({
    by: ['clientId', 'name'],
    _count: true,
    having: {
      name: {
        _count: {
          gt: 1
        }
      }
    }
  })
  
  if (contractGroups.length > 0) {
    logIssue('WARNING', 'Contracts with duplicate name per client found', { count: contractGroups.length })
  }
  
  const proposalGroups = await prisma.clientProposal.groupBy({
    by: ['clientId', 'title'],
    _count: true,
    having: {
      title: {
        _count: {
          gt: 1
        }
      }
    }
  })
  
  if (proposalGroups.length > 0) {
    logIssue('WARNING', 'Proposals with duplicate title per client found', { count: proposalGroups.length })
  }
}

async function checkJSONvsNormalizedDuplication() {
  console.log('\n🔍 Checking for Data in Both JSON and Normalized Tables...')
  
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
  
  for (const client of clients) {
    // Parse JSON fields
    const sitesJson = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sitesJsonb || [])
    const contractsJson = typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contractsJsonb || [])
    const proposalsJson = typeof client.proposals === 'string' ? JSON.parse(client.proposals || '[]') : (client.proposalsJsonb || [])
    const followUpsJson = typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUpsJsonb || [])
    const servicesJson = typeof client.services === 'string' ? JSON.parse(client.services || '[]') : (client.servicesJsonb || [])
    
    // Check normalized tables
    const normalizedSites = await prisma.clientSite.findMany({
      where: { clientId: client.id },
      select: { id: true, name: true }
    })
    
    const normalizedContracts = await prisma.clientContract.findMany({
      where: { clientId: client.id },
      select: { id: true, name: true }
    })
    
    const normalizedProposals = await prisma.clientProposal.findMany({
      where: { clientId: client.id },
      select: { id: true, title: true }
    })
    
    const normalizedFollowUps = await prisma.clientFollowUp.findMany({
      where: { clientId: client.id },
      select: { id: true, description: true }
    })
    
    const normalizedServices = await prisma.clientService.findMany({
      where: { clientId: client.id },
      select: { id: true, name: true }
    })
    
    // Check if JSON and normalized both have data
    if (sitesJson.length > 0 && normalizedSites.length > 0) {
      // Check for matching IDs
      const jsonSiteIds = sitesJson.map(s => s?.id).filter(Boolean)
      const normalizedSiteIds = normalizedSites.map(s => s.id)
      const matchingIds = jsonSiteIds.filter(id => normalizedSiteIds.includes(id))
      
      if (matchingIds.length > 0) {
        logIssue('WARNING', `Client ${client.name}: Sites exist in both JSON and normalized tables`, {
          clientId: client.id,
          jsonCount: sitesJson.length,
          normalizedCount: normalizedSites.length,
          matchingIds
        })
      }
    }
    
    if (contractsJson.length > 0 && normalizedContracts.length > 0) {
      const jsonContractIds = contractsJson.map(c => c?.id).filter(Boolean)
      const normalizedContractIds = normalizedContracts.map(c => c.id)
      const matchingIds = jsonContractIds.filter(id => normalizedContractIds.includes(id))
      
      if (matchingIds.length > 0) {
        logIssue('WARNING', `Client ${client.name}: Contracts exist in both JSON and normalized tables`, {
          clientId: client.id,
          jsonCount: contractsJson.length,
          normalizedCount: normalizedContracts.length,
          matchingIds
        })
      }
    }
    
    if (proposalsJson.length > 0 && normalizedProposals.length > 0) {
      const jsonProposalIds = proposalsJson.map(p => p?.id).filter(Boolean)
      const normalizedProposalIds = normalizedProposals.map(p => p.id)
      const matchingIds = jsonProposalIds.filter(id => normalizedProposalIds.includes(id))
      
      if (matchingIds.length > 0) {
        logIssue('WARNING', `Client ${client.name}: Proposals exist in both JSON and normalized tables`, {
          clientId: client.id,
          jsonCount: proposalsJson.length,
          normalizedCount: normalizedProposals.length,
          matchingIds
        })
      }
    }
    
    if (followUpsJson.length > 0 && normalizedFollowUps.length > 0) {
      const jsonFollowUpIds = followUpsJson.map(f => f?.id).filter(Boolean).map(String)
      const normalizedFollowUpIds = normalizedFollowUps.map(f => String(f.id))
      const matchingIds = jsonFollowUpIds.filter(id => normalizedFollowUpIds.includes(id))
      
      if (matchingIds.length > 0) {
        logIssue('WARNING', `Client ${client.name}: FollowUps exist in both JSON and normalized tables`, {
          clientId: client.id,
          jsonCount: followUpsJson.length,
          normalizedCount: normalizedFollowUps.length,
          matchingIds
        })
      }
    }
    
    if (servicesJson.length > 0 && normalizedServices.length > 0) {
      const jsonServiceIds = servicesJson.map(s => s?.id).filter(Boolean)
      const normalizedServiceIds = normalizedServices.map(s => s.id)
      const matchingIds = jsonServiceIds.filter(id => normalizedServiceIds.includes(id))
      
      if (matchingIds.length > 0) {
        logIssue('WARNING', `Client ${client.name}: Services exist in both JSON and normalized tables`, {
          clientId: client.id,
          jsonCount: servicesJson.length,
          normalizedCount: normalizedServices.length,
          matchingIds
        })
      }
    }
  }
}

async function simulateUIDataFlow() {
  console.log('\n🔍 Simulating UI Data Flow...')
  
  // Get a sample client with normalized data
  const clientWithData = await prisma.client.findFirst({
    where: {
      clientSites: {
        some: {}
      }
    },
    include: {
      clientSites: true,
      clientContracts: true,
      clientProposals: true,
      clientFollowUps: true,
      clientServices: true
    }
  })
  
  if (!clientWithData) {
    logIssue('INFO', 'No clients with normalized data found for UI simulation')
    return
  }
  
  // Simulate what parseClientJsonFields does
  const normalizedSites = clientWithData.clientSites || []
  const normalizedContracts = clientWithData.clientContracts || []
  const normalizedProposals = clientWithData.clientProposals || []
  const normalizedFollowUps = clientWithData.clientFollowUps || []
  const normalizedServices = clientWithData.clientServices || []
  
  // Parse JSON fields (as fallback)
  const sitesJson = typeof clientWithData.sites === 'string' 
    ? JSON.parse(clientWithData.sites || '[]') 
    : (clientWithData.sitesJsonb || [])
  
  const contractsJson = typeof clientWithData.contracts === 'string'
    ? JSON.parse(clientWithData.contracts || '[]')
    : (clientWithData.contractsJsonb || [])
  
  // Simulate UI mergeUniqueById logic
  const mergeUniqueById = (items = [], extras = []) => {
    const map = new Map()
    const allItems = [...(items || []), ...(extras || [])]
    allItems.forEach(item => {
      if (item && item.id) {
        map.set(item.id, item)
      }
    })
    return Array.from(map.values())
  }
  
  // Simulate what UI would see
  const uiSites = mergeUniqueById(normalizedSites, sitesJson)
  const uiContracts = mergeUniqueById(normalizedContracts, contractsJson)
  
  if (uiSites.length > normalizedSites.length) {
    logIssue('ERROR', `UI would show ${uiSites.length} sites (${normalizedSites.length} normalized + ${sitesJson.length} JSON)`, {
      clientId: clientWithData.id,
      clientName: clientWithData.name
    })
  }
  
  if (uiContracts.length > normalizedContracts.length) {
    logIssue('ERROR', `UI would show ${uiContracts.length} contracts (${normalizedContracts.length} normalized + ${contractsJson.length} JSON)`, {
      clientId: clientWithData.id,
      clientName: clientWithData.name
    })
  }
  
  // However, since parseClientJsonFields uses normalized tables first and only falls back to JSON,
  // this should not be an issue. But let's verify the API response structure.
  logIssue('INFO', `UI simulation complete for client ${clientWithData.name}`, {
    sites: { normalized: normalizedSites.length, json: sitesJson.length, ui: uiSites.length },
    contracts: { normalized: normalizedContracts.length, json: contractsJson.length, ui: uiContracts.length }
  })
}

async function checkAPIParsing() {
  console.log('\n🔍 Checking API Response Parsing...')
  
  // Get a client and check what parseClientJsonFields would return
  const client = await prisma.client.findFirst({
    include: {
      clientSites: true,
      clientContracts: true,
      clientProposals: true,
      clientFollowUps: true,
      clientServices: true
    }
  })
  
  if (!client) {
    logIssue('INFO', 'No clients found for API parsing check')
    return
  }
  
  // Simulate parseClientJsonFields logic
  const parsedSites = client.clientSites && client.clientSites.length > 0
    ? client.clientSites.map(site => ({
        id: site.id,
        name: site.name,
        address: site.address || '',
        contactPerson: site.contactPerson || '',
        contactPhone: site.contactPhone || '',
        contactEmail: site.contactEmail || '',
        notes: site.notes || ''
      }))
    : (() => {
        let value = client.sitesJsonb
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
          const stringValue = client.sites
          if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
            try {
              value = JSON.parse(stringValue)
            } catch (e) {
              value = []
            }
          } else {
            value = []
          }
        }
        return Array.isArray(value) ? value : []
      })()
  
  logIssue('INFO', `API parsing check for client ${client.name}`, {
    normalizedSites: client.clientSites?.length || 0,
    parsedSites: parsedSites.length,
    jsonSites: typeof client.sites === 'string' ? JSON.parse(client.sites || '[]').length : (client.sitesJsonb || []).length
  })
  
  if (client.clientSites && client.clientSites.length > 0 && parsedSites.length !== client.clientSites.length) {
    logIssue('ERROR', 'API parsing mismatch - normalized sites count does not match parsed sites', {
      clientId: client.id,
      normalizedCount: client.clientSites.length,
      parsedCount: parsedSites.length
    })
  }
}

async function main() {
  console.log('🚀 Starting Phase 6 Duplication Check')
  console.log('='.repeat(80))
  
  try {
    await checkDuplicateNormalizedRecords()
    await checkJSONvsNormalizedDuplication()
    await simulateUIDataFlow()
    await checkAPIParsing()
    
    console.log('\n' + '='.repeat(80))
    console.log('📊 Summary')
    console.log('='.repeat(80))
    
    const errors = issues.filter(i => i.severity === 'ERROR')
    const warnings = issues.filter(i => i.severity === 'WARNING')
    const info = issues.filter(i => i.severity === 'INFO')
    
    console.log(`❌ Errors: ${errors.length}`)
    console.log(`⚠️  Warnings: ${warnings.length}`)
    console.log(`ℹ️  Info: ${info.length}`)
    console.log('='.repeat(80))
    
    if (errors.length > 0) {
      console.log('\n❌ CRITICAL ISSUES FOUND:')
      errors.forEach(issue => {
        console.log(`  - ${issue.message}`)
      })
      process.exit(1)
    } else if (warnings.length > 0) {
      console.log('\n⚠️  Warnings found but no critical errors')
      process.exit(0)
    } else {
      console.log('\n✅ No duplication issues found!')
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Check failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

