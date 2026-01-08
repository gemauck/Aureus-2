// Simple script to check database counts
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function checkDatabase() {
  try {
    console.log('🔍 Checking database...\n');
    console.log('Database:', process.env.DATABASE_URL?.match(/@([^:]+):/)?.[1] || 'unknown');
    console.log('');
    
    // Quick count queries
    const [clients, leads, groups, total] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) as count FROM "Client" WHERE type = 'client' OR type IS NULL`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM "Client" WHERE type = 'lead'`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM "Client" WHERE type = 'group'`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM "Client"`
    ]);
    
    const clientsCount = Number(clients[0]?.count || 0);
    const leadsCount = Number(leads[0]?.count || 0);
    const groupsCount = Number(groups[0]?.count || 0);
    const totalCount = Number(total[0]?.count || 0);
    
    console.log('📊 Database Counts:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Clients: ${clientsCount}`);
    console.log(`Leads:   ${leadsCount}`);
    console.log(`Groups:  ${groupsCount}`);
    console.log(`Total:   ${totalCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (totalCount > 0) {
      console.log('✅ Database HAS DATA!');
      console.log('\n📋 Recent items (if any):');
      
      const recent = await prisma.$queryRaw`
        SELECT id, name, type, "createdAt" 
        FROM "Client" 
        ORDER BY "createdAt" DESC 
        LIMIT 5
      `;
      
      recent.forEach(item => {
        const date = new Date(item.createdAt).toLocaleDateString();
        console.log(`  - ${item.name || 'Unnamed'} (${item.type || 'client'}) - ${date}`);
      });
    } else {
      console.log('❌ Database is EMPTY - No clients, leads, or groups found!');
      console.log('\n💡 This database appears to be empty.');
      console.log('🔍 Your data might be in a different database cluster.');
    }
    
  } catch (error) {
    if (error.message.includes('connection slots')) {
      console.log('❌ Database connection limit reached.');
      console.log('💡 Too many connections are open to the database.');
      console.log('\n📋 Try checking via:');
      console.log('   - Your web application: https://abcoafrica.co.za/clients');
      console.log('   - Digital Ocean console');
      console.log('   - Wait a few minutes and try again');
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

checkDatabase();


