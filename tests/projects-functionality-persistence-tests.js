#!/usr/bin/env node
/**
 * Projects Section - Comprehensive Functionality and Persistence Tests
 * Tests: list, create, get, update, delete, and data persistence across API round-trips.
 * Requires: server running (npm run dev:backend), and auth (TEST_EMAIL/TEST_PASSWORD or dev login).
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
// Load .env.local from project root so TEST_EMAIL/TEST_PASSWORD are available
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

// Prefer TEST_URL when set (e.g. TEST_URL=http://localhost:3001) so dev-auth server can be targeted
const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'http://localhost:3000'
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@example.com'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123'

const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  totalTests: 0,
  startTime: Date.now(),
  createdProjectIds: []
}

let testToken = null

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

async function apiRequest(path, method = 'GET', body = null, token = testToken) {
  const url = `${BASE_URL}${path}`
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const options = { method, headers }
  if (body && method !== 'GET') {
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

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Login failed: ${res.status} ${text}`)
  }
  const body = await res.json()
  // API wraps in { data: { accessToken, user, ... } }
  const token = body.data?.accessToken ?? body.accessToken
  if (!token) throw new Error('No accessToken in login response')
  return token
}

async function cleanup() {
  log('\n🧹 Cleaning up test projects...', 'info')
  for (const id of testResults.createdProjectIds) {
    try {
      await apiRequest(`/api/projects/${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  testResults.createdProjectIds = []
}

// API wraps responses in { data: { ... } }; unwrap once for assertions
function apiData(res) {
  return res?.data?.data ?? res?.data ?? {}
}

// --- Functionality tests ---

async function testAuthAndListProjects() {
  log('\n🧪 Testing: Auth & List Projects', 'info')
  if (!testToken) {
    recordResult('List Projects', false, 'No auth token (login failed)')
    return
  }
  const res = await apiRequest('/api/projects', 'GET', null, testToken)
  const data = apiData(res)
  const ok = res.status === 200 && Array.isArray(data.projects)
  recordResult(
    'List Projects',
    ok,
    ok ? `Retrieved ${data.projects?.length ?? 0} projects` : `Status: ${res.status}`
  )
}

async function testCreateProject() {
  log('\n🧪 Testing: Create Project', 'info')
  const name = `Test Project ${Date.now()}`
  const body = {
    name,
    type: 'Monthly Review',
    clientName: 'Test Client',
    status: 'Planning',
    description: 'Persistence test project'
  }
  const res = await apiRequest('/api/projects', 'POST', body)
  const data = apiData(res)
  const created = res.status === 201 && data.project?.id
  if (!created) {
    recordResult('Create Project', false, `Status: ${res.status} ${JSON.stringify(data.error || data)?.[0] ?? ''}`)
    return
  }
  const id = data.project.id
  testResults.createdProjectIds.push(id)
  const nameMatch = data.project.name === name
  recordResult('Create Project', nameMatch, nameMatch ? `Created project ${id}` : 'Name mismatch')
}

async function testGetSingleProject() {
  log('\n🧪 Testing: Get Single Project', 'info')
  if (testResults.createdProjectIds.length === 0) {
    recordResult('Get Single Project', false, 'No project ID from create')
    return
  }
  const id = testResults.createdProjectIds[0]
  const res = await apiRequest(`/api/projects/${id}`, 'GET')
  const data = apiData(res)
  const ok = res.status === 200 && data.project?.id === id
  recordResult('Get Single Project', ok, ok ? 'Project retrieved' : `Status: ${res.status}`)
}

async function testUpdateProjectBasic() {
  log('\n🧪 Testing: Update Project (basic fields)', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const id = testResults.createdProjectIds[0]
  const newName = `Updated Project ${Date.now()}`
  const newStatus = 'In Progress'
  const res = await apiRequest(`/api/projects/${id}`, 'PUT', {
    name: newName,
    status: newStatus
  })
  if (res.status !== 200) {
    recordResult('Update Project Basic', false, `Status: ${res.status}`)
    return
  }
  const getRes = await apiRequest(`/api/projects/${id}`, 'GET')
  const getData = apiData(getRes)
  const match = getData.project?.name === newName && getData.project?.status === newStatus
  recordResult('Update Project Basic', match, match ? 'Name and status persisted' : 'Refetch mismatch')
}

async function testModuleFlagsPersistence() {
  log('\n🧪 Testing: Module flags persistence (hasDocumentCollectionProcess, etc.)', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const id = testResults.createdProjectIds[0]
  const res = await apiRequest(`/api/projects/${id}`, 'PUT', {
    hasDocumentCollectionProcess: true,
    hasMonthlyFMSReviewProcess: true
  })
  if (res.status !== 200) {
    recordResult('Module Flags Persistence', false, `PUT status: ${res.status}`)
    return
  }
  const getRes = await apiRequest(`/api/projects/${id}`, 'GET')
  const proj = apiData(getRes).project
  const flagsOk =
    proj?.hasDocumentCollectionProcess === true &&
    proj?.hasMonthlyFMSReviewProcess === true
  recordResult(
    'Module Flags Persistence',
    flagsOk,
    flagsOk ? 'Flags persisted after refresh' : `hasDoc: ${proj?.hasDocumentCollectionProcess}, hasMonthly: ${proj?.hasMonthlyFMSReviewProcess}`
  )
}

async function testDocumentSectionsPersistence() {
  log('\n🧪 Testing: Document sections persistence (table/JSON)', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const id = testResults.createdProjectIds[0]
  const year = new Date().getFullYear()
  const payload = {
    [year]: [
      {
        id: `sec-${Date.now()}`,
        name: 'Test Section',
        description: 'Persistence test',
        documents: [
          {
            id: `doc-${Date.now()}`,
            name: 'Test Doc',
            collectionStatus: { [`${year}-01`]: 'collected' },
            comments: {}
          }
        ]
      }
    ]
  }
  const putRes = await apiRequest(`/api/projects/${id}`, 'PUT', {
    documentSections: payload,
    hasDocumentCollectionProcess: true
  })
  if (putRes.status !== 200) {
    recordResult('Document Sections Persistence', false, `PUT status: ${putRes.status}`)
    return
  }
  const getRes = await apiRequest(`/api/projects/${id}`, 'GET')
  const sections = apiData(getRes).project?.documentSections
  const hasYear = sections && typeof sections === 'object' && sections[String(year)]
  const hasSection = hasYear && Array.isArray(sections[String(year)]) && sections[String(year)].length > 0
  const hasDoc = hasSection && sections[String(year)][0].documents?.length > 0
  const persisted = hasDoc && sections[String(year)][0].documents[0].name === 'Test Doc'
  recordResult(
    'Document Sections Persistence',
    persisted,
    persisted ? 'Document sections persisted' : `sections: ${JSON.stringify(sections)?.[0] ?? 'missing'}`
  )
}

async function testMonthlyFMSPersistence() {
  log('\n🧪 Testing: Monthly FMS sections persistence', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const id = testResults.createdProjectIds[0]
  const year = new Date().getFullYear()
  const payload = {
    [year]: [
      {
        id: `mfs-${Date.now()}`,
        name: 'Monthly FMS Section',
        documents: [
          { id: `mfs-doc-${Date.now()}`, name: 'FMS Item', collectionStatus: {}, comments: {} }
        ]
      }
    ]
  }
  const putRes = await apiRequest(`/api/projects/${id}`, 'PUT', {
    monthlyFMSReviewSections: payload,
    hasMonthlyFMSReviewProcess: true
  })
  if (putRes.status !== 200) {
    recordResult('Monthly FMS Persistence', false, `PUT status: ${putRes.status}`)
    return
  }
  const getRes = await apiRequest(`/api/projects/${id}`, 'GET')
  const sections = apiData(getRes).project?.monthlyFMSReviewSections
  const hasYear = sections && typeof sections === 'object' && sections[String(year)]
  const hasSection = hasYear && Array.isArray(sections[String(year)]) && sections[String(year)].length > 0
  const persisted = hasSection && sections[String(year)][0].name === 'Monthly FMS Section'
  recordResult(
    'Monthly FMS Persistence',
    persisted,
    persisted ? 'Monthly FMS sections persisted' : `monthlyFMS: ${sections ? 'present' : 'missing'}`
  )
}

async function testDeleteProject() {
  log('\n🧪 Testing: Delete Project', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const id = testResults.createdProjectIds[0]
  const delRes = await apiRequest(`/api/projects/${id}`, 'DELETE')
  const delData = apiData(delRes)
  const ok = delRes.status === 200 && (delData.deleted === true || delData.deleted === false)
  if (!ok) {
    recordResult('Delete Project', false, `Status: ${delRes.status}`)
    return
  }
  const getRes = await apiRequest(`/api/projects/${id}`, 'GET')
  const getData = apiData(getRes)
  const gone = getRes.status === 404 || (getData.error && getRes.status !== 200)
  recordResult('Delete Project', gone, gone ? 'Project removed; GET returns 404' : 'GET still returns project')
  if (gone) {
    testResults.createdProjectIds = testResults.createdProjectIds.filter((x) => x !== id)
  }
}

async function testPaginationAndCount() {
  log('\n🧪 Testing: List pagination & count', 'info')
  const res = await apiRequest('/api/projects?page=1&limit=5&includeCount=true')
  const data = apiData(res)
  const ok = res.status === 200 && Array.isArray(data.projects)
  const hasTotal = ok && typeof data.total === 'number'
  recordResult(
    'List Pagination',
    ok,
    ok ? `page/limit ok; total: ${data.total ?? 'N/A'}` : `Status: ${res.status}`
  )
}

async function runAllTests() {
  console.log('🚀 Projects – Functionality & Persistence Tests')
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log('='.repeat(60))

  try {
    testToken = await login()
    log('Auth: token obtained', 'success')
  } catch (e) {
    log(`Auth failed: ${e.message}. Set TEST_EMAIL/TEST_PASSWORD or use dev login.`, 'warn')
    recordResult('Authentication', false, e.message, true)
  }

  await testAuthAndListProjects()
  await testCreateProject()
  await testGetSingleProject()
  await testUpdateProjectBasic()
  await testModuleFlagsPersistence()
  await testDocumentSectionsPersistence()
  await testMonthlyFMSPersistence()
  await testPaginationAndCount()
  await testDeleteProject()
  await cleanup()

  const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(2)
  console.log('\n' + '='.repeat(60))
  console.log('📊 Summary')
  console.log('='.repeat(60))
  console.log(`✅ Passed: ${testResults.passed.length}`)
  console.log(`⚠️  Warnings: ${testResults.warnings.length}`)
  console.log(`❌ Failed: ${testResults.failed.length}`)
  console.log(`📈 Total: ${testResults.totalTests}`)
  console.log(`⏱️  Duration: ${duration}s`)
  if (testResults.failed.length > 0) {
    console.log('\n❌ Failed:')
    testResults.failed.forEach((f, i) => console.log(`   ${i + 1}. ${f.test}: ${f.message}`))
  }
  const rate =
    testResults.totalTests > 0
      ? ((testResults.passed.length / testResults.totalTests) * 100).toFixed(1)
      : 0
  console.log(`\n🎯 Success rate: ${rate}%`)
  process.exit(testResults.failed.length > 0 ? 1 : 0)
}

runAllTests().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
