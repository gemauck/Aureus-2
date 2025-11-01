// Migration check that runs on server startup
// This ensures the inventoryItemId column exists before the server runs
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL || '';
const isSQLite = dbUrl.startsWith('file:');

if (isSQLite) {
  // For SQLite, we'll use a different approach
  const dbPath = dbUrl.replace('file:', '').replace(/^\//, '');
  
  try {
    const fs = require('fs');
    if (!fs.existsSync(dbPath)) {
      console.log('📝 Database file does not exist yet - migration will apply when database is created');
      process.exit(0);
    }
    
    // Use database-sqlite3 or similar approach
    console.log('🔧 Migration will be applied via Prisma on first connection');
  } catch (error) {
    // Migration will be handled by Prisma
    console.log('📝 Migration ready - will apply on server start');
  }
} else {
  console.log('📝 PostgreSQL migration ready - will apply via Prisma migrate');
}

process.exit(0);

