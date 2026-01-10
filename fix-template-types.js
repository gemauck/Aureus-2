#!/usr/bin/env node

/**
 * Fix Template Types - Set type field for Weekly FMS Review templates
 * 
 * This script updates templates that are missing the type field to have
 * type: 'weekly-fms-review' so they appear in the API.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixTemplateTypes() {
  try {
    console.log('🔧 Fixing Template Types');
    console.log('========================\n');

    // Get all templates (since we can't filter by type if it doesn't exist)
    console.log('🔍 Finding all templates...');
    const allTemplates = await prisma.documentCollectionTemplate.findMany({
      orderBy: [{ createdAt: 'desc' }]
    });

    console.log(`✅ Found ${allTemplates.length} template(s)\n`);

    if (allTemplates.length === 0) {
      console.log('❌ No templates found in database.');
      return;
    }

    // Check which templates need fixing
    const templatesToFix = [];
    
    for (const template of allTemplates) {
      // Check if type field is missing or null
      const needsFix = !template.type || template.type === null || template.type === undefined;
      
      if (needsFix) {
        templatesToFix.push(template);
        console.log(`⚠️  Template "${template.name}" (${template.id})`);
        console.log(`    Missing type field - will set to 'weekly-fms-review'`);
      } else {
        console.log(`✅ Template "${template.name}" (${template.id})`);
        console.log(`    Already has type: ${template.type}`);
      }
    }

    if (templatesToFix.length === 0) {
      console.log('\n✅ All templates already have type set. Nothing to fix!');
      return;
    }

    console.log(`\n📝 Found ${templatesToFix.length} template(s) that need type field set.\n`);

    // Update templates using raw SQL to avoid Prisma schema issues
    console.log('🔄 Updating templates...\n');
    
    let updated = 0;
    let errors = 0;

    for (const template of templatesToFix) {
      try {
        // Use raw SQL to update the type field
        await prisma.$executeRaw`
          UPDATE "DocumentCollectionTemplate"
          SET "type" = 'weekly-fms-review',
              "updatedAt" = NOW()
          WHERE id = ${template.id}
        `;
        
        console.log(`   ✅ Updated: ${template.name}`);
        updated++;
      } catch (error) {
        console.error(`   ❌ Error updating ${template.name}: ${error.message}`);
        errors++;
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);

    // Verify the fix
    console.log('\n🔍 Verifying fix...');
    
    // Try to query with type filter (if schema supports it now)
    try {
      const weeklyTemplates = await prisma.documentCollectionTemplate.findMany({
        where: {
          type: 'weekly-fms-review'
        }
      });
      console.log(`✅ Found ${weeklyTemplates.length} template(s) with type 'weekly-fms-review'`);
    } catch (error) {
      // If type field still doesn't exist in schema, check with raw SQL
      if (error.message.includes('Unknown argument `type`')) {
        const result = await prisma.$queryRaw`
          SELECT COUNT(*) as count
          FROM "DocumentCollectionTemplate"
          WHERE "type" = 'weekly-fms-review'
        `;
        const count = result[0]?.count || 0;
        console.log(`✅ Found ${count} template(s) with type 'weekly-fms-review' (via raw SQL)`);
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('❌ Error fixing template types:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixTemplateTypes();



