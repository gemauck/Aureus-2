#!/usr/bin/env node

/**
 * Purge all Monthly Document Collection Tracker data
 * - Clears documentSections for every project
 * - Deletes every document collection template
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function confirmPurge(projectCount, templateCount) {
  if (!process.stdin.isTTY) {
    return true;
  }

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(
      `⚠️  This will purge ${projectCount} project(s) and delete ${templateCount} template(s). Type "yes" to continue: `,
      resolve,
    );
  });
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

async function purgeDocumentCollection() {
  try {
    console.log('🧹 Starting Monthly Document Collection purge...');

    const [projectsToUpdate, templatesToDelete] = await Promise.all([
      prisma.project.count({
        where: {
          OR: [
            { documentSections: { not: null } },
            { documentSections: { not: '[]' } },
          ],
        },
      }),
      prisma.documentCollectionTemplate.count(),
    ]);

    console.log(
      `📊 Found ${projectsToUpdate} project(s) with documentSections and ${templatesToDelete} template(s).`,
    );

    if (projectsToUpdate === 0 && templatesToDelete === 0) {
      console.log('✅ Nothing to purge.');
      return;
    }

    const confirmed = await confirmPurge(projectsToUpdate, templatesToDelete);
    if (!confirmed) {
      console.log('❌ Purge cancelled.');
      return;
    }

    if (projectsToUpdate > 0) {
      console.log('🔄 Clearing documentSections from all projects...');
      const projectResult = await prisma.project.updateMany({
        data: {
          documentSections: '[]',
        },
      });
      console.log(`✅ Cleared documentSections for ${projectResult.count} project(s).`);
    }

    if (templatesToDelete > 0) {
      console.log('🗑️  Deleting document collection templates...');
      const templateResult = await prisma.documentCollectionTemplate.deleteMany({});
      console.log(`✅ Deleted ${templateResult.count} template(s).`);
    }

    console.log('\n🎉 Document collection data has been purged successfully.');
  } catch (error) {
    console.error('❌ Error purging document collection data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

purgeDocumentCollection();



