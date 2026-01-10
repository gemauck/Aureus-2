#!/usr/bin/env node
/**
 * Comprehensive migration script to move all Project JSON fields to normalized tables
 * Migrates:
 * - comments → ProjectComment
 * - activityLog → ProjectActivityLog
 * - documents → ProjectDocument
 * - team → ProjectTeamMember
 * - taskLists → ProjectTaskList
 * - customFieldDefinitions → ProjectCustomFieldDefinition
 */

import 'dotenv/config';
import { prisma } from './api/_lib/prisma.js';

let migratedCounts = {
  comments: 0,
  activityLogs: 0,
  documents: 0,
  teamMembers: 0,
  taskLists: 0,
  customFields: 0,
  projectsProcessed: 0,
  errors: 0
};

async function migrateProjectComments(project) {
  if (!project.comments || project.comments === '[]' || project.comments.trim() === '') {
    return 0;
  }

  try {
    let comments = [];
    if (typeof project.comments === 'string') {
      comments = JSON.parse(project.comments || '[]');
    } else if (Array.isArray(project.comments)) {
      comments = project.comments;
    }

    if (!Array.isArray(comments) || comments.length === 0) {
      return 0;
    }

    let created = 0;
    for (const comment of comments) {
      try {
        // Skip if already migrated (check by matching text and timestamp)
        const existing = await prisma.projectComment.findFirst({
          where: {
            projectId: project.id,
            text: String(comment.text || ''),
            createdAt: comment.timestamp || comment.createdAt ? new Date(comment.timestamp || comment.createdAt) : undefined
          }
        });

        if (existing) {
          continue; // Skip duplicate
        }

        await prisma.projectComment.create({
          data: {
            projectId: project.id,
            text: String(comment.text || ''),
            author: String(comment.author || comment.authorName || 'Unknown'),
            authorId: comment.authorId || null,
            userName: comment.userName || comment.email || null,
            type: String(comment.type || 'comment'),
            parentId: comment.parentId || null,
            createdAt: comment.timestamp || comment.createdAt ? new Date(comment.timestamp || comment.createdAt) : new Date(),
          }
        });
        created++;
      } catch (commentError) {
        console.error(`❌ Error migrating comment for project ${project.id}:`, commentError.message);
      }
    }

    return created;
  } catch (error) {
    console.error(`❌ Error parsing comments for project ${project.id}:`, error.message);
    return 0;
  }
}

async function migrateActivityLogs(project) {
  if (!project.activityLog || project.activityLog === '[]' || project.activityLog.trim() === '') {
    return 0;
  }

  try {
    let activities = [];
    if (typeof project.activityLog === 'string') {
      activities = JSON.parse(project.activityLog || '[]');
    } else if (Array.isArray(project.activityLog)) {
      activities = project.activityLog;
    }

    if (!Array.isArray(activities) || activities.length === 0) {
      return 0;
    }

    let created = 0;
    for (const activity of activities) {
      try {
        // Skip if already migrated
        const existing = await prisma.projectActivityLog.findFirst({
          where: {
            projectId: project.id,
            type: String(activity.type || ''),
            description: String(activity.description || ''),
            createdAt: activity.timestamp || activity.createdAt ? new Date(activity.timestamp || activity.createdAt) : undefined
          }
        });

        if (existing) {
          continue;
        }

        await prisma.projectActivityLog.create({
          data: {
            projectId: project.id,
            type: String(activity.type || 'unknown'),
            userId: activity.userId || activity.user?.id || null,
            userName: String(activity.user || activity.userName || activity.user?.name || 'System'),
            description: String(activity.description || activity.message || ''),
            metadata: JSON.stringify(activity.metadata || activity.data || {}),
            ipAddress: activity.ipAddress || null,
            userAgent: activity.userAgent || null,
            createdAt: activity.timestamp || activity.createdAt ? new Date(activity.timestamp || activity.createdAt) : new Date(),
          }
        });
        created++;
      } catch (activityError) {
        console.error(`❌ Error migrating activity log for project ${project.id}:`, activityError.message);
      }
    }

    return created;
  } catch (error) {
    console.error(`❌ Error parsing activityLog for project ${project.id}:`, error.message);
    return 0;
  }
}

async function migrateDocuments(project) {
  if (!project.documents || project.documents === '[]' || project.documents.trim() === '') {
    return 0;
  }

  try {
    let documents = [];
    if (typeof project.documents === 'string') {
      documents = JSON.parse(project.documents || '[]');
    } else if (Array.isArray(project.documents)) {
      documents = project.documents;
    }

    if (!Array.isArray(documents) || documents.length === 0) {
      return 0;
    }

    let created = 0;
    for (const doc of documents) {
      try {
        // Skip if already migrated
        const existing = await prisma.projectDocument.findFirst({
          where: {
            projectId: project.id,
            name: String(doc.name || ''),
            url: doc.url || null
          }
        });

        if (existing) {
          continue;
        }

        await prisma.projectDocument.create({
          data: {
            projectId: project.id,
            name: String(doc.name || 'Untitled'),
            description: String(doc.description || ''),
            url: doc.url || null,
            filePath: doc.filePath || null,
            type: doc.type || doc.fileType || null,
            size: doc.size ? parseInt(doc.size) : null,
            mimeType: doc.mimeType || null,
            uploadDate: doc.uploadDate ? new Date(doc.uploadDate) : new Date(),
            uploadedBy: doc.uploadedBy || doc.userId || null,
            tags: JSON.stringify(Array.isArray(doc.tags) ? doc.tags : []),
            version: doc.version || 1,
            isActive: doc.isActive !== undefined ? Boolean(doc.isActive) : true,
          }
        });
        created++;
      } catch (docError) {
        console.error(`❌ Error migrating document for project ${project.id}:`, docError.message);
      }
    }

    return created;
  } catch (error) {
    console.error(`❌ Error parsing documents for project ${project.id}:`, error.message);
    return 0;
  }
}

async function migrateTeamMembers(project) {
  if (!project.team || project.team === '[]' || project.team.trim() === '') {
    return 0;
  }

  try {
    let team = [];
    if (typeof project.team === 'string') {
      team = JSON.parse(project.team || '[]');
    } else if (Array.isArray(project.team)) {
      team = project.team;
    }

    if (!Array.isArray(team) || team.length === 0) {
      return 0;
    }

    let created = 0;
    for (const member of team) {
      try {
        const userId = member.userId || member.id || null;
        if (!userId) {
          console.warn(`⚠️ Skipping team member without userId in project ${project.id}`);
          continue;
        }

        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id: String(userId) }
        });

        if (!user) {
          console.warn(`⚠️ User ${userId} not found, skipping team member for project ${project.id}`);
          continue;
        }

        // Skip if already migrated
        const existing = await prisma.projectTeamMember.findUnique({
          where: {
            projectId_userId: {
              projectId: project.id,
              userId: String(userId)
            }
          }
        });

        if (existing) {
          continue;
        }

        await prisma.projectTeamMember.create({
          data: {
            projectId: project.id,
            userId: String(userId),
            role: String(member.role || 'member'),
            permissions: JSON.stringify(Array.isArray(member.permissions) ? member.permissions : []),
            addedDate: member.addedDate ? new Date(member.addedDate) : new Date(),
            addedBy: member.addedBy || null,
            notes: String(member.notes || ''),
          }
        });
        created++;
      } catch (memberError) {
        console.error(`❌ Error migrating team member for project ${project.id}:`, memberError.message);
      }
    }

    return created;
  } catch (error) {
    console.error(`❌ Error parsing team for project ${project.id}:`, error.message);
    return 0;
  }
}

async function migrateTaskLists(project) {
  if (!project.taskLists || project.taskLists === '[]' || project.taskLists.trim() === '') {
    return 0;
  }

  try {
    let taskLists = [];
    if (typeof project.taskLists === 'string') {
      taskLists = JSON.parse(project.taskLists || '[]');
    } else if (Array.isArray(project.taskLists)) {
      taskLists = project.taskLists;
    }

    if (!Array.isArray(taskLists) || taskLists.length === 0) {
      return 0;
    }

    let created = 0;
    for (let i = 0; i < taskLists.length; i++) {
      const list = taskLists[i];
      try {
        const listId = list.id || (i + 1);

        // Skip if already migrated
        const existing = await prisma.projectTaskList.findUnique({
          where: {
            projectId_listId: {
              projectId: project.id,
              listId: parseInt(listId)
            }
          }
        });

        if (existing) {
          continue;
        }

        await prisma.projectTaskList.create({
          data: {
            projectId: project.id,
            listId: parseInt(listId),
            name: String(list.name || `List ${listId}`),
            color: String(list.color || 'blue'),
            order: i,
          }
        });
        created++;
      } catch (listError) {
        console.error(`❌ Error migrating task list for project ${project.id}:`, listError.message);
      }
    }

    return created;
  } catch (error) {
    console.error(`❌ Error parsing taskLists for project ${project.id}:`, error.message);
    return 0;
  }
}

async function migrateCustomFieldDefinitions(project) {
  if (!project.customFieldDefinitions || project.customFieldDefinitions === '[]' || project.customFieldDefinitions.trim() === '') {
    return 0;
  }

  try {
    let fields = [];
    if (typeof project.customFieldDefinitions === 'string') {
      fields = JSON.parse(project.customFieldDefinitions || '[]');
    } else if (Array.isArray(project.customFieldDefinitions)) {
      fields = project.customFieldDefinitions;
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return 0;
    }

    let created = 0;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      try {
        const fieldId = field.id || field.fieldId || `field_${i + 1}`;

        // Skip if already migrated
        const existing = await prisma.projectCustomFieldDefinition.findUnique({
          where: {
            projectId_fieldId: {
              projectId: project.id,
              fieldId: String(fieldId)
            }
          }
        });

        if (existing) {
          continue;
        }

        await prisma.projectCustomFieldDefinition.create({
          data: {
            projectId: project.id,
            fieldId: String(fieldId),
            name: String(field.name || `Field ${i + 1}`),
            type: String(field.type || 'text'),
            required: Boolean(field.required || false),
            options: JSON.stringify(Array.isArray(field.options) ? field.options : []),
            defaultValue: field.defaultValue ? String(field.defaultValue) : null,
            order: i,
          }
        });
        created++;
      } catch (fieldError) {
        console.error(`❌ Error migrating custom field for project ${project.id}:`, fieldError.message);
      }
    }

    return created;
  } catch (error) {
    console.error(`❌ Error parsing customFieldDefinitions for project ${project.id}:`, error.message);
    return 0;
  }
}

async function migrateProject(project) {
  console.log(`\n📁 Migrating project: ${project.name} (${project.id})`);

  try {
    const commentsCount = await migrateProjectComments(project);
    migratedCounts.comments += commentsCount;
    if (commentsCount > 0) console.log(`   ✅ Migrated ${commentsCount} comment(s)`);

    const activityCount = await migrateActivityLogs(project);
    migratedCounts.activityLogs += activityCount;
    if (activityCount > 0) console.log(`   ✅ Migrated ${activityCount} activity log(s)`);

    const documentsCount = await migrateDocuments(project);
    migratedCounts.documents += documentsCount;
    if (documentsCount > 0) console.log(`   ✅ Migrated ${documentsCount} document(s)`);

    const teamCount = await migrateTeamMembers(project);
    migratedCounts.teamMembers += teamCount;
    if (teamCount > 0) console.log(`   ✅ Migrated ${teamCount} team member(s)`);

    const taskListsCount = await migrateTaskLists(project);
    migratedCounts.taskLists += taskListsCount;
    if (taskListsCount > 0) console.log(`   ✅ Migrated ${taskListsCount} task list(s)`);

    const customFieldsCount = await migrateCustomFieldDefinitions(project);
    migratedCounts.customFields += customFieldsCount;
    if (customFieldsCount > 0) console.log(`   ✅ Migrated ${customFieldsCount} custom field definition(s)`);

    migratedCounts.projectsProcessed++;
    return true;
  } catch (error) {
    console.error(`❌ Error migrating project ${project.id}:`, error.message);
    migratedCounts.errors++;
    return false;
  }
}

async function runMigration() {
  console.log('🚀 Starting Project JSON to Tables Migration\n');
  console.log('Migrating: comments, activityLogs, documents, team, taskLists, customFieldDefinitions\n');

  try {
    // Get all projects
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        comments: true,
        activityLog: true,
        documents: true,
        team: true,
        taskLists: true,
        customFieldDefinitions: true
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`📊 Found ${projects.length} project(s) to migrate\n`);

    for (const project of projects) {
      await migrateProject(project);
    }

    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Projects processed: ${migratedCounts.projectsProcessed}`);
    console.log(`✅ Comments migrated: ${migratedCounts.comments}`);
    console.log(`✅ Activity logs migrated: ${migratedCounts.activityLogs}`);
    console.log(`✅ Documents migrated: ${migratedCounts.documents}`);
    console.log(`✅ Team members migrated: ${migratedCounts.teamMembers}`);
    console.log(`✅ Task lists migrated: ${migratedCounts.taskLists}`);
    console.log(`✅ Custom field definitions migrated: ${migratedCounts.customFields}`);
    console.log(`❌ Errors: ${migratedCounts.errors}`);
    console.log('='.repeat(60));

    if (migratedCounts.errors === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log(`\n⚠️ Migration completed with ${migratedCounts.errors} error(s)`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();


