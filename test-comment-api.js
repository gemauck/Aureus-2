// Test script for TaskComment API endpoints
import { prisma } from './api/_lib/prisma.js';

async function testCommentAPI() {
    try {
        console.log('🧪 Testing TaskComment API endpoints...\n');

        // Get a project and task to test with
        const projects = await prisma.project.findMany({
            take: 1,
            select: {
                id: true,
                name: true,
                tasksList: true
            }
        });

        if (projects.length === 0) {
            console.log('❌ No projects found. Cannot test.');
            return;
        }

        const project = projects[0];
        console.log(`📁 Using project: ${project.name} (${project.id})\n`);

        // Parse tasksList to get a task ID
        let taskId = null;
        if (project.tasksList && project.tasksList !== '[]') {
            try {
                const tasks = JSON.parse(project.tasksList);
                if (Array.isArray(tasks) && tasks.length > 0) {
                    taskId = tasks[0].id;
                    console.log(`📝 Using task ID: ${taskId}\n`);
                }
            } catch (e) {
                console.log('⚠️ Could not parse tasksList, using generated task ID');
            }
        }

        if (!taskId) {
            taskId = 'test-task-' + Date.now();
            console.log(`📝 Using generated task ID: ${taskId}\n`);
        }

        // Test 1: Create a comment
        console.log('Test 1: Creating a comment...');
        const testComment = await prisma.taskComment.create({
            data: {
                taskId: String(taskId),
                projectId: project.id,
                text: 'Test comment from API test script - ' + new Date().toISOString(),
                author: 'Test User',
                authorId: null,
                userName: 'test@example.com'
            }
        });
        console.log('✅ Comment created:', {
            id: testComment.id,
            taskId: testComment.taskId,
            text: testComment.text.substring(0, 50) + '...',
            author: testComment.author
        });
        console.log('');

        // Test 2: Get comments for task
        console.log('Test 2: Getting comments for task...');
        const comments = await prisma.taskComment.findMany({
            where: {
                taskId: String(taskId),
                projectId: project.id
            },
            orderBy: { createdAt: 'asc' }
        });
        console.log(`✅ Found ${comments.length} comment(s) for task ${taskId}`);
        comments.forEach((c, idx) => {
            console.log(`   ${idx + 1}. [${c.id}] ${c.text.substring(0, 40)}... by ${c.author}`);
        });
        console.log('');

        // Test 3: Update comment
        console.log('Test 3: Updating comment...');
        const updatedComment = await prisma.taskComment.update({
            where: { id: testComment.id },
            data: {
                text: testComment.text + ' (UPDATED)'
            }
        });
        console.log('✅ Comment updated:', {
            id: updatedComment.id,
            newText: updatedComment.text.substring(0, 50) + '...'
        });
        console.log('');

        // Test 4: Get all comments for project
        console.log('Test 4: Getting all comments for project...');
        const projectComments = await prisma.taskComment.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' }
        });
        console.log(`✅ Found ${projectComments.length} total comment(s) for project`);
        console.log('');

        // Test 5: Delete test comment
        console.log('Test 5: Deleting test comment...');
        await prisma.taskComment.delete({
            where: { id: testComment.id }
        });
        console.log('✅ Test comment deleted');
        console.log('');

        console.log('✅ All API tests passed!');
        console.log('\n📊 Summary:');
        console.log(`   - Comments in database: ${projectComments.length - 1} (excluding test comment)`);
        console.log(`   - TaskComment table is working correctly`);

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

testCommentAPI();

