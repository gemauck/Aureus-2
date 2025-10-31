#!/usr/bin/env node

/**
 * Purge All Stock Movements - API Method
 * Uses the API endpoint to delete all stock movements
 */

const https = require('https');
const http = require('http');

const API_BASE = process.env.API_BASE || 'https://abcoafrica.co.za';
const API_TOKEN = process.env.API_TOKEN || process.env.DATABASE_TOKEN;

async function purgeStockMovements() {
  try {
    console.log('🗑️  Starting stock movements purge via API...');
    console.log(`📡 API Base: ${API_BASE}`);

    // First, get count of existing movements
    const countUrl = `${API_BASE}/api/manufacturing/stock-movements`;
    console.log(`📊 Fetching current stock movements count...`);
    
    const countResponse = await fetch(countUrl, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN || ''}`,
        'Content-Type': 'application/json'
      }
    });

    if (!countResponse.ok) {
      const errorText = await countResponse.text();
      throw new Error(`Failed to fetch movements: ${countResponse.status} ${errorText}`);
    }

    const countData = await countResponse.json();
    const movements = countData?.data?.movements || [];
    const count = movements.length;

    console.log(`📊 Found ${count} stock movements to delete`);

    if (count === 0) {
      console.log('✅ No stock movements found. Nothing to purge.');
      return;
    }

    // Confirm deletion
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      readline.question(`⚠️  Are you sure you want to delete ALL ${count} stock movements? This cannot be undone! (yes/no): `, resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Purge cancelled.');
      return;
    }

    // Delete all stock movements via bulk delete endpoint
    console.log('🔄 Deleting all stock movements...');
    
    const deleteResponse = await fetch(countUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${API_TOKEN || ''}`,
        'Content-Type': 'application/json'
      }
    });

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      throw new Error(`Failed to delete movements: ${deleteResponse.status} ${errorText}`);
    }

    const result = await deleteResponse.json();
    const deletedCount = result?.count || result?.data?.count || 0;

    console.log(`✅ Successfully deleted ${deletedCount} stock movements`);
    console.log('\n📝 Note: Clear localStorage cache in browser:');
    console.log('   localStorage.removeItem("manufacturing_movements")');
    
  } catch (error) {
    console.error('❌ Error purging stock movements:', error.message);
    
    if (error.message.includes('fetch')) {
      console.error('\n💡 Tip: If running locally, you may need to:');
      console.error('   1. Set API_BASE environment variable');
      console.error('   2. Set API_TOKEN or DATABASE_TOKEN');
      console.error('   3. Or use the Prisma method: node purge-stock-movements.js');
    }
    
    process.exit(1);
  }
}

// Use Node's built-in fetch if available (Node 18+), otherwise use node-fetch
if (typeof fetch === 'undefined') {
  console.error('❌ Node.js 18+ required for fetch API');
  console.error('💡 Alternative: Use node purge-stock-movements.js (Prisma method)');
  process.exit(1);
}

// Run the purge
purgeStockMovements();
