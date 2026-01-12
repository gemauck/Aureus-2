#!/usr/bin/env node

/**
 * Test the templates API endpoint directly
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testTemplatesAPI() {
  try {
    console.log('🧪 Testing Templates API Query');
    console.log('==============================\n');

    // Test the exact query the API uses
    console.log('1. Testing Prisma query with type filter...');
    try {
      const templates = await prisma.documentCollectionTemplate.findMany({
        where: {
          type: 'weekly-fms-review'
        },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      console.log(`✅ Prisma query successful: Found ${templates.length} template(s)\n`);
      
      if (templates.length > 0) {
        templates.forEach((t, i) => {
          console.log(`  ${i + 1}. ${t.name}`);
          console.log(`     ID: ${t.id}`);
          console.log(`     Type: ${t.type}`);
          console.log(`     Default: ${t.isDefault}`);
        });
      } else {
        console.log('⚠️  No templates found with Prisma query');
      }
    } catch (error) {
      console.error('❌ Prisma query failed:', error.message);
      console.log('\n2. Trying raw SQL query instead...\n');
      
      // Fallback to raw SQL
      const rawTemplates = await prisma.$queryRaw`
        SELECT id, name, description, sections, "isDefault", type, "ownerId", "createdBy", "updatedBy", "createdAt", "updatedAt"
        FROM "DocumentCollectionTemplate"
        WHERE type = 'weekly-fms-review'
        ORDER BY "isDefault" DESC, "createdAt" DESC
      `;
      
      console.log(`✅ Raw SQL query successful: Found ${rawTemplates.length} template(s)\n`);
      
      if (rawTemplates.length > 0) {
        rawTemplates.forEach((t, i) => {
          console.log(`  ${i + 1}. ${t.name}`);
          console.log(`     ID: ${t.id}`);
          console.log(`     Type: ${t.type}`);
          console.log(`     Default: ${t.isDefault}`);
        });
      }
    }

    // Also check all templates
    console.log('\n3. Checking all templates in database...');
    const allTemplates = await prisma.documentCollectionTemplate.findMany({
      orderBy: [{ createdAt: 'desc' }]
    });
    
    console.log(`Total templates: ${allTemplates.length}`);
    allTemplates.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (type: ${t.type || 'null'})`);
    });

  } catch (error) {
    console.error('❌ Error testing API:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTemplatesAPI();






