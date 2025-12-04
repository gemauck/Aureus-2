// Comprehensive browser test - Paste this into browser console
// Tests if the corrupted clients can now be loaded successfully

(async function testClientFixes() {
  const token = window.storage?.getToken?.();
  
  if (!token) {
    console.error('❌ Not logged in. Please log in first.');
    alert('❌ Please log in first');
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
      const startTime = performance.now();
      const clientResponse = await fetch(`/api/clients/${client.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      if (clientResponse.ok) {
        const clientData = await clientResponse.json();
        console.log(`   ✅ GET /api/clients/${client.id}: SUCCESS (${duration}ms)`);
        console.log(`      Name: ${clientData.data?.client?.name || 'N/A'}`);
        console.log(`      Type: ${clientData.data?.client?.type || 'N/A'}`);
        console.log(`      Status: ${clientData.data?.client?.status || 'N/A'}`);
        console.log(`      Group Memberships: ${clientData.data?.client?.groupMemberships?.length || 0}`);
        results.push({ client: client.name, test: 'getClient', success: true, duration });
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
      const startTime = performance.now();
      const groupsResponse = await fetch(`/api/clients/${client.id}/groups`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json();
        console.log(`   ✅ GET /api/clients/${client.id}/groups: SUCCESS (${duration}ms)`);
        console.log(`      Group Memberships: ${groupsData.data?.groupMemberships?.length || 0}`);
        if (groupsData.data?.warning) {
          console.log(`      ⚠️  Warning: ${groupsData.data.warning}`);
        }
        if (groupsData.data?.cleanedUp) {
          console.log(`      🧹 Cleaned up: ${groupsData.data.cleanedUp} orphaned memberships`);
        }
        results.push({ client: client.name, test: 'getGroups', success: true, duration });
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

    // Test 3: Try to get sites (if client load worked)
    try {
      const startTime = performance.now();
      const sitesResponse = await fetch(`/api/sites/client/${client.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      if (sitesResponse.ok) {
        const sitesData = await sitesResponse.json();
        console.log(`   ✅ GET /api/sites/client/${client.id}: SUCCESS (${duration}ms)`);
        console.log(`      Sites: ${sitesData.data?.sites?.length || 0}`);
        results.push({ client: client.name, test: 'getSites', success: true, duration });
      } else {
        const errorText = await sitesResponse.text();
        console.error(`   ❌ GET /api/sites/client/${client.id}: FAILED (${sitesResponse.status})`);
        console.error(`      Error: ${errorText.substring(0, 200)}`);
        results.push({ client: client.name, test: 'getSites', success: false, status: sitesResponse.status });
      }
    } catch (error) {
      console.error(`   ❌ GET /api/sites/client/${client.id}: ERROR - ${error.message}`);
      results.push({ client: client.name, test: 'getSites', success: false, error: error.message });
    }

    // Small delay between clients
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📊 Test Summary:\n');
  
  const byClient = {};
  results.forEach(r => {
    if (!byClient[r.client]) byClient[r.client] = [];
    byClient[r.client].push(r);
  });

  let allPassed = true;
  Object.keys(byClient).forEach(clientName => {
    const tests = byClient[clientName];
    const passed = tests.filter(t => t.success).length;
    const total = tests.length;
    const avgDuration = Math.round(tests.filter(t => t.duration).reduce((sum, t) => sum + t.duration, 0) / tests.filter(t => t.duration).length) || 0;
    
    console.log(`${clientName}:`);
    tests.forEach(test => {
      const icon = test.success ? '✅' : '❌';
      const duration = test.duration ? ` (${test.duration}ms)` : '';
      console.log(`   ${icon} ${test.test}: ${test.success ? 'PASS' : `FAIL${test.status ? ` (${test.status})` : ''}${test.error ? ` - ${test.error}` : ''}`}${duration}`);
      if (!test.success) allPassed = false;
    });
    console.log(`   Result: ${passed}/${total} tests passed${avgDuration > 0 ? ` (avg ${avgDuration}ms)` : ''}\n`);
  });

  const totalPassed = results.filter(r => r.success).length;
  const totalTests = results.length;
  
  console.log(`\n🎯 Overall: ${totalPassed}/${totalTests} tests passed`);
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! The fixes are working correctly.');
    alert('✅ All tests passed! The fixes are working correctly.');
  } else {
    console.log('\n❌ Some tests failed. The fixes may need adjustment.');
    alert(`⚠️ ${totalPassed}/${totalTests} tests passed. Check console for details.`);
  }

  return results;
})();

