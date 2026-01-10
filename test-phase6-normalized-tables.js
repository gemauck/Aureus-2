#!/usr/bin/env node
/**
 * Phase 6: Comprehensive Test Suite for Normalized Tables
 * Tests functionality, persistence, and checks for data duplication
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const TEST_CLIENT_NAME = `Test Phase6 Client - ${Date.now()}`
let testClientId = null
let testLeadId = null

let testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
}

function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${status}: ${name}${message ? ` - ${message}` : ''}`)
  testResults.tests.push({ name, passed, message })
  if (passed) {
    testResults.passed++
  } else {
    testResults.failed++
  }
}

function logWarning(message) {
  console.log(`⚠️  WARNING: ${message}`)
  testResults.warnings++
}

async function testCreateClientWithNormalizedData() {
  console.log('\n📝 Test 1: Create Client with Normalized Data')
  
  try {
    const client = await prisma.client.create({
      data: {
        name: TEST_CLIENT_NAME,
        type: 'client',
        status: 'Active',
        industry: 'Test',
        sites: '[]', // Should not be written
        sitesJsonb: [],
        contracts: '[]',
        contractsJsonb: [],
        proposals: '[]',
        proposalsJsonb: [],
        followUps: '[]',
        followUpsJsonb: [],
        services: '[]',
        servicesJsonb: [],
        contacts: '[]',
        contactsJsonb: [],
        comments: '[]',
        commentsJsonb: []
      }
    })
    testClientId = client.id
    
    // Create normalized data
    await prisma.clientSite.create({
      data: {
        clientId: client.id,
        name: 'Test Site 1',
        address: '123 Test St'
      }
    })
    
    await prisma.clientContract.create({
      data: {
        clientId: client.id,
        name: 'Test Contract 1',
        size: 100
      }
    })
    
    await prisma.clientProposal.create({
      data: {
        clientId: client.id,
        title: 'Test Proposal 1',
        amount: 5000
      }
    })
    
    await prisma.clientFollowUp.create({
      data: {
        clientId: client.id,
        date: '2025-01-20',
        type: 'Call',
        description: 'Test FollowUp'
      }
    })
    
    await prisma.clientService.create({
      data: {
        clientId: client.id,
        name: 'Test Service 1',
        price: 1000
      }
    })
    
    logTest('Create client with normalized data', true)
    return true
  } catch (error) {
    logTest('Create client with normalized data', false, error.message)
    return false
  }
}

async function testReadClientNormalizedData() {
  console.log('\n📖 Test 2: Read Client with Normalized Data')
  
  try {
    const client = await prisma.client.findUnique({
      where: { id: testClientId },
      include: {
        clientSites: true,
        clientContracts: true,
        clientProposals: true,
        clientFollowUps: true,
        clientServices: true
      }
    })
    
    if (!client) {
      logTest('Read client', false, 'Client not found')
      return false
    }
    
    const sitesCount = client.clientSites?.length || 0
    const contractsCount = client.clientContracts?.length || 0
    const proposalsCount = client.clientProposals?.length || 0
    const followUpsCount = client.clientFollowUps?.length || 0
    const servicesCount = client.clientServices?.length || 0
    
    const hasAllData = sitesCount === 1 && contractsCount === 1 && 
                       proposalsCount === 1 && followUpsCount === 1 && servicesCount === 1
    
    logTest('Read normalized data', hasAllData, 
      `Sites: ${sitesCount}, Contracts: ${contractsCount}, Proposals: ${proposalsCount}, FollowUps: ${followUpsCount}, Services: ${servicesCount}`)
    
    return hasAllData
  } catch (error) {
    logTest('Read client normalized data', false, error.message)
    return false
  }
}

async function testNoJSONWrites() {
  console.log('\n🚫 Test 3: Verify No JSON Writes')
  
  try {
    const client = await prisma.client.findUnique({
      where: { id: testClientId },
      select: {
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
    
    // Check that JSON fields are empty or contain only empty arrays
    const sitesJson = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : client.sitesJsonb || []
    const contractsJson = typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : client.contractsJsonb || []
    const proposalsJson = typeof client.proposals === 'string' ? JSON.parse(client.proposals || '[]') : client.proposalsJsonb || []
    const followUpsJson = typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : client.followUpsJsonb || []
    const servicesJson = typeof client.services === 'string' ? JSON.parse(client.services || '[]') : client.servicesJsonb || []
    
    const jsonFieldsEmpty = sitesJson.length === 0 && contractsJson.length === 0 && 
                           proposalsJson.length === 0 && followUpsJson.length === 0 && servicesJson.length === 0
    
    if (!jsonFieldsEmpty) {
      logWarning(`JSON fields contain data: Sites: ${sitesJson.length}, Contracts: ${contractsJson.length}, Proposals: ${proposalsJson.length}, FollowUps: ${followUpsJson.length}, Services: ${servicesJson.length}`)
    }
    
    logTest('No JSON writes', jsonFieldsEmpty, 
      jsonFieldsEmpty ? 'All JSON fields are empty' : 'JSON fields contain data (may be from old migration)')
    
    return true // Don't fail test, just warn
  } catch (error) {
    logTest('Verify no JSON writes', false, error.message)
    return false
  }
}

async function testNoDuplicates() {
  console.log('\n🔍 Test 4: Check for Duplicates')
  
  try {
    // Check normalized tables
    const sites = await prisma.clientSite.findMany({
      where: { clientId: testClientId }
    })
    
    const contracts = await prisma.clientContract.findMany({
      where: { clientId: testClientId }
    })
    
    const proposals = await prisma.clientProposal.findMany({
      where: { clientId: testClientId }
    })
    
    const followUps = await prisma.clientFollowUp.findMany({
      where: { clientId: testClientId }
    })
    
    const services = await prisma.clientService.findMany({
      where: { clientId: testClientId }
    })
    
    // Check for duplicate IDs
    const siteIds = sites.map(s => s.id)
    const contractIds = contracts.map(c => c.id)
    const proposalIds = proposals.map(p => p.id)
    const followUpIds = followUps.map(f => f.id)
    const serviceIds = services.map(s => s.id)
    
    const hasDuplicateSites = new Set(siteIds).size !== siteIds.length
    const hasDuplicateContracts = new Set(contractIds).size !== contractIds.length
    const hasDuplicateProposals = new Set(proposalIds).size !== proposalIds.length
    const hasDuplicateFollowUps = new Set(followUpIds).size !== followUpIds.length
    const hasDuplicateServices = new Set(serviceIds).size !== serviceIds.length
    
    const hasDuplicates = hasDuplicateSites || hasDuplicateContracts || hasDuplicateProposals || 
                         hasDuplicateFollowUps || hasDuplicateServices
    
    logTest('No duplicates in normalized tables', !hasDuplicates,
      hasDuplicates ? 'Found duplicates' : 'No duplicates found')
    
    return !hasDuplicates
  } catch (error) {
    logTest('Check for duplicates', false, error.message)
    return false
  }
}

async function testUpdateClientNormalizedData() {
  console.log('\n✏️  Test 5: Update Client Normalized Data')
  
  try {
    // Update site
    await prisma.clientSite.updateMany({
      where: { clientId: testClientId, name: 'Test Site 1' },
      data: { address: 'Updated Address' }
    })
    
    // Add another contract
    await prisma.clientContract.create({
      data: {
        clientId: testClientId,
        name: 'Test Contract 2',
        size: 200
      }
    })
    
    const updatedSites = await prisma.clientSite.findMany({
      where: { clientId: testClientId }
    })
    
    const updatedContracts = await prisma.clientContract.findMany({
      where: { clientId: testClientId }
    })
    
    const siteUpdated = updatedSites.some(s => s.address === 'Updated Address')
    const contractAdded = updatedContracts.length === 2
    
    logTest('Update normalized data', siteUpdated && contractAdded,
      `Site updated: ${siteUpdated}, Contracts: ${updatedContracts.length}`)
    
    return siteUpdated && contractAdded
  } catch (error) {
    logTest('Update client normalized data', false, error.message)
    return false
  }
}

async function testPersistence() {
  console.log('\n💾 Test 6: Test Persistence')
  
  try {
    // Disconnect and reconnect
    await prisma.$disconnect()
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const client = await prisma.client.findUnique({
      where: { id: testClientId },
      include: {
        clientSites: true,
        clientContracts: true,
        clientProposals: true,
        clientFollowUps: true,
        clientServices: true
      }
    })
    
    const persisted = client && 
                     client.clientSites.length > 0 &&
                     client.clientContracts.length > 0 &&
                     client.clientProposals.length > 0 &&
                     client.clientFollowUps.length > 0 &&
                     client.clientServices.length > 0
    
    logTest('Data persistence', persisted, 
      persisted ? 'All data persisted correctly' : 'Some data missing after reconnect')
    
    return persisted
  } catch (error) {
    logTest('Test persistence', false, error.message)
    return false
  }
}

async function testGlobalDuplicateCheck() {
  console.log('\n🌐 Test 7: Global Duplicate Check')
  
  try {
    // Check all clients for duplicate normalized records
    const allSites = await prisma.clientSite.groupBy({
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
    
    // Check for duplicate IDs across all records
    const allSiteIds = await prisma.clientSite.findMany({
      select: { id: true }
    })
    const uniqueSiteIds = new Set(allSiteIds.map(s => s.id))
    const hasDuplicateSiteIds = allSiteIds.length !== uniqueSiteIds.size
    
    if (hasDuplicateSiteIds) {
      logWarning('Found duplicate site IDs in database')
    }
    
    logTest('Global duplicate check', !hasDuplicateSiteIds,
      hasDuplicateSiteIds ? 'Found duplicate IDs' : 'No duplicate IDs found')
    
    return !hasDuplicateSiteIds
  } catch (error) {
    logTest('Global duplicate check', false, error.message)
    return false
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...')
  
  try {
    if (testClientId) {
      // Delete normalized records (cascade should handle this, but being explicit)
      await prisma.clientSite.deleteMany({ where: { clientId: testClientId } })
      await prisma.clientContract.deleteMany({ where: { clientId: testClientId } })
      await prisma.clientProposal.deleteMany({ where: { clientId: testClientId } })
      await prisma.clientFollowUp.deleteMany({ where: { clientId: testClientId } })
      await prisma.clientService.deleteMany({ where: { clientId: testClientId } })
      await prisma.client.delete({ where: { id: testClientId } })
      console.log('✅ Test client cleaned up')
    }
    
    if (testLeadId) {
      await prisma.client.delete({ where: { id: testLeadId } })
      console.log('✅ Test lead cleaned up')
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message)
  }
}

async function main() {
  console.log('🚀 Starting Phase 6 Comprehensive Test Suite')
  console.log('='.repeat(80))
  
  try {
    await testCreateClientWithNormalizedData()
    await testReadClientNormalizedData()
    await testNoJSONWrites()
    await testNoDuplicates()
    await testUpdateClientNormalizedData()
    await testPersistence()
    await testGlobalDuplicateCheck()
    
    console.log('\n' + '='.repeat(80))
    console.log('📊 Test Summary')
    console.log('='.repeat(80))
    console.log(`✅ Passed: ${testResults.passed}`)
    console.log(`❌ Failed: ${testResults.failed}`)
    console.log(`⚠️  Warnings: ${testResults.warnings}`)
    console.log(`📈 Total: ${testResults.passed + testResults.failed}`)
    console.log('='.repeat(80))
    
    if (testResults.failed > 0) {
      console.log('\n❌ Some tests failed!')
      process.exit(1)
    } else {
      console.log('\n✅ All tests passed!')
    }
  } catch (error) {
    console.error('❌ Test suite failed:', error)
    process.exit(1)
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }
}

main()

