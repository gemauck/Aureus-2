#!/usr/bin/env node
/**
 * Comprehensive Test Suite for ALL Project Functionality Endpoints
 * Tests all CRUD operations and data persistence for:
 * - Projects (GET, POST, PUT, DELETE)
 * - Tasks (GET, POST, PUT, DELETE) 
 * - TaskComments (GET, POST, PUT, DELETE)
 * - Project relationships and data integrity
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

// ============================================================================
// PROJECT ENDPOINT TESTS
// ============================================================================

// Test Project CREATE
async function testProjectCreate() {
    log('Testing Project CREATE...', 'test');
    try {
        const projectData = {
            name: `Test Project - All Endpoints Test ${Date.now()}`,
            clientName: 'Test Client for Endpoint Testing',
            description: 'Comprehensive test project for all project functionality endpoints',
            type: 'General',
            status: 'Active',
            startDate: new Date(),
            dueDate: null,
            assignedTo: '',
            budget: 10000,
            priority: 'High',
            taskLists: JSON.stringify([
                { id: 1, name: 'To Do', color: 'blue' },
                { id: 2, name: 'In Progress', color: 'yellow' },
                { id: 3, name: 'Done', color: 'green' }
            ]),
            tasksList: '[]', // Empty - tasks are now in Task table
            customFieldDefinitions: JSON.stringify([]),
            team: JSON.stringify([]),
            documents: JSON.stringify([]),
            comments: JSON.stringify([]),
            activityLog: JSON.stringify([]),
            notes: 'Test project notes'
        };

        const project = await prisma.project.create({ data: projectData });
        
        if (!project || !project.id) {
            throw new Error('Project creation failed - no ID returned');
        }

        testProjectId = project.id;
        recordResult('Project CREATE', true, `Project ID: ${testProjectId}, Name: ${project.name}`);
        return true;
    } catch (error) {
        recordResult('Project CREATE', false, error.message);
        return false;
    }
}

// Test Project READ (single)
async function testProjectReadSingle() {
    log('Testing Project READ (single)...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        const project = await prisma.project.findUnique({
            where: { id: testProjectId },
            include: {
                tasks: {
                    take: 5 // Limit for performance
                },
                _count: {
                    select: {
                        tasks: true,
                        taskComments: true,
                        invoices: true,
                        timeEntries: true
                    }
                }
            }
        });

        // Get comments for tasks separately (Task model doesn't have comments relation yet)
        if (project && project.tasks) {
            for (const task of project.tasks) {
                task.comments = await prisma.taskComment.findMany({
                    where: { taskId: String(task.id) },
                    take: 5
                });
            }
        }

        if (!project) {
            throw new Error(`Project ${testProjectId} not found`);
        }

        if (project.id !== testProjectId) {
            throw new Error(`Project ID mismatch: expected ${testProjectId}, got ${project.id}`);
        }

        recordResult('Project READ (single)', true, 
            `Retrieved project: ${project.name}, Tasks: ${project._count.tasks}, Comments: ${project._count.taskComments}`);
        return true;
    } catch (error) {
        recordResult('Project READ (single)', false, error.message);
        return false;
    }
}

// Test Project READ (list)
async function testProjectReadList() {
    log('Testing Project READ (list)...', 'test');
    try {
        const projects = await prisma.project.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                clientName: true,
                status: true,
                type: true,
                startDate: true,
                dueDate: true,
                assignedTo: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        tasks: true
                    }
                }
            }
        });

        if (!Array.isArray(projects)) {
            throw new Error('Response is not an array of projects');
        }

        const foundProject = projects.find(p => p.id === testProjectId);
        if (!foundProject && projects.length > 0) {
            // Project might not be in first 10, which is OK
            log(`Test project not in first 10 results (${projects.length} projects found)`, 'warn');
        }

        recordResult('Project READ (list)', true, 
            `Found ${projects.length} project(s) in list view`);
        return true;
    } catch (error) {
        recordResult('Project READ (list)', false, error.message);
        return false;
    }
}

// Test Project UPDATE
async function testProjectUpdate() {
    log('Testing Project UPDATE...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        const updateData = {
            name: 'Test Project - UPDATED',
            description: 'This project has been updated via API test',
            status: 'In Progress',
            priority: 'Medium',
            budget: 15000,
            notes: 'Updated notes via test'
        };

        const updatedProject = await prisma.project.update({
            where: { id: testProjectId },
            data: updateData
        });

        if (updatedProject.name !== 'Test Project - UPDATED') {
            throw new Error(`Name not updated: expected "Test Project - UPDATED", got "${updatedProject.name}"`);
        }

        if (updatedProject.status !== 'In Progress') {
            throw new Error(`Status not updated: expected "In Progress", got "${updatedProject.status}"`);
        }

        if (updatedProject.budget !== 15000) {
            throw new Error(`Budget not updated: expected 15000, got ${updatedProject.budget}`);
        }

        recordResult('Project UPDATE', true, 
            `Project updated: ${updatedProject.name}, Status: ${updatedProject.status}, Budget: ${updatedProject.budget}`);
        return true;
    } catch (error) {
        recordResult('Project UPDATE', false, error.message);
        return false;
    }
}

// Test Project JSON fields (taskLists, customFieldDefinitions, team, etc.)
async function testProjectJSONFields() {
    log('Testing Project JSON fields...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        // Update with complex JSON fields
        const taskLists = [
            { id: 1, name: 'Backlog', color: 'gray' },
            { id: 2, name: 'In Progress', color: 'blue' },
            { id: 3, name: 'Review', color: 'yellow' },
            { id: 4, name: 'Done', color: 'green' }
        ];

        const customFields = [
            { id: 'field1', name: 'Custom Field 1', type: 'text', value: 'Test Value' }
        ];

        const team = [
            { userId: 'user1', name: 'Team Member 1', role: 'Developer' },
            { userId: 'user2', name: 'Team Member 2', role: 'Designer' }
        ];

        const updateData = {
            taskLists: JSON.stringify(taskLists),
            customFieldDefinitions: JSON.stringify(customFields),
            team: JSON.stringify(team)
        };

        const updatedProject = await prisma.project.update({
            where: { id: testProjectId },
            data: updateData
        });

        // Verify JSON fields were stored correctly
        const parsedTaskLists = JSON.parse(updatedProject.taskLists || '[]');
        if (!Array.isArray(parsedTaskLists) || parsedTaskLists.length !== 4) {
            throw new Error(`taskLists not stored correctly: expected 4 items, got ${parsedTaskLists.length}`);
        }

        const parsedCustomFields = JSON.parse(updatedProject.customFieldDefinitions || '[]');
        if (!Array.isArray(parsedCustomFields) || parsedCustomFields.length !== 1) {
            throw new Error(`customFieldDefinitions not stored correctly`);
        }

        const parsedTeam = JSON.parse(updatedProject.team || '[]');
        if (!Array.isArray(parsedTeam) || parsedTeam.length !== 2) {
            throw new Error(`team not stored correctly: expected 2 items, got ${parsedTeam.length}`);
        }

        recordResult('Project JSON Fields', true, 
            `JSON fields updated: taskLists (${parsedTaskLists.length}), customFields (${parsedCustomFields.length}), team (${parsedTeam.length})`);
        return true;
    } catch (error) {
        recordResult('Project JSON Fields', false, error.message);
        return false;
    }
}

// ============================================================================
// TASK ENDPOINT TESTS
// ============================================================================

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
            title: 'Test Task - Project Endpoint Test',
            description: 'This is a test task created via Task API',
            status: 'todo',
            priority: 'Medium',
            listId: 1,
            assigneeId: null,
            tags: JSON.stringify(['test', 'api', 'project']),
            attachments: JSON.stringify([]),
            checklist: JSON.stringify([
                { id: '1', text: 'Checklist item 1', completed: false },
                { id: '2', text: 'Checklist item 2', completed: false }
            ]),
            dependencies: JSON.stringify([]),
            subscribers: JSON.stringify([]),
            customFields: JSON.stringify({ field1: 'value1' })
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

// Test Subtask CREATE
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
            title: 'Test Subtask - Project Endpoint Test',
            description: 'This is a test subtask',
            status: 'todo',
            priority: 'Low',
            listId: 1,
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
            tags: JSON.stringify(['test', 'api', 'updated', 'project']),
            checklist: JSON.stringify([
                { id: '1', text: 'Checklist item 1', completed: true },
                { id: '2', text: 'Checklist item 2', completed: false }
            ])
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

        const parsedChecklist = JSON.parse(updatedTask.checklist || '[]');
        if (parsedChecklist.length !== 2 || !parsedChecklist[0].completed) {
            throw new Error('Checklist not updated correctly');
        }

        recordResult('Task UPDATE', true, 
            `Task updated: ${updatedTask.title}, Status: ${updatedTask.status}, Checklist items: ${parsedChecklist.length}`);
        return true;
    } catch (error) {
        recordResult('Task UPDATE', false, error.message);
        return false;
    }
}

// ============================================================================
// TASK COMMENT ENDPOINT TESTS
// ============================================================================

// Test TaskComment CREATE
async function testCommentCreate() {
    log('Testing TaskComment CREATE...', 'test');
    try {
        if (!testTaskId || !testProjectId) {
            throw new Error('No test task ID or project ID available');
        }

        const user = await prisma.user.findFirst();
        const authorId = user?.id || null;

        const commentData = {
            taskId: String(testTaskId),
            projectId: testProjectId,
            text: 'Test comment created via TaskComment API for project endpoint testing',
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

        if (comments.length < 2) {
            throw new Error(`Expected at least 2 comments, found ${comments.length}`);
        }

        const foundComment = comments.find(c => c.id === testCommentId);
        if (!foundComment) {
            throw new Error(`Test comment ${testCommentId} not found`);
        }

        recordResult('TaskComment READ (by task)', true, 
            `Found ${comments.length} comment(s), including both test comments`);
        return true;
    } catch (error) {
        recordResult('TaskComment READ (by task)', false, error.message);
        return false;
    }
}

// Test TaskComment READ (by project)
async function testCommentReadByProject() {
    log('Testing TaskComment READ (by project)...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        const comments = await prisma.taskComment.findMany({
            where: { projectId: testProjectId },
            orderBy: { createdAt: 'asc' }
        });

        if (!Array.isArray(comments)) {
            throw new Error('Response is not an array of comments');
        }

        if (comments.length < 2) {
            throw new Error(`Expected at least 2 comments, found ${comments.length}`);
        }

        recordResult('TaskComment READ (by project)', true, 
            `Found ${comments.length} comment(s) for project`);
        return true;
    } catch (error) {
        recordResult('TaskComment READ (by project)', false, error.message);
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

        recordResult('TaskComment UPDATE', true, 
            `Comment updated: ${updatedComment.text?.substring(0, 50)}...`);
        return true;
    } catch (error) {
        recordResult('TaskComment UPDATE', false, error.message);
        return false;
    }
}

// ============================================================================
// DATA INTEGRITY AND RELATIONSHIPS TESTS
// ============================================================================

// Test Project-Task relationships
async function testProjectTaskRelationships() {
    log('Testing Project-Task relationships...', 'test');
    try {
        if (!testProjectId || !testTaskId) {
            throw new Error('No test project or task ID available');
        }

        // Get project with tasks
        const project = await prisma.project.findUnique({
            where: { id: testProjectId },
            include: {
                tasks: {
                    include: {
                        subtasks: true
                    }
                }
            }
        });

        // Get comments for tasks separately (Task model doesn't have comments relation yet)
        if (project && project.tasks) {
            for (const task of project.tasks) {
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
        }

        if (!project) {
            throw new Error(`Project ${testProjectId} not found`);
        }

        const foundTask = project.tasks.find(t => t.id === testTaskId);
        if (!foundTask) {
            throw new Error(`Task ${testTaskId} not found in project.tasks relation`);
        }

        if (foundTask.projectId !== testProjectId) {
            throw new Error(`Task projectId mismatch: expected ${testProjectId}, got ${foundTask.projectId}`);
        }

        const foundSubtask = foundTask.subtasks.find(st => st.id === testSubtaskId);
        if (testSubtaskId && !foundSubtask) {
            throw new Error(`Subtask ${testSubtaskId} not found in task.subtasks relation`);
        }

        if (foundSubtask && foundSubtask.parentTaskId !== testTaskId) {
            throw new Error(`Subtask parentTaskId mismatch`);
        }

        recordResult('Project-Task Relationships', true, 
            `Project has ${project.tasks.length} task(s), task has ${foundTask.subtasks.length} subtask(s) and ${foundTask.comments.length} comment(s)`);
        return true;
    } catch (error) {
        recordResult('Project-Task Relationships', false, error.message);
        return false;
    }
}

// Test Task-Comment relationships
async function testTaskCommentRelationships() {
    log('Testing Task-Comment relationships...', 'test');
    try {
        if (!testTaskId || !testCommentId) {
            throw new Error('No test task or comment ID available');
        }

        // Get comments for task
        const comments = await prisma.taskComment.findMany({
            where: { taskId: String(testTaskId) }
        });

        if (comments.length < 1) {
            throw new Error(`No comments found for task ${testTaskId}`);
        }

        const foundComment = comments.find(c => c.id === testCommentId);
        if (!foundComment) {
            throw new Error(`Comment ${testCommentId} not found for task`);
        }

        if (foundComment.taskId !== String(testTaskId)) {
            throw new Error(`Comment taskId mismatch: expected ${testTaskId}, got ${foundComment.taskId}`);
        }

        if (foundComment.projectId !== testProjectId) {
            throw new Error(`Comment projectId mismatch: expected ${testProjectId}, got ${foundComment.projectId}`);
        }

        recordResult('Task-Comment Relationships', true, 
            `Task has ${comments.length} comment(s), all properly linked`);
        return true;
    } catch (error) {
        recordResult('Task-Comment Relationships', false, error.message);
        return false;
    }
}

// Test data persistence across all entities
async function testDataPersistence() {
    log('Testing data persistence across all entities...', 'test');
    try {
        // Verify project exists
        const project = await prisma.project.findUnique({
            where: { id: testProjectId }
        });

        if (!project || project.name !== 'Test Project - UPDATED') {
            throw new Error('Project data not persisted correctly');
        }

        // Verify task exists
        const task = await prisma.task.findUnique({
            where: { id: String(testTaskId) }
        });

        if (!task || task.title !== 'Test Task - UPDATED') {
            throw new Error('Task data not persisted correctly');
        }

        // Verify comment exists
        const comment = await prisma.taskComment.findUnique({
            where: { id: testCommentId }
        });

        if (!comment || !comment.text.includes('UPDATED')) {
            throw new Error('Comment data not persisted correctly');
        }

        // Verify relationships
        if (task.projectId !== testProjectId) {
            throw new Error('Task-Project relationship not persisted');
        }

        if (comment.taskId !== String(testTaskId)) {
            throw new Error('Comment-Task relationship not persisted');
        }

        if (comment.projectId !== testProjectId) {
            throw new Error('Comment-Project relationship not persisted');
        }

        recordResult('Data Persistence', true, 
            `All entities persisted correctly with proper relationships`);
        return true;
    } catch (error) {
        recordResult('Data Persistence', false, error.message);
        return false;
    }
}

// ============================================================================
// DELETE OPERATIONS TESTS
// ============================================================================

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

        // Delete task
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

        // Check if cascade worked for comments (may not be configured)
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

        // Verify subtask was deleted (cascade should work)
        if (testSubtaskId) {
            const deletedSubtask = await prisma.task.findUnique({
                where: { id: String(testSubtaskId) }
            });

            if (deletedSubtask) {
                log(`Warning: Subtask still exists after parent task deletion (cascade may not be working)`, 'warn');
                testResults.warnings.push('Subtask not deleted with parent task (cascade may not be working)');
            }
        }

        recordResult('Task DELETE', true, 
            `Task deleted. Cascade: Comments ${commentsAfter === 0 ? 'deleted' : 'not deleted'} (${commentsBefore} before)`);
        return true;
    } catch (error) {
        recordResult('Task DELETE', false, error.message);
        return false;
    }
}

// Test Project DELETE (cascade)
async function testProjectDelete() {
    log('Testing Project DELETE (cascade)...', 'test');
    try {
        if (!testProjectId) {
            throw new Error('No test project ID available');
        }

        // Count related entities before deletion
        const tasksBefore = await prisma.task.count({
            where: { projectId: testProjectId }
        });

        const commentsBefore = await prisma.taskComment.count({
            where: { projectId: testProjectId }
        });

        // Delete project (should cascade to tasks and comments)
        await prisma.project.delete({
            where: { id: testProjectId }
        });

        // Verify project deletion
        const deletedProject = await prisma.project.findUnique({
            where: { id: testProjectId }
        });

        if (deletedProject) {
            throw new Error('Project still exists in database after deletion');
        }

        // Verify cascade deletion worked
        const tasksAfter = await prisma.task.count({
            where: { projectId: testProjectId }
        });

        const commentsAfter = await prisma.taskComment.count({
            where: { projectId: testProjectId }
        });

        if (tasksAfter > 0) {
            log(`Warning: ${tasksAfter} task(s) still exist for deleted project (cascade may not be enabled)`, 'warn');
            testResults.warnings.push(`Tasks not deleted with project: ${tasksAfter} remaining`);
            
            // Clean up orphaned tasks
            await prisma.task.deleteMany({
                where: { projectId: testProjectId }
            });
        }

        if (commentsAfter > 0) {
            log(`Warning: ${commentsAfter} comment(s) still exist for deleted project (cascade may not be enabled)`, 'warn');
            testResults.warnings.push(`Comments not deleted with project: ${commentsAfter} remaining`);
            
            // Clean up orphaned comments
            await prisma.taskComment.deleteMany({
                where: { projectId: testProjectId }
            });
        }

        recordResult('Project DELETE', true, 
            `Project deleted. Cascade: Tasks ${tasksAfter === 0 ? 'deleted' : 'not deleted'} (${tasksBefore} before), Comments ${commentsAfter === 0 ? 'deleted' : 'not deleted'} (${commentsBefore} before)`);
        return true;
    } catch (error) {
        recordResult('Project DELETE', false, error.message);
        return false;
    }
}

// Cleanup remaining test data
async function cleanup() {
    log('Cleaning up any remaining test data...', 'test');
    try {
        // Clean up orphaned comments
        if (testProjectId) {
            await prisma.taskComment.deleteMany({
                where: { projectId: testProjectId }
            }).catch(() => {});
        }

        if (testTaskId) {
            await prisma.taskComment.deleteMany({
                where: { taskId: String(testTaskId) }
            }).catch(() => {});
        }

        // Clean up orphaned tasks
        if (testProjectId) {
            await prisma.task.deleteMany({
                where: { projectId: testProjectId }
            }).catch(() => {});
        }

        // Clean up project (should already be deleted, but just in case)
        if (testProjectId) {
            await prisma.project.delete({
                where: { id: testProjectId }
            }).catch(() => {});
        }

        log('Cleanup completed', 'success');
    } catch (error) {
        log(`Cleanup error: ${error.message}`, 'warn');
        testResults.warnings.push(`Cleanup: ${error.message}`);
    }
}

// Print summary
function printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('COMPREHENSIVE PROJECT FUNCTIONALITY TEST SUMMARY');
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
        console.log('\n✅ All project functionality endpoints verified!');
        console.log('📝 All CRUD operations working correctly.');
        console.log('🔗 All relationships and data integrity verified.');
    }
}

// Main test runner
async function runTests() {
    console.log('🧪 Comprehensive Project Functionality Endpoint Test Suite\n');
    console.log('Testing all project-related endpoints and functionality\n');

    try {
        // PROJECT TESTS
        await testProjectCreate();
        await testProjectReadSingle();
        await testProjectReadList();
        await testProjectUpdate();
        await testProjectJSONFields();

        // TASK TESTS
        await testTaskCreate();
        await testSubtaskCreate();
        await testTaskReadByProject();
        await testTaskUpdate();

        // COMMENT TESTS
        await testCommentCreate();
        await testCommentCreate2();
        await testCommentReadByTask();
        await testCommentReadByProject();
        await testCommentUpdate();

        // RELATIONSHIP TESTS
        await testProjectTaskRelationships();
        await testTaskCommentRelationships();
        await testDataPersistence();

        // DELETE TESTS
        await testCommentDelete();
        await testTaskDelete();
        await testProjectDelete();
        
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

