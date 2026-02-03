#!/usr/bin/env node
/**
 * Document collection email activity test
 * Verifies: 1) Activity API returns 200 and structure. 2) After send, activity shows sent (if send succeeds).
 * Run: TEST_URL=http://localhost:3000 TEST_EMAIL=... TEST_PASSWORD=... node tests/test-document-collection-email-activity.js
 * Or against production: TEST_URL=https://your-domain.com TEST_EMAIL=... TEST_PASSWORD=... node tests/test-document-collection-email-activity.js
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
const TEST_RECIPIENT = process.env.TEST_EMAIL_RECIPIENT || 'test@example.com'

let token = null

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  const body = await res.json()
  const t = body.data?.accessToken ?? body.accessToken
  if (!t) throw new Error('No accessToken')
  return t
}

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE_URL}${path}`, opts)
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch (_) {
    data = { raw: text }
  }
  return { status: res.status, data: data?.data ?? data }
}

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res
}

async function main() {
  console.log('Document collection email activity test')
  console.log('BASE_URL:', BASE_URL)
  console.log('')

  try {
    token = await login()
    console.log('Logged in')
  } catch (e) {
    console.error('Login failed:', e.message)
    process.exit(1)
  }

  try {
  // Get first project and a document from its sections
  const listRes = await api('/api/projects')
  const projects = unwrap(listRes).projects || []
  if (projects.length === 0) {
    console.error('No projects found')
    process.exit(1)
  }
  const projectId = projects[0].id
  console.log('Using project:', projectId, projects[0].name || '')

  const projectRes = await api(`/api/projects/${projectId}`)
  const projectData = unwrap(projectRes)
  const sections = projectData?.documentSections || projectData?.documentSectionsToJson || []
  const year = new Date().getFullYear()
  const sectionsForYear = Array.isArray(sections) ? sections : (sections[year] || [])
  let documentId = null
  if (sectionsForYear.length > 0 && sectionsForYear[0].documents?.length > 0) {
    documentId = sectionsForYear[0].documents[0].id
  }
  if (!documentId) {
    console.error('No document found in project sections')
    process.exit(1)
  }
  console.log('Using document:', documentId)
  const month = 2
  const yearNum = year

  // 1) Smoke: activity API returns 200 and { sent, received }
  const activityPath = `/api/projects/${projectId}/document-collection-email-activity?documentId=${encodeURIComponent(documentId)}&month=${month}&year=${yearNum}`
  const activityRes = await api(activityPath)
  const activity = unwrap(activityRes)
  if (activityRes.status !== 200) {
    console.error('Activity API failed:', activityRes.status, activity)
    process.exit(1)
  }
  if (!Array.isArray(activity.sent) || !Array.isArray(activity.received)) {
    console.error('Activity API bad shape: expected { sent, received }', activity)
    process.exit(1)
  }
  console.log('Activity API OK: sent=', activity.sent.length, 'received=', activity.received.length)

  // 2) Send email with cell context so server writes log
  const sendRes = await api(`/api/projects/${projectId}/document-collection-send-email`, 'POST', {
    to: [TEST_RECIPIENT],
    subject: 'Test document request',
    html: '<p>Test</p>',
    text: 'Test',
    projectId: String(projectId).trim(),
    documentId: String(documentId).trim(),
    month: Number(month),
    year: Number(yearNum)
  })
  const sendData = unwrap(sendRes)
  const sentList = sendData.sent || []
  console.log('Send API: status=', sendRes.status, 'sent=', sentList.length, 'failed=', (sendData.failed || []).length)

  if (sendRes.status !== 200 && sendRes.status !== 503) {
    console.error('Send failed:', sendData.error || sendData)
    process.exit(1)
  }

  // 3) Fetch activity again; if we had at least one successful send, we expect at least one sent item
  const activityRes2 = await api(activityPath)
  const activity2 = unwrap(activityRes2)
  if (activityRes2.status !== 200) {
    console.error('Activity API (after send) failed:', activityRes2.status)
    process.exit(1)
  }

  if (sentList.length > 0 && activity2.sent.length === 0) {
    console.error('Persistence check FAILED: send reported', sentList.length, 'sent but activity shows', activity2.sent.length, 'sent')
    process.exit(1)
  }

  if (sentList.length > 0 && activity2.sent.length > 0) {
    console.log('Persistence check OK: activity shows', activity2.sent.length, 'sent after send')
  } else if (sentList.length === 0) {
    console.log('Send had no successful recipients (e.g. invalid test address); skipping persistence assertion')
  }

  console.log('')
  console.log('All checks passed.')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
