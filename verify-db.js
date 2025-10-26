// Quick database verification script
// Run with: node verify-db.js

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'prisma', 'dev.db');

try {
  const db = new Database(dbPath, { readonly: true });
  
  console.log('=== DATABASE VERIFICATION ===\n');
  
  // Check schema
  console.log('📋 Client Table Schema:');
  const schema = db.prepare("PRAGMA table_info(Client)").all();
  const stageField = schema.find(col => col.name === 'stage');
  
  if (stageField) {
    console.log('✅ STAGE field exists');
    console.log('   Type:', stageField.type);
    console.log('   Default:', stageField.dflt_value);
  } else {
    console.log('❌ STAGE field MISSING!');
    console.log('\nRun: npx prisma migrate dev');
    process.exit(1);
  }
  
  // Check data
  console.log('\n📊 Data Counts:');
  const counts = db.prepare(`
    SELECT 
      SUM(CASE WHEN type = 'client' THEN 1 ELSE 0 END) as clients,
      SUM(CASE WHEN type = 'lead' THEN 1 ELSE 0 END) as leads,
      SUM(CASE WHEN type = 'lead' AND (stage IS NULL OR stage = '') THEN 1 ELSE 0 END) as leads_no_stage
    FROM Client
  `).get();
  
  console.log('   Clients:', counts.clients);
  console.log('   Leads:', counts.leads);
  console.log('   Leads without stage:', counts.leads_no_stage);
  
  if (counts.leads_no_stage > 0) {
    console.log('\n⚠️  WARNING: Some leads have NULL/empty stage');
    console.log('   Run: sqlite3 prisma/dev.db < ensure-stage-field.sql');
  }
  
  // Show recent leads
  if (counts.leads > 0) {
    console.log('\n📋 Recent Leads (last 5):');
    const recentLeads = db.prepare(`
      SELECT id, name, status, stage, datetime(updatedAt) as updated
      FROM Client 
      WHERE type = 'lead'
      ORDER BY updatedAt DESC
      LIMIT 5
    `).all();
    
    recentLeads.forEach(lead => {
      console.log(`   • ${lead.name}`);
      console.log(`     Status: ${lead.status} | Stage: ${lead.stage || 'NULL'}`);
      console.log(`     Updated: ${lead.updated}`);
    });
  }
  
  // Show stage distribution
  if (counts.leads > 0) {
    console.log('\n📊 Leads by Stage:');
    const stageDistribution = db.prepare(`
      SELECT stage, COUNT(*) as count
      FROM Client
      WHERE type = 'lead'
      GROUP BY stage
      ORDER BY count DESC
    `).all();
    
    stageDistribution.forEach(row => {
      console.log(`   ${row.stage || 'NULL'}: ${row.count}`);
    });
  }
  
  console.log('\n✅ Verification complete!');
  db.close();
  
} catch (error) {
  console.error('❌ Error:', error.message);
  
  if (error.message.includes('does not exist')) {
    console.log('\n💡 Database not found. Create it with:');
    console.log('   npx prisma migrate dev');
  }
  
  process.exit(1);
}
