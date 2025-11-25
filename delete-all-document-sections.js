#!/usr/bin/env node

/**
 * Delete All Document Sections / Checklist Items
 * 
 * This script clears all documentSections (monthly document collection checklists)
 * from all projects in the database.
 * 
 * Usage: node delete-all-document-sections.js
 * 
 * WARNING: This will permanently delete all checklist data from all projects!
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAllDocumentSections() {
  try {
    console.log('🗑️  Starting deletion of all document sections...\n');

    // Count projects with documentSections
    const projectsWithSections = await prisma.project.findMany({
      where: {
        OR: [
          { documentSections: { not: '[]' } },
          { documentSections: { not: null } }
        ]
      },
      select: {
        id: true,
        name: true,
        documentSections: true
      }
    });

    const count = projectsWithSections.length;
    console.log(`📊 Found ${count} project(s) with document sections`);

    if (count === 0) {
      console.log('✅ No document sections found. Nothing to delete.');
      await prisma.$disconnect();
      return;
    }

    // Show preview of what will be deleted
    console.log('\n📋 Projects that will be affected:');
    projectsWithSections.forEach((project, index) => {
      const sectionsLength = typeof project.documentSections === 'string' 
        ? project.documentSections.length 
        : 0;
      console.log(`   ${index + 1}. ${project.name} (ID: ${project.id}, Data size: ${sectionsLength} chars)`);
    });

    // Confirm deletion (when running interactively)
    if (process.stdin.isTTY) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        readline.question(`\n⚠️  Are you sure you want to delete ALL document sections from ${count} project(s)? This cannot be undone! (yes/no): `, resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Deletion cancelled.');
        await prisma.$disconnect();
        return;
      }
    }

    // Delete all documentSections (set to empty array JSON)
    console.log('\n🔄 Clearing document sections from all projects...');
    
    const result = await prisma.project.updateMany({
      data: {
        documentSections: '[]'
      }
    });

    console.log(`✅ Successfully cleared document sections from ${result.count} project(s)`);
    console.log('\n📝 Note: All monthly document collection checklists have been deleted.');
    console.log('   Users will need to recreate their checklists from scratch.');
    
  } catch (error) {
    console.error('❌ Error deleting document sections:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
deleteAllDocumentSections();

