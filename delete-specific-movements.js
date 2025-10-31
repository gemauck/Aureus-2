#!/usr/bin/env node

/**
 * Delete Specific Stock Movements by ID
 * Usage: node delete-specific-movements.js id1 id2 id3
 */

const https = require('https');
const http = require('http');

const API_BASE = process.env.API_BASE || 'https://abcoafrica.co.za';
const API_TOKEN = process.env.API_TOKEN || process.env.DATABASE_TOKEN;

async function deleteStockMovement(id) {
  try {
    const url = `${API_BASE}/api/manufacturing/stock-movements/${id}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${API_TOKEN || ''}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete movement ${id}: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return { success: true, id, result };
  } catch (error) {
    return { success: false, id, error: error.message };
  }
}

async function deleteMovements() {
  const movementIds = process.argv.slice(2);
  
  if (movementIds.length === 0) {
    console.log('Usage: node delete-specific-movements.js <id1> <id2> ...');
    console.log('Example: node delete-specific-movements.js cmhekkpro0003rbqgof3r5c4i cmhekkoc50001rbqgfbtjwhp4');
    process.exit(1);
  }

  console.log(`🗑️  Deleting ${movementIds.length} stock movement(s)...`);
  console.log(`📡 API Base: ${API_BASE}`);
  console.log('');

  const results = [];
  
  for (const id of movementIds) {
    console.log(`🔄 Deleting movement: ${id}...`);
    const result = await deleteStockMovement(id);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ Successfully deleted: ${id}`);
    } else {
      console.log(`❌ Failed to delete: ${id} - ${result.error}`);
    }
    console.log('');
  }

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('📊 Summary:');
  console.log(`   ✅ Successfully deleted: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed IDs:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.id}: ${r.error}`);
    });
    process.exit(1);
  }
}

// Use Node's built-in fetch if available (Node 18+), otherwise use node-fetch
if (typeof fetch === 'undefined') {
  console.error('❌ Node.js 18+ required for fetch API');
  console.error('💡 Alternative: Use browser console script');
  process.exit(1);
}

// Run the deletion
deleteMovements().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

