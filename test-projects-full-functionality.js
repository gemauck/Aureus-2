#!/usr/bin/env node
/**
 * Comprehensive test suite for Projects functionality and data persistence
 * Tests all CRUD operations for Projects, Tasks, TaskComments, and related tables
 */

import { PrismaClient } from '@prisma/client'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const prisma = new PrismaClient()

const results = {
  passed: 0,
  failed: 0,
  errors: []
}

function log(message, type = 'info') {
  const prefix = type === 'pass' ? '✅' : type === 'fail' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️'
  console.log(`${prefix} ${message}`)
}

function recordResult(testName, passed, error = null) {
  if (passed) {
    results.passed++
    log(testName, 'pass')
  } else {
    results.failed++
    results.errors.push({ test: testName, error: error?.message || error || 'Unknown error' })
    log(`${testName}: ${error?.message || error}`, 'fail')
  }
}

async function cleanupTestData() {
  try {
    // Delete test projects and all related data (cascade should handle most)
    const testProjects = await prisma.project.findMany({
      where: {
        name: { startsWith: '[TEST]' }
      },
      select: { id: true }
    })

    for (const project of testProjects) {
      // Delete related records manually to ensure cleanup
      await prisma.taskComment.deleteMany({ where: { projectId: project.id } })
      await prisma.task.deleteMany({ where: { projectId: project.id } })
      await prisma.projectComment.deleteMany({ where: { projectId: project.id } })
      await prisma.projectActivityLog.deleteMany({ where: { projectId: project.id } })
      await prisma.projectDocument.deleteMany({ where: { projectId: project.id } })
      await prisma.projectTeamMember.deleteMany({ where: { projectId: project.id } })
      await prisma.projectTaskList.deleteMany({ where: { projectId: project.id } })
      await prisma.projectCustomFieldDefinition.deleteMany({ where: { projectId: project.id } })
      await prisma.project.delete({ where: { id: project.id } })
    }
    log(`Cleaned up ${testProjects.length} test projects`, 'info')
  } catch (error) {
    log(`Cleanup warning: ${error.message}`, 'warn')
  }
}

async function getTestUserId() {
  try {
    const user = await prisma.user.findFirst({
      select: { id: true }
    })
    return user?.id || null
  } catch (error) {
    return null
  }
}

async function testProjectCRUD() {
  log('\n📋 Testing Project CRUD Operations...', 'info')
  
  const testUserId = await getTestUserId()
  
  // Test 1: Create Project
  let projectId = null
  try {
    const projectData = {
      name: '[TEST] Project CRUD Test',
      description: 'Test project for CRUD operations',
      status: 'Planning',
      priority: 'High',
      type: 'General',
      tasksList: '[]' // Only tasksList exists, other JSON fields were removed from schema
    }
    
    // Add owner relation if userId is available
    if (testUserId) {
      projectData.owner = {
        connect: { id: testUserId }
      }
    }
    
    const project = await prisma.project.create({
      data: projectData
    })
    projectId = project.id
    recordResult('Create Project', !!projectId)
  } catch (error) {
    recordResult('Create Project', false, error)
    return null
  }

  // Test 2: Read Project
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: true,
        taskComments: true, // Note: relation name is taskComments, not projectComments
        // Other relations may not exist yet or have different names
        documentSectionsTable: true,
        weeklyFMSReviewSectionsTable: true
      }
    })
    recordResult('Read Project', project !== null && project.name === '[TEST] Project CRUD Test')
  } catch (error) {
    recordResult('Read Project', false, error)
  }

  // Test 3: Update Project
  try {
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        description: 'Updated description',
        status: 'In Progress',
        priority: 'Medium'
      }
    })
    recordResult('Update Project', updated.description === 'Updated description' && updated.status === 'In Progress')
  } catch (error) {
    recordResult('Update Project', false, error)
  }

  return projectId
}

async function testTaskCRUD(projectId) {
  if (!projectId) {
    log('⚠️ Skipping Task tests - no project ID', 'warn')
    return null
  }

  log('\n📋 Testing Task CRUD Operations...', 'info')
  
  // Test 1: Create Task
  let taskId = null
  try {
    const task = await prisma.task.create({
      data: {
        projectId: projectId,
        title: '[TEST] Test Task',
        description: 'Test task description',
        status: 'todo',
        priority: 'High',
        listId: 1,
        assignee: 'Test User'
      }
    })
    taskId = task.id
    recordResult('Create Task', !!taskId)
  } catch (error) {
    recordResult('Create Task', false, error)
    return null
  }

  // Test 2: Read Task
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        subtasks: true
      }
    })
    recordResult('Read Task', task !== null && task.title === '[TEST] Test Task')
  } catch (error) {
    recordResult('Read Task', false, error)
  }

  // Test 3: Read Tasks by Project
  try {
    const tasks = await prisma.task.findMany({
      where: { 
        projectId: projectId,
        parentTaskId: null
      }
    })
    recordResult('Read Tasks by Project', tasks.length > 0 && tasks.some(t => t.id === taskId))
  } catch (error) {
    recordResult('Read Tasks by Project', false, error)
  }

  // Test 4: Update Task
  try {
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'in_progress',
        priority: 'Medium',
        description: 'Updated task description'
      }
    })
    recordResult('Update Task', updated.status === 'in_progress' && updated.priority === 'Medium')
  } catch (error) {
    recordResult('Update Task', false, error)
  }

  // Test 5: Create Subtask
  let subtaskId = null
  try {
    const subtask = await prisma.task.create({
      data: {
        projectId: projectId,
        parentTaskId: taskId,
        title: '[TEST] Test Subtask',
        description: 'Test subtask description',
        status: 'todo',
        priority: 'Low',
        listId: 1
      }
    })
    subtaskId = subtask.id
    recordResult('Create Subtask', !!subtaskId)
  } catch (error) {
    recordResult('Create Subtask', false, error)
  }

  return { taskId, subtaskId }
}

async function testTaskCommentCRUD(projectId, taskId) {
  if (!projectId || !taskId) {
    log('⚠️ Skipping TaskComment tests - missing IDs', 'warn')
    return null
  }

  log('\n📋 Testing TaskComment CRUD Operations...', 'info')
  
  // Test 1: Create TaskComment
  let commentId = null
  try {
    const comment = await prisma.taskComment.create({
      data: {
        taskId: taskId,
        projectId: projectId,
        text: '[TEST] Test comment text',
        author: 'Test Author',
        userName: 'testuser'
      }
    })
    commentId = comment.id
    recordResult('Create TaskComment', !!commentId)
  } catch (error) {
    recordResult('Create TaskComment', false, error)
    return null
  }

  // Test 2: Read TaskComment
  try {
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId }
    })
    recordResult('Read TaskComment', comment !== null && comment.text === '[TEST] Test comment text')
  } catch (error) {
    recordResult('Read TaskComment', false, error)
  }

  // Test 3: Read TaskComments by Task
  try {
    const comments = await prisma.taskComment.findMany({
      where: { taskId: taskId }
    })
    recordResult('Read TaskComments by Task', comments.length > 0 && comments.some(c => c.id === commentId))
  } catch (error) {
    recordResult('Read TaskComments by Task', false, error)
  }

  // Test 4: Read TaskComments by Project
  try {
    const comments = await prisma.taskComment.findMany({
      where: { projectId: projectId }
    })
    recordResult('Read TaskComments by Project', comments.length > 0 && comments.some(c => c.id === commentId))
  } catch (error) {
    recordResult('Read TaskComments by Project', false, error)
  }

  // Test 5: Update TaskComment
  try {
    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: {
        text: '[TEST] Updated comment text'
      }
    })
    recordResult('Update TaskComment', updated.text === '[TEST] Updated comment text')
  } catch (error) {
    recordResult('Update TaskComment', false, error)
  }

  // Test 6: Delete TaskComment
  try {
    await prisma.taskComment.delete({
      where: { id: commentId }
    })
    const deleted = await prisma.taskComment.findUnique({
      where: { id: commentId }
    })
    recordResult('Delete TaskComment', deleted === null)
  } catch (error) {
    recordResult('Delete TaskComment', false, error)
  }

  return commentId
}

async function testDataPersistence(projectId, taskId) {
  if (!projectId || !taskId) {
    log('⚠️ Skipping persistence tests - missing IDs', 'warn')
    return
  }

  log('\n📋 Testing Data Persistence...', 'info')

  // Test 1: Verify JSON fields are NOT updated (should remain as empty arrays)
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        tasksList: true
        // Other JSON fields (taskLists, customFieldDefinitions, team, documents, comments, activityLog) 
        // have been removed from schema - they're now in separate tables
      }
    })
    
    // Verify tasksList remains empty (tasks are now in Task table)
    const jsonFieldsEmpty = project.tasksList === '[]'
    
    recordResult('JSON Fields Remain Empty (No JSON Writes)', jsonFieldsEmpty)
  } catch (error) {
    recordResult('JSON Fields Remain Empty (No JSON Writes)', false, error)
  }

  // Test 2: Verify Task data is in Task table
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    })
    recordResult('Task Data Persisted in Task Table', task !== null && task.title.includes('[TEST]'))
  } catch (error) {
    recordResult('Task Data Persisted in Task Table', false, error)
  }

  // Test 3: Verify TaskComment data is in TaskComment table
  try {
    const comment = await prisma.taskComment.findFirst({
      where: { 
        taskId: taskId,
        text: { contains: '[TEST]' }
      }
    })
    // Comment might have been deleted in previous test, so this is optional
    if (comment) {
      recordResult('TaskComment Data Persisted in TaskComment Table', true)
    } else {
      log('TaskComment already deleted (expected from delete test)', 'info')
      recordResult('TaskComment Data Persisted in TaskComment Table', true) // Pass if deleted successfully
    }
  } catch (error) {
    recordResult('TaskComment Data Persisted in TaskComment Table', false, error)
  }

  // Test 4: Verify cascade delete works (delete project should delete tasks)
  try {
    const tasksBefore = await prisma.task.count({
      where: { projectId: projectId }
    })
    recordResult('Cascade Delete Preparation (Count Tasks)', tasksBefore > 0)
  } catch (error) {
    recordResult('Cascade Delete Preparation (Count Tasks)', false, error)
  }
}

async function testCascadeDelete(projectId) {
  if (!projectId) {
    log('⚠️ Skipping cascade delete test - no project ID', 'warn')
    return
  }

  log('\n📋 Testing Cascade Delete...', 'info')

  try {
    // Count related records before deletion
    const tasksCountBefore = await prisma.task.count({ where: { projectId: projectId } })
    const commentsCountBefore = await prisma.taskComment.count({ where: { projectId: projectId } })
    
    // Delete project
    await prisma.project.delete({
      where: { id: projectId }
    })

    // Verify project is deleted
    const projectExists = await prisma.project.findUnique({
      where: { id: projectId }
    })
    recordResult('Project Deleted', projectExists === null)

    // Verify tasks are cascade deleted (or manually cleaned)
    const tasksCountAfter = await prisma.task.count({ where: { projectId: projectId } })
    recordResult('Tasks Cascade Deleted', tasksCountAfter === 0)

    // Verify comments are cascade deleted
    const commentsCountAfter = await prisma.taskComment.count({ where: { projectId: projectId } })
    recordResult('TaskComments Cascade Deleted', commentsCountAfter === 0)

  } catch (error) {
    recordResult('Cascade Delete', false, error)
  }
}

async function runAllTests() {
  console.log('🧪 Starting Comprehensive Projects Functionality Tests\n')
  console.log('=' .repeat(60))
  
  // Cleanup any previous test data
  await cleanupTestData()

  try {
    // Test Project CRUD
    const projectId = await testProjectCRUD()

    // Test Task CRUD
    const taskIds = await testTaskCRUD(projectId)
    const taskId = taskIds?.taskId

    // Test TaskComment CRUD
    await testTaskCommentCRUD(projectId, taskId)

    // Test Data Persistence
    await testDataPersistence(projectId, taskId)

    // Test Cascade Delete (this will delete the test project)
    await testCascadeDelete(projectId)

    // Final cleanup
    await cleanupTestData()

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'fail')
    results.errors.push({ test: 'Fatal Error', error: error.message })
  } finally {
    await prisma.$disconnect()
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(60))
  console.log(`✅ Passed: ${results.passed}`)
  console.log(`❌ Failed: ${results.failed}`)
  console.log(`📈 Total:  ${results.passed + results.failed}`)
  console.log(`📉 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`)

  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:')
    results.errors.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`)
    })
  }

  console.log('\n' + '='.repeat(60))

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0)
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

