// Script to trigger migration via API endpoint
// This requires the server to be running

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function triggerMigration() {
  const API_BASE = process.env.API_BASE || 'http://localhost:3000';
  const token = process.argv[2]; // Get token from command line or use environment
  
  if (!token) {
    console.error('❌ Auth token required');
    console.log('Usage: node trigger-migration.js YOUR_AUTH_TOKEN');
    console.log('Or set AUTH_TOKEN environment variable');
    process.exit(1);
  }

  try {
    console.log('🔧 Triggering migration via API...');
    console.log(`📡 Calling: ${API_BASE}/api/run-location-migration`);
    
    const response = await fetch(`${API_BASE}/api/run-location-migration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Migration completed successfully!');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('❌ Migration failed:', result);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error calling migration API:', error.message);
    console.log('');
    console.log('Make sure:');
    console.log('  1. Server is running');
    console.log('  2. You have a valid auth token');
    console.log('  3. You are logged in as admin');
    process.exit(1);
  }
}

triggerMigration();

