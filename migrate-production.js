#!/usr/bin/env node

/**
 * Production Database Migration Script
 * This script adds the 'type' column to the Client table in production
 */

import { PrismaClient } from '@prisma/client';

async function migrateProduction() {
    const prisma = new PrismaClient();
    
    try {
        console.log('🚀 Starting production database migration...');
        
        // Check if type column exists
        const tableInfo = await prisma.$queryRaw`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'Client' AND column_name = 'type'
        `;
        
        if (tableInfo.length === 0) {
            console.log('📝 Adding type column to Client table...');
            
            // Add the type column
            await prisma.$executeRaw`
                ALTER TABLE "Client" ADD COLUMN "type" TEXT DEFAULT 'client'
            `;
            
            console.log('✅ Type column added successfully');
        } else {
            console.log('✅ Type column already exists');
        }
        
        // Update existing records that don't have a type
        console.log('🔄 Updating existing records...');
        const updatedCount = await prisma.$executeRaw`
            UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL
        `;
        
        console.log(`✅ Updated ${updatedCount} records`);
        
        console.log('🎉 Production migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run migration
migrateProduction();
