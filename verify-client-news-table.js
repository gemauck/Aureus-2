// Verify ClientNews table exists
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function verify() {
  try {
    // Try to query the ClientNews table using raw SQL
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count 
      FROM "ClientNews"
    `;
    
    const count = result[0]?.count || 0;
    console.log('✅ ClientNews table exists!');
    console.log(`📊 Total articles: ${count}`);
    
    // Get table structure
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ClientNews'
      ORDER BY ordinal_position
    `;
    
    console.log('\n📋 Table structure:');
    columns.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    if (error.code === '42P01') {
      console.error('❌ ClientNews table does not exist');
      console.error('   Error:', error.message);
    } else {
      console.error('❌ Error verifying table:', error.message);
      console.error('   Code:', error.code);
    }
    await prisma.$disconnect();
    process.exit(1);
  }
}

verify();

