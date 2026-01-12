// Browser Test Script for Contacts, Sites, and Opportunities
// Run this in the browser console while viewing a client detail modal
// 
// Instructions:
// 1. Open the application in browser
// 2. Navigate to a client that has contacts, sites, and opportunities in the database
// 3. Open the client detail modal
// 4. Open browser DevTools Console (F12 or Cmd+Option+I)
// 5. Copy and paste this entire script
// 6. Run: testContactsSitesOpportunities()

(async function testContactsSitesOpportunities() {
  console.log('🧪 Testing Contacts, Sites, and Opportunities Display');
  console.log('='.repeat(60));
  
  const token = window.storage?.getToken?.();
  if (!token) {
    console.error('❌ Not logged in. Please log in first.');
    alert('❌ Please log in first');
    return;
  }

  // Get current user info
  try {
    const meRes = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const meData = await meRes.json();
    const userEmail = meData.data?.user?.email || 'Unknown';
    console.log('👤 Current User:', userEmail);
    console.log('');
  } catch (error) {
    console.error('❌ Error getting user info:', error);
  }

  // Test 1: Check if ClientDetailModal is open
  console.log('📋 Test 1: Checking if ClientDetailModal is open...');
  const modal = document.querySelector('[class*="ClientDetailModal"], [class*="client-detail"], [class*="modal"]');
  const hasModal = !!modal;
  console.log(hasModal ? '✅ Modal found' : '⚠️  Modal not found (may need to open a client)');
  console.log('');

  // Test 2: Check API endpoints directly
  console.log('📋 Test 2: Testing API endpoints directly...');
  
  // Find a client ID to test with
  let testClientId = null;
  
  // Try to get client ID from the modal or URL
  const urlMatch = window.location.hash.match(/clients\/([^\/]+)/);
  if (urlMatch) {
    testClientId = urlMatch[1];
  }
  
  // Try to get from window state
  if (!testClientId && window.currentClient) {
    testClientId = window.currentClient.id;
  }
  
  if (!testClientId) {
    console.log('⚠️  No client ID found. Please open a client detail modal first.');
    console.log('   You can also manually set testClientId in the console:');
    console.log('   testClientId = "your-client-id-here"');
    console.log('');
    console.log('📋 Test 3: Manual Check Instructions');
    console.log('   1. Open a client that you know has contacts, sites, and opportunities');
    console.log('   2. Check the Contacts tab - contacts should be visible');
    console.log('   3. Check the Sites tab - sites should be visible');
    console.log('   4. Check the Opportunities tab - opportunities should be visible');
    console.log('   5. Check browser console for any errors');
    return;
  }

  console.log(`📋 Testing with client ID: ${testClientId}`);
  console.log('');

  // Test contacts endpoint
  console.log('📋 Test 2a: Testing Contacts API...');
  try {
    const contactsRes = await fetch(`/api/contacts/client/${testClientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (contactsRes.ok) {
      const contactsData = await contactsRes.json();
      const contacts = contactsData?.data?.contacts || contactsData?.contacts || [];
      console.log(`✅ Contacts API: ${contacts.length} contacts found`);
      if (contacts.length > 0) {
        console.log(`   Sample contact: ${contacts[0].name || 'N/A'} (${contacts[0].email || 'N/A'})`);
      }
    } else {
      console.error(`❌ Contacts API failed: ${contactsRes.status}`);
    }
  } catch (error) {
    console.error('❌ Contacts API error:', error.message);
  }
  console.log('');

  // Test sites endpoint
  console.log('📋 Test 2b: Testing Sites API...');
  try {
    const sitesRes = await fetch(`/api/sites/client/${testClientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (sitesRes.ok) {
      const sitesData = await sitesRes.json();
      const sites = sitesData?.data?.sites || sitesData?.sites || [];
      console.log(`✅ Sites API: ${sites.length} sites found`);
      if (sites.length > 0) {
        console.log(`   Sample site: ${sites[0].name || 'N/A'} (${sites[0].address || 'N/A'})`);
      }
    } else {
      console.error(`❌ Sites API failed: ${sitesRes.status}`);
    }
  } catch (error) {
    console.error('❌ Sites API error:', error.message);
  }
  console.log('');

  // Test opportunities endpoint
  console.log('📋 Test 2c: Testing Opportunities API...');
  try {
    const oppsRes = await fetch(`/api/opportunities?clientId=${testClientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (oppsRes.ok) {
      const oppsData = await oppsRes.json();
      const opportunities = oppsData?.data?.opportunities || oppsData?.opportunities || [];
      console.log(`✅ Opportunities API: ${opportunities.length} opportunities found`);
      if (opportunities.length > 0) {
        console.log(`   Sample opportunity: ${opportunities[0].title || opportunities[0].name || 'N/A'} (${opportunities[0].stage || 'N/A'})`);
      }
    } else {
      console.error(`❌ Opportunities API failed: ${oppsRes.status}`);
    }
  } catch (error) {
    console.error('❌ Opportunities API error:', error.message);
  }
  console.log('');

  // Test 3: Check if data is in formData (if modal is React component)
  console.log('📋 Test 3: Checking React component state...');
  console.log('   (This requires the ClientDetailModal to be open)');
  console.log('');
  
  // Test 4: Check UI elements
  console.log('📋 Test 4: Checking UI elements...');
  
  // Check for contacts tab
  const contactsTab = document.querySelector('[class*="tab"], button[class*="contacts"], [aria-label*="contact" i]');
  const contactsTabBadge = document.querySelector('[class*="badge"], [class*="count"]');
  console.log(contactsTab ? '✅ Contacts tab found' : '⚠️  Contacts tab not found');
  
  // Check for sites tab
  const sitesTab = document.querySelector('button[class*="site" i], [aria-label*="site" i]');
  console.log(sitesTab ? '✅ Sites tab found' : '⚠️  Sites tab not found');
  
  // Check for opportunities tab
  const oppsTab = document.querySelector('button[class*="opportunit" i], [aria-label*="opportunit" i]');
  console.log(oppsTab ? '✅ Opportunities tab found' : '⚠️  Opportunities tab not found');
  console.log('');

  // Test 5: Check console for loading logs
  console.log('📋 Test 5: Checking for loading logs in console...');
  console.log('   Look for these log messages:');
  console.log('   - "📡 Loading contacts from database"');
  console.log('   - "✅ Loaded X contacts from database"');
  console.log('   - "📡 Loading sites from database"');
  console.log('   - "✅ Loaded X sites from database"');
  console.log('   - "📡 Loading opportunities from database"');
  console.log('   - "✅ Loaded X opportunities from database"');
  console.log('');
  console.log('   If you see "⏭️ Skipping loadContactsFromDatabase" messages,');
  console.log('   check if the condition is correct (should only skip if contacts already exist).');
  console.log('');

  // Test 6: Manual verification steps
  console.log('📋 Test 6: Manual Verification Steps');
  console.log('   1. Open a client detail modal');
  console.log('   2. Click on the "Contacts" tab');
  console.log('   3. Verify contacts are displayed (should not be empty if data exists)');
  console.log('   4. Click on the "Sites" tab');
  console.log('   5. Verify sites are displayed (should not be empty if data exists)');
  console.log('   6. Click on the "Opportunities" tab');
  console.log('   7. Verify opportunities are displayed (should not be empty if data exists)');
  console.log('   8. Check the tab badges - they should show the correct count');
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log('✅ API endpoints tested');
  console.log('✅ UI elements checked');
  console.log('');
  console.log('💡 Next Steps:');
  console.log('   1. Open a client that has contacts, sites, and opportunities');
  console.log('   2. Verify they appear in the UI');
  console.log('   3. Check browser console for any errors');
  console.log('   4. If data exists in database but not in UI, check:');
  console.log('      - Browser console for loading errors');
  console.log('      - Network tab for failed API requests');
  console.log('      - React DevTools for component state');
  console.log('');
  
  return {
    testClientId,
    timestamp: new Date().toISOString()
  };
})();

