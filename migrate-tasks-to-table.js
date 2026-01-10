/**
 * Migration script: Move tasks from Project.tasksList JSON to Task table
 * 
 * This script:
 * 1. Reads all projects
 * 2. Parses tasksList JSON
 * 3. Creates Task records for each task and subtask
 * 4. Preserves all task data including comments (which are now in TaskComment table)
 * 
 * Run with: node migrate-tasks-to-table.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function migrateTasksToTable() {
  console.log('🚀 Starting task migration from JSON to Task table...\n');

  try {
    // Get all projects
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        tasksList: true
      }
    });

    console.log(`📊 Found ${projects.length} projects to process\n`);

    let totalTasksMigrated = 0;
    let totalSubtasksMigrated = 0;
    let totalProjectsProcessed = 0;
    let totalErrors = 0;

    for (const project of projects) {
      try {
        if (!project.tasksList) {
          console.log(`⏭️  Skipping project ${project.name} (${project.id}): No tasksList`);
          continue;
        }

        // Parse tasksList JSON
        let tasks;
        try {
          tasks = typeof project.tasksList === 'string' 
            ? JSON.parse(project.tasksList) 
            : project.tasksList;
        } catch (parseError) {
          console.error(`❌ Failed to parse tasksList for project ${project.name} (${project.id}):`, parseError.message);
          totalErrors++;
          continue;
        }

        if (!Array.isArray(tasks) || tasks.length === 0) {
          console.log(`⏭️  Skipping project ${project.name} (${project.id}): No tasks in tasksList`);
          continue;
        }

        console.log(`\n📋 Processing project: ${project.name} (${project.id})`);
        console.log(`   Found ${tasks.length} tasks in JSON`);

        let projectTasksMigrated = 0;
        let projectSubtasksMigrated = 0;

        // Process each task
        for (const task of tasks) {
          if (!task || !task.id || !task.title) {
            console.warn(`   ⚠️  Skipping invalid task:`, task);
            continue;
          }

          try {
            // Check if task already exists
            const existingTask = await prisma.task.findUnique({
              where: { id: String(task.id) }
            });

            if (existingTask) {
              console.log(`   ⏭️  Task "${task.title}" (${task.id}) already exists, skipping`);
              continue;
            }

            // Prepare task data
            const taskData = {
              id: String(task.id),
              projectId: project.id,
              parentTaskId: null, // Top-level tasks have no parent
              title: String(task.title || 'Untitled Task'),
              description: String(task.description || ''),
              status: String(task.status || task.listId ? 'todo' : 'To Do'),
              priority: String(task.priority || 'Medium'),
              assigneeId: task.assigneeId || null,
              assignee: String(task.assignee || ''),
              dueDate: task.dueDate ? new Date(task.dueDate) : null,
              listId: task.listId ? parseInt(task.listId, 10) : null,
              estimatedHours: task.estimatedHours ? parseFloat(task.estimatedHours) : null,
              actualHours: task.actualHours ? parseFloat(task.actualHours) : null,
              blockedBy: String(task.blockedBy || ''),
              tags: JSON.stringify(Array.isArray(task.tags) ? task.tags : []),
              attachments: JSON.stringify(Array.isArray(task.attachments) ? task.attachments : []),
              checklist: JSON.stringify(Array.isArray(task.checklist) ? task.checklist : []),
              dependencies: JSON.stringify(Array.isArray(task.dependencies) ? task.dependencies : []),
              subscribers: JSON.stringify(Array.isArray(task.subscribers) ? task.subscribers : []),
              customFields: JSON.stringify(typeof task.customFields === 'object' ? task.customFields : {})
            };

            // Create task
            await prisma.task.create({
              data: taskData
            });

            projectTasksMigrated++;
            totalTasksMigrated++;

            console.log(`   ✅ Migrated task: "${task.title}" (${task.id})`);

            // Process subtasks
            if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
              for (const subtask of task.subtasks) {
                if (!subtask || !subtask.id || !subtask.title) {
                  console.warn(`      ⚠️  Skipping invalid subtask:`, subtask);
                  continue;
                }

                try {
                  // Check if subtask already exists
                  const existingSubtask = await prisma.task.findUnique({
                    where: { id: String(subtask.id) }
                  });

                  if (existingSubtask) {
                    console.log(`      ⏭️  Subtask "${subtask.title}" (${subtask.id}) already exists, skipping`);
                    continue;
                  }

                  // Prepare subtask data
                  const subtaskData = {
                    id: String(subtask.id),
                    projectId: project.id,
                    parentTaskId: String(task.id), // Link to parent task
                    title: String(subtask.title || 'Untitled Subtask'),
                    description: String(subtask.description || ''),
                    status: String(subtask.status || 'To Do'),
                    priority: String(subtask.priority || 'Medium'),
                    assigneeId: subtask.assigneeId || null,
                    assignee: String(subtask.assignee || ''),
                    dueDate: subtask.dueDate ? new Date(subtask.dueDate) : null,
                    listId: null, // Subtasks don't have listId
                    estimatedHours: subtask.estimatedHours ? parseFloat(subtask.estimatedHours) : null,
                    actualHours: subtask.actualHours ? parseFloat(subtask.actualHours) : null,
                    blockedBy: String(subtask.blockedBy || ''),
                    tags: JSON.stringify(Array.isArray(subtask.tags) ? subtask.tags : []),
                    attachments: JSON.stringify(Array.isArray(subtask.attachments) ? subtask.attachments : []),
                    checklist: JSON.stringify(Array.isArray(subtask.checklist) ? subtask.checklist : []),
                    dependencies: JSON.stringify(Array.isArray(subtask.dependencies) ? subtask.dependencies : []),
                    subscribers: JSON.stringify(Array.isArray(subtask.subscribers) ? subtask.subscribers : []),
                    customFields: JSON.stringify(typeof subtask.customFields === 'object' ? subtask.customFields : {})
                  };

                  // Create subtask
                  await prisma.task.create({
                    data: subtaskData
                  });

                  projectSubtasksMigrated++;
                  totalSubtasksMigrated++;

                  console.log(`      ✅ Migrated subtask: "${subtask.title}" (${subtask.id})`);
                } catch (subtaskError) {
                  console.error(`      ❌ Failed to migrate subtask "${subtask.title}" (${subtask.id}):`, subtaskError.message);
                  totalErrors++;
                }
              }
            }

          } catch (taskError) {
            console.error(`   ❌ Failed to migrate task "${task.title}" (${task.id}):`, taskError.message);
            totalErrors++;
          }
        }

        if (projectTasksMigrated > 0 || projectSubtasksMigrated > 0) {
          console.log(`   📊 Project summary: ${projectTasksMigrated} tasks, ${projectSubtasksMigrated} subtasks migrated`);
        }

        totalProjectsProcessed++;

      } catch (projectError) {
        console.error(`❌ Error processing project ${project.name} (${project.id}):`, projectError.message);
        totalErrors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Projects processed: ${totalProjectsProcessed}`);
    console.log(`✅ Tasks migrated: ${totalTasksMigrated}`);
    console.log(`✅ Subtasks migrated: ${totalSubtasksMigrated}`);
    console.log(`❌ Errors: ${totalErrors}`);
    console.log('='.repeat(60));

    if (totalErrors === 0) {
      console.log('\n🎉 Migration completed successfully!');
    } else {
      console.log(`\n⚠️  Migration completed with ${totalErrors} error(s). Please review the logs above.`);
    }

  } catch (error) {
    console.error('\n❌ Fatal error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateTasksToTable()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });



