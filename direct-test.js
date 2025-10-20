// Direct Test Execution Script
console.log('🧪 Running Direct Client Consistency Tests...');

// Test 1: Check localStorage data
console.log('\n📊 Test 1: localStorage Data Check');
const clients = JSON.parse(localStorage.getItem('abcotronics_clients') || '[]');
const leads = JSON.parse(localStorage.getItem('abcotronics_leads') || '[]');

console.log('Clients in localStorage:', clients.length);
console.log('Client names:', clients.map(c => c.name));
console.log('Leads in localStorage:', leads.length);
console.log('Lead names:', leads.map(l => l.name));

// Check for RGN and Exxaro
const rgnInLeads = leads.find(l => l.name === 'RGN');
const exxaroInClients = clients.find(c => c.name === 'Exxaro');

console.log('RGN found in leads:', !!rgnInLeads);
console.log('Exxaro found in clients:', !!exxaroInClients);

// Test 2: Check authentication
console.log('\n🔑 Test 2: Authentication Check');
const token = localStorage.getItem('abcotronics_token');
const user = JSON.parse(localStorage.getItem('abcotronics_user') || 'null');

console.log('Has token:', !!token);
console.log('Has user:', !!user);
console.log('User info:', user);

// Test 3: Check API availability
console.log('\n🌐 Test 3: API Availability Check');
console.log('DatabaseAPI available:', !!window.DatabaseAPI);
console.log('Storage available:', !!window.storage);

// Test 4: Check dashboard components
console.log('\n📊 Test 4: Dashboard Components Check');
console.log('DashboardLive available:', !!window.DashboardLive);
console.log('DashboardDatabaseFirst available:', !!window.DashboardDatabaseFirst);

// Test 5: Run database check if API is available
if (window.DatabaseAPI) {
    console.log('\n🗄️ Test 5: Database Check');
    window.DatabaseAPI.getClients().then(response => {
        const allClients = response?.data?.clients || [];
        console.log('Total clients in database:', allClients.length);
        
        const dbClients = allClients.filter(c => c.type === 'client' || !c.type);
        const dbLeads = allClients.filter(c => c.type === 'lead');
        
        console.log('Database clients:', dbClients.length, dbClients.map(c => c.name));
        console.log('Database leads:', dbLeads.length, dbLeads.map(l => l.name));
        
        const rgnInDB = dbLeads.find(l => l.name === 'RGN');
        const exxaroInDB = dbClients.find(c => c.name === 'Exxaro');
        
        console.log('RGN found in database leads:', !!rgnInDB);
        console.log('Exxaro found in database clients:', !!exxaroInDB);
        
        // Final assessment
        console.log('\n🎯 Final Assessment:');
        const rgnFound = rgnInLeads || rgnInDB;
        const exxaroFound = exxaroInClients || exxaroInDB;
        
        console.log('RGN Lead Status:', rgnFound ? '✅ FOUND' : '❌ MISSING');
        console.log('Exxaro Client Status:', exxaroFound ? '✅ FOUND' : '❌ MISSING');
        
        if (rgnFound && exxaroFound) {
            console.log('🎉 SUCCESS: Both RGN (lead) and Exxaro (client) are properly configured!');
        } else {
            console.log('⚠️ ISSUE: Missing data detected. Database seeding may be needed.');
        }
        
    }).catch(error => {
        console.error('❌ Database API error:', error);
        console.log('⚠️ Cannot verify database state due to API error');
    });
} else {
    console.log('\n⚠️ Test 5: Database Check - API not available');
    console.log('⚠️ Cannot check database state without DatabaseAPI');
}

// Test 6: Check seeding function
console.log('\n🌱 Test 6: Seeding Function Check');
console.log('Seeding function available:', !!window.seedClientsAndLeads);

if (window.seedClientsAndLeads) {
    console.log('✅ Seeding function is available - can run manual seeding if needed');
} else {
    console.log('❌ Seeding function not available - may need to reload page');
}

console.log('\n🏁 Test execution completed!');
