// Script to add a comment directly to the database via SQL
import { prisma } from './api/_lib/prisma.js';

async function addCommentViaSQL() {
    try {
        console.log('🔍 Fetching project from database...\n');
        
        const project = await prisma.project.findUnique({
            where: { id: 'cmhn2drtq001lqyu9bgfzzqx6' },
            select: {
                id: true,
                name: true,
                tasksList: true
            }
        });

        if (!project) {
            console.log('❌ Project not found');
            return;
        }

        console.log(`📁 Project: "${project.name}" (ID: ${project.id})\n`);

        if (!project.tasksList) {
            console.log('⚠️  No tasksList found');
            return;
        }

        const tasks = JSON.parse(project.tasksList);
        console.log(`📋 Found ${tasks.length} task(s)\n`);

        // Find the "Arrange Site Visit" task
        const task = tasks.find(t => 
            (t.title && t.title.includes('Arrange Site Visit')) || 
            (t.id && t.id.toString() === '1767959279785')
        );

        if (!task) {
            console.log('❌ Task "Arrange Site Visit" not found');
            return;
        }

        console.log(`✅ Found task: "${task.title}" (ID: ${task.id})\n`);

        // Ensure comments array exists
        if (!Array.isArray(task.comments)) {
            task.comments = [];
        }

        // Create a new test comment
        const testComment = {
            id: `sql-test-${Date.now()}`,
            text: `SQL Test Comment - Added directly via database at ${new Date().toLocaleString()}`,
            author: 'Gareth Mauck',
            userName: 'Gareth Mauck',
            user: 'Gareth Mauck',
            date: new Date().toISOString(),
            timestamp: new Date().toISOString()
        };

        // Add the comment
        task.comments.push(testComment);

        console.log(`📝 Adding comment to task...`);
        console.log(`   Comment ID: ${testComment.id}`);
        console.log(`   Comment Text: "${testComment.text}"`);
        console.log(`   Author: ${testComment.author}`);
        console.log(`   Date: ${testComment.date}\n`);

        // Update the project with the modified tasks
        const updatedTasksList = JSON.stringify(tasks);

        console.log('💾 Saving updated tasksList to database...\n');

        await prisma.project.update({
            where: { id: project.id },
            data: {
                tasksList: updatedTasksList
            }
        });

        console.log('✅ Comment successfully added to database via SQL/Prisma!\n');
        console.log(`📊 Task now has ${task.comments.length} comment(s)`);
        console.log(`\n🔄 Please refresh the UI to see the new comment.`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

addCommentViaSQL();



