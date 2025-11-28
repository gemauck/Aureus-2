import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

(async () => {
  try {
    // Create Industry table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Industry" (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    // Create indexes
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Industry_name_idx" ON "Industry"(name);
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Industry_isActive_idx" ON "Industry"("isActive");
    `;
    
    console.log('✅ Industry table created successfully');
    
    // Check if table exists and show count
    const count = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "Industry"
    `;
    console.log('📊 Current industries in database:', count[0]?.count || 0);
    
  } catch (error) {
    if (error.message.includes('already exists') || error.code === '42P07') {
      console.log('✅ Industry table already exists');
    } else {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
})();

