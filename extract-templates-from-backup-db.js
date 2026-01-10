#!/usr/bin/env node

/**
 * Extract Weekly FMS Review Templates from a Backup Database
 * 
 * This script connects to a backup database (like a Digital Ocean restored backup)
 * and extracts only the Weekly FMS Review templates, then restores them to your
 * current database.
 * 
 * Usage:
 *   node extract-templates-from-backup-db.js <backup-database-url>
 * 
 * Example:
 *   node extract-templates-from-backup-db.js "postgresql://user:pass@backup-db.example.com:25060/defaultdb?sslmode=require"
 * 
 * Or set BACKUP_DATABASE_URL environment variable:
 *   BACKUP_DATABASE_URL="postgresql://..." node extract-templates-from-backup-db.js
 */

import { PrismaClient } from '@prisma/client';

async function extractTemplatesFromBackup(backupDatabaseUrl) {
  // Create a separate Prisma client for the backup database
  const backupPrisma = new PrismaClient({
    datasources: {
      db: {
        url: backupDatabaseUrl
      }
    }
  });

  // Create a client for the current database
  const currentPrisma = new PrismaClient();

  try {
    console.log('🔍 Extracting Weekly FMS Review Templates from Backup Database');
    console.log('=============================================================\n');

    // Test connection to backup database
    console.log('🔌 Connecting to backup database...');
    try {
      await backupPrisma.$connect();
      console.log('✅ Connected to backup database\n');
    } catch (error) {
      console.error('❌ Failed to connect to backup database:', error.message);
      console.error('\nPlease check:');
      console.error('  1. The backup database URL is correct');
      console.error('  2. The backup database is accessible');
      console.error('  3. Your network can reach the backup database');
      process.exit(1);
    }

    // Find templates in backup database
    console.log('🔍 Searching for templates in backup...');
    
    // Try to find templates with type filter first (newer schema)
    let backupTemplates = [];
    let hasTypeField = true;
    
    try {
      backupTemplates = await backupPrisma.documentCollectionTemplate.findMany({
        where: {
          type: 'weekly-fms-review'
        },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      });
    } catch (error) {
      // If type field doesn't exist (older schema), get all templates
      if (error.message.includes('Unknown argument `type`') || error.message.includes('type')) {
        console.log('⚠️  Backup database has older schema (no type field). Getting all templates...');
        hasTypeField = false;
        backupTemplates = await backupPrisma.documentCollectionTemplate.findMany({
          orderBy: [
            { isDefault: 'desc' },
            { createdAt: 'desc' }
          ]
        });
        
        console.log(`✅ Found ${backupTemplates.length} total template(s) in backup database`);
        console.log('   (Backup has older schema - will restore all templates and set type to weekly-fms-review)\n');
      } else {
        throw error;
      }
    }

    if (backupTemplates.length === 0) {
      console.log('❌ No templates found in backup database!');
      await backupPrisma.$disconnect();
      return;
    }

    console.log(`✅ Found ${backupTemplates.length} Weekly FMS Review template(s) in backup:\n`);
    backupTemplates.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name}`);
      console.log(`     ID: ${t.id}`);
      console.log(`     Default: ${t.isDefault ? 'Yes' : 'No'}`);
      console.log(`     Created: ${t.createdAt}`);
      try {
        const sections = typeof t.sections === 'string' ? JSON.parse(t.sections) : t.sections;
        const sectionCount = Array.isArray(sections) ? sections.length : 0;
        console.log(`     Sections: ${sectionCount}`);
      } catch (e) {
        console.log(`     Sections: (parse error)`);
      }
    });

    // Check which templates already exist in current database
    console.log('\n🔍 Checking current database...');
    const existingTemplates = await currentPrisma.documentCollectionTemplate.findMany({
      where: {
        id: { in: backupTemplates.map(t => t.id) }
      },
      select: { id: true, name: true }
    });

    const existingIdSet = new Set(existingTemplates.map(t => t.id));
    const newTemplates = backupTemplates.filter(t => !existingIdSet.has(t.id));
    const existingTemplatesList = backupTemplates.filter(t => existingIdSet.has(t.id));

    if (existingTemplatesList.length > 0) {
      console.log(`\n⚠️  ${existingTemplatesList.length} template(s) already exist in current database:`);
      existingTemplatesList.forEach(t => console.log(`   - ${t.name} (${t.id})`));
      console.log('   These will be skipped.');
    }

    if (newTemplates.length === 0) {
      console.log('\n✅ All templates already exist in current database. Nothing to restore.');
      await backupPrisma.$disconnect();
      await currentPrisma.$disconnect();
      return;
    }

    console.log(`\n📥 Restoring ${newTemplates.length} template(s) to current database...`);

    let restored = 0;
    let errors = 0;

    for (const template of newTemplates) {
      try {
        // Get the type from template if it exists, otherwise default to weekly-fms-review
        const templateType = hasTypeField && template.type 
          ? template.type 
          : 'weekly-fms-review';
        
        await currentPrisma.documentCollectionTemplate.create({
          data: {
            id: template.id,
            name: template.name,
            description: template.description || '',
            sections: template.sections || '[]',
            isDefault: template.isDefault || false,
            type: templateType,
            ownerId: template.ownerId,
            createdBy: template.createdBy || '',
            updatedBy: template.updatedBy || '',
            createdAt: template.createdAt,
            updatedAt: template.updatedAt,
          }
        });
        console.log(`   ✅ Restored: ${template.name}`);
        restored++;
      } catch (error) {
        console.error(`   ❌ Error restoring ${template.name}: ${error.message}`);
        errors++;
      }
    }

    console.log(`\n✅ Restoration complete!`);
    console.log(`   Restored: ${restored}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Skipped (already exist): ${existingTemplatesList.length}`);

    // Verify restoration
    console.log('\n🔍 Verifying restoration...');
    const verifyCount = await currentPrisma.documentCollectionTemplate.count({
      where: { type: 'weekly-fms-review' }
    });
    console.log(`✅ Total Weekly FMS Review templates in current database: ${verifyCount}`);

  } catch (error) {
    console.error('❌ Error extracting templates:', error);
    process.exit(1);
  } finally {
    await backupPrisma.$disconnect();
    await currentPrisma.$disconnect();
  }
}

// Get backup database URL from command line or environment variable
const backupDatabaseUrl = process.argv[2] || process.env.BACKUP_DATABASE_URL;

if (!backupDatabaseUrl) {
  console.error('❌ Error: Backup database URL required');
  console.log('\nUsage:');
  console.log('  node extract-templates-from-backup-db.js <backup-database-url>');
  console.log('\nOr set BACKUP_DATABASE_URL environment variable:');
  console.log('  BACKUP_DATABASE_URL="postgresql://..." node extract-templates-from-backup-db.js');
  console.log('\nExample:');
  console.log('  node extract-templates-from-backup-db.js "postgresql://doadmin:pass@backup-db.example.com:25060/defaultdb?sslmode=require"');
  console.log('\n💡 To get the backup database URL:');
  console.log('  1. Go to Digital Ocean: https://cloud.digitalocean.com/databases');
  console.log('  2. Find your restored backup database');
  console.log('  3. Click "Connection Details" or "Connection String"');
  console.log('  4. Copy the PostgreSQL connection string');
  process.exit(1);
}

extractTemplatesFromBackup(backupDatabaseUrl);

