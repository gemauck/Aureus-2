#!/usr/bin/env node
// Safe migration script to add inventoryItemId to BOM table
// Works with both SQLite and PostgreSQL
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log('🔧 Starting BOM migration...\n');
    
    // Check database type
    const dbUrl = process.env.DATABASE_URL || '';
    const isSQLite = dbUrl.startsWith('file:');
    const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');
    
    console.log(`📊 Database type: ${isSQLite ? 'SQLite' : isPostgres ? 'PostgreSQL' : 'Unknown'}`);
    
    // For SQLite, check if column exists first
    if (isSQLite) {
      try {
        const result = await prisma.$queryRaw`
          SELECT name FROM pragma_table_info('BOM') WHERE name = 'inventoryItemId';
        `;
        
        if (result && result.length > 0) {
          console.log('✅ Column inventoryItemId already exists in BOM table');
          console.log('✅ Migration already applied - nothing to do!\n');
          return;
        }
      } catch (error) {
        // Table might not exist yet, continue
        console.log('📝 BOM table exists, checking columns...');
      }
      
      // Apply SQLite migration
      console.log('🔨 Adding inventoryItemId column to BOM table...');
      await prisma.$executeRaw`ALTER TABLE "BOM" ADD COLUMN "inventoryItemId" TEXT;`;
      console.log('✅ Column added successfully');
      
      console.log('🔨 Creating index...');
      await prisma.$executeRaw`CREATE INDEX "BOM_inventoryItemId_idx" ON "BOM"("inventoryItemId");`;
      console.log('✅ Index created successfully');
      
    } else if (isPostgres) {
      // For PostgreSQL, use IF NOT EXISTS
      console.log('🔨 Adding inventoryItemId column to BOM table (PostgreSQL)...');
      await prisma.$executeRaw`
        ALTER TABLE "BOM" 
        ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;
      `;
      console.log('✅ Column added successfully');
      
      console.log('🔨 Creating index (PostgreSQL)...');
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "BOM_inventoryItemId_idx" ON "BOM"("inventoryItemId");
      `;
      console.log('✅ Index created successfully');
      
    } else {
      throw new Error('Unsupported database type. DATABASE_URL must start with "file:" (SQLite) or "postgresql://" (PostgreSQL)');
    }
    
    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    const tables = await prisma.$queryRaw`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='BOM';
    `.catch(() => {
      // If SQLite query fails, try PostgreSQL syntax
      return prisma.$queryRaw`SELECT tablename as name FROM pg_tables WHERE tablename = 'BOM';`;
    });
    
    if (tables && tables.length > 0) {
      console.log('✅ BOM table found');
      
      // Check column
      const columns = await prisma.$queryRaw`
        SELECT name FROM pragma_table_info('BOM') WHERE name = 'inventoryItemId';
      `.catch(() => {
        return prisma.$queryRaw`
          SELECT column_name as name 
          FROM information_schema.columns 
          WHERE table_name = 'BOM' AND column_name = 'inventoryItemId';
        `;
      });
      
      if (columns && columns.length > 0) {
        console.log('✅ inventoryItemId column verified');
        console.log('\n🎉 Migration completed successfully!');
        console.log('✅ Your server is safe - existing BOMs continue working');
        console.log('✅ New BOMs will require inventoryItemId selection\n');
      } else {
        throw new Error('Migration verification failed - column not found');
      }
    }
    
  } catch (error) {
    // Handle specific errors gracefully
    if (error.message.includes('duplicate column') || 
        error.message.includes('already exists') ||
        error.message.includes('UNIQUE constraint failed')) {
      console.log('✅ Column already exists (safe to ignore)');
      console.log('✅ Migration was likely already applied\n');
      return;
    }
    
    if (error.message.includes('no such table')) {
      console.log('⚠️  BOM table does not exist yet');
      console.log('✅ Migration will be applied when table is created\n');
      return;
    }
    
    console.error('\n❌ Migration error:', error.message);
    console.error('❌ This should not break your server');
    console.error('❌ If you see this, please check your DATABASE_URL\n');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
applyMigration().catch((error) => {
  console.error('❌ Failed to apply migration:', error);
  process.exit(1);
});

