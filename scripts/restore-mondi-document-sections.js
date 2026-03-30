#!/usr/bin/env node

/**
 * Restore a project's Document Collection from a backup database into production.
 *
 * Copies, for the matched project:
 * - DocumentSection, DocumentItem, DocumentItemStatus, DocumentItemComment (grid)
 * - DocumentRequestEmailSent, DocumentRequestEmailReceived (request/reply routing)
 * - DocumentCollectionEmailLog (email activity UI, tracking, delivery)
 * - DocumentCollectionNotificationRead (read state for notification badges)
 * - Project.documentSections + Project.hasDocumentCollectionProcess (blob / tab flag)
 * - ProjectActivityLog rows whose type starts with document_section (status/notes history)
 *
 * Not copied (by design):
 * - DocumentCollectionTemplate — global org templates, not per project
 * - “Received counts” API — derived live from DocumentItemComment (already restored)
 * - Browser localStorage (year selection, snapshots)
 *
 * Prerequisites:
 * 1. Restore DO backup to a separate DB instance; set RESTORE_DATABASE_URL to it.
 * 2. DATABASE_URL = production.
 *
 * Usage:
 *   RESTORE_DATABASE_URL="postgresql://..." node scripts/restore-mondi-document-sections.js
 *   RESTORE_DATABASE_URL="postgresql://..." node scripts/restore-mondi-document-sections.js "Mafube"
 *
 * Optional: pass a project name search string (default "Mondi") to match the project.
 */

import { PrismaClient } from '@prisma/client';

const PROJECT_NAME_SEARCH = process.argv[2] || 'Mondi';

const restoreUrl = process.env.RESTORE_DATABASE_URL;
const currentUrl = process.env.DATABASE_URL;

if (!restoreUrl) {
  console.error('❌ RESTORE_DATABASE_URL is required (connection string of the DB restored from backup).');
  console.error('');
  console.error('Example:');
  console.error('  RESTORE_DATABASE_URL="postgresql://user:pass@restored-db.ondigitalocean.com:25060/defaultdb?sslmode=require" \\');
  console.error('  node scripts/restore-mondi-document-sections.js');
  process.exit(1);
}

if (!currentUrl) {
  console.error('❌ DATABASE_URL is required (current production database).');
  process.exit(1);
}

// Two Prisma clients: one for the backup DB, one for production
const restoreDb = new PrismaClient({
  datasources: { db: { url: restoreUrl } },
});

const currentDb = new PrismaClient({
  datasources: { db: { url: currentUrl } },
});

async function run() {
  console.log('🔍 Restore Document Collection (full) from backup DB');
  console.log('==================================================\n');

  try {
    // 1) Find project in restore DB by name
    const projects = await restoreDb.project.findMany({
      where: {
        name: { contains: PROJECT_NAME_SEARCH, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });

    if (projects.length === 0) {
      console.error(`❌ No project matching "${PROJECT_NAME_SEARCH}" found in the restore database.`);
      await restoreDb.$disconnect();
      await currentDb.$disconnect();
      process.exit(1);
    }

    if (projects.length > 1) {
      console.log(`⚠️  Multiple projects matching "${PROJECT_NAME_SEARCH}":`);
      projects.forEach((p, i) => console.log(`   ${i + 1}. ${p.name} (${p.id})`));
      console.log('');
    }

    const projectId = projects[0].id;
    const projectName = projects[0].name;
    console.log(`✅ Using project: ${projectName} (${projectId})\n`);

    // 2) Load from restore DB: sections, items, statuses, comments
    const sections = await restoreDb.documentSection.findMany({
      where: { projectId },
      orderBy: [{ year: 'asc' }, { order: 'asc' }],
    });

    if (sections.length === 0) {
      console.log('⚠️  No document sections found for this project in the backup. Nothing to restore.');
      await restoreDb.$disconnect();
      await currentDb.$disconnect();
      return;
    }

    const sectionIds = sections.map((s) => s.id);
    const items = await restoreDb.documentItem.findMany({
      where: { sectionId: { in: sectionIds } },
      orderBy: { order: 'asc' },
    });
    const itemIds = items.map((i) => i.id);

    const statuses = await restoreDb.documentItemStatus.findMany({
      where: { itemId: { in: itemIds } },
    });
    const comments = await restoreDb.documentItemComment.findMany({
      where: { itemId: { in: itemIds } },
    });

    console.log(`📦 From backup: ${sections.length} sections, ${items.length} items, ${statuses.length} statuses, ${comments.length} comments`);
    const file6 = sections.find((s) => s.name && (s.name.includes('File 6') || s.name.includes('file 6')));
    if (file6) {
      const file6Items = items.filter((i) => i.sectionId === file6.id);
      console.log(`   Including File 6: "${file6.name}" with ${file6Items.length} document(s)\n`);
    } else {
      console.log('');
    }

    // 3) Check if this project already has sections in current DB (we'll replace them)
    const existingInCurrent = await currentDb.documentSection.findMany({
      where: { projectId },
      select: { id: true },
    });

    if (existingInCurrent.length > 0) {
      console.log(`⚠️  Current DB already has ${existingInCurrent.length} section(s) for this project.`);
      console.log('   We will DELETE existing document sections for this project and then insert from backup.\n');
    }

    // 3b) Remove document-collection satellite rows in production (not cascaded from DocumentSection)
    const delNotif = await currentDb.documentCollectionNotificationRead.deleteMany({ where: { projectId } })
    const delLog = await currentDb.documentCollectionEmailLog.deleteMany({ where: { projectId } })
    const delRecv = await currentDb.documentRequestEmailReceived.deleteMany({ where: { projectId } })
    const delSent = await currentDb.documentRequestEmailSent.deleteMany({ where: { projectId } })
    const delAct = await currentDb.projectActivityLog.deleteMany({
      where: { projectId, type: { startsWith: 'document_section' } },
    })
    const extraDel =
      delNotif.count + delLog.count + delRecv.count + delSent.count + delAct.count
    if (extraDel > 0) {
      console.log(
        `🗑️  Cleared doc-collection extras: notificationRead=${delNotif.count}, emailLog=${delLog.count}, emailReceived=${delRecv.count}, emailSent=${delSent.count}, activityLog=${delAct.count}\n`
      )
    }

    // 4) Delete existing document sections for this project in current DB (cascade will remove items, statuses, comments)
    const deleted = await currentDb.documentSection.deleteMany({
      where: { projectId },
    });
    if (deleted.count > 0) {
      console.log(`🗑️  Deleted ${deleted.count} existing section(s) in current DB.\n`);
    }

    // 5) Insert into current DB: sections, then items, then statuses, then comments
    console.log('📥 Inserting sections...');
    for (const s of sections) {
      await currentDb.documentSection.create({
        data: {
          id: s.id,
          projectId: s.projectId,
          year: s.year,
          name: s.name,
          description: s.description ?? '',
          order: s.order,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        },
      });
    }
    console.log(`   ✅ ${sections.length} sections`);

    console.log('📥 Inserting document items...');
    for (const i of items) {
      await currentDb.documentItem.create({
        data: {
          id: i.id,
          sectionId: i.sectionId,
          parentId: i.parentId,
          name: i.name,
          description: i.description ?? '',
          required: i.required ?? false,
          order: i.order,
          assignedTo: i.assignedTo ?? '[]',
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
        },
      });
    }
    console.log(`   ✅ ${items.length} items`);

    console.log('📥 Inserting item statuses...');
    for (const st of statuses) {
      await currentDb.documentItemStatus.create({
        data: {
          id: st.id,
          itemId: st.itemId,
          year: st.year,
          month: st.month,
          status: st.status ?? 'pending',
          updatedBy: st.updatedBy,
          updatedAt: st.updatedAt,
        },
      });
    }
    console.log(`   ✅ ${statuses.length} statuses`);

    console.log('📥 Inserting item comments...');
    for (const c of comments) {
      await currentDb.documentItemComment.create({
        data: {
          id: c.id,
          itemId: c.itemId,
          year: c.year,
          month: c.month,
          text: c.text,
          authorId: c.authorId,
          author: c.author ?? '',
          attachments: c.attachments ?? '[]',
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
      });
    }
    console.log(`   ✅ ${comments.length} comments`);

    // 6) Email / notification satellite tables from backup
    const emailSentRows = await restoreDb.documentRequestEmailSent.findMany({ where: { projectId } })
    const emailRecvRows = await restoreDb.documentRequestEmailReceived.findMany({ where: { projectId } })
    const emailLogRows = await restoreDb.documentCollectionEmailLog.findMany({ where: { projectId } })
    const notifReadRows = await restoreDb.documentCollectionNotificationRead.findMany({ where: { projectId } })
    const activityRows = await restoreDb.projectActivityLog.findMany({
      where: { projectId, type: { startsWith: 'document_section' } },
      orderBy: { createdAt: 'asc' },
    })

    console.log(
      `📧 From backup (extras): sent=${emailSentRows.length}, received=${emailRecvRows.length}, emailLog=${emailLogRows.length}, notificationRead=${notifReadRows.length}, activityLog=${activityRows.length}`
    )

    for (const row of emailSentRows) {
      await currentDb.documentRequestEmailSent.create({
        data: {
          id: row.id,
          messageId: row.messageId,
          projectId: row.projectId,
          sectionId: row.sectionId,
          documentId: row.documentId,
          year: row.year,
          month: row.month,
          requesterEmail: row.requesterEmail,
          createdAt: row.createdAt,
        },
      })
    }
    console.log(`   ✅ ${emailSentRows.length} DocumentRequestEmailSent`)

    for (const row of emailRecvRows) {
      await currentDb.documentRequestEmailReceived.create({
        data: {
          id: row.id,
          emailId: row.emailId,
          projectId: row.projectId,
          documentId: row.documentId,
          year: row.year,
          month: row.month,
          createdAt: row.createdAt,
        },
      })
    }
    console.log(`   ✅ ${emailRecvRows.length} DocumentRequestEmailReceived`)

    for (const row of emailLogRows) {
      await currentDb.documentCollectionEmailLog.create({
        data: {
          id: row.id,
          projectId: row.projectId,
          sectionId: row.sectionId,
          documentId: row.documentId,
          year: row.year,
          month: row.month,
          kind: row.kind ?? 'sent',
          createdAt: row.createdAt,
          subject: row.subject,
          bodyText: row.bodyText,
          messageId: row.messageId,
          trackingId: row.trackingId,
          deliveryStatus: row.deliveryStatus ?? 'sent',
          deliveredAt: row.deliveredAt,
          bouncedAt: row.bouncedAt,
          bounceReason: row.bounceReason,
          lastEventAt: row.lastEventAt,
          openedAt: row.openedAt,
          lastOpenedAt: row.lastOpenedAt,
          openCount: row.openCount ?? 0,
        },
      })
    }
    console.log(`   ✅ ${emailLogRows.length} DocumentCollectionEmailLog`)

    for (const row of notifReadRows) {
      await currentDb.documentCollectionNotificationRead.create({
        data: {
          id: row.id,
          userId: row.userId,
          projectId: row.projectId,
          documentId: row.documentId,
          year: row.year,
          month: row.month,
          type: row.type,
          openedAt: row.openedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })
    }
    console.log(`   ✅ ${notifReadRows.length} DocumentCollectionNotificationRead`)

    for (const row of activityRows) {
      await currentDb.projectActivityLog.create({
        data: {
          id: row.id,
          projectId: row.projectId,
          userId: row.userId,
          userName: row.userName ?? '',
          type: row.type,
          description: row.description ?? '',
          metadata: row.metadata ?? '{}',
          ipAddress: row.ipAddress ?? '',
          userAgent: row.userAgent ?? '',
          action: row.action ?? '',
          details: row.details ?? '',
          createdAt: row.createdAt,
        },
      })
    }
    console.log(`   ✅ ${activityRows.length} ProjectActivityLog (document_section*)`)

    // 7) Project flags + legacy JSON blob (cron schedule / emailRequestByMonth merge source)
    const projBackup = await restoreDb.project.findUnique({
      where: { id: projectId },
      select: { documentSections: true, hasDocumentCollectionProcess: true },
    })
    if (projBackup) {
      const updateData = {
        hasDocumentCollectionProcess: !!projBackup.hasDocumentCollectionProcess,
      }
      if (projBackup.documentSections != null && String(projBackup.documentSections).trim()) {
        updateData.documentSections = projBackup.documentSections
      }
      await currentDb.project.update({
        where: { id: projectId },
        data: updateData,
      })
      const parts = [`hasDocumentCollectionProcess=${updateData.hasDocumentCollectionProcess}`]
      if (updateData.documentSections != null) {
        parts.push(`documentSections (${String(updateData.documentSections).length} chars)`)
      }
      console.log(`   ✅ Project updated: ${parts.join(', ')}`)
    }

    console.log(
      '\n✅ Restore complete. All DB-backed document collection data for this project is copied from backup.'
    )
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.code) console.error('   Code:', err.code);
    process.exit(1);
  } finally {
    await restoreDb.$disconnect();
    await currentDb.$disconnect();
  }
}

run();
