// Migration script to move comments from JSON (tasksList) to TaskComment table
// Run this after creating the TaskComment table with: node migrate-comments-to-table.js

import { prisma } from './api/_lib/prisma.js';

async function migrateComments() {
  try {
    console.log('🔄 Starting comment migration from JSON to TaskComment table...\n');

    // Get all projects
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        tasksList: true
      }
    });

    console.log(`📁 Found ${projects.length} project(s) to process\n`);

    let totalCommentsMigrated = 0;
    let totalProjectsProcessed = 0;
    let totalTasksProcessed = 0;

    for (const project of projects) {
      if (!project.tasksList || project.tasksList === '[]' || project.tasksList.trim() === '') {
        continue;
      }

      try {
        const tasks = JSON.parse(project.tasksList || '[]');
        if (!Array.isArray(tasks) || tasks.length === 0) {
          continue;
        }

        let projectCommentsMigrated = 0;
        let projectTasksProcessed = 0;

        for (const task of tasks) {
          if (!task.id) continue;

          const comments = Array.isArray(task.comments) ? task.comments : [];
          if (comments.length === 0) continue;

          projectTasksProcessed++;

          for (const comment of comments) {
            try {
              // Check if comment already exists (by checking text + taskId + createdAt if available)
              const existingComment = await prisma.taskComment.findFirst({
                where: {
                  taskId: String(task.id),
                  projectId: project.id,
                  text: comment.text || '',
                  author: comment.author || comment.userName || 'Unknown'
                }
              });

              if (existingComment) {
                console.log(`   ⏭️  Comment already exists, skipping: "${comment.text?.substring(0, 50)}..."`);
                continue;
              }

              // Create comment in new table
              await prisma.taskComment.create({
                data: {
                  taskId: String(task.id),
                  projectId: project.id,
                  text: comment.text || '',
                  author: comment.author || comment.userName || comment.user || 'Unknown User',
                  authorId: comment.authorId || comment.userId || null,
                  userName: comment.userName || comment.user || comment.author || null,
                  createdAt: comment.date || comment.timestamp || comment.createdAt 
                    ? new Date(comment.date || comment.timestamp || comment.createdAt)
                    : new Date(),
                  updatedAt: comment.updatedAt 
                    ? new Date(comment.updatedAt)
                    : new Date()
                }
              });

              projectCommentsMigrated++;
              totalCommentsMigrated++;

            } catch (commentError) {
              console.error(`   ❌ Failed to migrate comment for task ${task.id}:`, commentError.message);
            }
          }

          // Also process subtasks
          if (Array.isArray(task.subtasks)) {
            for (const subtask of task.subtasks) {
              if (!subtask.id) continue;

              const subtaskComments = Array.isArray(subtask.comments) ? subtask.comments : [];
              if (subtaskComments.length === 0) continue;

              for (const comment of subtaskComments) {
                try {
                  const existingComment = await prisma.taskComment.findFirst({
                    where: {
                      taskId: String(subtask.id),
                      projectId: project.id,
                      text: comment.text || '',
                      author: comment.author || comment.userName || 'Unknown'
                    }
                  });

                  if (existingComment) continue;

                  await prisma.taskComment.create({
                    data: {
                      taskId: String(subtask.id),
                      projectId: project.id,
                      text: comment.text || '',
                      author: comment.author || comment.userName || comment.user || 'Unknown User',
                      authorId: comment.authorId || comment.userId || null,
                      userName: comment.userName || comment.user || comment.author || null,
                      createdAt: comment.date || comment.timestamp || comment.createdAt 
                        ? new Date(comment.date || comment.timestamp || comment.createdAt)
                        : new Date(),
                      updatedAt: comment.updatedAt 
                        ? new Date(comment.updatedAt)
                        : new Date()
                    }
                  });

                  projectCommentsMigrated++;
                  totalCommentsMigrated++;

                } catch (commentError) {
                  console.error(`   ❌ Failed to migrate subtask comment:`, commentError.message);
                }
              }
            }
          }
        }

        if (projectCommentsMigrated > 0) {
          console.log(`✅ Project "${project.name}" (${project.id}):`);
          console.log(`   Migrated ${projectCommentsMigrated} comment(s) from ${projectTasksProcessed} task(s)`);
          totalProjectsProcessed++;
          totalTasksProcessed += projectTasksProcessed;
        }

      } catch (parseError) {
        console.error(`❌ Failed to parse tasksList for project ${project.id}:`, parseError.message);
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Projects processed: ${totalProjectsProcessed}`);
    console.log(`   Tasks processed: ${totalTasksProcessed}`);
    console.log(`   Comments migrated: ${totalCommentsMigrated}`);

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateComments();

