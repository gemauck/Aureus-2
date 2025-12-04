// Browser test script - Paste this into browser console
// Tests if the corrupted clients can now be loaded successfully

(async function testClientFixes() {
  const token = window.storage?.getToken?.();
  
  if (!token) {
    console.error('❌ Not logged in. Please log in first.');
    return;
  }

  const testClients = [
    { id: 'cmhdajkei000bm8zlnz01j7hb', name: 'Chromex Mining Company' },
    { id: 'cmhdajkcd0001m8zlk72lb2bt', name: 'AccuFarm' }
  ];

  console.log('🧪 Testing Client Fixes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = [];

  for (const client of testClients) {
    console.log(`\n📋 Testing: ${client.name} (${client.id})`);
    
    // Test 1: Get client
    try {
      const clientResponse = await fetch(`/api/clients/${client.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (clientResponse.ok) {
        const clientData = await clientResponse.json();
        console.log(`   ✅ GET /api/clients/${client.id}: SUCCESS`);
        console.log(`      Name: ${clientData.data?.client?.name || 'N/A'}`);
        console.log(`      Group Memberships: ${clientData.data?.client?.groupMemberships?.length || 0}`);
        results.push({ client: client.name, test: 'getClient', success: true });
      } else {
        const errorText = await clientResponse.text();
        console.error(`   ❌ GET /api/clients/${client.id}: FAILED (${clientResponse.status})`);
        console.error(`      Error: ${errorText.substring(0, 200)}`);
        results.push({ client: client.name, test: 'getClient', success: false, status: clientResponse.status });
      }
    } catch (error) {
      console.error(`   ❌ GET /api/clients/${client.id}: ERROR - ${error.message}`);
      results.push({ client: client.name, test: 'getClient', success: false, error: error.message });
    }

    // Test 2: Get client groups
    try {
      const groupsResponse = await fetch(`/api/clients/${client.id}/groups`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json();
        console.log(`   ✅ GET /api/clients/${client.id}/groups: SUCCESS`);
        console.log(`      Group Memberships: ${groupsData.data?.groupMemberships?.length || 0}`);
        if (groupsData.data?.warning) {
          console.log(`      ⚠️  Warning: ${groupsData.data.warning}`);
        }
        results.push({ client: client.name, test: 'getGroups', success: true });
      } else {
        const errorText = await groupsResponse.text();
        console.error(`   ❌ GET /api/clients/${client.id}/groups: FAILED (${groupsResponse.status})`);
        console.error(`      Error: ${errorText.substring(0, 200)}`);
        results.push({ client: client.name, test: 'getGroups', success: false, status: groupsResponse.status });
      }
    } catch (error) {
      console.error(`   ❌ GET /api/clients/${client.id}/groups: ERROR - ${error.message}`);
      results.push({ client: client.name, test: 'getGroups', success: false, error: error.message });
    }

    // Test 3: Try to create a site (if client load worked)
    try {
      const siteResponse = await fetch(`/api/sites/client/${client.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          name: 'Test Site (will be deleted)',
          address: 'Test Address'
        })
      });

      if (siteResponse.ok) {
        const siteData = await siteResponse.json();
        console.log(`   ✅ POST /api/sites/client/${client.id}: SUCCESS`);
        console.log(`      Site ID: ${siteData.data?.site?.id || 'N/A'}`);
        results.push({ client: client.name, test: 'createSite', success: true });
        
        // Clean up test site
        if (siteData.data?.site?.id) {
          const siteId = siteData.data.site.id;
          // Note: Site deletion would need the siteId, but we'll skip cleanup for now
          console.log(`      ℹ️  Test site created (not deleted - manual cleanup may be needed)`);
        }
      } else {
        const errorText = await siteResponse.text();
        console.error(`   ❌ POST /api/sites/client/${client.id}: FAILED (${siteResponse.status})`);
        console.error(`      Error: ${errorText.substring(0, 200)}`);
        results.push({ client: client.name, test: 'createSite', success: false, status: siteResponse.status });
      }
    } catch (error) {
      console.error(`   ❌ POST /api/sites/client/${client.id}: ERROR - ${error.message}`);
      results.push({ client: client.name, test: 'createSite', success: false, error: error.message });
    }

    // Small delay between clients
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📊 Test Summary:\n');
  
  const byClient = {};
  results.forEach(r => {
    if (!byClient[r.client]) byClient[r.client] = [];
    byClient[r.client].push(r);
  });

  Object.keys(byClient).forEach(clientName => {
    const tests = byClient[clientName];
    const passed = tests.filter(t => t.success).length;
    const total = tests.length;
    console.log(`${clientName}:`);
    tests.forEach(test => {
      const icon = test.success ? '✅' : '❌';
      console.log(`   ${icon} ${test.test}: ${test.success ? 'PASS' : `FAIL${test.status ? ` (${test.status})` : ''}${test.error ? ` - ${test.error}` : ''}`}`);
    });
    console.log(`   Result: ${passed}/${total} tests passed\n`);
  });

  const allPassed = results.every(r => r.success);
  const allFailed = results.every(r => !r.success);
  
  if (allPassed) {
    console.log('🎉 All tests passed! The fixes are working correctly.');
    alert('✅ All tests passed! The fixes are working correctly.');
  } else if (allFailed) {
    console.log('❌ All tests failed. The fixes may not be working.');
    alert('❌ All tests failed. Check console for details.');
  } else {
    console.log('⚠️  Some tests passed, some failed. Check details above.');
    alert('⚠️  Some tests passed, some failed. Check console for details.');
  }

  return results;
})();

