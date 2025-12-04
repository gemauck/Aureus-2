// Bulk fix script for all corrupted clients
// Paste this into browser console to fix all clients with 500 errors

(async function fixAllCorruptedClients() {
  const token = window.storage?.getToken?.();
  
  if (!token) {
    console.error('❌ Not logged in. Please log in first.');
    return;
  }

  // Known corrupted clients
  const corruptedClients = [
    { id: 'cmhdajkei000bm8zlnz01j7hb', name: 'Chromex Mining Company (Pty) Ltd' },
    { id: 'cmhdajkcd0001m8zlk72lb2bt', name: 'AccuFarm (Pty) Ltd' }
  ];

  console.log('🚀 Starting bulk fix for corrupted clients...');
  console.log(`Found ${corruptedClients.length} clients to fix\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const results = [];

  for (const client of corruptedClients) {
    console.log(`\n📋 Fixing: ${client.name} (${client.id})`);
    
    try {
      // Run full fix
      const fixResponse = await fetch(`/api/clients/${client.id}/fix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'full-fix' })
      });

      if (!fixResponse.ok) {
        const errorText = await fixResponse.text();
        throw new Error(`Fix failed: ${fixResponse.status} ${fixResponse.statusText}\n${errorText}`);
      }

      const fixResults = await fixResponse.json();
      
      // Verify
      const verifyResponse = await fetch(`/api/clients/${client.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      const success = verifyResponse.ok;
      const result = {
        client: client.name,
        id: client.id,
        success,
        operations: fixResults.operations || []
      };

      results.push(result);

      if (success) {
        console.log(`   ✅ ${client.name}: Fixed and verified`);
      } else {
        console.log(`   ⚠️  ${client.name}: Fix completed but verification failed`);
      }

    } catch (error) {
      console.error(`   ❌ ${client.name}: Fix failed - ${error.message}`);
      results.push({
        client: client.name,
        id: client.id,
        success: false,
        error: error.message
      });
    }

    // Small delay between clients
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📊 Summary:');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(result => {
    console.log(`   ${result.success ? '✅' : '❌'} ${result.client}: ${result.success ? 'Fixed' : result.error || 'Failed'}`);
  });

  console.log(`\n✅ Successfully fixed: ${successful}/${corruptedClients.length}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}/${corruptedClients.length}`);
  }

  if (successful > 0) {
    alert(`✅ Fixed ${successful} client(s)! ${failed > 0 ? `${failed} failed. ` : ''}Please refresh the page.`);
    if (confirm('Refresh page now?')) {
      location.reload();
    }
  } else {
    alert('❌ No clients were fixed. Check console for details.');
  }
})();

