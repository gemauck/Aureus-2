// Quick Functionality Check Script
// Run this in the browser console to check system functionality

console.log('🔧 Starting ERP System Functionality Check...');

const checkSystemFunctionality = async () => {
    const results = {
        authentication: false,
        clients: false,
        leads: false,
        projects: false,
        invoices: false,
        timeEntries: false,
        userManagement: false,
        databaseAPI: false
    };

    try {
        // Check if auth storage is available
        if (window.storage && typeof window.storage.getToken === 'function') {
            results.authentication = true;
            console.log('✅ Authentication system available');
        } else {
            console.log('❌ Authentication system not available');
        }

        // Check if DatabaseAPI is available
        if (window.DatabaseAPI && typeof window.DatabaseAPI.getClients === 'function') {
            results.databaseAPI = true;
            console.log('✅ DatabaseAPI available');
        } else {
            console.log('❌ DatabaseAPI not available');
        }

        // Check if database-first components are available
        if (window.ClientsDatabaseFirst) {
            results.clients = true;
            console.log('✅ ClientsDatabaseFirst component available');
        } else {
            console.log('❌ ClientsDatabaseFirst component not available');
        }

        if (window.ProjectsDatabaseFirst) {
            results.projects = true;
            console.log('✅ ProjectsDatabaseFirst component available');
        } else {
            console.log('❌ ProjectsDatabaseFirst component not available');
        }

        if (window.InvoicingDatabaseFirst) {
            results.invoices = true;
            console.log('✅ InvoicingDatabaseFirst component available');
        } else {
            console.log('❌ InvoicingDatabaseFirst component not available');
        }

        if (window.TimeTrackingDatabaseFirst) {
            results.timeEntries = true;
            console.log('✅ TimeTrackingDatabaseFirst component available');
        } else {
            console.log('❌ TimeTrackingDatabaseFirst component not available');
        }

        // Test API endpoints
        console.log('🌐 Testing API endpoints...');
        
        try {
            const loginResponse = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@abcotronics.com', password: 'admin123' })
            });
            
            if (loginResponse.ok) {
                console.log('✅ Login endpoint working');
                const loginData = await loginResponse.json();
                localStorage.setItem('abcotronics_auth_token', loginData.accessToken);
                
                // Test other endpoints
                const endpoints = [
                    { name: 'Clients', url: '/api/clients' },
                    { name: 'Leads', url: '/api/leads' },
                    { name: 'Projects', url: '/api/projects' },
                    { name: 'Invoices', url: '/api/invoices' },
                    { name: 'Time Entries', url: '/api/time-entries' },
                    { name: 'Users', url: '/api/users' },
                    { name: 'Health', url: '/api/health' }
                ];

                for (const endpoint of endpoints) {
                    try {
                        const response = await fetch(endpoint.url, {
                            headers: { 'Authorization': `Bearer ${loginData.accessToken}` }
                        });
                        
                        if (response.ok) {
                            console.log(`✅ ${endpoint.name} endpoint working`);
                        } else {
                            console.log(`❌ ${endpoint.name} endpoint failed: ${response.status}`);
                        }
                    } catch (error) {
                        console.log(`❌ ${endpoint.name} endpoint error:`, error.message);
                    }
                }
            } else {
                console.log('❌ Login endpoint failed');
            }
        } catch (error) {
            console.log('❌ API test error:', error.message);
        }

        // Summary
        console.log('\n📊 Functionality Check Summary:');
        console.log('================================');
        Object.entries(results).forEach(([key, value]) => {
            console.log(`${value ? '✅' : '❌'} ${key}: ${value ? 'Available' : 'Not Available'}`);
        });

        const availableCount = Object.values(results).filter(v => v).length;
        const totalCount = Object.keys(results).length;
        const successRate = Math.round((availableCount / totalCount) * 100);

        console.log(`\n🎯 Overall Status: ${availableCount}/${totalCount} components available (${successRate}%)`);

        if (successRate >= 80) {
            console.log('🎉 System is functioning well!');
        } else if (successRate >= 60) {
            console.log('⚠️ System has some issues but is mostly functional');
        } else {
            console.log('❌ System has significant issues that need attention');
        }

        return results;

    } catch (error) {
        console.error('❌ Functionality check failed:', error);
        return results;
    }
};

// Run the check
checkSystemFunctionality();

console.log('🔧 Functionality check complete. Check the results above.');
