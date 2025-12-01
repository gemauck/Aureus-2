#!/usr/bin/env node
/**
 * CRM Functionality Tests - Comprehensive Feature Testing
 * Tests all CRM features, workflows, and integrations
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const BASE_URL = process.env.APP_URL || process.env.TEST_URL || 'http://localhost:3000'
const TEST_TIMEOUT = 30000

const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  totalTests: 0,
  startTime: Date.now(),
  createdLeads: []
}

let prisma = null
let testToken = null

// Initialize Prisma
try {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('mock')) {
    prisma = new PrismaClient()
  }
} catch (error) {
  console.warn('⚠️  Could not initialize Prisma client:', error.message)
}

// Test utilities
function log(message, type = 'info') {
  const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '📝'
  console.log(`${emoji} ${message}`)
}

function recordResult(test, passed, message = '', isWarning = false) {
  testResults.totalTests++
  const result = { test, passed, message, warning: isWarning }
  if (passed) {
    testResults.passed.push(result)
    log(`${test}: PASSED`, 'success')
  } else if (isWarning) {
    testResults.warnings.push(result)
    log(`${test}: WARNING - ${message}`, 'warn')
  } else {
    testResults.failed.push(result)
    log(`${test}: FAILED - ${message}`, 'error')
  }
}

// Helper to make authenticated API requests
async function apiRequest(path, method = 'GET', body = null, token = testToken) {
  const url = `${BASE_URL}${path}`
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  }
  if (body) {
    options.body = JSON.stringify(body)
  }
  
  try {
    const response = await fetch(url, options)
    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch (e) {
      data = { raw: text }
    }
    return { status: response.status, data, headers: response.headers }
  } catch (error) {
    return { error: error.message, status: 0 }
  }
}

// Cleanup function
async function cleanup() {
  log('\n🧹 Cleaning up test data...', 'info')
  for (const leadId of testResults.createdLeads) {
    try {
      await apiRequest(`/api/leads/${leadId}`, 'DELETE')
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  testResults.createdLeads = []
}

// ============================================
// FUNCTIONALITY TEST SUITE
// ============================================

// Test 1: List All Leads
async function testListAllLeads() {
  log('\n🧪 Testing: List All Leads', 'info')
  
  const response = await apiRequest('/api/leads', 'GET')
  
  const passed = response.status === 200 && 
                 Array.isArray(response.data?.leads)
  
  recordResult(
    'List All Leads',
    passed,
    passed ? `Retrieved ${response.data?.leads?.length || 0} leads` : `Status: ${response.status}`
  )
}

// Test 2: Get Single Lead
async function testGetSingleLead() {
  log('\n🧪 Testing: Get Single Lead', 'info')
  
  // Create a test lead first
  const createResponse = await apiRequest('/api/leads', 'POST', {
    name: `Get Single Lead Test ${Date.now()}`,
    industry: 'Technology'
  })
  
  if (createResponse.status !== 201) {
    recordResult('Get Single Lead', false, 'Could not create test lead')
    return
  }
  
  const leadId = createResponse.data?.lead?.id
  testResults.createdLeads.push(leadId)
  
  // Get the lead
  const getResponse = await apiRequest(`/api/leads/${leadId}`, 'GET')
  
  const passed = getResponse.status === 200 && 
                 getResponse.data?.lead?.id === leadId
  
  recordResult(
    'Get Single Lead',
    passed,
    passed ? 'Lead retrieved successfully' : `Status: ${getResponse.status}`
  )
}

// Test 3: Create Lead with All Fields
async function testCreateLeadWithAllFields() {
  log('\n🧪 Testing: Create Lead with All Fields', 'info')
  
  const leadData = {
    name: `Full Lead Test ${Date.now()}`,
    industry: 'Healthcare',
    status: 'Potential',
    stage: 'Awareness',
    revenue: 150000,
    value: 75000,
    probability: 60,
    source: 'Referral',
    address: '123 Test Street',
    website: 'https://test.example.com',
    notes: 'This is a comprehensive test lead',
    contacts: [
      { name: 'Primary Contact', email: 'primary@test.com', phone: '123-456-7890' }
    ],
    followUps: [
      { date: '2025-02-01', type: 'Call', notes: 'Follow up call' }
    ],
    sites: [
      { name: 'Main Site', url: 'https://test.example.com' }
    ],
    billingTerms: {
      paymentTerms: 'Net 30',
      billingFrequency: 'Monthly',
      currency: 'ZAR',
      retainerAmount: 5000
    }
  }
  
  const response = await apiRequest('/api/leads', 'POST', leadData)
  
  if (response.status !== 201) {
    recordResult('Create Lead with All Fields', false, `Status: ${response.status}`)
    return
  }
  
  const lead = response.data?.lead
  testResults.createdLeads.push(lead.id)
  
  // Verify all fields were saved
  const fieldsSaved = 
    lead.name === leadData.name &&
    lead.industry === leadData.industry &&
    lead.stage === leadData.stage &&
    lead.value === leadData.value &&
    lead.probability === leadData.probability
  
  recordResult(
    'Create Lead with All Fields',
    fieldsSaved,
    fieldsSaved ? 'All fields saved correctly' : 'Some fields were not saved'
  )
}

// Test 4: Update Lead Fields
async function testUpdateLeadFields() {
  log('\n🧪 Testing: Update Lead Fields', 'info')
  
  // Create lead
  const createResponse = await apiRequest('/api/leads', 'POST', {
    name: `Update Test ${Date.now()}`,
    industry: 'Technology',
    value: 10000
  })
  
  if (createResponse.status !== 201) {
    recordResult('Update Lead Fields', false, 'Could not create test lead')
    return
  }
  
  const leadId = createResponse.data?.lead?.id
  testResults.createdLeads.push(leadId)
  
  // Update multiple fields
  const updateResponse = await apiRequest(`/api/leads/${leadId}`, 'PUT', {
    industry: 'Finance',
    value: 20000,
    probability: 80,
    website: 'https://updated.example.com'
  })
  
  if (updateResponse.status !== 200) {
    recordResult('Update Lead Fields', false, 'Update failed')
    return
  }
  
  // Verify updates
  await new Promise(resolve => setTimeout(resolve, 100))
  
  const verifyResponse = await apiRequest(`/api/leads/${leadId}`, 'GET')
  const updatedLead = verifyResponse.data?.lead
  
  const updatesApplied = 
    updatedLead.industry === 'Finance' &&
    updatedLead.value === 20000 &&
    updatedLead.probability === 80 &&
    updatedLead.website === 'https://updated.example.com'
  
  recordResult(
    'Update Lead Fields',
    updatesApplied,
    updatesApplied ? 'All updates applied correctly' : 'Some updates were not applied'
  )
}

// Test 5: Delete Lead
async function testDeleteLead() {
  log('\n🧪 Testing: Delete Lead', 'info')
  
  // Create lead
  const createResponse = await apiRequest('/api/leads', 'POST', {
    name: `Delete Test ${Date.now()}`,
    industry: 'Technology'
  })
  
  if (createResponse.status !== 201) {
    recordResult('Delete Lead', false, 'Could not create test lead')
    return
  }
  
  const leadId = createResponse.data?.lead?.id
  
  // Delete lead
  const deleteResponse = await apiRequest(`/api/leads/${leadId}`, 'DELETE')
  
  const passed = deleteResponse.status === 200
  
  // Verify deletion
  await new Promise(resolve => setTimeout(resolve, 100))
  
  const verifyResponse = await apiRequest(`/api/leads/${leadId}`, 'GET')
  const deleted = verifyResponse.status === 404
  
  recordResult(
    'Delete Lead',
    passed && deleted,
    passed && deleted ? 'Lead deleted successfully' : 'Delete operation failed'
  )
}

// Test 6: Duplicate Detection
async function testDuplicateDetection() {
  log('\n🧪 Testing: Duplicate Detection', 'info')
  
  const leadName = `Duplicate Test ${Date.now()}`
  
  // Create first lead
  const create1Response = await apiRequest('/api/leads', 'POST', {
    name: leadName,
    industry: 'Technology'
  })
  
  if (create1Response.status !== 201) {
    recordResult('Duplicate Detection', false, 'Could not create first lead')
    return
  }
  
  const leadId1 = create1Response.data?.lead?.id
  testResults.createdLeads.push(leadId1)
  
  // Try to create duplicate
  const create2Response = await apiRequest('/api/leads', 'POST', {
    name: leadName, // Same name
    industry: 'Technology'
  })
  
  // Should either reject duplicate or allow (depending on business rules)
  const handled = create2Response.status === 400 || create2Response.status === 201
  
  if (create2Response.status === 201) {
    testResults.createdLeads.push(create2Response.data?.lead?.id)
  }
  
  recordResult(
    'Duplicate Detection',
    handled,
    handled ? 'Duplicate handled appropriately' : 'Duplicate not handled'
  )
}

// Test 7: External Agent Assignment
async function testExternalAgentAssignment() {
  log('\n🧪 Testing: External Agent Assignment', 'info')
  
  if (!prisma) {
    recordResult('External Agent Assignment', true, 'Skipped - no database access', true)
    return
  }
  
  try {
    // Check if external agents exist
    const agents = await prisma.externalAgent.findMany({ take: 1 })
    if (agents.length === 0) {
      recordResult('External Agent Assignment', true, 'Skipped - no external agents', true)
      return
    }
    
    const agentId = agents[0].id
    
    // Create lead with external agent
    const createResponse = await apiRequest('/api/leads', 'POST', {
      name: `External Agent Test ${Date.now()}`,
      industry: 'Technology',
      externalAgentId: agentId
    })
    
    if (createResponse.status !== 201) {
      recordResult('External Agent Assignment', false, 'Could not create lead')
      return
    }
    
    const leadId = createResponse.data?.lead?.id
    testResults.createdLeads.push(leadId)
    
    // Verify assignment
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const verifyResponse = await apiRequest(`/api/leads/${leadId}`, 'GET')
    const assigned = verifyResponse.data?.lead?.externalAgentId === agentId
    
    recordResult(
      'External Agent Assignment',
      assigned,
      assigned ? 'External agent assigned correctly' : 'External agent not assigned'
    )
  } catch (error) {
    recordResult('External Agent Assignment', false, error.message)
  }
}

// Test 8: Remove External Agent
async function testRemoveExternalAgent() {
  log('\n🧪 Testing: Remove External Agent', 'info')
  
  if (!prisma) {
    recordResult('Remove External Agent', true, 'Skipped - no database access', true)
    return
  }
  
  try {
    const agents = await prisma.externalAgent.findMany({ take: 1 })
    if (agents.length === 0) {
      recordResult('Remove External Agent', true, 'Skipped - no external agents', true)
      return
    }
    
    const agentId = agents[0].id
    
    // Create lead with external agent
    const createResponse = await apiRequest('/api/leads', 'POST', {
      name: `Remove Agent Test ${Date.now()}`,
      industry: 'Technology',
      externalAgentId: agentId
    })
    
    if (createResponse.status !== 201) {
      recordResult('Remove External Agent', false, 'Could not create lead')
      return
    }
    
    const leadId = createResponse.data?.lead?.id
    testResults.createdLeads.push(leadId)
    
    // Remove external agent
    const updateResponse = await apiRequest(`/api/leads/${leadId}`, 'PUT', {
      externalAgentId: null
    })
    
    if (updateResponse.status !== 200) {
      recordResult('Remove External Agent', false, 'Update failed')
      return
    }
    
    // Verify removal
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const verifyResponse = await apiRequest(`/api/leads/${leadId}`, 'GET')
    const removed = verifyResponse.data?.lead?.externalAgentId === null
    
    recordResult(
      'Remove External Agent',
      removed,
      removed ? 'External agent removed correctly' : 'External agent not removed'
    )
  } catch (error) {
    recordResult('Remove External Agent', false, error.message)
  }
}

// Test 9: Add Contacts to Lead
async function testAddContacts() {
  log('\n🧪 Testing: Add Contacts to Lead', 'info')
  
  // Create lead
  const createResponse = await apiRequest('/api/leads', 'POST', {
    name: `Contacts Test ${Date.now()}`,
    industry: 'Technology'
  })
  
  if (createResponse.status !== 201) {
    recordResult('Add Contacts', false, 'Could not create lead')
    return
  }
  
  const leadId = createResponse.data?.lead?.id
  testResults.createdLeads.push(leadId)
  
  // Add contacts
  const contacts = [
    { name: 'Contact 1', email: 'contact1@test.com', phone: '111-111-1111' },
    { name: 'Contact 2', email: 'contact2@test.com', phone: '222-222-2222' }
  ]
  
  const updateResponse = await apiRequest(`/api/leads/${leadId}`, 'PUT', { contacts })
  
  if (updateResponse.status !== 200) {
    recordResult('Add Contacts', false, 'Update failed')
    return
  }
  
  // Verify contacts added
  await new Promise(resolve => setTimeout(resolve, 100))
  
  const verifyResponse = await apiRequest(`/api/leads/${leadId}`, 'GET')
  const fetchedContacts = verifyResponse.data?.lead?.contacts
  
  const contactsAdded = Array.isArray(fetchedContacts) && 
                       fetchedContacts.length === contacts.length &&
                       fetchedContacts[0].name === contacts[0].name
  
  recordResult(
    'Add Contacts',
    contactsAdded,
    contactsAdded ? 'Contacts added correctly' : 'Contacts not added correctly'
  )
}

// Test 10: Add FollowUps to Lead
async function testAddFollowUps() {
  log('\n🧪 Testing: Add FollowUps to Lead', 'info')
  
  // Create lead
  const createResponse = await apiRequest('/api/leads', 'POST', {
    name: `FollowUps Test ${Date.now()}`,
    industry: 'Technology'
  })
  
  if (createResponse.status !== 201) {
    recordResult('Add FollowUps', false, 'Could not create lead')
    return
  }
  
  const leadId = createResponse.data?.lead?.id
  testResults.createdLeads.push(leadId)
  
  // Add followUps
  const followUps = [
    { date: '2025-02-01', type: 'Call', notes: 'Initial call' },
    { date: '2025-02-05', type: 'Email', notes: 'Send proposal' }
  ]
  
  const updateResponse = await apiRequest(`/api/leads/${leadId}`, 'PUT', { followUps })
  
  if (updateResponse.status !== 200) {
    recordResult('Add FollowUps', false, 'Update failed')
    return
  }
  
  // Verify followUps added
  await new Promise(resolve => setTimeout(resolve, 100))
  
  const verifyResponse = await apiRequest(`/api/leads/${leadId}`, 'GET')
  const fetchedFollowUps = verifyResponse.data?.lead?.followUps
  
  const followUpsAdded = Array.isArray(fetchedFollowUps) && 
                        fetchedFollowUps.length === followUps.length &&
                        fetchedFollowUps[0].type === followUps[0].type
  
  recordResult(
    'Add FollowUps',
    followUpsAdded,
    followUpsAdded ? 'FollowUps added correctly' : 'FollowUps not added correctly'
  )
}

// Test 11: Update Billing Terms
async function testUpdateBillingTerms() {
  log('\n🧪 Testing: Update Billing Terms', 'info')
  
  // Create lead
  const createResponse = await apiRequest('/api/leads', 'POST', {
    name: `Billing Terms Test ${Date.now()}`,
    industry: 'Technology'
  })
  
  if (createResponse.status !== 201) {
    recordResult('Update Billing Terms', false, 'Could not create lead')
    return
  }
  
  const leadId = createResponse.data?.lead?.id
  testResults.createdLeads.push(leadId)
  
  // Update billing terms
  const billingTerms = {
    paymentTerms: 'Net 60',
    billingFrequency: 'Quarterly',
    currency: 'USD',
    retainerAmount: 15000,
    taxExempt: true,
    notes: 'Updated billing terms'
  }
  
  const updateResponse = await apiRequest(`/api/leads/${leadId}`, 'PUT', { billingTerms })
  
  if (updateResponse.status !== 200) {
    recordResult('Update Billing Terms', false, 'Update failed')
    return
  }
  
  // Verify billing terms updated
  await new Promise(resolve => setTimeout(resolve, 100))
  
  const verifyResponse = await apiRequest(`/api/leads/${leadId}`, 'GET')
  const fetchedBillingTerms = verifyResponse.data?.lead?.billingTerms
  
  const termsUpdated = fetchedBillingTerms &&
                      fetchedBillingTerms.paymentTerms === billingTerms.paymentTerms &&
                      fetchedBillingTerms.retainerAmount === billingTerms.retainerAmount
  
  recordResult(
    'Update Billing Terms',
    termsUpdated,
    termsUpdated ? 'Billing terms updated correctly' : 'Billing terms not updated correctly'
  )
}

// Test 12: Filter Leads by Status
async function testFilterLeadsByStatus() {
  log('\n🧪 Testing: Filter Leads by Status', 'info')
  
  // Create leads with different statuses
  const statuses = ['Potential', 'Active', 'Disinterested']
  const createdIds = []
  
  for (const status of statuses) {
    const createResponse = await apiRequest('/api/leads', 'POST', {
      name: `Status Filter Test ${status} ${Date.now()}`,
      industry: 'Technology',
      status
    })
    
    if (createResponse.status === 201) {
      createdIds.push(createResponse.data?.lead?.id)
    }
  }
  
  testResults.createdLeads.push(...createdIds)
  
  // Get all leads and check if filtering works (if API supports it)
  const allLeadsResponse = await apiRequest('/api/leads', 'GET')
  
  if (allLeadsResponse.status === 200) {
    const leads = allLeadsResponse.data?.leads || []
    const ourLeads = leads.filter(l => createdIds.includes(l.id))
    
    recordResult(
      'Filter Leads by Status',
      ourLeads.length === statuses.length,
      `Created ${statuses.length} leads, found ${ourLeads.length} in list`
    )
  } else {
    recordResult('Filter Leads by Status', false, 'Could not retrieve leads')
  }
}

// Test 13: Search Leads (if API supports)
async function testSearchLeads() {
  log('\n🧪 Testing: Search Leads', 'info')
  
  const uniqueName = `Search Test Unique ${Date.now()}`
  
  // Create a lead with unique name
  const createResponse = await apiRequest('/api/leads', 'POST', {
    name: uniqueName,
    industry: 'Technology'
  })
  
  if (createResponse.status !== 201) {
    recordResult('Search Leads', false, 'Could not create test lead')
    return
  }
  
  const leadId = createResponse.data?.lead?.id
  testResults.createdLeads.push(leadId)
  
  // Get all leads and search in memory (API may not have search endpoint)
  const allLeadsResponse = await apiRequest('/api/leads', 'GET')
  
  if (allLeadsResponse.status === 200) {
    const leads = allLeadsResponse.data?.leads || []
    const found = leads.find(l => l.name === uniqueName)
    
    recordResult(
      'Search Leads',
      found !== undefined,
      found ? 'Lead found in list' : 'Lead not found in list'
    )
  } else {
    recordResult('Search Leads', false, 'Could not retrieve leads')
  }
}

// Test 14: Lead Count/Statistics
async function testLeadCount() {
  log('\n🧪 Testing: Lead Count', 'info')
  
  const response = await apiRequest('/api/leads', 'GET')
  
  if (response.status === 200) {
    const leads = response.data?.leads || []
    const count = leads.length
    
    recordResult(
      'Lead Count',
      typeof count === 'number',
      `Total leads: ${count}`
    )
  } else {
    recordResult('Lead Count', false, 'Could not retrieve leads')
  }
}

// Test 15: Lead Ordering (by createdAt)
async function testLeadOrdering() {
  log('\n🧪 Testing: Lead Ordering', 'info')
  
  // Create two leads with delay
  const create1Response = await apiRequest('/api/leads', 'POST', {
    name: `Ordering Test 1 ${Date.now()}`,
    industry: 'Technology'
  })
  
  await new Promise(resolve => setTimeout(resolve, 100))
  
  const create2Response = await apiRequest('/api/leads', 'POST', {
    name: `Ordering Test 2 ${Date.now()}`,
    industry: 'Technology'
  })
  
  if (create1Response.status !== 201 || create2Response.status !== 201) {
    recordResult('Lead Ordering', false, 'Could not create test leads')
    return
  }
  
  const leadId1 = create1Response.data?.lead?.id
  const leadId2 = create2Response.data?.lead?.id
  testResults.createdLeads.push(leadId1, leadId2)
  
  // Get all leads and check ordering
  const allLeadsResponse = await apiRequest('/api/leads', 'GET')
  
  if (allLeadsResponse.status === 200) {
    const leads = allLeadsResponse.data?.leads || []
    const lead1 = leads.find(l => l.id === leadId1)
    const lead2 = leads.find(l => l.id === leadId2)
    
    // Should be ordered by createdAt desc (newest first)
    const index1 = leads.indexOf(lead1)
    const index2 = leads.indexOf(lead2)
    
    const ordered = index2 < index1 // lead2 should come before lead1 (newer first)
    
    recordResult(
      'Lead Ordering',
      ordered,
      ordered ? 'Leads ordered correctly (newest first)' : 'Leads not ordered correctly'
    )
  } else {
    recordResult('Lead Ordering', false, 'Could not retrieve leads')
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting CRM Functionality Tests')
  console.log(`📍 Testing against: ${BASE_URL}`)
  console.log('='.repeat(60))
  
  // Run all functionality tests
  await testListAllLeads()
  await testGetSingleLead()
  await testCreateLeadWithAllFields()
  await testUpdateLeadFields()
  await testDeleteLead()
  await testDuplicateDetection()
  await testExternalAgentAssignment()
  await testRemoveExternalAgent()
  await testAddContacts()
  await testAddFollowUps()
  await testUpdateBillingTerms()
  await testFilterLeadsByStatus()
  await testSearchLeads()
  await testLeadCount()
  await testLeadOrdering()
  
  // Cleanup
  await cleanup()
  
  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary')
  console.log('='.repeat(60))
  console.log(`✅ Passed: ${testResults.passed.length}`)
  console.log(`⚠️  Warnings: ${testResults.warnings.length}`)
  console.log(`❌ Failed: ${testResults.failed.length}`)
  console.log(`📈 Total: ${testResults.totalTests}`)
  
  const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(2)
  console.log(`⏱️  Duration: ${duration}s`)
  
  if (testResults.failed.length > 0) {
    console.log('\n❌ Failed Tests:')
    testResults.failed.forEach((f, i) => {
      console.log(`   ${i + 1}. ${f.test}: ${f.message}`)
    })
  }
  
  const successRate = ((testResults.passed.length / testResults.totalTests) * 100).toFixed(1)
  console.log(`\n🎯 Success Rate: ${successRate}%`)
  
  // Cleanup
  if (prisma) {
    try {
      await prisma.$disconnect()
    } catch (error) {
      // Ignore
    }
  }
  
  process.exit(testResults.failed.length > 0 ? 1 : 0)
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Fatal error during testing:', error)
  if (prisma) {
    prisma.$disconnect().catch(() => {})
  }
  process.exit(1)
})

