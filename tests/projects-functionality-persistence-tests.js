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
  createdProjectIds: [],
  createdTaskIds: [],
  createdCommentIds: [],
  createdTaskListIds: [],
  createdCustomFieldIds: [],
  createdTeamMemberIds: [],
  createdDocumentIds: [],
  createdProjectCommentIds: []
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
  for (const id of testResults.createdProjectCommentIds) {
    try {
      await apiRequest(`/api/project-comments?id=${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  for (const id of testResults.createdDocumentIds) {
    try {
      await apiRequest(`/api/project-documents?id=${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  for (const id of testResults.createdTeamMemberIds) {
    try {
      await apiRequest(`/api/project-team-members?id=${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  for (const id of testResults.createdCustomFieldIds) {
    try {
      await apiRequest(`/api/project-custom-fields?id=${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  for (const id of testResults.createdTaskListIds) {
    try {
      await apiRequest(`/api/project-task-lists?id=${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  for (const id of testResults.createdCommentIds) {
    try {
      await apiRequest(`/api/task-comments?id=${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  for (const id of testResults.createdTaskIds) {
    try {
      await apiRequest(`/api/tasks?id=${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  for (const id of testResults.createdProjectIds) {
    try {
      await apiRequest(`/api/projects/${id}`, 'DELETE')
    } catch (e) {
      // ignore
    }
  }
  testResults.createdProjectIds = []
  testResults.createdTaskIds = []
  testResults.createdCommentIds = []
  testResults.createdTaskListIds = []
  testResults.createdCustomFieldIds = []
  testResults.createdTeamMemberIds = []
  testResults.createdDocumentIds = []
  testResults.createdProjectCommentIds = []
}

// API wraps responses in { data: { ... } }; unwrap once for assertions
function apiData(res) {
  return res?.data?.data ?? res?.data ?? {}
}

function errorSummary(res) {
  const data = apiData(res)
  const message =
    data?.error?.message ||
    data?.message ||
    data?.error ||
    (typeof data === 'string' ? data : '')
  if (message) return message
  try {
    return JSON.stringify(data).slice(0, 200)
  } catch (e) {
    return `Status: ${res?.status ?? 'unknown'}`
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let testUserId = null

async function loadTestUserId() {
  if (testUserId) return testUserId
  const res = await apiRequest('/api/users', 'GET')
  const data = apiData(res)
  const users = Array.isArray(data.users) ? data.users : []
  const found = users.find((u) => u?.email === TEST_EMAIL)
  if (found?.id) {
    testUserId = found.id
  }
  return testUserId
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

async function testCreateProjectValidation() {
  log('\n🧪 Testing: Project validation (best-practice checks)', 'info')
  const missingNameRes = await apiRequest('/api/projects', 'POST', { type: 'General' })
  const missingNameOk = missingNameRes.status === 400
  recordResult(
    'Project Validation (missing name)',
    missingNameOk,
    missingNameOk ? 'Rejects missing name' : `Status: ${missingNameRes.status}`
  )

  const invalidTypeRes = await apiRequest('/api/projects', 'POST', { name: 'Invalid Type Test', type: 'InvalidType' })
  const invalidTypeOk = invalidTypeRes.status === 400
  recordResult(
    'Project Validation (invalid type)',
    invalidTypeOk,
    invalidTypeOk ? 'Rejects invalid type' : `Status: ${invalidTypeRes.status}`
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

async function testProjectDefaultsAndShape() {
  log('\n🧪 Testing: Project defaults & response shape (best-practice checks)', 'info')
  if (testResults.createdProjectIds.length === 0) {
    recordResult('Project Defaults & Shape', false, 'No project ID from create')
    return
  }
  const id = testResults.createdProjectIds[0]
  const res = await apiRequest(`/api/projects/${id}`, 'GET')
  const proj = apiData(res).project
  const flags = [
    'hasDocumentCollectionProcess',
    'hasWeeklyFMSReviewProcess',
    'hasMonthlyFMSReviewProcess',
    'hasMonthlyDataReviewProcess'
  ]
  const flagsOk = flags.every((flag) => typeof proj?.[flag] === 'boolean')
  const sectionsOk =
    proj &&
    proj.documentSections &&
    typeof proj.documentSections === 'object' &&
    !Array.isArray(proj.documentSections)
  const monthlyOk =
    proj &&
    proj.monthlyFMSReviewSections &&
    typeof proj.monthlyFMSReviewSections === 'object' &&
    !Array.isArray(proj.monthlyFMSReviewSections)
  const tasksListOk = Array.isArray(proj?.tasksList)
  const taskListsOk = Array.isArray(proj?.taskLists)
  const customFieldsOk = Array.isArray(proj?.customFieldDefinitions)
  const teamOk = Array.isArray(proj?.team)
  const documentsOk = Array.isArray(proj?.documents)
  const commentsOk = Array.isArray(proj?.comments)
  const activityOk = Array.isArray(proj?.activityLog)
  const ok =
    res.status === 200 &&
    flagsOk &&
    sectionsOk &&
    monthlyOk &&
    tasksListOk &&
    taskListsOk &&
    customFieldsOk &&
    teamOk &&
    documentsOk &&
    commentsOk &&
    activityOk
  const details = `flagsOk=${flagsOk}, sectionsOk=${sectionsOk}, monthlyOk=${monthlyOk}, tasksListOk=${tasksListOk}, taskListsOk=${taskListsOk}, customFieldsOk=${customFieldsOk}, teamOk=${teamOk}, documentsOk=${documentsOk}, commentsOk=${commentsOk}, activityOk=${activityOk}`
  recordResult('Project Defaults & Shape', ok, ok ? 'Defaults and shapes OK' : details)
}

async function testAuthRequiredForSubresources() {
  log('\n🧪 Testing: Subresource auth protection', 'info')
  const endpoints = [
    { name: 'Project Task Lists Auth', path: '/api/project-task-lists' },
    { name: 'Project Custom Fields Auth', path: '/api/project-custom-fields' },
    { name: 'Project Team Members Auth', path: '/api/project-team-members' },
    { name: 'Project Documents Auth', path: '/api/project-documents' },
    { name: 'Project Comments Auth', path: '/api/project-comments' },
    { name: 'Project Activity Logs Auth', path: '/api/project-activity-logs' }
  ]
  for (const endpoint of endpoints) {
    const res = await apiRequest(endpoint.path, 'POST', { projectId: 'unauth-test', name: 'X', text: 'X', type: 'test' }, null)
    const ok = res.status === 401 || res.status === 403
    recordResult(endpoint.name, ok, ok ? 'Auth required' : `Status: ${res.status}`)
  }
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

async function testCreateTask() {
  log('\n🧪 Testing: Create Task (project functioning)', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const body = {
    projectId,
    title: `Test Task ${Date.now()}`,
    description: 'Task persistence test',
    status: 'todo',
    priority: 'Medium'
  }
  const res = await apiRequest('/api/tasks', 'POST', body)
  const task = apiData(res).task ?? apiData(res)
  const created = res.status === 200 && task?.id
  if (!created) {
    recordResult('Create Task', false, `Status: ${res.status}`)
    return
  }
  testResults.createdTaskIds.push(task.id)
  recordResult('Create Task', true, `Created task ${task.id}`)
}

async function testGetTasksByProject() {
  log('\n🧪 Testing: Get Tasks by Project', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const res = await apiRequest(`/api/tasks?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const data = apiData(res)
  const tasks = Array.isArray(data.tasks) ? data.tasks : Array.isArray(data) ? data : []
  const hasTask = testResults.createdTaskIds.length === 0 || tasks.some((t) => t.id === testResults.createdTaskIds[0])
  const ok = res.status === 200 && Array.isArray(tasks) && hasTask
  recordResult('Get Tasks by Project', ok, ok ? `Tasks: ${tasks.length}` : `Status: ${res.status}`)
}

async function testUpdateTask() {
  log('\n🧪 Testing: Update Task', 'info')
  if (testResults.createdTaskIds.length === 0) return
  const taskId = testResults.createdTaskIds[0]
  const res = await apiRequest(`/api/tasks?id=${encodeURIComponent(taskId)}`, 'PUT', {
    status: 'in_progress',
    priority: 'High',
    description: 'Updated task description'
  })
  const task = apiData(res).task ?? apiData(res)
  const ok = res.status === 200 && task?.status === 'in_progress'
  recordResult('Update Task', ok, ok ? 'Task updated' : `Status: ${res.status}`)
}

async function testCreateTaskComment() {
  log('\n🧪 Testing: Create Task Comment', 'info')
  if (testResults.createdProjectIds.length === 0 || testResults.createdTaskIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const taskId = testResults.createdTaskIds[0]
  const res = await apiRequest('/api/task-comments', 'POST', {
    projectId,
    taskId,
    text: 'Test comment from projects check suite',
    author: 'Projects Check Suite'
  })
  const comment = apiData(res).comment ?? apiData(res)
  const created = res.status === 200 && comment?.id
  if (!created) {
    recordResult('Create Task Comment', false, `Status: ${res.status}`)
    return
  }
  testResults.createdCommentIds.push(comment.id)
  recordResult('Create Task Comment', true, `Created comment ${comment.id}`)
}

async function testGetTaskComments() {
  log('\n🧪 Testing: Get Task Comments', 'info')
  if (testResults.createdTaskIds.length === 0) return
  const taskId = testResults.createdTaskIds[0]
  const res = await apiRequest(`/api/task-comments?taskId=${encodeURIComponent(taskId)}`, 'GET')
  const data = apiData(res)
  const comments = Array.isArray(data.comments) ? data.comments : Array.isArray(data) ? data : []
  const hasComment =
    testResults.createdCommentIds.length === 0 ||
    comments.some((c) => c.id === testResults.createdCommentIds[0])
  const ok = res.status === 200 && Array.isArray(comments) && hasComment
  recordResult('Get Task Comments', ok, ok ? `Comments: ${comments.length}` : `Status: ${res.status}`)
}

async function testUpdateTaskComment() {
  log('\n🧪 Testing: Update Task Comment', 'info')
  if (testResults.createdCommentIds.length === 0) return
  const commentId = testResults.createdCommentIds[0]
  const res = await apiRequest(`/api/task-comments?id=${encodeURIComponent(commentId)}`, 'PUT', {
    text: 'Updated comment from projects check suite'
  })
  const comment = apiData(res).comment ?? apiData(res)
  const ok = res.status === 200 && comment?.text?.includes('Updated')
  recordResult('Update Task Comment', ok, ok ? 'Comment updated' : `Status: ${res.status}`)
}

async function testProjectTasksListSync() {
  log('\n🧪 Testing: Project tasks/comments persistence', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  await sleep(300)
  const res = await apiRequest(`/api/projects/${projectId}`, 'GET')
  const proj = apiData(res).project
  const tasks = Array.isArray(proj?.tasksList) ? proj.tasksList : []
  const taskFound = testResults.createdTaskIds.length === 0 || tasks.some((t) => t.id === testResults.createdTaskIds[0])
  const commentFound =
    testResults.createdCommentIds.length === 0 ||
    tasks.some((t) => Array.isArray(t.comments) && t.comments.some((c) => c.id === testResults.createdCommentIds[0]))
  const ok = res.status === 200 && taskFound && commentFound
  const details = `taskFound=${taskFound}, commentFound=${commentFound}`
  recordResult('Project Tasks/Comments Persistence', ok, ok ? 'Tasks & comments persisted' : details)
}

async function testSubresourceInvalidProjectId() {
  log('\n🧪 Testing: Subresources invalid projectId', 'info')
  const badId = 'invalid-project-id'
  const cases = [
    { name: 'Task Lists Invalid Project', path: '/api/project-task-lists', body: { projectId: badId, name: 'X' } },
    { name: 'Custom Fields Invalid Project', path: '/api/project-custom-fields', body: { projectId: badId, name: 'X', type: 'text' } },
    { name: 'Team Members Invalid Project', path: '/api/project-team-members', body: { projectId: badId, userId: 'invalid-user' } },
    { name: 'Documents Invalid Project', path: '/api/project-documents', body: { projectId: badId, name: 'X' } },
    { name: 'Comments Invalid Project', path: '/api/project-comments', body: { projectId: badId, text: 'X' } },
    { name: 'Activity Logs Invalid Project', path: '/api/project-activity-logs', body: { projectId: badId, type: 'test', description: 'X' } }
  ]
  for (const testCase of cases) {
    const res = await apiRequest(testCase.path, 'POST', testCase.body)
    const ok = res.status === 404
    recordResult(testCase.name, ok, ok ? 'Rejected missing project' : `Status: ${res.status}`)
  }
}

async function testProjectTaskListsCrud() {
  log('\n🧪 Testing: Project task lists CRUD', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const createRes = await apiRequest('/api/project-task-lists', 'POST', {
    projectId,
    name: 'Test List',
    color: 'blue',
    order: 1
  })
  const created = apiData(createRes).taskList
  if (createRes.status !== 201 || !created?.id) {
    recordResult('Project Task Lists Create', false, `Status: ${createRes.status} ${errorSummary(createRes)}`)
    return
  }
  testResults.createdTaskListIds.push(created.id)
  recordResult('Project Task Lists Create', true, `Created task list ${created.id}`)

  const listRes = await apiRequest(`/api/project-task-lists?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const lists = apiData(listRes).taskLists || []
  const listFound = Array.isArray(lists) && lists.some((l) => l.id === created.id)
  recordResult('Project Task Lists Get', listRes.status === 200 && listFound, listFound ? 'List found' : 'List missing')

  const updateRes = await apiRequest(`/api/project-task-lists?id=${encodeURIComponent(created.id)}`, 'PUT', {
    name: 'Test List Updated'
  })
  const updated = apiData(updateRes).taskList
  recordResult(
    'Project Task Lists Update',
    updateRes.status === 200 && updated?.name === 'Test List Updated',
    updateRes.status === 200 ? 'List updated' : `Status: ${updateRes.status}`
  )

  if (created?.listId != null) {
    const dupRes = await apiRequest('/api/project-task-lists', 'POST', {
      projectId,
      listId: created.listId,
      name: 'Duplicate List',
      color: 'blue'
    })
    const dupOk = dupRes.status === 400
    recordResult('Project Task Lists Duplicate', dupOk, dupOk ? 'Duplicate rejected' : `Status: ${dupRes.status}`)
  }

  const delRes = await apiRequest(`/api/project-task-lists?id=${encodeURIComponent(created.id)}`, 'DELETE')
  recordResult('Project Task Lists Delete', delRes.status === 200, delRes.status === 200 ? 'List deleted' : `Status: ${delRes.status}`)
}

async function testProjectCustomFieldsCrud() {
  log('\n🧪 Testing: Project custom fields CRUD', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const createRes = await apiRequest('/api/project-custom-fields', 'POST', {
    projectId,
    name: 'Test Field',
    type: 'text',
    required: false,
    options: [],
    order: 1
  })
  const created = apiData(createRes).field
  if (createRes.status !== 201 || !created?.id) {
    recordResult('Project Custom Fields Create', false, `Status: ${createRes.status} ${errorSummary(createRes)}`)
    return
  }
  testResults.createdCustomFieldIds.push(created.id)
  recordResult('Project Custom Fields Create', true, `Created field ${created.id}`)

  const listRes = await apiRequest(`/api/project-custom-fields?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const fields = apiData(listRes).fields || []
  const fieldFound = Array.isArray(fields) && fields.some((f) => f.id === created.id)
  recordResult('Project Custom Fields Get', listRes.status === 200 && fieldFound, fieldFound ? 'Field found' : 'Field missing')

  const updateRes = await apiRequest(`/api/project-custom-fields?id=${encodeURIComponent(created.id)}`, 'PUT', {
    name: 'Test Field Updated',
    required: true
  })
  const updated = apiData(updateRes).field
  recordResult(
    'Project Custom Fields Update',
    updateRes.status === 200 && updated?.name === 'Test Field Updated' && updated?.required === true,
    updateRes.status === 200 ? 'Field updated' : `Status: ${updateRes.status}`
  )

  const fieldId = created?.fieldId || (Array.isArray(fields) ? fields.find((f) => f.id === created.id)?.fieldId : null)
  if (fieldId) {
    const dupRes = await apiRequest('/api/project-custom-fields', 'POST', {
      projectId,
      fieldId,
      name: 'Duplicate Field',
      type: 'text'
    })
    const dupOk = dupRes.status === 400
    recordResult('Project Custom Fields Duplicate', dupOk, dupOk ? 'Duplicate rejected' : `Status: ${dupRes.status}`)
  }

  const delRes = await apiRequest(`/api/project-custom-fields?id=${encodeURIComponent(created.id)}`, 'DELETE')
  recordResult('Project Custom Fields Delete', delRes.status === 200, delRes.status === 200 ? 'Field deleted' : `Status: ${delRes.status}`)
}

async function testProjectTeamMembersCrud() {
  log('\n🧪 Testing: Project team members CRUD', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const userId = await loadTestUserId()
  if (!userId) {
    recordResult('Project Team Members', false, 'Unable to resolve userId for test user')
    return
  }

  const createRes = await apiRequest('/api/project-team-members', 'POST', {
    projectId,
    userId,
    role: 'member',
    permissions: ['read'],
    notes: 'Test team member'
  })
  const created = apiData(createRes).member
  if (createRes.status !== 201 || !created?.id) {
    recordResult('Project Team Members Create', false, `Status: ${createRes.status} ${errorSummary(createRes)}`)
    return
  }
  testResults.createdTeamMemberIds.push(created.id)
  recordResult('Project Team Members Create', true, `Added member ${created.id}`)

  const listRes = await apiRequest(`/api/project-team-members?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const members = apiData(listRes).members || []
  const memberFound = Array.isArray(members) && members.some((m) => m.id === created.id)
  recordResult('Project Team Members Get', listRes.status === 200 && memberFound, memberFound ? 'Member found' : 'Member missing')

  const updateRes = await apiRequest(`/api/project-team-members?id=${encodeURIComponent(created.id)}`, 'PUT', {
    role: 'viewer',
    permissions: ['read', 'comment']
  })
  const updated = apiData(updateRes).member
  recordResult(
    'Project Team Members Update',
    updateRes.status === 200 && updated?.role === 'viewer',
    updateRes.status === 200 ? 'Member updated' : `Status: ${updateRes.status}`
  )

  const dupRes = await apiRequest('/api/project-team-members', 'POST', {
    projectId,
    userId,
    role: 'member'
  })
  const dupOk = dupRes.status === 400
  recordResult('Project Team Members Duplicate', dupOk, dupOk ? 'Duplicate rejected' : `Status: ${dupRes.status}`)

  const delRes = await apiRequest(`/api/project-team-members?id=${encodeURIComponent(created.id)}`, 'DELETE')
  recordResult('Project Team Members Delete', delRes.status === 200, delRes.status === 200 ? 'Member removed' : `Status: ${delRes.status}`)
}

async function testProjectDocumentsCrud() {
  log('\n🧪 Testing: Project documents CRUD', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const createRes = await apiRequest('/api/project-documents', 'POST', {
    projectId,
    name: 'Test Document',
    description: 'Test document for projects suite',
    type: 'general',
    url: 'https://example.com/test-doc'
  })
  const created = apiData(createRes).document
  if (createRes.status !== 200 || !created?.id) {
    recordResult('Project Documents Create', false, `Status: ${createRes.status} ${errorSummary(createRes)}`)
    return
  }
  testResults.createdDocumentIds.push(created.id)
  recordResult('Project Documents Create', true, `Created document ${created.id}`)

  const listRes = await apiRequest(`/api/project-documents?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const docs = apiData(listRes).documents || []
  const docFound = Array.isArray(docs) && docs.some((d) => d.id === created.id)
  recordResult('Project Documents Get', listRes.status === 200 && docFound, docFound ? 'Document found' : 'Document missing')

  const updateRes = await apiRequest(`/api/project-documents?id=${encodeURIComponent(created.id)}`, 'PUT', {
    description: 'Updated document description'
  })
  const updated = apiData(updateRes).document
  recordResult(
    'Project Documents Update',
    updateRes.status === 200 && updated?.description === 'Updated document description',
    updateRes.status === 200 ? 'Document updated' : `Status: ${updateRes.status}`
  )

  const delRes = await apiRequest(`/api/project-documents?id=${encodeURIComponent(created.id)}`, 'DELETE')
  recordResult('Project Documents Delete', delRes.status === 200, delRes.status === 200 ? 'Document deleted' : `Status: ${delRes.status}`)

  const listAfterRes = await apiRequest(`/api/project-documents?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const docsAfter = apiData(listAfterRes).documents || []
  const removed = Array.isArray(docsAfter) && !docsAfter.some((d) => d.id === created.id)
  recordResult('Project Documents Soft Delete Filter', listAfterRes.status === 200 && removed, removed ? 'Document hidden' : 'Document still visible')

  const missingNameRes = await apiRequest('/api/project-documents', 'POST', {
    projectId
  })
  const missingNameOk = missingNameRes.status === 400
  recordResult('Project Documents Validation', missingNameOk, missingNameOk ? 'Rejects missing name' : `Status: ${missingNameRes.status}`)
}

async function testProjectCommentsCrud() {
  log('\n🧪 Testing: Project comments CRUD', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const createRes = await apiRequest('/api/project-comments', 'POST', {
    projectId,
    text: 'Test project comment',
    type: 'comment'
  })
  const created = apiData(createRes).comment
  if (createRes.status !== 200 || !created?.id) {
    recordResult('Project Comments Create', false, `Status: ${createRes.status} ${errorSummary(createRes)}`)
    return
  }
  testResults.createdProjectCommentIds.push(created.id)
  recordResult('Project Comments Create', true, `Created comment ${created.id}`)

  const replyRes = await apiRequest('/api/project-comments', 'POST', {
    projectId,
    text: 'Test project comment reply',
    parentId: created.id
  })
  const reply = apiData(replyRes).comment
  recordResult('Project Comments Reply', replyRes.status === 200 && reply?.parentId === created.id, replyRes.status === 200 ? 'Reply created' : `Status: ${replyRes.status}`)

  const listRes = await apiRequest(`/api/project-comments?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const comments = apiData(listRes).comments || []
  const parentFound = Array.isArray(comments) && comments.some((c) => c.id === created.id)
  const replyFound =
    Array.isArray(comments) &&
    comments.some((c) => c.id === created.id && Array.isArray(c.replies) && c.replies.some((r) => r.id === reply?.id))
  recordResult('Project Comments Get', listRes.status === 200 && parentFound, parentFound ? 'Parent found' : 'Parent missing')
  recordResult('Project Comments Replies', listRes.status === 200 && replyFound, replyFound ? 'Reply found' : 'Reply missing')

  const updateRes = await apiRequest(`/api/project-comments?id=${encodeURIComponent(created.id)}`, 'PUT', {
    text: 'Updated project comment'
  })
  const updated = apiData(updateRes).comment
  recordResult(
    'Project Comments Update',
    updateRes.status === 200 && updated?.text === 'Updated project comment',
    updateRes.status === 200 ? 'Comment updated' : `Status: ${updateRes.status}`
  )

  const delRes = await apiRequest(`/api/project-comments?id=${encodeURIComponent(created.id)}`, 'DELETE')
  recordResult('Project Comments Delete', delRes.status === 200, delRes.status === 200 ? 'Comment deleted' : `Status: ${delRes.status}`)

  const missingTextRes = await apiRequest('/api/project-comments', 'POST', { projectId })
  const missingTextOk = missingTextRes.status === 400
  recordResult('Project Comments Validation', missingTextOk, missingTextOk ? 'Rejects missing text' : `Status: ${missingTextRes.status}`)
}

async function testProjectActivityLogs() {
  log('\n🧪 Testing: Project activity logs', 'info')
  if (testResults.createdProjectIds.length === 0) return
  const projectId = testResults.createdProjectIds[0]
  const createRes = await apiRequest('/api/project-activity-logs', 'POST', {
    projectId,
    type: 'test',
    description: 'Test activity log entry',
    metadata: { source: 'projects test suite' }
  })
  const created = apiData(createRes).log
  if (createRes.status !== 200 || !created?.id) {
    recordResult('Project Activity Logs Create', false, `Status: ${createRes.status} ${errorSummary(createRes)}`)
    return
  }
  recordResult('Project Activity Logs Create', true, `Created log ${created.id}`)

  const listRes = await apiRequest(`/api/project-activity-logs?projectId=${encodeURIComponent(projectId)}&type=test`, 'GET')
  const logs = apiData(listRes).logs || []
  const logFound = Array.isArray(logs) && logs.some((l) => l.id === created.id)
  recordResult('Project Activity Logs Get', listRes.status === 200 && logFound, logFound ? 'Log found' : 'Log missing')

  const missingTypeRes = await apiRequest('/api/project-activity-logs', 'POST', {
    projectId,
    description: 'Missing type'
  })
  const missingTypeOk = missingTypeRes.status === 400
  recordResult('Project Activity Logs Validation', missingTypeOk, missingTypeOk ? 'Rejects missing type' : `Status: ${missingTypeRes.status}`)
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

async function testDeleteTaskComment() {
  log('\n🧪 Testing: Delete Task Comment', 'info')
  if (testResults.createdCommentIds.length === 0) return
  const commentId = testResults.createdCommentIds[0]
  const delRes = await apiRequest(`/api/task-comments?id=${encodeURIComponent(commentId)}`, 'DELETE')
  const ok = delRes.status === 200
  recordResult('Delete Task Comment', ok, ok ? 'Comment deleted' : `Status: ${delRes.status}`)
}

async function testDeleteTask() {
  log('\n🧪 Testing: Delete Task', 'info')
  if (testResults.createdTaskIds.length === 0) return
  const taskId = testResults.createdTaskIds[0]
  const delRes = await apiRequest(`/api/tasks?id=${encodeURIComponent(taskId)}`, 'DELETE')
  const ok = delRes.status === 200
  recordResult('Delete Task', ok, ok ? 'Task deleted' : `Status: ${delRes.status}`)
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

async function testCascadeAfterProjectDelete(projectId) {
  log('\n🧪 Testing: Cascade delete (tasks/comments)', 'info')
  if (!projectId) return
  const tasksRes = await apiRequest(`/api/tasks?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const tasksData = apiData(tasksRes)
  const tasks = Array.isArray(tasksData.tasks) ? tasksData.tasks : Array.isArray(tasksData) ? tasksData : []
  const commentsRes = await apiRequest(`/api/task-comments?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const commentsData = apiData(commentsRes)
  const comments = Array.isArray(commentsData.comments) ? commentsData.comments : Array.isArray(commentsData) ? commentsData : []
  const ok = tasksRes.status === 200 && commentsRes.status === 200 && tasks.length === 0 && comments.length === 0
  recordResult(
    'Cascade Delete (Tasks/Comments)',
    ok,
    ok ? 'Tasks/comments removed after project delete' : `tasks=${tasks.length}, comments=${comments.length}`
  )

  const logsRes = await apiRequest(`/api/project-activity-logs?projectId=${encodeURIComponent(projectId)}`, 'GET')
  const logsData = apiData(logsRes)
  const logs = Array.isArray(logsData.logs) ? logsData.logs : Array.isArray(logsData) ? logsData : []
  const logsCleared = logsRes.status === 200 && logs.length === 0
  recordResult(
    'Cascade Delete (Activity Logs)',
    logsCleared,
    logsCleared ? 'Activity logs removed after project delete' : `logs=${logs.length}`,
    !logsCleared
  )
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
  await testCreateProjectValidation()
  await testCreateProject()
  await testProjectDefaultsAndShape()
  await testAuthRequiredForSubresources()
  await testGetSingleProject()
  await testUpdateProjectBasic()
  await testModuleFlagsPersistence()
  await testDocumentSectionsPersistence()
  await testMonthlyFMSPersistence()
  await testCreateTask()
  await testGetTasksByProject()
  await testUpdateTask()
  await testCreateTaskComment()
  await testGetTaskComments()
  await testUpdateTaskComment()
  await testProjectTasksListSync()
  await testSubresourceInvalidProjectId()
  await testProjectTaskListsCrud()
  await testProjectCustomFieldsCrud()
  await testProjectTeamMembersCrud()
  await testProjectDocumentsCrud()
  await testProjectCommentsCrud()
  await testProjectActivityLogs()
  await testPaginationAndCount()
  await testDeleteTaskComment()
  await testDeleteTask()
  const deletedProjectId = testResults.createdProjectIds[0]
  await testDeleteProject()
  await testCascadeAfterProjectDelete(deletedProjectId)
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
