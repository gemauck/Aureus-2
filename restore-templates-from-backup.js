#!/usr/bin/env node

/**
 * Restore Weekly FMS Review Templates from a Database Backup
 * This script extracts only the templates from a backup SQL file and restores them
 * without affecting the rest of the database.
 * 
 * Usage: node restore-templates-from-backup.js <backup-file>
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { createGunzip } from 'zlib';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

const prisma = new PrismaClient();

async function extractTemplatesFromSQL(sqlContent) {
  const templates = [];
  
  // Find all INSERT statements for DocumentCollectionTemplate
  const insertPattern = /INSERT\s+INTO\s+"?DocumentCollectionTemplate"?\s*\([^)]+\)\s*VALUES\s*\(([^)]+)\)/gi;
  
  let match;
  while ((match = insertPattern.exec(sqlContent)) !== null) {
    try {
      const values = match[1];
      
      // Parse the VALUES clause - this is a simplified parser
      // PostgreSQL format: 'id', 'name', 'description', 'sections', true/false, 'type', 'ownerId', 'createdBy', 'updatedBy', '2024-01-01 00:00:00', '2024-01-01 00:00:00'
      const valuePattern = /'([^']*(?:''[^']*)*)'|(true|false|null|\d+)/g;
      const parsedValues = [];
      let valueMatch;
      
      while ((valueMatch = valuePattern.exec(values)) !== null) {
        let value = valueMatch[1] || valueMatch[2];
        // Unescape single quotes
        if (value) {
          value = value.replace(/''/g, "'");
        }
        parsedValues.push(value);
      }
      
      // Map to template object (adjust indices based on your schema)
      if (parsedValues.length >= 11) {
        const template = {
          id: parsedValues[0],
          name: parsedValues[1],
          description: parsedValues[2] || '',
          sections: parsedValues[3] || '[]',
          isDefault: parsedValues[4] === 'true',
          type: parsedValues[5] || 'document-collection',
          ownerId: parsedValues[6] === 'null' ? null : parsedValues[6],
          createdBy: parsedValues[7] || '',
          updatedBy: parsedValues[8] || '',
          createdAt: parsedValues[9] ? new Date(parsedValues[9]) : new Date(),
          updatedAt: parsedValues[10] ? new Date(parsedValues[10]) : new Date(),
        };
        
        // Only include weekly-fms-review templates
        if (template.type === 'weekly-fms-review') {
          templates.push(template);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Warning: Could not parse template from SQL: ${error.message}`);
    }
  }
  
  return templates;
}

async function readBackupFile(backupPath) {
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  
  if (backupPath.endsWith('.gz')) {
    // Decompress gzipped backup
    const chunks = [];
    const gunzip = createGunzip();
    const fileStream = createReadStream(backupPath);
    
    await pipeline(
      fileStream,
      gunzip,
      async function* (source) {
        for await (const chunk of source) {
          chunks.push(chunk);
        }
      }
    );
    
    return Buffer.concat(chunks).toString('utf8');
  } else {
    // Read plain SQL file
    return readFileSync(backupPath, 'utf8');
  }
}

async function restoreTemplates(backupPath) {
  try {
    console.log('🔍 Restoring Weekly FMS Review Templates from Backup');
    console.log('==================================================\n');
    
    console.log(`📦 Reading backup file: ${backupPath}`);
    const sqlContent = await readBackupFile(backupPath);
    console.log(`✅ Backup file read (${(sqlContent.length / 1024 / 1024).toFixed(2)} MB)\n`);
    
    console.log('🔍 Extracting templates from backup...');
    const templates = await extractTemplatesFromSQL(sqlContent);
    
    if (templates.length === 0) {
      console.log('❌ No Weekly FMS Review templates found in backup!');
      console.log('\nPossible reasons:');
      console.log('  1. Templates were not in the backup');
      console.log('  2. Templates have a different type value');
      console.log('  3. Backup format is different than expected');
      return;
    }
    
    console.log(`✅ Found ${templates.length} Weekly FMS Review template(s) in backup:\n`);
    templates.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name}`);
      console.log(`     ID: ${t.id}`);
      console.log(`     Default: ${t.isDefault ? 'Yes' : 'No'}`);
      console.log(`     Created: ${t.createdAt}`);
    });
    
    console.log('\n⚠️  About to restore templates to database...');
    console.log('   This will:');
    console.log('   - Insert templates that don\'t exist');
    console.log('   - Skip templates that already exist (by ID)');
    
    // Check which templates already exist
    const existingIds = await prisma.documentCollectionTemplate.findMany({
      where: {
        id: { in: templates.map(t => t.id) }
      },
      select: { id: true }
    });
    
    const existingIdSet = new Set(existingIds.map(t => t.id));
    const newTemplates = templates.filter(t => !existingIdSet.has(t.id));
    const existingTemplates = templates.filter(t => existingIdSet.has(t.id));
    
    if (existingTemplates.length > 0) {
      console.log(`\n⚠️  ${existingTemplates.length} template(s) already exist and will be skipped:`);
      existingTemplates.forEach(t => console.log(`   - ${t.name} (${t.id})`));
    }
    
    if (newTemplates.length === 0) {
      console.log('\n✅ All templates already exist in database. Nothing to restore.');
      return;
    }
    
    console.log(`\n📥 Restoring ${newTemplates.length} template(s)...`);
    
    let restored = 0;
    let errors = 0;
    
    for (const template of newTemplates) {
      try {
        await prisma.documentCollectionTemplate.create({
          data: {
            id: template.id,
            name: template.name,
            description: template.description,
            sections: template.sections,
            isDefault: template.isDefault,
            type: template.type,
            ownerId: template.ownerId,
            createdBy: template.createdBy,
            updatedBy: template.updatedBy,
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
    console.log(`   Skipped (already exist): ${existingTemplates.length}`);
    
    // Verify restoration
    console.log('\n🔍 Verifying restoration...');
    const verifyCount = await prisma.documentCollectionTemplate.count({
      where: { type: 'weekly-fms-review' }
    });
    console.log(`✅ Total Weekly FMS Review templates in database: ${verifyCount}`);
    
  } catch (error) {
    console.error('❌ Error restoring templates:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get backup file from command line
const backupPath = process.argv[2];

if (!backupPath) {
  console.error('❌ Error: Backup file path required');
  console.log('\nUsage: node restore-templates-from-backup.js <backup-file>');
  console.log('\nExample:');
  console.log('  node restore-templates-from-backup.js database-backups/backup_20240101_120000.sql.gz');
  console.log('  node restore-templates-from-backup.js database-backups/backup_20240101_120000.sql');
  process.exit(1);
}

restoreTemplates(backupPath);









