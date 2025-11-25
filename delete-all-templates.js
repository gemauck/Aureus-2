#!/usr/bin/env node

/**
 * Delete All Document Collection Templates
 * Deletes all templates from the database and clears localStorage cache
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAllTemplates() {
  try {
    console.log('🗑️  Starting template deletion...');

    // Count existing templates
    const count = await prisma.documentCollectionTemplate.count();
    console.log(`📊 Found ${count} templates to delete`);

    if (count === 0) {
      console.log('✅ No templates found. Nothing to delete.');
      await prisma.$disconnect();
      return;
    }

    // Confirm deletion (when running interactively)
    if (process.stdin.isTTY) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        rl.question(`⚠️  Are you sure you want to delete ALL ${count} templates? This cannot be undone! (yes/no): `, resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Deletion cancelled.');
        await prisma.$disconnect();
        return;
      }
    }

    // Delete all templates (including default templates)
    console.log('🔄 Deleting all templates...');
    const result = await prisma.documentCollectionTemplate.deleteMany({});
    
    console.log(`✅ Successfully deleted ${result.count} templates from database`);
    console.log('\n📝 Note: Clear localStorage cache in browser:');
    console.log('   localStorage.removeItem("documentCollectionTemplates")');
    console.log('   localStorage.removeItem("abcotronics_deleted_template_ids")');
    
  } catch (error) {
    console.error('❌ Error deleting templates:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
deleteAllTemplates();



