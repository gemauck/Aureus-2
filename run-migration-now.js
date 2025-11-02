// Auto-run migration via HTTP request to server
import fetch from 'node-fetch';

const ports = [3000, 3001, 8000, 5000, 4000];
const endpoints = [
  '/api/admin-run-migration?key=run-migration-2024',
  '/api/run-location-migration'
];

async function tryMigration() {
  console.log('🔧 Attempting to run migration automatically...\n');
  
  for (const port of ports) {
    for (const endpoint of endpoints) {
      const url = `http://localhost:${port}${endpoint}`;
      console.log(`📡 Trying: ${url}`);
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
        
        const data = await response.json();
        
        if (response.ok) {
          console.log('\n✅✅✅ MIGRATION SUCCESSFUL! ✅✅✅\n');
          console.log('📊 Results:', JSON.stringify(data, null, 2));
          
          if (data.results?.steps) {
            console.log('\n📋 Migration Steps:');
            data.results.steps.forEach(step => {
              const icon = step.status === 'success' ? '✅' : 
                          step.status === 'warning' ? '⚠️' : 
                          step.status === 'already exists' ? 'ℹ️' : '❌';
              console.log(`${icon} Step ${step.step}: ${step.action} - ${step.status}`);
              if (step.assigned) console.log(`   → Assigned ${step.assigned} items`);
            });
          }
          
          console.log('\n📋 Next steps:');
          console.log('   1. Restart your server');
          console.log('   2. Go to Manufacturing → Inventory Tab');
          console.log('   3. Use the location selector dropdown');
          console.log('\n✅ Migration complete!\n');
          process.exit(0);
        } else {
          console.log(`   ❌ Response not OK: ${data.error || data.message}`);
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
          // Server not running on this port - continue
          continue;
        } else {
          console.log(`   ⚠️ Error: ${error.message}`);
        }
      }
    }
  }
  
  console.log('\n❌ Could not connect to server automatically.');
  console.log('\n📋 Please run manually:');
  console.log('   1. Make sure your server is running');
  console.log('   2. Open your app in browser (logged in as admin)');
  console.log('   3. Press F12 → Console');
  console.log('   4. Copy/paste code from ONE-CLICK-MIGRATION.md');
  console.log('   5. Press Enter');
  console.log('\nSee ONE-CLICK-MIGRATION.md for exact code.\n');
  process.exit(1);
}

tryMigration();

