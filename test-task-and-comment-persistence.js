#!/usr/bin/env node
/**
 * Comprehensive Test Script for Task and TaskComment Data Persistence
 * Tests all CRUD operations directly via Prisma (no authentication required)
 */

import 'dotenv/config';
import { prisma } from './api/_lib/prisma.js';

let testProjectId = null;
let testTaskId = null;
let testSubtaskId = null;
let testCommentId = null;
let testComment2Id = null;

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

// Create test project
async function createTestProject() {
    log('Creating test project...', 'test');
    try {
        // Find an existing project or create a new one
        const existingProject = await prisma.project.findFirst({
            orderBy: { createdAt: 'desc' }
        });

        if (existingProject) {
            testProjectId = existingProject.id;
            log(`Using existing project: ${existingProject.name} (${testProjectId})`, 'info');
            recordResult('Get Test Project', true, `Project ID: ${testProjectId}`);
            return true;
        }

        // Create new test project
        const project = await prisma.project.create({
            data: {
                name: `Test Project - API Test ${Date.now()}`,
                clientName: 'Test Client',
                description: 'Temporary test project for Task and Comment API testing',
                type: 'General',
                status: 'Active',
                startDate: new Date(),
                tasksList: '[]',
                taskLists: JSON.stringify([
                    { id: 1, name: 'To Do', color: 'blue' },
                    { id: 2, name: 'In Progress', color: 'yellow' },
                    { id: 3, name: 'Done', color: 'green' }
                ]),
                customFieldDefinitions: JSON.stringify([]),
                team: JSON.stringify([])
            }
        });

        testProjectId = project.id;
        recordResult('Create Test Project', true, `Project ID: ${testProjectId}`);
        return true;
    } catch (error) {
        recordResult('Create Test Project', false, error.message);
        return false;
    }
}

// Test Task CREATE
async function testTaskCreate() {
    log('Testing Task CREATE...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        const taskData = {
            id: `test-task-${Date.now()}`,
            projectId: testProjectId,
            title: 'Test Task - API Test',
            description: 'This is a test task created via Task API',
            status: 'todo',
            priority: 'Medium',
            listId: 1, // Int, not String
            assigneeId: null,
            tags: JSON.stringify(['test', 'api']),
            attachments: JSON.stringify([]),
            checklist: JSON.stringify([]),
            dependencies: JSON.stringify([]),
            subscribers: JSON.stringify([]),
            customFields: JSON.stringify({})
        };

        const task = await prisma.task.create({ data: taskData });
        
        if (!task || !task.id) {
            throw new Error('Task creation failed - no ID returned');
        }

        testTaskId = task.id;
        recordResult('Task CREATE', true, `Task ID: ${testTaskId}, Title: ${task.title}`);
        return true;
    } catch (error) {
        recordResult('Task CREATE', false, error.message);
        return false;
    }
}

// Test Task CREATE (subtask)
async function testSubtaskCreate() {
    log('Testing Subtask CREATE...', 'test');
    try {
        if (!testProjectId || !testTaskId) {
            throw new Error('No test project ID or parent task ID available');
        }

        const subtaskData = {
            id: `test-subtask-${Date.now()}`,
            projectId: testProjectId,
            parentTaskId: testTaskId,
            title: 'Test Subtask - API Test',
            description: 'This is a test subtask',
            status: 'todo',
            priority: 'Low',
            listId: 1, // Int, not String
            tags: JSON.stringify(['test', 'subtask']),
            attachments: JSON.stringify([]),
            checklist: JSON.stringify([]),
            dependencies: JSON.stringify([]),
            subscribers: JSON.stringify([]),
            customFields: JSON.stringify({})
        };

        const subtask = await prisma.task.create({ data: subtaskData });
        
        if (!subtask || !subtask.id) {
            throw new Error('Subtask creation failed - no ID returned');
        }

        testSubtaskId = subtask.id;
        recordResult('Subtask CREATE', true, `Subtask ID: ${testSubtaskId}, Title: ${subtask.title}`);
        return true;
    } catch (error) {
        recordResult('Subtask CREATE', false, error.message);
        return false;
    }
}

// Test Task READ (single)
async function testTaskRead() {
    log('Testing Task READ (single)...', 'test');
    try {
        if (!testTaskId) {
            throw new Error('No test task ID available');
        }

        const task = await prisma.task.findUnique({
            where: { id: String(testTaskId) },
            include: {
                subtasks: true,
                project: {
                    select: { id: true, name: true }
                }
            }
        });

        // Get comments separately since relation may not exist yet
        const comments = await prisma.taskComment.findMany({
            where: { taskId: String(testTaskId) }
        });

        if (!task) {
            throw new Error(`Task ${testTaskId} not found`);
        }

        if (task.id !== testTaskId) {
            throw new Error(`Task ID mismatch: expected ${testTaskId}, got ${task.id}`);
        }

        recordResult('Task READ (single)', true, 
            `Retrieved task: ${task.title}, Status: ${task.status}, Comments: ${comments.length}, Subtasks: ${task.subtasks.length}`);
        return true;
    } catch (error) {
        recordResult('Task READ (single)', false, error.message);
        return false;
    }
}

// Test Task READ (by project)
async function testTaskReadByProject() {
    log('Testing Task READ (by project)...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        const tasks = await prisma.task.findMany({
            where: { 
                projectId: testProjectId,
                parentTaskId: null // Only top-level tasks
            },
            include: {
                subtasks: true
            },
            orderBy: { createdAt: 'asc' }
        });

        // Get comments for each task separately
        for (const task of tasks) {
            task.comments = await prisma.taskComment.findMany({
                where: { taskId: String(task.id) }
            });
            
            // Get comments for subtasks
            for (const subtask of task.subtasks) {
                subtask.comments = await prisma.taskComment.findMany({
                    where: { taskId: String(subtask.id) }
                });
            }
        }

        if (!Array.isArray(tasks)) {
            throw new Error('Response is not an array of tasks');
        }

        const foundTask = tasks.find(t => t.id === testTaskId);
        if (!foundTask) {
            throw new Error(`Test task ${testTaskId} not found in project tasks`);
        }

        const foundSubtask = foundTask.subtasks.find(st => st.id === testSubtaskId);
        if (testSubtaskId && !foundSubtask) {
            throw new Error(`Test subtask ${testSubtaskId} not found in task subtasks`);
        }

        recordResult('Task READ (by project)', true, 
            `Found ${tasks.length} task(s), including test task with ${foundTask.subtasks.length} subtask(s)`);
        return true;
    } catch (error) {
        recordResult('Task READ (by project)', false, error.message);
        return false;
    }
}

// Test Task UPDATE
async function testTaskUpdate() {
    log('Testing Task UPDATE...', 'test');
    try {
        if (!testTaskId) {
            throw new Error('No test task ID available');
        }

        const updateData = {
            title: 'Test Task - UPDATED',
            description: 'This task has been updated',
            status: 'in-progress',
            priority: 'High',
            tags: JSON.stringify(['test', 'api', 'updated'])
        };

        const updatedTask = await prisma.task.update({
            where: { id: String(testTaskId) },
            data: updateData
        });

        if (updatedTask.title !== 'Test Task - UPDATED') {
            throw new Error(`Title not updated: expected "Test Task - UPDATED", got "${updatedTask.title}"`);
        }

        if (updatedTask.status !== 'in-progress') {
            throw new Error(`Status not updated: expected "in-progress", got "${updatedTask.status}"`);
        }

        if (updatedTask.priority !== 'High') {
            throw new Error(`Priority not updated: expected "High", got "${updatedTask.priority}"`);
        }

        recordResult('Task UPDATE', true, 
            `Task updated: ${updatedTask.title}, Status: ${updatedTask.status}, Priority: ${updatedTask.priority}`);
        return true;
    } catch (error) {
        recordResult('Task UPDATE', false, error.message);
        return false;
    }
}

// Test TaskComment CREATE
async function testCommentCreate() {
    log('Testing TaskComment CREATE...', 'test');
    try {
        if (!testTaskId || !testProjectId) {
            throw new Error('No test task ID or project ID available');
        }

        // Get a user ID for author
        const user = await prisma.user.findFirst();
        const authorId = user?.id || null;

        const commentData = {
            taskId: String(testTaskId),
            projectId: testProjectId,
            text: 'Test comment created via TaskComment API',
            author: user?.name || 'Test User',
            authorId: authorId,
            userName: user?.email || 'test@example.com'
        };

        const comment = await prisma.taskComment.create({
            data: commentData
        });

        if (!comment || !comment.id) {
            throw new Error('Comment creation failed - no ID returned');
        }

        testCommentId = comment.id;
        recordResult('TaskComment CREATE', true, `Comment ID: ${testCommentId}, Text: ${comment.text?.substring(0, 50)}...`);
        return true;
    } catch (error) {
        recordResult('TaskComment CREATE', false, error.message);
        return false;
    }
}

// Test TaskComment CREATE (second comment)
async function testCommentCreate2() {
    log('Testing TaskComment CREATE (second comment)...', 'test');
    try {
        if (!testTaskId || !testProjectId) {
            throw new Error('No test task ID or project ID available');
        }

        const user = await prisma.user.findFirst();

        const commentData = {
            taskId: String(testTaskId),
            projectId: testProjectId,
            text: 'Second test comment - for update/delete testing',
            author: user?.name || 'Test User',
            authorId: user?.id || null,
            userName: user?.email || 'test@example.com'
        };

        const comment = await prisma.taskComment.create({
            data: commentData
        });

        if (!comment || !comment.id) {
            throw new Error('Second comment creation failed - no ID returned');
        }

        testComment2Id = comment.id;
        recordResult('TaskComment CREATE (second)', true, `Comment ID: ${testComment2Id}`);
        return true;
    } catch (error) {
        recordResult('TaskComment CREATE (second)', false, error.message);
        return false;
    }
}

// Test TaskComment READ (by task)
async function testCommentReadByTask() {
    log('Testing TaskComment READ (by task)...', 'test');
    try {
        if (!testTaskId) {
            throw new Error('No test task ID available');
        }

        const comments = await prisma.taskComment.findMany({
            where: { taskId: String(testTaskId) },
            orderBy: { createdAt: 'asc' },
            include: {
                authorUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        if (!Array.isArray(comments)) {
            throw new Error('Response is not an array of comments');
        }

        const foundComment = comments.find(c => c.id === testCommentId);
        if (!foundComment) {
            throw new Error(`Test comment ${testCommentId} not found in task comments`);
        }

        const foundComment2 = comments.find(c => c.id === testComment2Id);
        if (!foundComment2) {
            throw new Error(`Second test comment ${testComment2Id} not found`);
        }

        recordResult('TaskComment READ (by task)', true, 
            `Found ${comments.length} comment(s), including both test comments`);
        return true;
    } catch (error) {
        recordResult('TaskComment READ (by task)', false, error.message);
        return false;
    }
}

// Test TaskComment UPDATE
async function testCommentUpdate() {
    log('Testing TaskComment UPDATE...', 'test');
    try {
        if (!testCommentId) {
            throw new Error('No test comment ID available');
        }

        const updateData = {
            text: 'Test comment - UPDATED via TaskComment API'
        };

        const updatedComment = await prisma.taskComment.update({
            where: { id: testCommentId },
            data: updateData
        });

        if (!updatedComment.text.includes('UPDATED')) {
            throw new Error(`Comment text not updated: "${updatedComment.text}"`);
        }

        // Verify update persisted
        const verifyComment = await prisma.taskComment.findUnique({
            where: { id: testCommentId }
        });

        if (!verifyComment.text.includes('UPDATED')) {
            throw new Error('Comment update did not persist in database');
        }

        recordResult('TaskComment UPDATE', true, 
            `Comment updated: ${verifyComment.text?.substring(0, 50)}...`);
        return true;
    } catch (error) {
        recordResult('TaskComment UPDATE', false, error.message);
        return false;
    }
}

// Test data persistence and relationships
async function testDataPersistence() {
    log('Testing data persistence and relationships...', 'test');
    try {
        // Check Task in database with all relationships
        const task = await prisma.task.findUnique({
            where: { id: String(testTaskId) },
            include: {
                subtasks: true,
                project: {
                    select: { id: true, name: true }
                }
            }
        });

        // Get comments separately
        const taskComments = await prisma.taskComment.findMany({
            where: { taskId: String(testTaskId) },
            orderBy: { createdAt: 'asc' }
        });

        // Get comments for subtasks
        for (const subtask of task.subtasks) {
            subtask.comments = await prisma.taskComment.findMany({
                where: { taskId: String(subtask.id) }
            });
        }

        if (!task) {
            throw new Error(`Task ${testTaskId} not found in database`);
        }

        if (task.title !== 'Test Task - UPDATED') {
            throw new Error(`Task title mismatch in DB: expected "Test Task - UPDATED", got "${task.title}"`);
        }

        if (task.status !== 'in-progress') {
            throw new Error(`Task status mismatch in DB: expected "in-progress", got "${task.status}"`);
        }

        // Verify comments relationship
        if (taskComments.length < 2) {
            throw new Error(`Expected at least 2 comments, found ${taskComments.length}`);
        }

        const comment1 = taskComments.find(c => c.id === testCommentId);
        if (!comment1) {
            throw new Error('First test comment not found in task comments');
        }

        if (!comment1.text.includes('UPDATED')) {
            throw new Error('First comment was not updated correctly');
        }

        // Verify subtasks relationship
        if (task.subtasks.length < 1) {
            throw new Error(`Expected at least 1 subtask, found ${task.subtasks.length}`);
        }

        const subtask = task.subtasks.find(st => st.id === testSubtaskId);
        if (!subtask) {
            throw new Error('Test subtask not found in task.subtasks relation');
        }

        // Verify foreign key relationships
        if (task.projectId !== testProjectId) {
            throw new Error(`Task projectId mismatch: expected ${testProjectId}, got ${task.projectId}`);
        }

        if (subtask.parentTaskId !== testTaskId) {
            throw new Error(`Subtask parentTaskId mismatch: expected ${testTaskId}, got ${subtask.parentTaskId}`);
        }

        // Verify comment foreign keys
        if (comment1.taskId !== String(testTaskId)) {
            throw new Error(`Comment taskId mismatch: expected ${testTaskId}, got ${comment1.taskId}`);
        }

        if (comment1.projectId !== testProjectId) {
            throw new Error(`Comment projectId mismatch: expected ${testProjectId}, got ${comment1.projectId}`);
        }

        recordResult('Data Persistence & Relationships', true, 
            `Task with ${taskComments.length} comment(s) and ${task.subtasks.length} subtask(s). All relationships verified.`);
        return true;
    } catch (error) {
        recordResult('Data Persistence & Relationships', false, error.message);
        return false;
    }
}

// Test TaskComment DELETE
async function testCommentDelete() {
    log('Testing TaskComment DELETE...', 'test');
    try {
        if (!testComment2Id) {
            throw new Error('No second test comment ID available');
        }

        await prisma.taskComment.delete({
            where: { id: testComment2Id }
        });

        // Verify deletion
        const deletedComment = await prisma.taskComment.findUnique({
            where: { id: testComment2Id }
        });

        if (deletedComment) {
            throw new Error('Comment still exists in database after deletion');
        }

        // Verify other comment still exists
        const remainingComment = await prisma.taskComment.findUnique({
            where: { id: testCommentId }
        });

        if (!remainingComment) {
            throw new Error('First comment was accidentally deleted');
        }

        // Verify task still has remaining comment
        const remainingComments = await prisma.taskComment.findMany({
            where: { taskId: String(testTaskId) }
        });

        if (remainingComments.length !== 1) {
            throw new Error(`Expected 1 remaining comment, found ${remainingComments.length}`);
        }

        recordResult('TaskComment DELETE', true, 
            'Comment deleted. Other comment and task remain intact.');
        return true;
    } catch (error) {
        recordResult('TaskComment DELETE', false, error.message);
        return false;
    }
}

// Test Task DELETE (cascade)
async function testTaskDelete() {
    log('Testing Task DELETE (cascade)...', 'test');
    try {
        if (!testTaskId) {
            throw new Error('No test task ID available');
        }

        // Count comments before deletion
        const commentsBefore = await prisma.taskComment.count({
            where: { taskId: String(testTaskId) }
        });

        // Count subtasks before deletion
        const subtasksBefore = await prisma.task.count({
            where: { parentTaskId: String(testTaskId) }
        });

        // Delete task (should cascade to subtasks and comments if cascade is enabled)
        await prisma.task.delete({
            where: { id: String(testTaskId) }
        });

        // Verify task deletion
        const deletedTask = await prisma.task.findUnique({
            where: { id: String(testTaskId) }
        });

        if (deletedTask) {
            throw new Error('Task still exists in database after deletion');
        }

        // Check if cascade worked for comments
        const commentsAfter = await prisma.taskComment.count({
            where: { taskId: String(testTaskId) }
        });

        if (commentsAfter > 0) {
            log(`Warning: ${commentsAfter} comment(s) still exist for deleted task (cascade may not be enabled)`, 'warn');
            testResults.warnings.push(`Comments not deleted with task: ${commentsAfter} remaining (cascade may not be configured)`);
            
            // Clean up orphaned comments
            await prisma.taskComment.deleteMany({
                where: { taskId: String(testTaskId) }
            });
        }

        // Check if cascade worked for subtasks
        const subtasksAfter = await prisma.task.count({
            where: { parentTaskId: String(testTaskId) }
        });

        if (subtasksAfter > 0) {
            log(`Warning: ${subtasksAfter} subtask(s) still exist for deleted task (cascade may not be enabled)`, 'warn');
            testResults.warnings.push(`Subtasks not deleted with task: ${subtasksAfter} remaining (cascade may not be configured)`);
            
            // Clean up orphaned subtasks
            await prisma.task.deleteMany({
                where: { parentTaskId: String(testTaskId) }
            });
        }

        recordResult('Task DELETE', true, 
            `Task deleted. Cascade: Comments ${commentsAfter === 0 ? 'deleted' : 'not deleted'} (${commentsBefore} before), Subtasks ${subtasksAfter === 0 ? 'deleted' : 'not deleted'} (${subtasksBefore} before)`);
        return true;
    } catch (error) {
        recordResult('Task DELETE', false, error.message);
        return false;
    }
}

// Cleanup remaining test data
async function cleanup() {
    log('Cleaning up remaining test data...', 'test');
    try {
        // Clean up any remaining test comments
        if (testTaskId) {
            await prisma.taskComment.deleteMany({
                where: { taskId: String(testTaskId) }
            }).catch(e => {
                log(`Warning: Could not delete test comments: ${e.message}`, 'warn');
            });
        }

        if (testCommentId) {
            await prisma.taskComment.delete({
                where: { id: testCommentId }
            }).catch(e => {
                log(`Warning: Could not delete test comment: ${e.message}`, 'warn');
            });
        }

        if (testSubtaskId) {
            await prisma.task.delete({
                where: { id: String(testSubtaskId) }
            }).catch(e => {
                log(`Warning: Could not delete test subtask: ${e.message}`, 'warn');
            });
        }

        // Note: testTaskId was already deleted in testTaskDelete()
        // Note: testProjectId is not deleted - we use existing project

        log('Cleanup completed', 'success');
    } catch (error) {
        log(`Cleanup error: ${error.message}`, 'warn');
        testResults.warnings.push(`Cleanup: ${error.message}`);
    }
}

// Print summary
function printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Passed: ${testResults.passed.length}`);
    console.log(`❌ Failed: ${testResults.failed.length}`);
    console.log(`⚠️  Warnings: ${testResults.warnings.length}`);
    console.log('\n');

    if (testResults.passed.length > 0) {
        console.log('PASSED TESTS:');
        testResults.passed.forEach(({ test, message }) => {
            console.log(`  ✅ ${test}${message ? `: ${message}` : ''}`);
        });
        console.log('\n');
    }

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
    console.log('='.repeat(70));
    console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
    console.log('='.repeat(70));
    
    if (allPassed && testResults.passed.length > 0) {
        console.log('\n✅ Data persistence verified: Tasks and Comments are correctly stored in relational tables!');
    }
}

// Main test runner
async function runTests() {
    console.log('🧪 Task and TaskComment Data Persistence Test Suite\n');
    console.log('Testing CRUD operations and data persistence directly via Prisma\n');

    try {
        // Test sequence
        await createTestProject();
        await testTaskCreate();
        await testSubtaskCreate();
        await testTaskRead();
        await testTaskReadByProject();
        await testTaskUpdate();
        await testCommentCreate();
        await testCommentCreate2();
        await testCommentReadByTask();
        await testCommentUpdate();
        await testDataPersistence();
        await testCommentDelete();
        await testTaskDelete();
        await cleanup();

        // Print summary
        printSummary();

        // Exit with appropriate code
        process.exit(testResults.failed.length > 0 ? 1 : 0);

    } catch (error) {
        console.error('\n❌ Unexpected error during tests:', error);
        console.error(error.stack);
        await cleanup();
        process.exit(1);
    } finally {
        // Ensure Prisma connection is closed
        await prisma.$disconnect().catch(() => {});
    }
}

// Run tests
runTests();

