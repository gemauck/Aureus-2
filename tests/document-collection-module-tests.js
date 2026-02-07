#!/usr/bin/env node
/**
 * Document Collection Module - Comprehensive Tests
 * Covers: templates CRUD, email activity, send email, received counts, notification opened.
 * Run:
 *   TEST_URL=https://abcoafrica.co.za TEST_EMAIL=... TEST_PASSWORD=... TEST_EMAIL_RECIPIENT=... node tests/document-collection-module-tests.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'http://localhost:3000'
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@example.com'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123'
const TEST_RECIPIENT = process.env.TEST_EMAIL_RECIPIENT || TEST_EMAIL || 'test@example.com'

const results = {
  passed: [],
  failed: [],
  warnings: [],
  total: 0,
  startTime: Date.now()
}

let token = null

function log(message, type = 'info') {
  const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '📝'
  console.log(`${emoji} ${message}`)
}

function recordResult(test, passed, message = '', isWarning = false) {
  results.total++
  const result = { test, passed, message, warning: isWarning }
  if (passed) {
    results.passed.push(result)
    log(`${test}: PASSED`, 'success')
  } else if (isWarning) {
    results.warnings.push(result)
    log(`${test}: WARNING - ${message}`, 'warn')
  } else {
    results.failed.push(result)
    log(`${test}: FAILED - ${message}`, 'error')
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
  const t = body.data?.accessToken ?? body.accessToken
  if (!t) throw new Error('No accessToken in login response')
  return t
}

async function apiRequest(path, method = 'GET', body = null) {
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
    } catch (_) {
      data = { raw: text }
    }
    return { status: response.status, data }
  } catch (error) {
    return { status: 0, error: error.message }
  }
}

function apiData(res) {
  return res?.data?.data ?? res?.data ?? {}
}

async function testTemplatesCrud() {
  log('\n🧪 Testing: Document collection templates CRUD', 'info')
  const listRes = await apiRequest('/api/document-collection-templates')
  const listData = apiData(listRes)
  const templates = Array.isArray(listData.templates) ? listData.templates : []
  recordResult('Templates List', listRes.status === 200, `Status: ${listRes.status}`)

  const name = `Test Template ${Date.now()}`
  const createRes = await apiRequest('/api/document-collection-templates', 'POST', {
    name,
    description: 'Test template',
    sections: [{ name: 'Section A', description: 'Test', documents: [{ name: 'Doc A' }] }],
    isDefault: false
  })
  const created = apiData(createRes).template
  if (createRes.status !== 200 || !created?.id) {
    recordResult('Templates Create', false, `Status: ${createRes.status}`)
    return null
  }
  recordResult('Templates Create', true, `Created ${created.id}`)

  const getRes = await apiRequest(`/api/document-collection-templates/${created.id}`)
  const got = apiData(getRes).template
  recordResult('Templates Get', getRes.status === 200 && got?.id === created.id, `Status: ${getRes.status}`)

  const updateRes = await apiRequest(`/api/document-collection-templates/${created.id}`, 'PUT', {
    name: `${name} Updated`,
    description: 'Updated template'
  })
  const updated = apiData(updateRes).template
  recordResult(
    'Templates Update',
    updateRes.status === 200 && updated?.name?.includes('Updated'),
    `Status: ${updateRes.status}`
  )

  const deleteRes = await apiRequest(`/api/document-collection-templates/${created.id}`, 'DELETE')
  recordResult('Templates Delete', deleteRes.status === 200, `Status: ${deleteRes.status}`)

  return created
}

async function findProjectDocument() {
  const listRes = await apiRequest('/api/projects')
  const projects = apiData(listRes).projects || []
  if (!Array.isArray(projects) || projects.length === 0) return null

  const year = new Date().getFullYear()
  for (const project of projects) {
    const projRes = await apiRequest(`/api/projects/${project.id}`)
    const proj = apiData(projRes).project || apiData(projRes)
    const sections = proj?.documentSections
    const sectionsForYear = Array.isArray(sections) ? sections : (sections?.[String(year)] || [])
    if (Array.isArray(sectionsForYear) && sectionsForYear.length > 0) {
      const firstDoc = sectionsForYear[0]?.documents?.[0]
      if (firstDoc?.id) {
        return { projectId: project.id, documentId: firstDoc.id, year }
      }
    }
  }
  return null
}

async function testEmailActivityAndSend(context) {
  log('\n🧪 Testing: Document collection email activity & send', 'info')
  const { projectId, documentId, year } = context
  const month = 2

  const activityPath = `/api/projects/${projectId}/document-collection-email-activity?documentId=${encodeURIComponent(documentId)}&month=${month}&year=${year}`
  const activityRes = await apiRequest(activityPath)
  const activity = apiData(activityRes)
  const activityOk = activityRes.status === 200 && Array.isArray(activity.sent) && Array.isArray(activity.received)
  recordResult('Email Activity (GET)', activityOk, `Status: ${activityRes.status}`)

  const sendRes = await apiRequest(`/api/projects/${projectId}/document-collection-send-email`, 'POST', {
    to: [TEST_RECIPIENT],
    subject: 'Test document request',
    html: '<p>Test</p>',
    text: 'Test',
    projectId: String(projectId),
    documentId: String(documentId),
    month: Number(month),
    year: Number(year)
  })
  const sendData = apiData(sendRes)
  const sendOk = sendRes.status === 200 || sendRes.status === 503
  recordResult('Send Document Request', sendOk, `Status: ${sendRes.status}`)

  const activityRes2 = await apiRequest(activityPath)
  const activity2 = apiData(activityRes2)
  const sentList = sendData?.sent || []
  if (sentList.length > 0) {
    const persisted = Array.isArray(activity2?.sent) && activity2.sent.length > 0
    recordResult('Email Activity Persistence', persisted, persisted ? 'Sent log persisted' : 'No sent logs after send')
  } else {
    recordResult('Email Activity Persistence', true, 'No sent recipients; skipped persistence assertion', true)
  }
}

async function testReceivedCountsAndNotifications(context) {
  log('\n🧪 Testing: Received counts & notification opened', 'info')
  const { projectId, documentId, year } = context
  const countsRes = await apiRequest(`/api/projects/${projectId}/document-collection-received-counts?year=${year}`)
  const countsData = apiData(countsRes)
  const countsOk = countsRes.status === 200 && Array.isArray(countsData.counts)
  recordResult('Received Counts (GET)', countsOk, `Status: ${countsRes.status}`)

  const notifyRes = await apiRequest(`/api/projects/${projectId}/document-collection-notification-opened`, 'POST', {
    documentId,
    year,
    month: 2,
    type: 'email'
  })
  const notifyData = apiData(notifyRes)
  const notifyOk = notifyRes.status === 200 && (notifyData.success === true || notifyData.skipped === true)
  recordResult('Notification Opened (email)', notifyOk, `Status: ${notifyRes.status}`)

  const notifyCommentRes = await apiRequest(`/api/projects/${projectId}/document-collection-notification-opened`, 'POST', {
    documentId,
    year,
    month: 2,
    type: 'comment'
  })
  const notifyCommentData = apiData(notifyCommentRes)
  const notifyCommentOk = notifyCommentRes.status === 200 && (notifyCommentData.success === true || notifyCommentData.skipped === true)
  recordResult('Notification Opened (comment)', notifyCommentOk, `Status: ${notifyCommentRes.status}`)
}

async function run() {
  console.log('🚀 Document Collection Module Tests')
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log('='.repeat(60))

  try {
    token = await login()
    log('Auth: token obtained', 'success')
  } catch (e) {
    log(`Auth failed: ${e.message}`, 'error')
    recordResult('Authentication', false, e.message)
    process.exit(1)
  }

  await testTemplatesCrud()

  const context = await findProjectDocument()
  if (!context) {
    recordResult('Document Collection Context', true, 'No document sections found; skipping doc-specific tests', true)
  } else {
    recordResult('Document Collection Context', true, `Project ${context.projectId} doc ${context.documentId}`)
    await testEmailActivityAndSend(context)
    await testReceivedCountsAndNotifications(context)
  }

  const duration = ((Date.now() - results.startTime) / 1000).toFixed(2)
  console.log('\n' + '='.repeat(60))
  console.log('📊 Summary')
  console.log('='.repeat(60))
  console.log(`✅ Passed: ${results.passed.length}`)
  console.log(`⚠️  Warnings: ${results.warnings.length}`)
  console.log(`❌ Failed: ${results.failed.length}`)
  console.log(`📈 Total: ${results.total}`)
  console.log(`⏱️  Duration: ${duration}s`)
  if (results.failed.length > 0) {
    console.log('\n❌ Failed:')
    results.failed.forEach((f, i) => console.log(`   ${i + 1}. ${f.test}: ${f.message}`))
  }
  const rate =
    results.total > 0
      ? ((results.passed.length / results.total) * 100).toFixed(1)
      : 0
  console.log(`\n🎯 Success rate: ${rate}%`)
  process.exit(results.failed.length > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
