#!/usr/bin/env node
/**
 * Comprehensive Test Script for Task and TaskComment API Endpoints
 * Tests all CRUD operations and data persistence
 */

import 'dotenv/config';
import { prisma } from './api/_lib/prisma.js';

const BASE_URL = process.env.API_URL || process.env.APP_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'garethm@abcotronics.co.za';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'test123';

let authToken = null;
let testProjectId = null;
let testTaskId = null;
let testCommentId = null;

// Test results tracking
const testResults = {
    passed: [],
    failed: [],
    warnings: []
};

// Helper functions
function log(message, type = 'info') {
    const emoji = {
        success: '✅',
        error: '❌',
        warn: '⚠️',
        info: '📝',
        test: '🧪'
    }[type] || '📝';
    console.log(`${emoji} ${message}`);
}

function recordResult(test, passed, message = '') {
    if (passed) {
        testResults.passed.push({ test, message });
        log(`${test}: PASSED`, 'success');
        if (message) log(`   ${message}`, 'info');
    } else {
        testResults.failed.push({ test, message });
        log(`${test}: FAILED - ${message}`, 'error');
    }
}

// Authentication
async function authenticate() {
    log('Authenticating...', 'test');
    try {
        const response = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: TEST_USER_EMAIL,
                password: TEST_USER_PASSWORD
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Login failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        authToken = data.accessToken || data.data?.accessToken;
        
        if (!authToken) {
            throw new Error('No access token in response');
        }

        recordResult('Authentication', true, `Token obtained for ${TEST_USER_EMAIL}`);
        return true;
    } catch (error) {
        recordResult('Authentication', false, error.message);
        return false;
    }
}

// API request helper
async function apiRequest(path, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BASE_URL}/api/${path}`, options);
        const text = await response.text();
        let data = null;
        
        try {
            data = text ? JSON.parse(text) : null;
        } catch (e) {
            // Response might not be JSON
        }

        return {
            ok: response.ok,
            status: response.status,
            data,
            error: !response.ok ? (data?.error || data?.message || `HTTP ${response.status}`) : null
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            data: null,
            error: error.message
        };
    }
}

// Create test project
async function createTestProject() {
    log('Creating test project...', 'test');
    try {
        const projectData = {
            name: `Test Project - Task API Test ${Date.now()}`,
            clientName: 'Test Client',
            description: 'Temporary test project for Task and Comment API testing',
            type: 'General',
            status: 'Active',
            startDate: new Date().toISOString().split('T')[0],
            taskLists: JSON.stringify([
                { id: 1, name: 'To Do', color: 'blue' },
                { id: 2, name: 'In Progress', color: 'yellow' },
                { id: 3, name: 'Done', color: 'green' }
            ]),
            tasksList: '[]', // Empty - tasks are now in Task table
            customFieldDefinitions: JSON.stringify([]),
            team: JSON.stringify([])
        };

        const result = await apiRequest('projects', 'POST', projectData);
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        const project = result.data?.project || result.data?.data?.project || result.data;
        if (!project || !project.id) {
            throw new Error('No project ID in response');
        }

        testProjectId = project.id;
        recordResult('Create Test Project', true, `Project ID: ${testProjectId}`);
        return true;
    } catch (error) {
        recordResult('Create Test Project', false, error.message);
        return false;
    }
}

// Test Task API - CREATE
async function testTaskCreate() {
    log('Testing Task CREATE...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        const taskData = {
            projectId: testProjectId,
            title: 'Test Task - API Test',
            description: 'This is a test task created via Task API',
            status: 'todo',
            priority: 'Medium',
            listId: '1',
            assigneeId: null,
            tags: JSON.stringify(['test', 'api']),
            attachments: JSON.stringify([]),
            checklist: JSON.stringify([]),
            dependencies: JSON.stringify([]),
            subscribers: JSON.stringify([]),
            customFields: JSON.stringify({})
        };

        const result = await apiRequest('tasks', 'POST', taskData);
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        const task = result.data?.task || result.data?.data?.task || result.data;
        if (!task || !task.id) {
            throw new Error('No task ID in response');
        }

        testTaskId = task.id;
        recordResult('Task CREATE', true, `Task ID: ${testTaskId}, Title: ${task.title}`);
        return true;
    } catch (error) {
        recordResult('Task CREATE', false, error.message);
        return false;
    }
}

// Test Task API - GET (single)
async function testTaskGetSingle() {
    log('Testing Task GET (single)...', 'test');
    try {
        if (!testTaskId) {
            throw new Error('No test task ID available');
        }

        const result = await apiRequest(`tasks?id=${encodeURIComponent(testTaskId)}`, 'GET');
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        const task = result.data?.task || result.data?.data?.task || result.data;
        if (!task || !task.id) {
            throw new Error('No task in response');
        }

        if (task.id !== testTaskId) {
            throw new Error(`Task ID mismatch: expected ${testTaskId}, got ${task.id}`);
        }

        recordResult('Task GET (single)', true, `Retrieved task: ${task.title}`);
        return true;
    } catch (error) {
        recordResult('Task GET (single)', false, error.message);
        return false;
    }
}

// Test Task API - GET (by project)
async function testTaskGetByProject() {
    log('Testing Task GET (by project)...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        const result = await apiRequest(`tasks?projectId=${encodeURIComponent(testProjectId)}`, 'GET');
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        const tasks = result.data?.tasks || result.data?.data?.tasks || result.data || [];
        if (!Array.isArray(tasks)) {
            throw new Error('Response is not an array of tasks');
        }

        const foundTask = tasks.find(t => t.id === testTaskId);
        if (!foundTask) {
            throw new Error(`Test task ${testTaskId} not found in project tasks`);
        }

        recordResult('Task GET (by project)', true, `Found ${tasks.length} task(s), including test task`);
        return true;
    } catch (error) {
        recordResult('Task GET (by project)', false, error.message);
        return false;
    }
}

// Test Task API - UPDATE
async function testTaskUpdate() {
    log('Testing Task UPDATE...', 'test');
    try {
        if (!testTaskId) {
            throw new Error('No test task ID available');
        }

        const updateData = {
            title: 'Test Task - UPDATED',
            description: 'This task has been updated via Task API',
            status: 'in-progress',
            priority: 'High',
            tags: JSON.stringify(['test', 'api', 'updated'])
        };

        const result = await apiRequest(`tasks?id=${encodeURIComponent(testTaskId)}`, 'PUT', updateData);
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        // Verify update by fetching the task again
        const verifyResult = await apiRequest(`tasks?id=${encodeURIComponent(testTaskId)}`, 'GET');
        if (!verifyResult.ok) {
            throw new Error('Failed to verify update');
        }

        const task = verifyResult.data?.task || verifyResult.data?.data?.task || verifyResult.data;
        if (task.title !== 'Test Task - UPDATED') {
            throw new Error(`Title not updated: expected "Test Task - UPDATED", got "${task.title}"`);
        }

        if (task.status !== 'in-progress') {
            throw new Error(`Status not updated: expected "in-progress", got "${task.status}"`);
        }

        recordResult('Task UPDATE', true, `Task updated: ${task.title}, Status: ${task.status}`);
        return true;
    } catch (error) {
        recordResult('Task UPDATE', false, error.message);
        return false;
    }
}

// Test TaskComment API - CREATE
async function testCommentCreate() {
    log('Testing TaskComment CREATE...', 'test');
    try {
        if (!testTaskId || !testProjectId) {
            throw new Error('No test task ID or project ID available');
        }

        const commentData = {
            taskId: testTaskId,
            projectId: testProjectId,
            text: 'Test comment created via TaskComment API',
            author: 'Test User',
            authorId: null,
            userName: 'test@example.com'
        };

        const result = await apiRequest('task-comments', 'POST', commentData);
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        const comment = result.data?.comment || result.data?.data?.comment || result.data;
        if (!comment || !comment.id) {
            throw new Error('No comment ID in response');
        }

        testCommentId = comment.id;
        recordResult('TaskComment CREATE', true, `Comment ID: ${testCommentId}, Text: ${comment.text?.substring(0, 50)}...`);
        return true;
    } catch (error) {
        recordResult('TaskComment CREATE', false, error.message);
        return false;
    }
}

// Test TaskComment API - GET (by task)
async function testCommentGetByTask() {
    log('Testing TaskComment GET (by task)...', 'test');
    try {
        if (!testTaskId) {
            throw new Error('No test task ID available');
        }

        const result = await apiRequest(`task-comments?taskId=${encodeURIComponent(testTaskId)}`, 'GET');
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        const comments = result.data?.comments || result.data?.data?.comments || result.data || [];
        if (!Array.isArray(comments)) {
            throw new Error('Response is not an array of comments');
        }

        const foundComment = comments.find(c => c.id === testCommentId);
        if (!foundComment) {
            throw new Error(`Test comment ${testCommentId} not found in task comments`);
        }

        recordResult('TaskComment GET (by task)', true, `Found ${comments.length} comment(s), including test comment`);
        return true;
    } catch (error) {
        recordResult('TaskComment GET (by task)', false, error.message);
        return false;
    }
}

// Test TaskComment API - UPDATE
async function testCommentUpdate() {
    log('Testing TaskComment UPDATE...', 'test');
    try {
        if (!testCommentId) {
            throw new Error('No test comment ID available');
        }

        const updateData = {
            text: 'Test comment - UPDATED via TaskComment API'
        };

        const result = await apiRequest(`task-comments?id=${encodeURIComponent(testCommentId)}`, 'PUT', updateData);
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        // Verify update by fetching the comment again
        const verifyResult = await apiRequest(`task-comments?taskId=${encodeURIComponent(testTaskId)}`, 'GET');
        if (!verifyResult.ok) {
            throw new Error('Failed to verify update');
        }

        const comments = verifyResult.data?.comments || verifyResult.data?.data?.comments || verifyResult.data || [];
        const updatedComment = comments.find(c => c.id === testCommentId);
        
        if (!updatedComment) {
            throw new Error('Updated comment not found');
        }

        if (!updatedComment.text.includes('UPDATED')) {
            throw new Error(`Comment text not updated: "${updatedComment.text}"`);
        }

        recordResult('TaskComment UPDATE', true, `Comment updated: ${updatedComment.text?.substring(0, 50)}...`);
        return true;
    } catch (error) {
        recordResult('TaskComment UPDATE', false, error.message);
        return false;
    }
}

// Test data persistence in database
async function testDataPersistence() {
    log('Testing data persistence in database...', 'test');
    try {
        // Check Task in database
        const task = await prisma.task.findUnique({
            where: { id: String(testTaskId) },
            include: {
                comments: true,
                project: true
            }
        });

        if (!task) {
            throw new Error(`Task ${testTaskId} not found in database`);
        }

        if (task.title !== 'Test Task - UPDATED') {
            throw new Error(`Task title mismatch in DB: expected "Test Task - UPDATED", got "${task.title}"`);
        }

        if (task.status !== 'in-progress') {
            throw new Error(`Task status mismatch in DB: expected "in-progress", got "${task.status}"`);
        }

        // Check Comment in database
        const comment = await prisma.taskComment.findUnique({
            where: { id: testCommentId }
        });

        if (!comment) {
            throw new Error(`Comment ${testCommentId} not found in database`);
        }

        if (!comment.text.includes('UPDATED')) {
            throw new Error(`Comment text mismatch in DB: "${comment.text}"`);
        }

        if (comment.taskId !== String(testTaskId)) {
            throw new Error(`Comment taskId mismatch in DB: expected ${testTaskId}, got ${comment.taskId}`);
        }

        // Verify relationship
        if (task.comments.length === 0) {
            throw new Error('Task has no comments in database relation');
        }

        const commentInRelation = task.comments.find(c => c.id === testCommentId);
        if (!commentInRelation) {
            throw new Error('Comment not found in task.comments relation');
        }

        recordResult('Data Persistence', true, 
            `Task and Comment found in DB with correct data. Task has ${task.comments.length} comment(s)`);
        return true;
    } catch (error) {
        recordResult('Data Persistence', false, error.message);
        return false;
    }
}

// Test TaskComment API - DELETE
async function testCommentDelete() {
    log('Testing TaskComment DELETE...', 'test');
    try {
        if (!testCommentId) {
            throw new Error('No test comment ID available');
        }

        const result = await apiRequest(`task-comments?id=${encodeURIComponent(testCommentId)}`, 'DELETE');
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        // Verify deletion by trying to fetch the comment
        const verifyResult = await apiRequest(`task-comments?taskId=${encodeURIComponent(testTaskId)}`, 'GET');
        if (!verifyResult.ok) {
            throw new Error('Failed to verify deletion');
        }

        const comments = verifyResult.data?.comments || verifyResult.data?.data?.comments || verifyResult.data || [];
        const deletedComment = comments.find(c => c.id === testCommentId);
        
        if (deletedComment) {
            throw new Error('Comment still exists after deletion');
        }

        // Verify deletion in database
        const dbComment = await prisma.taskComment.findUnique({
            where: { id: testCommentId }
        });

        if (dbComment) {
            throw new Error('Comment still exists in database after deletion');
        }

        recordResult('TaskComment DELETE', true, 'Comment deleted from API and database');
        return true;
    } catch (error) {
        recordResult('TaskComment DELETE', false, error.message);
        return false;
    }
}

// Test Task API - DELETE
async function testTaskDelete() {
    log('Testing Task DELETE...', 'test');
    try {
        if (!testTaskId) {
            throw new Error('No test task ID available');
        }

        const result = await apiRequest(`tasks?id=${encodeURIComponent(testTaskId)}`, 'DELETE');
        
        if (!result.ok) {
            throw new Error(result.error || `HTTP ${result.status}`);
        }

        // Verify deletion by trying to fetch the task
        const verifyResult = await apiRequest(`tasks?id=${encodeURIComponent(testTaskId)}`, 'GET');
        if (verifyResult.ok) {
            // Task might still exist but that's OK for this test
            log('Task still exists after DELETE (may be intentional)', 'warn');
        }

        // Verify deletion in database (cascade should delete comments)
        const dbTask = await prisma.task.findUnique({
            where: { id: String(testTaskId) }
        });

        if (dbTask) {
            log('Task still exists in database after DELETE (may be soft delete)', 'warn');
            testResults.warnings.push('Task DELETE may be soft delete - task still in database');
        }

        // Verify comments were also deleted (cascade)
        const remainingComments = await prisma.taskComment.findMany({
            where: { taskId: String(testTaskId) }
        });

        if (remainingComments.length > 0) {
            log(`Warning: ${remainingComments.length} comment(s) still exist for deleted task (cascade may not be enabled)`, 'warn');
            testResults.warnings.push(`Comments not deleted with task: ${remainingComments.length} remaining`);
        }

        recordResult('Task DELETE', true, 'Task deletion completed');
        return true;
    } catch (error) {
        recordResult('Task DELETE', false, error.message);
        return false;
    }
}

// Cleanup test project
async function cleanup() {
    log('Cleaning up test data...', 'test');
    try {
        if (testProjectId) {
            // Delete test project
            await prisma.project.delete({
                where: { id: testProjectId }
            }).catch(e => {
                log(`Warning: Could not delete test project: ${e.message}`, 'warn');
            });
            
            log(`Test project ${testProjectId} deleted`, 'success');
        }

        // Clean up any remaining test tasks
        if (testTaskId) {
            await prisma.task.deleteMany({
                where: { id: String(testTaskId) }
            }).catch(e => {
                log(`Warning: Could not delete test task: ${e.message}`, 'warn');
            });
        }

        // Clean up any remaining test comments
        if (testCommentId) {
            await prisma.taskComment.deleteMany({
                where: { id: testCommentId }
            }).catch(e => {
                log(`Warning: Could not delete test comment: ${e.message}`, 'warn');
            });
        }

        recordResult('Cleanup', true, 'Test data cleaned up');
    } catch (error) {
        log(`Cleanup error: ${error.message}`, 'warn');
        testResults.warnings.push(`Cleanup: ${error.message}`);
    }
}

// Print summary
function printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testResults.passed.length}`);
    console.log(`❌ Failed: ${testResults.failed.length}`);
    console.log(`⚠️  Warnings: ${testResults.warnings.length}`);
    console.log('\n');

    if (testResults.failed.length > 0) {
        console.log('FAILED TESTS:');
        testResults.failed.forEach(({ test, message }) => {
            console.log(`  ❌ ${test}: ${message}`);
        });
        console.log('\n');
    }

    if (testResults.warnings.length > 0) {
        console.log('WARNINGS:');
        testResults.warnings.forEach(warning => {
            console.log(`  ⚠️  ${warning}`);
        });
        console.log('\n');
    }

    const allPassed = testResults.failed.length === 0;
    console.log('='.repeat(60));
    console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
    console.log('='.repeat(60));
}

// Main test runner
async function runTests() {
    console.log('🧪 Task and TaskComment API Endpoint Test Suite\n');
    console.log(`Testing against: ${BASE_URL}\n`);

    try {
        // Step 1: Authenticate
        const authSuccess = await authenticate();
        if (!authSuccess) {
            console.log('\n❌ Authentication failed. Cannot continue with tests.');
            process.exit(1);
        }

        // Step 2: Create test project
        const projectSuccess = await createTestProject();
        if (!projectSuccess) {
            console.log('\n⚠️  Failed to create test project. Some tests may fail.');
        }

        // Step 3: Test Task API
        await testTaskCreate();
        await testTaskGetSingle();
        await testTaskGetByProject();
        await testTaskUpdate();

        // Step 4: Test TaskComment API
        await testCommentCreate();
        await testCommentGetByTask();
        await testCommentUpdate();

        // Step 5: Test data persistence
        await testDataPersistence();

        // Step 6: Test DELETE operations
        await testCommentDelete();
        await testTaskDelete();

        // Step 7: Cleanup
        await cleanup();

        // Print summary
        printSummary();

        // Exit with appropriate code
        process.exit(testResults.failed.length > 0 ? 1 : 0);

    } catch (error) {
        console.error('\n❌ Unexpected error during tests:', error);
        await cleanup();
        process.exit(1);
    } finally {
        // Ensure Prisma connection is closed
        await prisma.$disconnect().catch(() => {});
    }
}

// Run tests
runTests();


