#!/usr/bin/env node
/**
 * Production CRM Checks - Comprehensive automated checks
 * Usage:
 *   TEST_URL=https://abcoafrica.co.za TEST_EMAIL=admin@... TEST_PASSWORD=... node scripts/test-production-crm.js
 * Optional:
 *   AUTH_TOKEN=...          # skip login and use token directly
 *   CRM_SKIP_UI=true        # skip Playwright UI checks
 *   CRM_SKIP_API=true       # skip API checks
 *   CRM_TEST_CLEANUP=false  # keep created test data
 *   CRM_TEST_PREFIX=...     # custom prefix for test records
 */

import 'dotenv/config'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'https://abcoafrica.co.za'
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''

const RUN_UI = process.env.CRM_SKIP_UI !== 'true'
const RUN_API = process.env.CRM_SKIP_API !== 'true'
const SHOULD_CLEANUP = process.env.CRM_TEST_CLEANUP !== 'false'
const TEST_PREFIX = process.env.CRM_TEST_PREFIX || `CRM-PROD-CHECK-${new Date().toISOString().slice(0, 10)}`

const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  totalTests: 0,
  startTime: Date.now()
}

let accessToken = AUTH_TOKEN || ''
let createdLeadId = null
let createdLeadName = null
let createdClientId = null
let createdClientName = null
let createdGroupId = null
let createdGroupName = null
let createdContactId = null
let createdOpportunityId = null
let createdTagId = null
let createdTagName = null

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

async function apiRequest(path, method = 'GET', body = null, token = accessToken) {
  const url = `${BASE_URL}${path}`
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const options = { method, headers }
  if (body) options.body = JSON.stringify(body)

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
    return { error: error.message, status: 0, headers: new Headers() }
  }
}

async function getAccessToken() {
  if (accessToken) return accessToken

  if (!EMAIL || !PASSWORD) {
    recordResult('Authentication', false, 'Missing TEST_EMAIL or TEST_PASSWORD')
    return ''
  }

  const loginPayload = { email: EMAIL, password: PASSWORD }
  const authLogin = await apiRequest('/api/auth/login', 'POST', loginPayload, '')
  if (authLogin.status === 200 && authLogin.data?.accessToken) {
    accessToken = authLogin.data.accessToken
    recordResult('Authentication', true, 'Authenticated via /api/auth/login')
    return accessToken
  }

  const legacyLogin = await apiRequest('/api/login', 'POST', loginPayload, '')
  if (legacyLogin.status === 200 && legacyLogin.data?.accessToken) {
    accessToken = legacyLogin.data.accessToken
    recordResult('Authentication', true, 'Authenticated via /api/login')
    return accessToken
  }

  recordResult(
    'Authentication',
    false,
    `Login failed (auth: ${authLogin.status}, legacy: ${legacyLogin.status})`
  )
  return ''
}

function headerPresent(headers, name) {
  return Boolean(headers.get(name))
}

async function testBestPracticeHeaders() {
  log('\n🧪 Testing: Best Practice Security Headers', 'info')
  const endpoints = ['/api/leads', '/api/clients', '/api/opportunities']

  const requiredHeaders = [
    'content-security-policy',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy'
  ]
  const optionalHeaders = [
    'x-dns-prefetch-control',
    'x-download-options',
    'x-permitted-cross-domain-policies'
  ]

  for (const endpoint of endpoints) {
    const response = await apiRequest(endpoint, 'GET')
    const missingRequired = requiredHeaders.filter((h) => !headerPresent(response.headers, h))
    const missingOptional = optionalHeaders.filter((h) => !headerPresent(response.headers, h))

    recordResult(
      `Security Headers (Required) ${endpoint}`,
      missingRequired.length === 0,
      missingRequired.length === 0 ? 'All required headers present' : `Missing: ${missingRequired.join(', ')}`
    )

    if (missingOptional.length > 0) {
      recordResult(
        `Security Headers (Optional) ${endpoint}`,
        true,
        `Missing optional headers: ${missingOptional.join(', ')}`,
        true
      )
    } else {
      recordResult(`Security Headers (Optional) ${endpoint}`, true, 'All optional headers present')
    }
  }
}

async function testAuthRequired() {
  log('\n🧪 Testing: Auth Required for CRM', 'info')
  const response = await apiRequest('/api/leads', 'GET', null, '')
  const passed = response.status === 401 || response.status === 403
  recordResult('Auth Required', passed, `Status: ${response.status}`)
}

async function testValidationMissingName() {
  log('\n🧪 Testing: Input Validation (Missing Name)', 'info')
  const leadResponse = await apiRequest('/api/leads', 'POST', { industry: 'Technology' })
  recordResult('Validation Missing Name (Lead)', leadResponse.status === 400, `Status: ${leadResponse.status}`)

  const clientResponse = await apiRequest('/api/clients', 'POST', { industry: 'Technology' })
  recordResult('Validation Missing Name (Client)', clientResponse.status === 400, `Status: ${clientResponse.status}`)
}

async function testListLeads() {
  log('\n🧪 Testing: CRM List Leads', 'info')
  const response = await apiRequest('/api/leads', 'GET')
  const passed = response.status === 200 && Array.isArray(response.data?.leads)
  recordResult(
    'List Leads',
    passed,
    passed ? `Retrieved ${response.data?.leads?.length || 0} leads` : `Status: ${response.status}`
  )
}

async function testCreateUpdateDeleteLead() {
  log('\n🧪 Testing: Create / Update / Delete Lead', 'info')

  createdLeadName = `${TEST_PREFIX} Lead ${Date.now()}`
  const leadData = {
    name: createdLeadName,
    industry: 'Technology',
    status: 'Potential',
    stage: 'Awareness',
    value: 75000,
    probability: 60,
    source: 'Production Check',
    contacts: [{ name: 'Prod Test Contact', email: 'prod-test@example.com', phone: '000-000-0000' }],
    followUps: [{ date: '2026-02-06', type: 'Call', notes: 'Production check follow-up' }],
    billingTerms: { paymentTerms: 'Net 30', currency: 'ZAR', retainerAmount: 5000 }
  }

  const createResponse = await apiRequest('/api/leads', 'POST', leadData)
  if (createResponse.status !== 201) {
    recordResult('Create Lead', false, `Status: ${createResponse.status}`)
    return
  }

  createdLeadId = createResponse.data?.lead?.id
  recordResult('Create Lead', Boolean(createdLeadId), createdLeadId ? 'Lead created' : 'No lead id returned')

  await new Promise((resolve) => setTimeout(resolve, 200))
  const fetchResponse = await apiRequest(`/api/leads/${createdLeadId}`, 'GET')
  const fetchedLead = fetchResponse.data?.lead
  const persisted =
    fetchResponse.status === 200 &&
    fetchedLead?.name === leadData.name &&
    fetchedLead?.status === leadData.status &&
    fetchedLead?.stage === leadData.stage

  recordResult(
    'Persistence After Create',
    persisted,
    persisted ? 'Created lead persisted' : `Status: ${fetchResponse.status}`
  )

  const updateData = { status: 'Active', value: 90000, probability: 75 }
  const updateResponse = await apiRequest(`/api/leads/${createdLeadId}`, 'PUT', updateData)
  const updatePassed = updateResponse.status === 200
  recordResult('Update Lead', updatePassed, `Status: ${updateResponse.status}`)

  await new Promise((resolve) => setTimeout(resolve, 200))
  const verifyResponse = await apiRequest(`/api/leads/${createdLeadId}`, 'GET')
  const updatedLead = verifyResponse.data?.lead
  const updatePersisted =
    verifyResponse.status === 200 &&
    updatedLead?.status === updateData.status &&
    updatedLead?.value === updateData.value &&
    updatedLead?.probability === updateData.probability

  recordResult(
    'Persistence After Update',
    updatePersisted,
    updatePersisted ? 'Updated lead persisted' : `Status: ${verifyResponse.status}`
  )

  const deleteLeadData = {
    name: `${TEST_PREFIX} Lead Delete ${Date.now()}`,
    industry: 'Technology'
  }
  const deleteCreateResponse = await apiRequest('/api/leads', 'POST', deleteLeadData)
  if (deleteCreateResponse.status !== 201) {
    recordResult('Delete Lead', false, `Could not create delete-test lead (Status: ${deleteCreateResponse.status})`)
    return
  }

  const deleteLeadId = deleteCreateResponse.data?.lead?.id
  const deleteResponse = await apiRequest(`/api/leads/${deleteLeadId}`, 'DELETE')
  const deletePassed = deleteResponse.status === 200
  recordResult('Delete Lead', deletePassed, `Status: ${deleteResponse.status}`)

  await new Promise((resolve) => setTimeout(resolve, 200))
  const verifyDelete = await apiRequest(`/api/leads/${deleteLeadId}`, 'GET')
  recordResult(
    'Persistence After Delete',
    verifyDelete.status === 404,
    `Status: ${verifyDelete.status}`
  )
}

async function testListClients() {
  log('\n🧪 Testing: CRM List Clients', 'info')
  const response = await apiRequest('/api/clients', 'GET')
  const passed = response.status === 200 && Array.isArray(response.data?.clients)
  recordResult(
    'List Clients',
    passed,
    passed ? `Retrieved ${response.data?.clients?.length || 0} clients` : `Status: ${response.status}`
  )
}

async function testCreateUpdateClient() {
  log('\n🧪 Testing: Create / Update / Delete Client', 'info')

  createdClientName = `${TEST_PREFIX} Client ${Date.now()}`
  const clientData = {
    name: createdClientName,
    industry: 'Technology',
    status: 'active',
    stage: 'Awareness',
    value: 50000,
    probability: 50,
    website: 'https://example.com',
    notes: 'Production CRM check client'
  }

  const createResponse = await apiRequest('/api/clients', 'POST', clientData)
  if (createResponse.status !== 201) {
    recordResult('Create Client', false, `Status: ${createResponse.status}`)
    return
  }

  createdClientId = createResponse.data?.client?.id
  recordResult('Create Client', Boolean(createdClientId), createdClientId ? 'Client created' : 'No client id returned')

  const fetchResponse = await apiRequest(`/api/clients/${createdClientId}`, 'GET')
  const fetchedClient = fetchResponse.data?.client
  const persisted =
    fetchResponse.status === 200 &&
    fetchedClient?.name === clientData.name &&
    fetchedClient?.industry === clientData.industry

  recordResult(
    'Client Persistence After Create',
    persisted,
    persisted ? 'Created client persisted' : `Status: ${fetchResponse.status}`
  )

  const updateData = { industry: 'Energy', value: 65000, probability: 70 }
  const updateResponse = await apiRequest(`/api/clients/${createdClientId}`, 'PATCH', updateData)
  recordResult('Update Client', updateResponse.status === 200, `Status: ${updateResponse.status}`)

  await new Promise((resolve) => setTimeout(resolve, 200))
  const verifyResponse = await apiRequest(`/api/clients/${createdClientId}`, 'GET')
  const updatedClient = verifyResponse.data?.client
  const updatePersisted =
    verifyResponse.status === 200 &&
    updatedClient?.industry === updateData.industry &&
    updatedClient?.value === updateData.value &&
    updatedClient?.probability === updateData.probability

  recordResult(
    'Client Persistence After Update',
    updatePersisted,
    updatePersisted ? 'Updated client persisted' : `Status: ${verifyResponse.status}`
  )

  const deleteClientData = {
    name: `${TEST_PREFIX} Client Delete ${Date.now()}`,
    industry: 'Technology'
  }
  const deleteCreateResponse = await apiRequest('/api/clients', 'POST', deleteClientData)
  if (deleteCreateResponse.status !== 201) {
    recordResult('Delete Client', false, `Could not create delete-test client (Status: ${deleteCreateResponse.status})`)
    return
  }

  const deleteClientId = deleteCreateResponse.data?.client?.id
  const deleteResponse = await apiRequest(`/api/clients/${deleteClientId}`, 'DELETE')
  recordResult('Delete Client', deleteResponse.status === 200, `Status: ${deleteResponse.status}`)

  await new Promise((resolve) => setTimeout(resolve, 200))
  const verifyDelete = await apiRequest(`/api/clients/${deleteClientId}`, 'GET')
  recordResult(
    'Client Persistence After Delete',
    verifyDelete.status === 404,
    `Status: ${verifyDelete.status}`
  )
}

async function testExternalAgentsList() {
  log('\n🧪 Testing: External Agents List', 'info')
  const response = await apiRequest('/api/external-agents', 'GET')
  const passed = response.status === 200 && Array.isArray(response.data?.agents || response.data?.externalAgents || response.data?.items)
  recordResult(
    'List External Agents',
    passed,
    passed ? 'External agents list retrieved' : `Status: ${response.status}`
  )
}

async function testContactsCrud() {
  log('\n🧪 Testing: Client Contacts CRUD', 'info')
  if (!createdClientId) {
    recordResult('Contacts CRUD', true, 'Skipped (no client available)', true)
    return
  }

  const createResponse = await apiRequest(`/api/contacts/client/${createdClientId}`, 'POST', {
    name: 'Production Contact',
    email: 'prod-contact@example.com',
    phone: '000-111-2222',
    role: 'Tester'
  })

  if (createResponse.status !== 201) {
    recordResult('Create Contact', false, `Status: ${createResponse.status}`)
    return
  }

  createdContactId = createResponse.data?.contact?.id
  recordResult('Create Contact', Boolean(createdContactId), createdContactId ? 'Contact created' : 'No contact id returned')

  const listResponse = await apiRequest(`/api/contacts/client/${createdClientId}`, 'GET')
  const contacts = listResponse.data?.contacts || []
  const listPassed = listResponse.status === 200 && Array.isArray(contacts)
  recordResult('List Contacts', listPassed, `Status: ${listResponse.status}`)

  const updateResponse = await apiRequest(
    `/api/contacts/client/${createdClientId}/${createdContactId}`,
    'PATCH',
    { phone: '999-999-9999', notes: 'Updated by production check' }
  )
  recordResult('Update Contact', updateResponse.status === 200, `Status: ${updateResponse.status}`)

  const verifyResponse = await apiRequest(`/api/contacts/client/${createdClientId}`, 'GET')
  const updatedContact = (verifyResponse.data?.contacts || []).find((c) => c.id === createdContactId)
  const updatePersisted = Boolean(updatedContact && updatedContact.phone === '999-999-9999')
  recordResult('Contact Persistence After Update', updatePersisted, updatePersisted ? 'Contact updated' : 'Contact not updated')

  const deleteResponse = await apiRequest(`/api/contacts/client/${createdClientId}/${createdContactId}`, 'DELETE')
  const deletePassed = deleteResponse.status === 200
  recordResult('Delete Contact', deletePassed, `Status: ${deleteResponse.status}`)
  if (deletePassed) {
    createdContactId = null
  }
}

async function testOpportunitiesCrud() {
  log('\n🧪 Testing: Opportunities CRUD', 'info')
  if (!createdClientId) {
    recordResult('Opportunities CRUD', true, 'Skipped (no client available)', true)
    return
  }

  const createResponse = await apiRequest('/api/opportunities', 'POST', {
    title: `${TEST_PREFIX} Opportunity ${Date.now()}`,
    clientId: createdClientId,
    stage: 'Awareness',
    status: 'Potential',
    value: 25000
  })

  if (createResponse.status !== 201) {
    recordResult('Create Opportunity', false, `Status: ${createResponse.status}`)
    return
  }

  createdOpportunityId = createResponse.data?.opportunity?.id
  recordResult('Create Opportunity', Boolean(createdOpportunityId), createdOpportunityId ? 'Opportunity created' : 'No opportunity id returned')

  const getResponse = await apiRequest(`/api/opportunities/${createdOpportunityId}`, 'GET')
  recordResult('Get Opportunity', getResponse.status === 200, `Status: ${getResponse.status}`)

  const updateResponse = await apiRequest(`/api/opportunities/${createdOpportunityId}`, 'PUT', {
    title: `${TEST_PREFIX} Opportunity Updated`,
    status: 'Active',
    value: 40000
  })
  recordResult('Update Opportunity', updateResponse.status === 200, `Status: ${updateResponse.status}`)

  const verifyResponse = await apiRequest(`/api/opportunities/${createdOpportunityId}`, 'GET')
  const updated = verifyResponse.data?.opportunity
  const updatePersisted = verifyResponse.status === 200 && updated?.status === 'Active' && updated?.value === 40000
  recordResult(
    'Opportunity Persistence After Update',
    updatePersisted,
    updatePersisted ? 'Opportunity updated' : `Status: ${verifyResponse.status}`
  )

  const deleteResponse = await apiRequest(`/api/opportunities/${createdOpportunityId}`, 'DELETE')
  const deletePassed = deleteResponse.status === 200
  recordResult('Delete Opportunity', deletePassed, `Status: ${deleteResponse.status}`)
  if (deletePassed) {
    createdOpportunityId = null
  }
}

async function testTagsCrud() {
  log('\n🧪 Testing: Tags CRUD', 'info')

  createdTagName = `${TEST_PREFIX}-Tag-${Date.now()}`
  const createResponse = await apiRequest('/api/tags', 'POST', {
    name: createdTagName,
    color: '#3B82F6',
    description: 'Production CRM check tag'
  })

  if (createResponse.status !== 201) {
    recordResult('Create Tag', false, `Status: ${createResponse.status}`)
    return
  }

  createdTagId = createResponse.data?.tag?.id
  recordResult('Create Tag', Boolean(createdTagId), createdTagId ? 'Tag created' : 'No tag id returned')

  const updateResponse = await apiRequest(`/api/tags/${createdTagId}`, 'PATCH', {
    description: 'Updated by production CRM check'
  })
  recordResult('Update Tag', updateResponse.status === 200, `Status: ${updateResponse.status}`)

  const getResponse = await apiRequest(`/api/tags/${createdTagId}`, 'GET')
  recordResult('Get Tag', getResponse.status === 200, `Status: ${getResponse.status}`)

  const deleteTagName = `${TEST_PREFIX}-Tag-Delete-${Date.now()}`
  const deleteCreate = await apiRequest('/api/tags', 'POST', { name: deleteTagName })
  if (deleteCreate.status === 201) {
    const deleteTagId = deleteCreate.data?.tag?.id
    const deleteResponse = await apiRequest(`/api/tags/${deleteTagId}`, 'DELETE')
    recordResult('Delete Tag', deleteResponse.status === 200, `Status: ${deleteResponse.status}`)
  } else {
    recordResult('Delete Tag', false, `Could not create delete-test tag (Status: ${deleteCreate.status})`)
  }
}

async function testClientTagsCrud() {
  log('\n🧪 Testing: Client Tags CRUD', 'info')
  if (!createdClientId || !createdTagId) {
    recordResult('Client Tags CRUD', true, 'Skipped (missing client or tag)', true)
    return
  }

  const addResponse = await apiRequest(`/api/clients/${createdClientId}/tags`, 'POST', {
    tagId: createdTagId
  })
  recordResult('Add Client Tag', addResponse.status === 201, `Status: ${addResponse.status}`)

  const listResponse = await apiRequest(`/api/clients/${createdClientId}/tags`, 'GET')
  const tags = listResponse.data?.tags || []
  const listPassed = listResponse.status === 200 && Array.isArray(tags)
  recordResult('List Client Tags', listPassed, `Status: ${listResponse.status}`)

  const removeResponse = await apiRequest(`/api/clients/${createdClientId}/tags?tagId=${createdTagId}`, 'DELETE')
  recordResult('Remove Client Tag', removeResponse.status === 200, `Status: ${removeResponse.status}`)
}

async function testRssSubscription() {
  log('\n🧪 Testing: RSS Subscription', 'info')
  if (!createdClientId) {
    recordResult('RSS Subscription', true, 'Skipped (no client available)', true)
    return
  }

  const getResponse = await apiRequest(`/api/clients/${createdClientId}/rss-subscription`, 'GET')
  recordResult('Get RSS Subscription', getResponse.status === 200, `Status: ${getResponse.status}`)

  const disableResponse = await apiRequest(`/api/clients/${createdClientId}/rss-subscription`, 'POST', { subscribed: false })
  recordResult('Disable RSS Subscription', disableResponse.status === 200, `Status: ${disableResponse.status}`)

  const enableResponse = await apiRequest(`/api/clients/${createdClientId}/rss-subscription`, 'POST', { subscribed: true })
  recordResult('Enable RSS Subscription', enableResponse.status === 200, `Status: ${enableResponse.status}`)
}

async function testKycPersistence() {
  log('\n🧪 Testing: KYC Persistence', 'info')
  if (!createdClientId) {
    recordResult('KYC Persistence', true, 'Skipped (no client available)', true)
    return
  }

  const kycPayload = {
    legalEntity: {
      registeredName: `${TEST_PREFIX} Entity`,
      registrationNumber: 'REG-123'
    },
    businessProfile: {
      industry: 'Energy',
      website: 'https://example.com'
    },
    bankingDetails: {
      bankName: 'Test Bank',
      accountNumber: '1234567890'
    }
  }

  const patchResponse = await apiRequest(`/api/clients/${createdClientId}/kyc`, 'PATCH', { kyc: kycPayload })
  recordResult('Update KYC', patchResponse.status === 200, `Status: ${patchResponse.status}`)

  const getClientResponse = await apiRequest(`/api/clients/${createdClientId}`, 'GET')
  const client = getClientResponse.data?.client
  const kycSource = client?.kycJsonb || client?.kyc
  const kycString = typeof kycSource === 'string' ? kycSource : JSON.stringify(kycSource || {})
  const kycPersisted = kycString.includes(kycPayload.legalEntity.registeredName)

  recordResult(
    'KYC Persistence After Update',
    kycPersisted,
    kycPersisted ? 'KYC persisted' : 'KYC not found in client response'
  )
}

async function testDiagnosticsEndpoints() {
  log('\n🧪 Testing: Client Diagnostics', 'info')
  if (!createdClientId) {
    recordResult('Client Diagnostics', true, 'Skipped (no client available)', true)
    return
  }

  const diagnoseResponse = await apiRequest(`/api/clients/${createdClientId}/diagnose`, 'GET')
  recordResult('Client Diagnose', diagnoseResponse.status === 200, `Status: ${diagnoseResponse.status}`)

  const fixDiagnoseResponse = await apiRequest(`/api/clients/${createdClientId}/fix`, 'POST', { action: 'diagnose' })
  recordResult('Client Fix (Diagnose)', fixDiagnoseResponse.status === 200, `Status: ${fixDiagnoseResponse.status}`)
}

async function testStarredClient() {
  log('\n🧪 Testing: Starred Clients', 'info')
  if (!createdClientId) {
    recordResult('Starred Clients', true, 'Skipped (no client available)', true)
    return
  }

  const starResponse = await apiRequest(`/api/starred-clients/${createdClientId}`, 'POST')
  const starPassed = starResponse.status === 201 || starResponse.status === 200
  recordResult('Star Client', starPassed, `Status: ${starResponse.status}`)

  const listResponse = await apiRequest('/api/starred-clients', 'GET')
  const listPassed = listResponse.status === 200 && Array.isArray(listResponse.data?.starredClients)
  recordResult('List Starred Clients', listPassed, `Status: ${listResponse.status}`)

  const unstarResponse = await apiRequest(`/api/starred-clients/${createdClientId}`, 'DELETE')
  recordResult('Unstar Client', unstarResponse.status === 200, `Status: ${unstarResponse.status}`)
}

async function testGroupsCrud() {
  log('\n🧪 Testing: Company Groups', 'info')
  const listResponse = await apiRequest('/api/clients/groups', 'GET')
  recordResult('List Company Groups', listResponse.status === 200, `Status: ${listResponse.status}`)

  createdGroupName = `${TEST_PREFIX} Group ${Date.now()}`
  const createResponse = await apiRequest('/api/clients/groups', 'POST', {
    name: createdGroupName,
    industry: 'Technology',
    notes: 'Production CRM check group'
  })
  if (createResponse.status !== 201) {
    recordResult('Create Company Group', false, `Status: ${createResponse.status}`)
    return
  }

  createdGroupId = createResponse.data?.group?.id
  recordResult('Create Company Group', Boolean(createdGroupId), createdGroupId ? 'Group created' : 'No group id returned')

  const deleteResponse = await apiRequest(`/api/clients/groups/${createdGroupId}`, 'DELETE')
  const deletePassed = deleteResponse.status === 200
  recordResult('Delete Company Group', deletePassed, `Status: ${deleteResponse.status}`)
  if (deletePassed) {
    createdGroupId = null
  }
}

async function runUiChecks() {
  log('\n🧪 Testing: CRM UI (Playwright)', 'info')

  if (!EMAIL || !PASSWORD) {
    recordResult('UI Login', false, 'Missing TEST_EMAIL or TEST_PASSWORD')
    return
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    await page.fill('input[type="email"], input[name="email"]', EMAIL)
    await page.fill('input[type="password"], input[name="password"]', PASSWORD)
    await page.click('button[type="submit"], button:has-text("Login"), [type="submit"]')
    await page.waitForTimeout(2500)

    const onLoginPage = page.url().includes('/login')
    recordResult('UI Login', !onLoginPage, onLoginPage ? 'Still on login page' : 'Logged in')
    if (onLoginPage) {
      await browser.close()
      return
    }

    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const hasClientsText = await page.locator('text=Clients').first().isVisible().catch(() => false)
    const hasLeadsText = await page.locator('text=Leads').first().isVisible().catch(() => false)
    recordResult(
      'CRM Page Loaded',
      hasClientsText || hasLeadsText,
      hasClientsText || hasLeadsText ? 'Clients/Leads UI visible' : 'CRM page content not detected'
    )

    const componentStatus = await page.evaluate(() => ({
      Clients: typeof window.Clients !== 'undefined',
      Pipeline: typeof window.Pipeline !== 'undefined',
      ClientDetailModal: typeof window.ClientDetailModal !== 'undefined',
      LeadDetailModal: typeof window.LeadDetailModal !== 'undefined',
      OpportunityDetailModal: typeof window.OpportunityDetailModal !== 'undefined'
    }))

    Object.entries(componentStatus).forEach(([name, exists]) => {
      recordResult(`Component Available: ${name}`, Boolean(exists), exists ? 'Loaded' : 'Missing')
    })

    const listSelectors = [
      '[data-testid="leads-list"]',
      '.leads-list',
      '#leads-list',
      'table tbody tr',
      '.mobile-card'
    ]
    let listFound = false
    for (const selector of listSelectors) {
      const count = await page.locator(selector).count().catch(() => 0)
      if (count > 0) {
        listFound = true
        break
      }
    }
    recordResult('CRM List Visible', listFound, listFound ? 'List elements found' : 'List not found')

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first()
    const searchVisible = await searchInput.isVisible().catch(() => false)
    recordResult('Search Input Visible', searchVisible, searchVisible ? 'Search input found' : 'Search input not found')

    if (searchVisible && createdLeadName) {
      await searchInput.fill(createdLeadName)
      await page.waitForTimeout(1500)
      const leadVisible = await page.locator(`text=${createdLeadName}`).first().isVisible().catch(() => false)
      recordResult(
        'UI Shows Created Lead',
        leadVisible,
        leadVisible ? 'Lead found in UI' : `Lead not found: ${createdLeadName}`
      )
    } else {
      recordResult('UI Shows Created Lead', true, 'Skipped (no search or lead name)', true)
    }

    if (searchVisible && createdClientName) {
      await searchInput.fill(createdClientName)
      await page.waitForTimeout(1500)
      const clientVisible = await page.locator(`text=${createdClientName}`).first().isVisible().catch(() => false)
      recordResult(
        'UI Shows Created Client',
        clientVisible,
        clientVisible ? 'Client found in UI' : `Client not found: ${createdClientName}`
      )
    } else {
      recordResult('UI Shows Created Client', true, 'Skipped (no search or client name)', true)
    }

    const pipelineTab = page.locator('button:has-text("Pipeline"), [role="tab"]:has-text("Pipeline")').first()
    const pipelineVisible = await pipelineTab.isVisible().catch(() => false)
    recordResult('Pipeline Tab Visible', pipelineVisible, pipelineVisible ? 'Pipeline tab found' : 'Pipeline tab not found')
    if (pipelineVisible) {
      await pipelineTab.click().catch(() => {})
      await page.waitForTimeout(1500)
      const pipelineContainer = await page.locator('[data-testid="pipeline"], .pipeline, [class*="pipeline" i]').first().isVisible().catch(() => false)
      recordResult('Pipeline View Loaded', pipelineContainer, pipelineContainer ? 'Pipeline view visible' : 'Pipeline view not detected')
    }

    const localStorageInfo = await page.evaluate(() => {
      const keys = Object.keys(localStorage || {})
      const crmKeys = keys.filter((k) => k.toLowerCase().includes('lead') || k.toLowerCase().includes('client') || k.toLowerCase().includes('crm'))
      return { total: keys.length, crmCount: crmKeys.length }
    })
    if (localStorageInfo.crmCount === 0) {
      recordResult(
        'LocalStorage CRM Keys',
        false,
        `No CRM-related keys found (${localStorageInfo.total} total)`,
        true
      )
    } else {
      recordResult(
        'LocalStorage CRM Keys',
        true,
        `Keys: ${localStorageInfo.crmCount} CRM-related / ${localStorageInfo.total} total`
      )
    }

    const createButton = page.locator('button:has-text("New"), button:has-text("Add")').first()
    const createVisible = await createButton.isVisible().catch(() => false)
    recordResult(
      'Create Button Visible',
      createVisible,
      createVisible ? 'Create button found' : 'Create button not found'
    )

    await browser.close()
  } catch (error) {
    recordResult('CRM UI Tests', false, error.message)
    await browser.close().catch(() => {})
  }
}

async function cleanupCreatedEntities() {
  if (!SHOULD_CLEANUP) {
    recordResult('Cleanup', true, 'Cleanup skipped (CRM_TEST_CLEANUP=false)', true)
    return
  }

  if (createdContactId && createdClientId) {
    await apiRequest(`/api/contacts/client/${createdClientId}/${createdContactId}`, 'DELETE')
  }
  if (createdOpportunityId) {
    await apiRequest(`/api/opportunities/${createdOpportunityId}`, 'DELETE')
  }
  if (createdTagId) {
    await apiRequest(`/api/tags/${createdTagId}`, 'DELETE')
  }
  if (createdGroupId) {
    await apiRequest(`/api/clients/groups/${createdGroupId}`, 'DELETE')
  }
  if (createdLeadId) {
    await apiRequest(`/api/leads/${createdLeadId}`, 'DELETE')
  }
  if (createdClientId) {
    await apiRequest(`/api/clients/${createdClientId}`, 'DELETE')
  }
}

async function run() {
  console.log('🚀 Starting Production CRM Checks')
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log('='.repeat(60))

  if (RUN_API) {
    await getAccessToken()
    if (accessToken) {
      await testBestPracticeHeaders()
      await testAuthRequired()
      await testValidationMissingName()
      await testListLeads()
      await testCreateUpdateDeleteLead()
      await testListClients()
      await testCreateUpdateClient()
      await testExternalAgentsList()
      await testContactsCrud()
      await testOpportunitiesCrud()
      await testTagsCrud()
      await testClientTagsCrud()
      await testRssSubscription()
      await testKycPersistence()
      await testDiagnosticsEndpoints()
      await testStarredClient()
      await testGroupsCrud()
    }
  } else {
    recordResult('API Checks', true, 'Skipped (CRM_SKIP_API=true)', true)
  }

  if (RUN_UI) {
    await runUiChecks()
  } else {
    recordResult('UI Checks', true, 'Skipped (CRM_SKIP_UI=true)', true)
  }

  if (RUN_API && accessToken) {
    await cleanupCreatedEntities()
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Final CRM Production Check Summary')
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

  process.exit(testResults.failed.length > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error('\n❌ Fatal error during production CRM checks:', error)
  process.exit(1)
})
