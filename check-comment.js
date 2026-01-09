// Script to check if the comment "Please start" is saved in the database
import { prisma } from './api/_lib/prisma.js';

async function checkComment() {
    try {
        console.log('🔍 Searching for comment "Please start"...\n');
        
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
            console.log('\n📋 Searching all projects for tasks with comments...\n');
            
            // Search all projects
            const allProjects = await prisma.project.findMany({
                select: {
                    id: true,
                    name: true,
                    tasksList: true
                }
            });

            let foundComment = false;
            for (const project of allProjects) {
                if (!project.tasksList) continue;
                
                try {
                    const tasks = typeof project.tasksList === 'string' 
                        ? JSON.parse(project.tasksList) 
                        : project.tasksList;
                    
                    if (!Array.isArray(tasks)) continue;
                    
                    for (const task of tasks) {
                        if (Array.isArray(task.comments)) {
                            for (const comment of task.comments) {
                                if (comment.text && comment.text.includes('Please start')) {
                                    foundComment = true;
                                    console.log(`✅ FOUND COMMENT in project: "${project.name}"`);
                                    console.log(`   Task: "${task.title || 'Untitled'}"`);
                                    console.log(`   Comment: "${comment.text}"`);
                                    console.log(`   Author: ${comment.author || 'Unknown'}`);
                                    console.log(`   Date: ${comment.date || comment.timestamp || 'Unknown'}`);
                                    console.log(`   Comment ID: ${comment.id || 'No ID'}\n`);
                                }
                            }
                        }
                        
                        // Check subtasks too
                        if (Array.isArray(task.subtasks)) {
                            for (const subtask of task.subtasks) {
                                if (Array.isArray(subtask.comments)) {
                                    for (const comment of subtask.comments) {
                                        if (comment.text && comment.text.includes('Please start')) {
                                            foundComment = true;
                                            console.log(`✅ FOUND COMMENT in subtask of project: "${project.name}"`);
                                            console.log(`   Task: "${task.title || 'Untitled'}"`);
                                            console.log(`   Subtask: "${subtask.title || 'Untitled'}"`);
                                            console.log(`   Comment: "${comment.text}"`);
                                            console.log(`   Author: ${comment.author || 'Unknown'}`);
                                            console.log(`   Date: ${comment.date || comment.timestamp || 'Unknown'}\n`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (parseError) {
                    console.warn(`⚠️  Failed to parse tasksList for project "${project.name}":`, parseError.message);
                }
            }
            
            if (!foundComment) {
                console.log('❌ Comment "Please start" NOT FOUND in any project');
                console.log('\n📊 Summary: Checking all projects for any comments...\n');
                
                // Show summary of all comments
                for (const project of allProjects) {
                    if (!project.tasksList) continue;
                    
                    try {
                        const tasks = typeof project.tasksList === 'string' 
                            ? JSON.parse(project.tasksList) 
                            : project.tasksList;
                        
                        if (!Array.isArray(tasks)) continue;
                        
                        let totalComments = 0;
                        let tasksWithComments = [];
                        
                        for (const task of tasks) {
                            const commentCount = Array.isArray(task.comments) ? task.comments.length : 0;
                            totalComments += commentCount;
                            if (commentCount > 0) {
                                tasksWithComments.push({
                                    title: task.title || 'Untitled',
                                    comments: task.comments
                                });
                            }
                        }
                        
                        if (totalComments > 0) {
                            console.log(`📝 Project: "${project.name}"`);
                            console.log(`   Total comments: ${totalComments}`);
                            console.log(`   Tasks with comments: ${tasksWithComments.length}`);
                            for (const taskInfo of tasksWithComments) {
                                console.log(`   - "${taskInfo.title}": ${taskInfo.comments.length} comment(s)`);
                                taskInfo.comments.forEach(c => {
                                    console.log(`     • "${c.text?.substring(0, 50)}${c.text?.length > 50 ? '...' : ''}"`);
                                });
                            }
                            console.log('');
                        }
                    } catch (parseError) {
                        // Skip projects with invalid JSON
                    }
                }
            }
        } else {
            // Found Barberton project
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
                        const commentCount = Array.isArray(task.comments) ? task.comments.length : 0;
                        
                        console.log(`   Task: "${taskTitle}"`);
                        console.log(`   Comments: ${commentCount}`);
                        
                        if (Array.isArray(task.comments) && task.comments.length > 0) {
                            task.comments.forEach((comment, index) => {
                                console.log(`   Comment ${index + 1}:`);
                                console.log(`     Text: "${comment.text}"`);
                                console.log(`     Author: ${comment.author || 'Unknown'}`);
                                console.log(`     Date: ${comment.date || comment.timestamp || 'Unknown'}`);
                                
                                if (comment.text && comment.text.includes('Please start')) {
                                    foundComment = true;
                                    console.log(`     ✅ THIS IS THE COMMENT WE'RE LOOKING FOR!`);
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
                                        if (comment.text && comment.text.includes('Please start')) {
                                            foundComment = true;
                                            console.log(`     ✅ THIS IS THE COMMENT WE'RE LOOKING FOR!`);
                                        }
                                    });
                                    console.log('');
                                }
                            }
                        }
                    }
                    
                    if (!foundComment) {
                        console.log('\n❌ Comment "Please start" NOT FOUND in this project');
                    } else {
                        console.log('\n✅ Comment "Please start" IS SAVED in the database!');
                    }
                } catch (parseError) {
                    console.error('❌ Error parsing tasksList:', parseError.message);
                    console.error('Raw tasksList (first 500 chars):', project.tasksList.substring(0, 500));
                }
            }
        }
    } catch (error) {
        console.error('❌ Error querying database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkComment();

