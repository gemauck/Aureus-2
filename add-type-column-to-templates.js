#!/usr/bin/env node

/**
 * Add type column to DocumentCollectionTemplate table
 * 
 * This script adds the missing 'type' column to the DocumentCollectionTemplate table
 * and sets default values for existing templates.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addTypeColumn() {
  try {
    console.log('🔧 Adding type column to DocumentCollectionTemplate table');
    console.log('==========================================================\n');

    // Check if column already exists
    console.log('🔍 Checking if type column exists...');
    
    try {
      const checkResult = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'DocumentCollectionTemplate' 
        AND column_name = 'type'
      `;
      
      if (checkResult && checkResult.length > 0) {
        console.log('✅ Type column already exists!\n');
        
        // Check if any templates need type set
        const templatesWithoutType = await prisma.$queryRaw`
          SELECT id, name 
          FROM "DocumentCollectionTemplate"
          WHERE "type" IS NULL OR "type" = ''
        `;
        
        if (templatesWithoutType && templatesWithoutType.length > 0) {
          console.log(`⚠️  Found ${templatesWithoutType.length} template(s) without type. Setting to 'weekly-fms-review'...\n`);
          
          await prisma.$executeRaw`
            UPDATE "DocumentCollectionTemplate"
            SET "type" = 'weekly-fms-review',
                "updatedAt" = NOW()
            WHERE "type" IS NULL OR "type" = ''
          `;
          
          console.log(`✅ Updated ${templatesWithoutType.length} template(s) with type 'weekly-fms-review'`);
        } else {
          console.log('✅ All templates already have type set.');
        }
        
        return;
      }
    } catch (error) {
      // Column doesn't exist, continue to create it
      if (!error.message.includes('column') && !error.message.includes('does not exist')) {
        throw error;
      }
    }

    console.log('⚠️  Type column does not exist. Creating it...\n');

    // Add the type column with default value
    console.log('📝 Adding type column...');
    await prisma.$executeRaw`
      ALTER TABLE "DocumentCollectionTemplate"
      ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'document-collection'
    `;
    
    console.log('✅ Type column added with default value\n');

    // Update existing templates to have weekly-fms-review type
    console.log('🔄 Setting type for existing templates...');
    
    const updateResult = await prisma.$executeRaw`
      UPDATE "DocumentCollectionTemplate"
      SET "type" = 'weekly-fms-review',
          "updatedAt" = NOW()
      WHERE "type" IS NULL 
         OR "type" = 'document-collection'
         OR "type" = ''
    `;
    
    console.log(`✅ Updated existing templates to have type 'weekly-fms-review'\n`);

    // Verify
    console.log('🔍 Verifying...');
    const countResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "DocumentCollectionTemplate"
      WHERE "type" = 'weekly-fms-review'
    `;
    
    const count = countResult[0]?.count || 0;
    console.log(`✅ Found ${count} template(s) with type 'weekly-fms-review'`);

    console.log('\n✅ Type column added and templates updated successfully!');
    console.log('\n💡 Your templates should now be visible in the Weekly FMS Review Tracker.');

  } catch (error) {
    console.error('❌ Error adding type column:', error);
    console.error('\nError details:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addTypeColumn();







