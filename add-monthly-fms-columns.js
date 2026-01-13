import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const prisma = new PrismaClient();

async function addColumns() {
  try {
    console.log('🔄 Adding monthlyFMSReviewSections and hasMonthlyFMSReviewProcess columns...');
    
    // Use raw SQL to add columns
    await prisma.$executeRaw`
      ALTER TABLE "Project" 
      ADD COLUMN IF NOT EXISTS "monthlyFMSReviewSections" TEXT DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "hasMonthlyFMSReviewProcess" BOOLEAN DEFAULT false;
    `;
    
    console.log('✅ Columns added successfully!');
    
    // Verify columns exist
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Project' 
      AND column_name IN ('monthlyFMSReviewSections', 'hasMonthlyFMSReviewProcess')
      ORDER BY column_name;
    `;
    
    console.log('📋 Verification:', result);
    
  } catch (error) {
    console.error('❌ Error adding columns:', error.message);
    if (error.code === 'P2037') {
      console.error('⚠️ Database connection pool exhausted. Please wait and try again.');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addColumns();

