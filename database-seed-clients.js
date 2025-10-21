// Database Seeding Script for Consistent Client/Lead Data
// This ensures all users see the same RGN (lead) and Exxaro (client) data

const seedClientsAndLeads = async () => {
    console.log('🌱 Starting database seeding for consistent client/lead data...');
    
    try {
        // Check if DatabaseAPI is available
        if (!window.DatabaseAPI) {
            console.error('❌ DatabaseAPI not available for seeding');
            return;
        }

        // Get existing clients and leads to check if RGN and Exxaro already exist
        const existingClientsResponse = await window.DatabaseAPI.getClients();
        const existingClients = existingClientsResponse?.data?.clients || [];
        
        const existingLeadsResponse = await window.DatabaseAPI.getLeads();
        const existingLeads = existingLeadsResponse?.data?.leads || [];
        
        console.log('📊 Existing clients in database:', existingClients.length);
        console.log('📊 Existing client names:', existingClients.map(c => c.name));
        console.log('📊 Existing leads in database:', existingLeads.length);
        console.log('📊 Existing lead names:', existingLeads.map(l => l.name));

        // Check if RGN (lead) exists
        const rgnExists = existingLeads.some(l => l.name === 'RGN');
        console.log('🔍 RGN lead exists:', rgnExists);

        // Check if Exxaro (client) exists
        const exxaroExists = existingClients.some(c => c.name === 'Exxaro');
        console.log('🔍 Exxaro client exists:', exxaroExists);

        // Create RGN as a lead if it doesn't exist
        if (!rgnExists) {
            console.log('➕ Creating RGN as a lead...');
            const rgnLead = {
                name: 'RGN',
                industry: 'Mining',
                status: 'New',
                revenue: 0,
                value: 500000, // Potential value for lead
                probability: 25, // 25% probability of conversion
                lastContact: new Date().toISOString().split('T')[0],
                address: 'Mining District, South Africa',
                website: 'https://rgn.co.za',
                notes: 'Potential lead for fuel management services in mining operations',
                contacts: [
                    {
                        id: 'rgn-contact-1',
                        name: 'RGN Operations Manager',
                        role: 'Operations Manager',
                        department: 'Operations',
                        email: 'operations@rgn.co.za',
                        phone: '+27-11-555-0201',
                        isPrimary: true
                    }
                ],
                followUps: [],
                projectIds: [],
                comments: [],
                sites: [],
                contracts: [],
                activityLog: [
                    {
                        id: 'rgn-log-1',
                        type: 'Lead Created',
                        description: 'Initial lead entry for RGN mining operations',
                        timestamp: new Date().toISOString(),
                        user: 'System'
                    }
                ],
                billingTerms: {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: 'Lead - no billing terms yet'
                }
            };

            try {
                const rgnResponse = await window.DatabaseAPI.createLead(rgnLead);
                console.log('✅ RGN lead created successfully:', rgnResponse?.data?.lead?.id);
            } catch (error) {
                console.error('❌ Failed to create RGN lead:', error);
            }
        } else {
            console.log('✅ RGN lead already exists');
        }

        // Create Exxaro as a client if it doesn't exist
        if (!exxaroExists) {
            console.log('➕ Creating Exxaro as a client...');
            const exxaroClient = {
                name: 'Exxaro',
                type: 'client',
                industry: 'Mining',
                status: 'Active',
                revenue: 1575000,
                value: 1575000,
                probability: 100, // 100% probability for existing client
                lastContact: new Date().toISOString().split('T')[0],
                address: 'Mining District, South Africa',
                website: 'https://exxaro.com',
                notes: 'Key mining client - regular fuel audits and optimization services',
                contacts: [
                    {
                        id: 'exxaro-contact-1',
                        name: 'Sarah Johnson',
                        role: 'Finance Manager',
                        department: 'Finance',
                        email: 'sarah.johnson@exxaro.com',
                        phone: '+27-11-555-0102',
                        isPrimary: true
                    }
                ],
                followUps: [],
                projectIds: [],
                comments: [],
                sites: [],
                contracts: [],
                activityLog: [
                    {
                        id: 'exxaro-log-1',
                        type: 'Client Created',
                        description: 'Exxaro added as active mining client',
                        timestamp: new Date().toISOString(),
                        user: 'System'
                    }
                ],
                billingTerms: {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 50000,
                    taxExempt: false,
                    notes: 'Established client with monthly retainer'
                }
            };

            try {
                const exxaroResponse = await window.DatabaseAPI.createClient(exxaroClient);
                console.log('✅ Exxaro client created successfully:', exxaroResponse?.data?.client?.id);
            } catch (error) {
                console.error('❌ Failed to create Exxaro client:', error);
            }
        } else {
            console.log('✅ Exxaro client already exists');
        }

        // Verify the seeding was successful
        console.log('🔍 Verifying seeding results...');
        const finalClientsResponse = await window.DatabaseAPI.getClients();
        const finalClients = finalClientsResponse?.data?.clients || [];
        
        const finalLeadsResponse = await window.DatabaseAPI.getLeads();
        const finalLeads = finalLeadsResponse?.data?.leads || [];
        
        const rgnFinal = finalLeads.find(l => l.name === 'RGN');
        const exxaroFinal = finalClients.find(c => c.name === 'Exxaro');
        
        console.log('📊 Final verification:');
        console.log('  - RGN lead:', rgnFinal ? '✅ Found' : '❌ Missing');
        console.log('  - Exxaro client:', exxaroFinal ? '✅ Found' : '❌ Missing');
        console.log('  - Total clients:', finalClients.length);
        console.log('  - Total leads:', finalLeads.length);

        // Clear localStorage cache to force fresh data load
        try {
            if (window.storage && typeof window.storage.removeClients === 'function') {
                window.storage.removeClients();
                if (typeof window.storage.removeLeads === 'function') {
                    window.storage.removeLeads();
                }
                console.log('🗑️ Cleared localStorage cache to force fresh data load');
            } else {
                console.warn('⚠️ Storage methods not available for cache clearing');
                // Fallback: clear localStorage directly
                localStorage.removeItem('abcotronics_clients');
                localStorage.removeItem('abcotronics_leads');
                console.log('🗑️ Cleared localStorage cache directly');
            }
        } catch (error) {
            console.warn('⚠️ Error clearing cache:', error);
            // Fallback: clear localStorage directly
            try {
                localStorage.removeItem('abcotronics_clients');
                localStorage.removeItem('abcotronics_leads');
                console.log('🗑️ Cleared localStorage cache directly (fallback)');
            } catch (fallbackError) {
                console.warn('⚠️ Fallback cache clearing also failed:', fallbackError);
            }
        }

        console.log('✅ Database seeding completed successfully!');
        return {
            success: true,
            rgnCreated: !rgnExists,
            exxaroCreated: !exxaroExists,
            totalClients: finalClients.length
        };

    } catch (error) {
        console.error('❌ Database seeding failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Make the seeding function available globally
window.seedClientsAndLeads = seedClientsAndLeads;

// Auto-run seeding when the script loads (if user is authenticated)
const runAutoSeeding = () => {
    // DISABLED: Auto-seeding to prevent RGN and Exxaro from being recreated after deletion
    console.log('🚫 Auto-seeding disabled to allow proper deletion of RGN and Exxaro');
    console.log('💡 To manually seed data, run: window.seedClientsAndLeads()');
    return;
    
    if (window.storage?.getToken?.()) {
        console.log('🔑 User is authenticated, running auto-seeding...');
        seedClientsAndLeads().then(result => {
            if (result.success) {
                console.log('🎉 Auto-seeding completed successfully!');
                // Trigger a refresh of the clients data
                if (window.location.hash.includes('clients') || window.location.hash.includes('dashboard')) {
                    console.log('🔄 Refreshing page to show updated data...');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            } else {
                console.error('❌ Auto-seeding failed:', result.error);
            }
        });
    } else {
        console.log('⚠️ User not authenticated, skipping auto-seeding');
    }
};

// Wait for storage to be available before running auto-seeding
if (window.storage && typeof window.storage.getToken === 'function') {
    // Storage is already available
    runAutoSeeding();
} else {
    // Wait for storage to be available
    console.log('⏳ Waiting for storage to be available...');
    const checkStorage = () => {
        if (window.storage && typeof window.storage.getToken === 'function') {
            console.log('✅ Storage is now available, running auto-seeding...');
            runAutoSeeding();
        } else {
            // Check again in 100ms
            setTimeout(checkStorage, 100);
        }
    };
    
    // Start checking after a short delay
    setTimeout(checkStorage, 50);
}

console.log('🌱 Database seeding script loaded successfully');
