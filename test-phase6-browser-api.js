#!/usr/bin/env node
/**
 * Phase 6 Browser API Test
 * Tests the API endpoints that the browser uses for normalized tables
 * This simulates what happens when creating/updating a client in the browser
 */

import fetch from 'node-fetch'

const BASE_URL = process.env.APP_URL || 'https://abcoafrica.co.za'
const TEST_CLIENT_NAME = `Browser Test Client - ${Date.now()}`

// You'll need to provide a valid token from the browser
// Get it from: localStorage.getItem('abcotronics_token')
const TOKEN = process.env.TEST_TOKEN || ''

let testClientId = null

async function apiRequest(endpoint, method = 'GET', body = null) {
  const url = `${BASE_URL}${endpoint}`
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    }
  }
  
  if (body) {
    options.body = JSON.stringify(body)
  }
  
  try {
    const response = await fetch(url, options)
    const data = await response.json()
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

async function testCreateClient() {
  console.log('\n📝 Test: Create Client via API (simulating browser)')
  
  if (!TOKEN) {
    console.log('⚠️  No token provided. Set TEST_TOKEN environment variable or login in browser first.')
    console.log('   Get token from browser: localStorage.getItem("abcotronics_token")')
    return false
  }
  
  const clientData = {
    name: TEST_CLIENT_NAME,
    type: 'client',
    status: 'Active',
    industry: 'Test',
    // These should NOT be written to JSON fields
    sites: [],
    contracts: [],
    proposals: [],
    followUps: [],
    services: []
  }
  
  const result = await apiRequest('/api/clients', 'POST', clientData)
  
  if (result.ok && result.data?.client) {
    testClientId = result.data.client.id
    console.log(`✅ Client created: ${testClientId}`)
    return true
  } else {
    console.log(`❌ Failed to create client:`, result.error || result.data)
    return false
  }
}

async function testAddSite() {
  console.log('\n📍 Test: Add Site via Sites API')
  
  if (!testClientId) {
    console.log('⏭️  Skipping - no test client')
    return false
  }
  
  const siteData = {
    name: 'Test Site from Browser',
    address: '123 Browser Test St',
    contactPerson: 'Browser Tester',
    contactPhone: '1234567890',
    contactEmail: 'browser@test.com'
  }
  
  const result = await apiRequest(`/api/sites/client/${testClientId}`, 'POST', siteData)
  
  if (result.ok && result.data?.site) {
    console.log(`✅ Site created: ${result.data.site.id}`)
    return true
  } else {
    console.log(`❌ Failed to create site:`, result.error || result.data)
    return false
  }
}

async function testGetClientWithNormalizedData() {
  console.log('\n📖 Test: Get Client with Normalized Data')
  
  if (!testClientId) {
    console.log('⏭️  Skipping - no test client')
    return false
  }
  
  const result = await apiRequest(`/api/clients/${testClientId}`, 'GET')
  
  if (result.ok && result.data?.client) {
    const client = result.data.client
    const sites = client.sites || []
    const hasSites = sites.length > 0
    
    console.log(`✅ Client retrieved`)
    console.log(`   Sites count: ${sites.length}`)
    console.log(`   Has normalized sites: ${hasSites}`)
    
    // Check if data is from normalized table (has createdAt, id structure, etc.)
    if (hasSites && sites[0].id && sites[0].createdAt) {
      console.log(`   ✅ Sites appear to be from normalized table`)
    }
    
    return true
  } else {
    console.log(`❌ Failed to get client:`, result.error || result.data)
    return false
  }
}

async function testUpdateClient() {
  console.log('\n✏️  Test: Update Client with Normalized Data')
  
  if (!testClientId) {
    console.log('⏭️  Skipping - no test client')
    return false
  }
  
  // Update client with sites array (should sync to normalized table)
  const updateData = {
    name: `${TEST_CLIENT_NAME} - Updated`,
    sites: [
      {
        id: `site-${Date.now()}`,
        name: 'Updated Site via API',
        address: '456 Updated St'
      }
    ]
  }
  
  const result = await apiRequest(`/api/clients/${testClientId}`, 'PATCH', updateData)
  
  if (result.ok && result.data?.client) {
    console.log(`✅ Client updated`)
    const client = result.data.client
    console.log(`   Sites count: ${client.sites?.length || 0}`)
    return true
  } else {
    console.log(`❌ Failed to update client:`, result.error || result.data)
    return false
  }
}

async function testCheckForDuplicates() {
  console.log('\n🔍 Test: Check for Duplicates in API Response')
  
  if (!testClientId) {
    console.log('⏭️  Skipping - no test client')
    return false
  }
  
  const result = await apiRequest(`/api/clients/${testClientId}`, 'GET')
  
  if (result.ok && result.data?.client) {
    const client = result.data.client
    const sites = client.sites || []
    
    // Check for duplicate IDs
    const siteIds = sites.map(s => s.id).filter(Boolean)
    const uniqueIds = new Set(siteIds)
    const hasDuplicates = siteIds.length !== uniqueIds.size
    
    if (hasDuplicates) {
      console.log(`❌ Found duplicate site IDs in API response`)
      return false
    } else {
      console.log(`✅ No duplicates found in API response`)
      return true
    }
  }
  
  return false
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...')
  
  if (!testClientId || !TOKEN) {
    console.log('⏭️  Skipping cleanup - no test client or token')
    return
  }
  
  try {
    await apiRequest(`/api/clients/${testClientId}`, 'DELETE')
    console.log('✅ Test client deleted')
  } catch (error) {
    console.log('⚠️  Could not delete test client:', error.message)
  }
}

async function main() {
  console.log('🚀 Phase 6 Browser API Test')
  console.log('='.repeat(80))
  console.log(`Testing API endpoints for: ${BASE_URL}`)
  console.log('='.repeat(80))
  
  if (!TOKEN) {
    console.log('\n⚠️  WARNING: No authentication token provided!')
    console.log('To get your token:')
    console.log('1. Login to the application in your browser')
    console.log('2. Open browser console (F12)')
    console.log('3. Run: localStorage.getItem("abcotronics_token")')
    console.log('4. Copy the token and run:')
    console.log(`   TEST_TOKEN="your-token-here" node test-phase6-browser-api.js`)
    console.log('\nContinuing with tests that don\'t require authentication...\n')
  }
  
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0
  }
  
  try {
    if (TOKEN) {
      const createResult = await testCreateClient()
      if (createResult) results.passed++
      else results.failed++
      
      await testAddSite()
      await testGetClientWithNormalizedData()
      await testUpdateClient()
      const dupResult = await testCheckForDuplicates()
      if (dupResult) results.passed++
      
      await cleanup()
    } else {
      console.log('\n⏭️  Skipping authenticated tests (no token)')
      results.skipped++
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('📊 Test Summary')
    console.log('='.repeat(80))
    console.log(`✅ Passed: ${results.passed}`)
    console.log(`❌ Failed: ${results.failed}`)
    console.log(`⏭️  Skipped: ${results.skipped}`)
    console.log('='.repeat(80))
    
  } catch (error) {
    console.error('❌ Test suite failed:', error)
    process.exit(1)
  }
}

main()

