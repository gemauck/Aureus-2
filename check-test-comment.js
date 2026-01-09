// Script to check if the test comment "Test comment - verifying persistence fix" is saved in the database
import { prisma } from './api/_lib/prisma.js';

async function checkTestComment() {
    try {
        console.log('🔍 Searching for test comment "Test comment - verifying persistence fix"...\n');
        
        // Find the project "Barberton Mines FMS & Diesel Refund"
        const projects = await prisma.project.findMany({
            where: {
                name: {
                    contains: 'Barberton',
                    mode: 'insensitive'
                }
            },
            select: {
                id: true,
                name: true,
                tasksList: true
            }
        });

        if (projects.length === 0) {
            console.log('❌ No projects found with "Barberton" in the name');
            return;
        }

        for (const project of projects) {
            console.log(`📁 Project: "${project.name}" (ID: ${project.id})\n`);
            
            if (!project.tasksList) {
                console.log('⚠️  This project has no tasksList field');
                continue;
            }
            
            try {
                const tasks = typeof project.tasksList === 'string' 
                    ? JSON.parse(project.tasksList) 
                    : project.tasksList;
                
                if (!Array.isArray(tasks)) {
                    console.log('⚠️  tasksList is not an array');
                    continue;
                }
                
                console.log(`📋 Found ${tasks.length} task(s) in this project\n`);
                
                let foundComment = false;
                for (const task of tasks) {
                    const taskTitle = task.title || 'Untitled Task';
                    const taskId = task.id || 'No ID';
                    const commentCount = Array.isArray(task.comments) ? task.comments.length : 0;
                    
                    console.log(`   Task: "${taskTitle}" (ID: ${taskId})`);
                    console.log(`   Comments: ${commentCount}`);
                    
                    if (Array.isArray(task.comments) && task.comments.length > 0) {
                        task.comments.forEach((comment, index) => {
                            console.log(`   Comment ${index + 1}:`);
                            console.log(`     Text: "${comment.text}"`);
                            console.log(`     Author: ${comment.author || comment.userName || 'Unknown'}`);
                            console.log(`     Date: ${comment.date || comment.timestamp || 'Unknown'}`);
                            console.log(`     Comment ID: ${comment.id || 'No ID'}`);
                            
                            if (comment.text && comment.text.includes('Test comment - verifying persistence fix')) {
                                foundComment = true;
                                console.log(`     ✅ THIS IS THE TEST COMMENT WE'RE LOOKING FOR!`);
                            }
                            console.log('');
                        });
                    }
                    
                    // Check subtasks
                    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
                        for (const subtask of task.subtasks) {
                            const subtaskCommentCount = Array.isArray(subtask.comments) ? subtask.comments.length : 0;
                            if (subtaskCommentCount > 0) {
                                console.log(`   Subtask: "${subtask.title || 'Untitled'}"`);
                                console.log(`   Comments: ${subtaskCommentCount}`);
                                subtask.comments.forEach((comment, index) => {
                                    console.log(`     Comment ${index + 1}: "${comment.text}"`);
                                    if (comment.text && comment.text.includes('Test comment - verifying persistence fix')) {
                                        foundComment = true;
                                        console.log(`     ✅ THIS IS THE TEST COMMENT WE'RE LOOKING FOR!`);
                                    }
                                });
                                console.log('');
                            }
                        }
                    }
                }
                
                if (!foundComment) {
                    console.log('\n❌ Test comment "Test comment - verifying persistence fix" NOT FOUND in this project');
                } else {
                    console.log('\n✅ Test comment "Test comment - verifying persistence fix" IS SAVED in the database!');
                }
            } catch (parseError) {
                console.error('❌ Error parsing tasksList:', parseError.message);
                console.error('Raw tasksList (first 500 chars):', project.tasksList.substring(0, 500));
            }
        }
    } catch (error) {
        console.error('❌ Error querying database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkTestComment();

