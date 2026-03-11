#!/usr/bin/env node

/**
 * Restore Mondi (or any project) Document Collection sections from a backup database.
 * Use this after restoring a Digital Ocean backup to a separate cluster, to copy only
 * that project's DocumentSection / DocumentItem data into the current production DB.
 *
 * Prerequisites:
 * 1. In Digital Ocean: Databases → your cluster → Backups → pick a backup from BEFORE
 *    the failed save (when File 6 still existed) → "Restore" / "Create database from backup".
 * 2. Wait for the new cluster, then get its connection string (Users & Databases).
 * 3. Set RESTORE_DATABASE_URL to that connection string (current DATABASE_URL stays as production).
 *
 * Usage:
 *   RESTORE_DATABASE_URL="postgresql://..." node scripts/restore-mondi-document-sections.js
 *   RESTORE_DATABASE_URL="postgresql://..." node scripts/restore-mondi-document-sections.js "Mondi"
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
  console.log('🔍 Restore Mondi Document Collection from backup DB');
  console.log('====================================================\n');

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

    console.log('\n✅ Restore complete. Mondi document collection (including File 6) is back in production.');
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
