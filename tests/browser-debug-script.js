/**
 * Browser Console Debug Script
 * 
 * Run this in the browser console on both profiles to compare what each sees.
 * 
 * Instructions:
 * 1. Open browser console (F12 or Cmd+Option+I)
 * 2. Copy and paste this entire script
 * 3. Run it on both profiles (gemauck@gmail.com and garethm@abcotronics.co.za)
 * 4. Compare the results
 */

(async function() {
  console.log('🔍 Starting Profile Comparison Debug...\n')
  
  const token = window.storage?.getToken?.()
  if (!token) {
    console.error('❌ No authentication token found. Please log in first.')
    return
  }
  
  // Get current user info
  try {
    const meRes = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const meData = await meRes.json()
    console.log('👤 Current User:', meData.data?.user?.email || 'Unknown')
    console.log('   User ID:', meData.data?.user?.id || 'Unknown')
    console.log('\n')
  } catch (e) {
    console.error('❌ Could not get user info:', e)
  }
  
  // Test 1: Get leads from API
  console.log('='.repeat(60))
  console.log('TEST 1: API Leads Response')
  console.log('='.repeat(60))
  
  try {
    const leadsRes = await fetch('/api/leads', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const leadsData = await leadsRes.json()
    const leads = leadsData.leads || leadsData.data?.leads || []
    
    console.log(`📊 Leads Count: ${leads.length}`)
    console.log(`📋 Lead IDs:`, leads.map(l => l.id).slice(0, 20))
    console.log(`📋 Lead Names:`, leads.map(l => l.name).slice(0, 20))
    console.log(`📋 Lead OwnerIds:`, leads.map(l => l.ownerId || 'null').slice(0, 20))
    
    // Check for specific test lead
    const testLead = leads.find(l => l.name && l.name.toLowerCase().includes('test'))
    if (testLead) {
      console.log(`✅ Found test lead:`, testLead)
    } else {
      console.log(`⚠️ No test lead found in results`)
    }
    
    console.log('\n')
  } catch (e) {
    console.error('❌ Failed to get leads:', e)
  }
  
  // Test 2: Get clients from API
  console.log('='.repeat(60))
  console.log('TEST 2: API Clients Response')
  console.log('='.repeat(60))
  
  try {
    const clientsRes = await fetch('/api/clients', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const clientsData = await clientsRes.json()
    const clients = clientsData.clients || clientsData.data?.clients || []
    
    console.log(`📊 Clients Count: ${clients.length}`)
    console.log(`📋 Client IDs:`, clients.map(c => c.id).slice(0, 20))
    console.log(`📋 Client Names:`, clients.map(c => c.name).slice(0, 20))
    console.log(`📋 Client OwnerIds:`, clients.map(c => c.ownerId || 'null').slice(0, 20))
    
    console.log('\n')
  } catch (e) {
    console.error('❌ Failed to get clients:', e)
  }
  
  // Test 3: Get debug endpoint response
  console.log('='.repeat(60))
  console.log('TEST 3: Debug Endpoint Response')
  console.log('='.repeat(60))
  
  try {
    const debugRes = await fetch('/api/debug-leads-clients', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const debugData = await debugRes.json()
    
    console.log('📊 Debug Info:', JSON.stringify(debugData, null, 2))
    console.log('\n')
  } catch (e) {
    console.error('❌ Failed to get debug info:', e)
    console.log('   (This endpoint may not exist yet)')
  }
  
  // Test 4: Check localStorage cache
  console.log('='.repeat(60))
  console.log('TEST 4: LocalStorage Cache')
  console.log('='.repeat(60))
  
  try {
    const cachedLeads = window.storage?.getLeads?.() || []
    const cachedClients = window.storage?.getClients?.() || []
    
    console.log(`📊 Cached Leads: ${cachedLeads.length}`)
    console.log(`📊 Cached Clients: ${cachedClients.length}`)
    console.log(`📋 Cached Lead IDs:`, cachedLeads.map(l => l.id).slice(0, 20))
    console.log(`📋 Cached Client IDs:`, cachedClients.map(c => c.id).slice(0, 20))
    
    console.log('\n')
  } catch (e) {
    console.error('❌ Failed to get cache:', e)
  }
  
  // Test 5: Check component state (if available)
  console.log('='.repeat(60))
  console.log('TEST 5: Component State (if available)')
  console.log('='.repeat(60))
  
  try {
    // Try to find the Clients component in the DOM
    const leadsBadge = document.querySelector('[data-testid="leads-count"], .leads-count, *:contains("Leads")')
    const clientsBadge = document.querySelector('[data-testid="clients-count"], .clients-count, *:contains("Clients")')
    
    console.log('📊 UI Badges:')
    if (leadsBadge) console.log(`   Leads badge text: ${leadsBadge.textContent}`)
    if (clientsBadge) console.log(`   Clients badge text: ${clientsBadge.textContent}`)
    
    console.log('\n')
  } catch (e) {
    console.warn('⚠️ Could not check component state:', e.message)
  }
  
  console.log('='.repeat(60))
  console.log('✅ Debug Complete')
  console.log('='.repeat(60))
  console.log('\n📋 INSTRUCTIONS:')
  console.log('1. Copy the entire output from this console')
  console.log('2. Run the same script on the other profile')
  console.log('3. Compare the results to see what differs')
})();

