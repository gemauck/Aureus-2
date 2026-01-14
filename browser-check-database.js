// Copy and paste this code into your browser console (F12 → Console tab)
// Make sure you're logged into https://abcoafrica.co.za

(async () => {
  console.log('🔍 Checking database for clients and leads...\n');
  
  const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token');
  
  if (!token) {
    console.log('❌ Not logged in! Please log in first.');
    return;
  }
  
  try {
    // Check clients
    console.log('📡 Fetching clients...');
    const clientsRes = await fetch('/api/clients', {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const clientsData = await clientsRes.json();
    const clients = clientsData?.data?.clients || clientsData?.clients || [];
    
    // Check leads
    console.log('📡 Fetching leads...');
    const leadsRes = await fetch('/api/leads', {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const leadsData = await leadsRes.json();
    const leads = leadsData?.data?.leads || leadsData?.leads || [];
    
    // Results
    console.log('\n📊 DATABASE CHECK RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Clients: ${clients.length}`);
    console.log(`Leads:   ${leads.length}`);
    console.log(`Total:   ${clients.length + leads.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (clients.length > 0 || leads.length > 0) {
      console.log('✅ DATABASE HAS DATA!');
      console.log('\n📋 Sample clients:');
      clients.slice(0, 5).forEach(c => {
        console.log(`  - ${c.name || 'Unnamed'} (${c.type || 'client'})`);
      });
      
      if (leads.length > 0) {
        console.log('\n📋 Sample leads:');
        leads.slice(0, 5).forEach(l => {
          console.log(`  - ${l.name || 'Unnamed'} (${l.type || 'lead'})`);
        });
      }
    } else {
      console.log('❌ DATABASE IS EMPTY!');
      console.log('\n💡 This means:');
      console.log('   1. The database you\'re connected to has no data');
      console.log('   2. Your data might be in a DIFFERENT database');
      console.log('   3. Check Digital Ocean for your PRIMARY database');
      console.log('   4. Or restore from a December 9th backup');
    }
    
    // Show current database connection
    const dbUrl = window.location.origin;
    console.log(`\n🌐 Current app: ${dbUrl}`);
    console.log('📊 Database connection: Check .env file for DATABASE_URL');
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
    console.log('\n💡 Try refreshing the page and logging in again.');
  }
})();













