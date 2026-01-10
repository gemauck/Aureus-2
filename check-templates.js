#!/usr/bin/env node

/**
 * Diagnostic script to check Weekly FMS Review Templates in the database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTemplates() {
  try {
    console.log('🔍 Checking Weekly FMS Review Templates...\n');

    // Check all templates
    const allTemplates = await prisma.documentCollectionTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    });

    console.log(`📊 Total templates in database: ${allTemplates.length}\n`);

    if (allTemplates.length > 0) {
      console.log('All templates by type:');
      const byType = allTemplates.reduce((acc, t) => {
        const type = t.type || 'undefined';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count} template(s)`);
      });
      console.log('');
    }

    // Check weekly-fms-review templates specifically
    let weeklyTemplates = [];
    try {
      weeklyTemplates = await prisma.documentCollectionTemplate.findMany({
        where: {
          type: 'weekly-fms-review'
        },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      });
    } catch (error) {
      // If type field doesn't exist, get all templates
      if (error.message.includes('Unknown argument `type`') || error.message.includes('type')) {
        console.log('⚠️  Database schema missing type field. Getting all templates...\n');
        weeklyTemplates = await prisma.documentCollectionTemplate.findMany({
          orderBy: [
            { isDefault: 'desc' },
            { createdAt: 'desc' }
          ]
        });
      } else {
        throw error;
      }
    }

    console.log(`📋 Weekly FMS Review Templates: ${weeklyTemplates.length}\n`);

    if (weeklyTemplates.length > 0) {
      console.log('Weekly FMS Review Templates:');
      weeklyTemplates.forEach((template, index) => {
        console.log(`\n${index + 1}. ${template.name}`);
        console.log(`   ID: ${template.id}`);
        console.log(`   Type: ${template.type}`);
        console.log(`   Default: ${template.isDefault ? 'Yes' : 'No'}`);
        console.log(`   Created: ${template.createdAt}`);
        console.log(`   Updated: ${template.updatedAt}`);
        console.log(`   Owner: ${template.ownerId || 'N/A'}`);
        console.log(`   Description: ${template.description || 'N/A'}`);
        
        // Try to parse sections
        try {
          const sections = typeof template.sections === 'string' 
            ? JSON.parse(template.sections) 
            : template.sections;
          const sectionCount = Array.isArray(sections) ? sections.length : 0;
          console.log(`   Sections: ${sectionCount} section(s)`);
        } catch (e) {
          console.log(`   Sections: Error parsing - ${e.message}`);
        }
      });
    } else {
      console.log('❌ No Weekly FMS Review templates found!');
      console.log('\nPossible reasons:');
      console.log('  1. Templates were never created');
      console.log('  2. Templates were deleted (check if purge-document-collection.js was run)');
      console.log('  3. Templates have a different type value');
      
      if (allTemplates.length > 0) {
        console.log('\n⚠️  Found other templates with different types:');
        allTemplates.forEach(t => {
          console.log(`   - "${t.name}" (type: ${t.type || 'undefined'})`);
        });
        console.log('\n💡 If your templates are listed above, they may have the wrong type.');
        console.log('   They should have type: "weekly-fms-review"');
      }
    }

    // Check for templates with no type or wrong type
    const templatesWithoutType = allTemplates.filter(t => !t.type || t.type === 'document-collection');
    if (templatesWithoutType.length > 0 && weeklyTemplates.length === 0) {
      console.log('\n⚠️  Found templates that might be Weekly FMS Review templates:');
      templatesWithoutType.forEach(t => {
        console.log(`   - "${t.name}" (type: ${t.type || 'undefined'}, created: ${t.createdAt})`);
      });
      console.log('\n💡 These templates might need their type updated to "weekly-fms-review"');
    }

  } catch (error) {
    console.error('❌ Error checking templates:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkTemplates();
