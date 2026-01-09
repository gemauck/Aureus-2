// Simple script to check database for test comment
import { prisma } from './api/_lib/prisma.js';

async function checkDB() {
    try {
        console.log('🔍 Querying database for test comment...\n');
        
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

        for (const task of tasks) {
            if (task.title && task.title.includes('Arrange Site Visit')) {
                console.log(`✅ Found task: "${task.title}" (ID: ${task.id})\n`);
                console.log(`📝 Comments: ${Array.isArray(task.comments) ? task.comments.length : 0}\n`);

                if (Array.isArray(task.comments) && task.comments.length > 0) {
                    task.comments.forEach((comment, i) => {
                        console.log(`Comment ${i + 1}:`);
                        console.log(`  Text: "${comment.text}"`);
                        console.log(`  Author: ${comment.author || comment.userName || 'Unknown'}`);
                        console.log(`  Date: ${comment.date || comment.timestamp || 'Unknown'}`);
                        
                        if (comment.text && comment.text.includes('Test comment - verifying persistence fix')) {
                            console.log(`  ✅ THIS IS THE TEST COMMENT!`);
                        }
                        console.log('');
                    });
                } else {
                    console.log('⚠️  No comments found for this task');
                }
                break;
            }
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkDB();
