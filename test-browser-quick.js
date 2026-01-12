// Quick Browser Test - Copy and paste this into browser console
// Tests if contacts, sites, and opportunities are loading correctly

(async function quickTest() {
  console.log('🧪 Quick Test: Contacts, Sites, and Opportunities');
  console.log('='.repeat(60));
  
  const token = window.storage?.getToken?.();
  if (!token) {
    console.error('❌ Not logged in. Please log in first.');
    return;
  }

  // Get client ID from URL or prompt
  let clientId = null;
  const urlMatch = window.location.hash.match(/clients\/([^\/]+)/);
  if (urlMatch) {
    clientId = urlMatch[1];
    console.log(`✅ Found client ID from URL: ${clientId}`);
  } else {
    console.log('⚠️  No client ID in URL. Please open a client detail modal first.');
    console.log('   Or manually set: clientId = "your-client-id"');
    return;
  }

  console.log('');
  console.log('📋 Testing API Endpoints...');
  console.log('');

  // Test Contacts
  try {
    const res = await fetch(`/api/contacts/client/${clientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const contacts = data?.data?.contacts || data?.contacts || [];
    console.log(`✅ Contacts API: ${contacts.length} contacts found`);
    if (contacts.length > 0) {
      console.log(`   First contact: ${contacts[0].name || 'N/A'}`);
    }
  } catch (error) {
    console.error('❌ Contacts API error:', error.message);
  }

  // Test Sites
  try {
    const res = await fetch(`/api/sites/client/${clientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const sites = data?.data?.sites || data?.sites || [];
    console.log(`✅ Sites API: ${sites.length} sites found`);
    if (sites.length > 0) {
      console.log(`   First site: ${sites[0].name || 'N/A'}`);
    }
  } catch (error) {
    console.error('❌ Sites API error:', error.message);
  }

  // Test Opportunities
  try {
    const res = await fetch(`/api/opportunities?clientId=${clientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const opportunities = data?.data?.opportunities || data?.opportunities || [];
    console.log(`✅ Opportunities API: ${opportunities.length} opportunities found`);
    if (opportunities.length > 0) {
      console.log(`   First opportunity: ${opportunities[0].title || opportunities[0].name || 'N/A'}`);
    }
  } catch (error) {
    console.error('❌ Opportunities API error:', error.message);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Manual Verification:');
  console.log('   1. Check the Contacts tab - contacts should be visible');
  console.log('   2. Check the Sites tab - sites should be visible');
  console.log('   3. Check the Opportunities tab - opportunities should be visible');
  console.log('   4. Check tab badges - they should show correct counts');
  console.log('');
  console.log('💡 Look for these console messages:');
  console.log('   - "📡 Loading contacts from database"');
  console.log('   - "✅ Loaded X contacts from database"');
  console.log('   - Similar messages for sites and opportunities');
  console.log('');
})();

