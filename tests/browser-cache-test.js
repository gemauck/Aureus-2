/**
 * Browser Console Test Script
 * 
 * Run this in the browser console on BOTH profiles to compare caching state
 * 
 * Instructions:
 * 1. Open browser console (F12 or Cmd+Option+I)
 * 2. Copy and paste this entire script
 * 3. Run it on both profiles
 * 4. Compare the results
 */

(async function() {
  console.log('🧪 Testing Caching State...\n')
  
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
    const userEmail = meData.data?.user?.email || 'Unknown'
    const userId = meData.data?.user?.id || 'Unknown'
    
    console.log('👤 Current User:', userEmail)
    console.log('   User ID:', userId)
    console.log('\n')
    
    // Test 1: Check localStorage cache
    console.log('='.repeat(60))
    console.log('TEST 1: LocalStorage Cache State')
    console.log('='.repeat(60))
    
    const cachedLeads = window.storage?.getLeads?.() || []
    const cachedClients = window.storage?.getClients?.() || []
    
    console.log(`📊 Cached Leads: ${cachedLeads.length}`)
    console.log(`📊 Cached Clients: ${cachedClients.length}`)
    
    if (cachedLeads.length > 0) {
      console.log(`📋 Cached Lead IDs (first 10):`, cachedLeads.map(l => l.id).slice(0, 10))
      console.log(`📋 Cached Lead Names (first 10):`, cachedLeads.map(l => l.name).slice(0, 10))
    }
    
    if (cachedClients.length > 0) {
      console.log(`📋 Cached Client IDs (first 10):`, cachedClients.map(c => c.id).slice(0, 10))
    }
    
    console.log('\n')
    
    // Test 2: Check ClientCache state
    console.log('='.repeat(60))
    console.log('TEST 2: ClientCache State')
    console.log('='.repeat(60))
    
    if (window.ClientCache) {
      const cacheStatus = window.ClientCache.getCacheStatus()
      console.log('📊 Cache Status:', JSON.stringify(cacheStatus, null, 2))
      
      const cachedLeadsFromCache = window.ClientCache.getLeads()
      const cachedClientsFromCache = window.ClientCache.getClients()
      
      console.log(`📊 ClientCache Leads: ${cachedLeadsFromCache ? cachedLeadsFromCache.length : 'null'}`)
      console.log(`📊 ClientCache Clients: ${cachedClientsFromCache ? cachedClientsFromCache.length : 'null'}`)
    } else {
      console.log('⚠️ ClientCache not available')
    }
    
    console.log('\n')
    
    // Test 3: Check DatabaseAPI cache
    console.log('='.repeat(60))
    console.log('TEST 3: DatabaseAPI Cache State')
    console.log('='.repeat(60))
    
    if (window.DatabaseAPI && window.DatabaseAPI.cache) {
      const cacheSize = window.DatabaseAPI.cache.size
      console.log(`📊 DatabaseAPI Cache Entries: ${cacheSize}`)
      
      if (cacheSize > 0) {
        console.log('📋 Cached Endpoints:')
        for (const [key, value] of window.DatabaseAPI.cache.entries()) {
          const age = Math.round((Date.now() - value.timestamp) / 1000)
          const dataCount = value.data?.data?.leads?.length || value.data?.data?.clients?.length || value.data?.leads?.length || value.data?.clients?.length || 'unknown'
          console.log(`   ${key}: ${age}s old, data count: ${dataCount}`)
        }
      }
    } else {
      console.log('⚠️ DatabaseAPI cache not available')
    }
    
    console.log('\n')
    
    // Test 4: Force clear all caches and fetch fresh data
    console.log('='.repeat(60))
    console.log('TEST 4: Force Clear & Fresh Fetch')
    console.log('='.repeat(60))
    
    // Clear all caches
    console.log('🗑️ Clearing all caches...')
    
    if (window.ClientCache?.clearCache) {
      window.ClientCache.clearCache()
      console.log('   ✅ ClientCache cleared')
    }
    
    if (window.DatabaseAPI?.clearCache) {
      window.DatabaseAPI.clearCache('/leads')
      window.DatabaseAPI.clearCache('/clients')
      console.log('   ✅ DatabaseAPI cache cleared')
    }
    
    if (window.storage?.removeLeads) {
      window.storage.removeLeads()
      console.log('   ✅ localStorage leads cleared')
    }
    
    if (window.storage?.removeClients) {
      window.storage.removeClients()
      console.log('   ✅ localStorage clients cleared')
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Fetch fresh data
    console.log('\n📡 Fetching fresh data from API...')
    
    const leadsRes = await fetch('/api/leads?_t=' + Date.now(), {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache'
      }
    })
    const leadsData = await leadsRes.json()
    const freshLeads = leadsData.leads || leadsData.data?.leads || []
    
    const clientsRes = await fetch('/api/clients?_t=' + Date.now(), {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache'
      }
    })
    const clientsData = await clientsRes.json()
    const freshClients = clientsData.clients || clientsData.data?.clients || []
    
    console.log(`✅ Fresh Leads from API: ${freshLeads.length}`)
    console.log(`✅ Fresh Clients from API: ${freshClients.length}`)
    
    if (freshLeads.length > 0) {
      console.log(`📋 Fresh Lead IDs (first 10):`, freshLeads.map(l => l.id).slice(0, 10))
      console.log(`📋 Fresh Lead Names (first 10):`, freshLeads.map(l => l.name).slice(0, 10))
    }
    
    console.log('\n')
    
    // Test 5: Compare cached vs fresh
    console.log('='.repeat(60))
    console.log('TEST 5: Cache vs Fresh Comparison')
    console.log('='.repeat(60))
    
    const cachedLeadsCount = cachedLeads.length
    const freshLeadsCount = freshLeads.length
    
    console.log(`📊 Leads: Cached=${cachedLeadsCount}, Fresh=${freshLeadsCount}`)
    
    if (cachedLeadsCount !== freshLeadsCount) {
      console.error(`❌ MISMATCH: Cached leads (${cachedLeadsCount}) != Fresh leads (${freshLeadsCount})`)
      console.error(`   This indicates stale cache data!`)
      
      // Find missing leads
      const cachedIds = new Set(cachedLeads.map(l => l.id))
      const freshIds = new Set(freshLeads.map(l => l.id))
      const missing = freshLeads.filter(l => !cachedIds.has(l.id))
      const extra = cachedLeads.filter(l => !freshIds.has(l.id))
      
      if (missing.length > 0) {
        console.error(`   Missing from cache: ${missing.length} leads`)
        missing.slice(0, 5).forEach(l => console.error(`      - ${l.name} (${l.id})`))
      }
      if (extra.length > 0) {
        console.error(`   Extra in cache: ${extra.length} leads`)
        extra.slice(0, 5).forEach(l => console.error(`      - ${l.name} (${l.id})`))
      }
    } else {
      console.log(`✅ Cache matches fresh data`)
    }
    
    console.log('\n')
    console.log('='.repeat(60))
    console.log('✅ TEST COMPLETE')
    console.log('='.repeat(60))
    console.log('\n📋 SUMMARY:')
    console.log(`   User: ${userEmail}`)
    console.log(`   Cached Leads: ${cachedLeadsCount}`)
    console.log(`   Fresh Leads: ${freshLeadsCount}`)
    console.log(`   Status: ${cachedLeadsCount === freshLeadsCount ? '✅ OK' : '❌ STALE CACHE'}`)
    console.log('\n💡 If cache is stale, run this script on the other profile to compare.')
    
})();

