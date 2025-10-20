// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage || {};
const ClientDetailModal = window.ClientDetailModal;
const LeadDetailModal = window.LeadDetailModal;

// Safe storage helper functions
const safeStorage = {
    getClients: () => storage.getClients ? safeStorage.getClients() : null,
    setClients: (data) => storage.setClients ? safeStorage.setClients(data) : null,
    getLeads: () => storage.getLeads ? safeStorage.getLeads() : null,
    setLeads: (data) => storage.setLeads ? safeStorage.setLeads(data) : null,
    getProjects: () => storage.getProjects ? safeStorage.getProjects() : null,
    setProjects: (data) => storage.setProjects ? safeStorage.setProjects(data) : null,
};

// Initial data with opportunities
const initialClients = [
    { 
        id: 1, 
        name: 'ABC Corporation', 
        industry: 'Mining', 
        status: 'Active',
        type: 'client',
        revenue: 2250000,
        lastContact: '2024-03-08',
        address: '123 Business St, New York, NY',
        website: 'https://abc-corp.com',
        notes: 'Key client, priority support',
        contacts: [
            {
                id: 1,
                name: 'John Smith',
                role: 'Operations Director',
                department: 'Operations',
                email: 'john@abc.com',
                phone: '555-0101',
                isPrimary: true
            }
        ],
        followUps: [],
        projectIds: [],
        comments: [],
        sites: [],
        opportunities: [],
        activityLog: []
    },
    { 
        id: 2, 
        name: 'Exxaro', 
        industry: 'Mining', 
        status: 'Active',
        type: 'client',
        revenue: 1575000,
        lastContact: '2024-03-05',
        address: '456 Industry Ave, Chicago, IL',
        website: 'https://exxaro.com',
        notes: 'Key mining client - regular fuel audits and optimization services',
        contacts: [
            {
                id: 2,
                name: 'Sarah Johnson',
                role: 'Finance Manager',
                department: 'Finance',
                email: 'sarah@exxaro.com',
                phone: '555-0102',
                isPrimary: true
            }
        ],
        followUps: [],
        projectIds: [],
        comments: [],
        sites: [],
        opportunities: [],
        activityLog: []
    },
    { 
        id: 3, 
        name: 'XYZ Industries', 
        industry: 'Agriculture', 
        status: 'Active',
        type: 'client',
        revenue: 1575000,
        lastContact: '2024-03-05',
        address: '456 Industry Ave, Chicago, IL',
        website: 'https://xyz-industries.com',
        notes: 'Regular audits quarterly',
        contacts: [
            {
                id: 3,
                name: 'Sarah Johnson',
                role: 'Finance Manager',
                department: 'Finance',
                email: 'sarah@xyz.com',
                phone: '555-0102',
                isPrimary: true
            }
        ],
        followUps: [],
        projectIds: [],
        comments: [],
        sites: [],
        opportunities: [],
        activityLog: []
    }
];

const initialLeads = [
    {
        id: 101,
        name: 'RGN',
        industry: 'Mining',
        status: 'Potential',
        source: 'Website',
        stage: 'Awareness',
        notes: 'Potential lead for fuel management services in mining operations',
        contacts: [
            {
                id: 101,
                name: 'RGN Contact',
                role: 'Operations Manager',
                department: 'Operations',
                email: 'contact@rgn.co.za',
                phone: '011-555-0201',
                isPrimary: true
            }
        ],
        followUps: [],
        projectIds: [],
        comments: [],
        activityLog: [],
        firstContactDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 5 days ago
    },
    {
        id: 102,
        name: 'Green Fleet Solutions',
        industry: 'Forestry',
        status: 'Potential',
        source: 'Website',
        stage: 'Awareness',
        notes: 'Inquiry about fuel monitoring systems for 50 vehicle fleet',
        contacts: [
            {
                id: 102,
                name: 'Michael Chen',
                role: 'Fleet Operations Manager',
                department: 'Operations',
                email: 'michael@greenfleet.co.za',
                phone: '011-555-0202',
                isPrimary: true
            }
        ],
        followUps: [],
        projectIds: [],
        comments: [],
        activityLog: [],
        firstContactDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 5 days ago
    },
    {
        id: 102,
        name: 'TransLogix SA',
        industry: 'Agriculture',
        status: 'Active',
        source: 'Referral',
        stage: 'Interest',
        notes: 'Interested in GPS tracking and fuel telemetry for their logistics division',
        contacts: [
            {
                id: 102,
                name: 'Nomsa Dlamini',
                role: 'Technology Director',
                department: 'IT',
                email: 'nomsa.dlamini@translogix.co.za',
                phone: '021-555-0302',
                isPrimary: true
            }
        ],
        followUps: [
            {
                id: 1001,
                date: '2024-03-15',
                time: '10:00',
                type: 'Demo',
                description: 'Product demonstration for management team',
                completed: false,
                createdAt: new Date().toISOString()
            }
        ],
        projectIds: [],
        comments: [],
        activityLog: [],
        firstContactDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 14 days ago
    },
    {
        id: 103,
        name: 'Coastal Mining Corp',
        industry: 'Mining',
        status: 'Active',
        source: 'Trade Show',
        stage: 'Desire',
        notes: 'Ready to move forward with implementation. Requires 100+ units',
        contacts: [
            {
                id: 103,
                name: 'David van der Merwe',
                role: 'Procurement Manager',
                department: 'Procurement',
                email: 'dvdmerwe@coastalmining.co.za',
                phone: '031-555-0403',
                isPrimary: true
            }
        ],
        followUps: [
            {
                id: 1002,
                date: '2024-03-12',
                time: '14:30',
                type: 'Proposal Review',
                description: 'Final proposal presentation to board',
                completed: false,
                createdAt: new Date().toISOString()
            }
        ],
        projectIds: [],
        comments: [
            {
                id: 2001,
                text: 'Received positive feedback on technical specifications',
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                createdBy: 'Gareth Mauck'
            }
        ],
        activityLog: []
    },
    {
        id: 104,
        name: 'Express Couriers Ltd',
        industry: 'Other',
        status: 'Active',
        source: 'LinkedIn',
        stage: 'Action',
        notes: 'Contract negotiations in final stage. Ready to sign this week',
        contacts: [
            {
                id: 104,
                name: 'Sarah Mthembu',
                role: 'COO',
                department: 'Executive',
                email: 'sarah@expresscouriers.co.za',
                phone: '011-555-0504',
                isPrimary: true
            }
        ],
        followUps: [
            {
                id: 1003,
                date: '2024-03-11',
                time: '09:00',
                type: 'Meeting',
                description: 'Contract signing and project kickoff',
                completed: false,
                createdAt: new Date().toISOString()
            }
        ],
        projectIds: [],
        comments: [
            {
                id: 2002,
                text: 'Legal team approved contract terms',
                createdAt: new Date(Date.now() - 172800000).toISOString(),
                createdBy: 'David Buttemer'
            }
        ],
        activityLog: [],
        firstContactDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 days ago
    }
];

const Clients = () => {
    const [viewMode, setViewMode] = useState('clients');
    const [clients, setClients] = useState([]);

    // Utility function to calculate time since first contact
    const getTimeSinceFirstContact = (firstContactDate) => {
        if (!firstContactDate) return 'Not set';
        
        const firstContact = new Date(firstContactDate);
        const now = new Date();
        const diffTime = Math.abs(now - firstContact);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
        return `${Math.ceil(diffDays / 365)} years ago`;
    };
    const [leads, setLeads] = useState([]);
    const [projects, setProjects] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedLead, setSelectedLead] = useState(null);
    const [currentTab, setCurrentTab] = useState('overview');
    const [currentLeadTab, setCurrentLeadTab] = useState('overview');
    // Removed isEditing state - always allow editing
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('All Industries');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [refreshKey, setRefreshKey] = useState(0);
    const [sortField, setSortField] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const { isDark } = window.useTheme();
    
    // Add comprehensive state tracking
    useEffect(() => {
        console.log('🔄 Clients state changed:', {
            count: clients.length,
            clients: clients.map(c => ({ id: c.id, name: c.name }))
        });
    }, [clients]);
    
    // Track localStorage changes
    useEffect(() => {
        const savedClients = safeStorage.getClients();
        console.log('💾 localStorage clients:', savedClients ? savedClients.length : 'none');
    }, [refreshKey]);
    
    // Load clients and leads from API immediately on mount
    useEffect(() => {
        loadClients();
        loadLeads();
    }, []);

    // Live sync: subscribe to real-time updates so clients stay fresh without manual refresh
    useEffect(() => {
        const mapDbClient = (c) => ({
            id: c.id,
            name: c.name,
            status: c.status === 'active' ? 'Active' : (c.status || 'Inactive'),
            industry: c.industry || 'Other',
            type: c.type || 'client',
            revenue: c.revenue || 0,
            lastContact: new Date(c.updatedAt || c.createdAt || Date.now()).toISOString().split('T')[0],
            address: c.address || '',
            website: c.website || '',
            notes: c.notes || '',
            contacts: Array.isArray(c.contacts) ? c.contacts : [],
            followUps: Array.isArray(c.followUps) ? c.followUps : [],
            projectIds: Array.isArray(c.projectIds) ? c.projectIds : [],
            comments: Array.isArray(c.comments) ? c.comments : [],
            sites: Array.isArray(c.sites) ? c.sites : [],
            opportunities: Array.isArray(c.opportunities) ? c.opportunities : [],
            contracts: Array.isArray(c.contracts) ? c.contracts : [],
            activityLog: Array.isArray(c.activityLog) ? c.activityLog : [],
            billingTerms: typeof c.billingTerms === 'object' ? c.billingTerms : {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            }
        });

        const subscriberId = 'clients-screen-live-sync';
        const handler = (message) => {
            if (message?.type === 'data' && Array.isArray(message.data)) {
                if (message.dataType === 'clients') {
                    const processed = message.data.map(mapDbClient).filter(c => (c.type || 'client') === 'client');
                    setClients(processed);
                    safeStorage.setClients(processed);
                }
                if (message.dataType === 'leads') {
                    const processedLeads = message.data.map(mapDbClient).filter(c => (c.type || 'lead') === 'lead');
                    setLeads(processedLeads);
                    safeStorage.setLeads(processedLeads);
                }
            }
        };

        try {
            if (window.storage?.getToken?.()) {
                window.LiveDataSync?.start?.();
            }
        } catch (_e) {}

        window.LiveDataSync?.subscribe?.(subscriberId, handler);
        return () => {
            window.LiveDataSync?.unsubscribe?.(subscriberId);
        };
    }, []);


    // Manual refresh/clear removed to ensure always-live data

    // Debug function to check client data consistency
    const debugClientData = () => {
        console.log('🔍 Client Data Debug Report:');
        console.log('Current clients state:', clients.length, 'clients');
        console.log('Clients:', clients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        
        const localStorageClients = safeStorage.getClients();
        console.log('localStorage clients:', localStorageClients ? localStorageClients.length : 'none');
        if (localStorageClients) {
            console.log('localStorage clients:', localStorageClients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        }
        
        const cachedClients = window.ClientCache?.getClients();
        console.log('Cached clients:', cachedClients ? cachedClients.length : 'none');
        if (cachedClients) {
            console.log('Cached clients:', cachedClients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        }
        
        const currentUser = window.storage?.getUser?.();
        console.log('Current user:', currentUser);
        
        console.log('Cache status:', window.ClientCache?.getCacheStatus?.());
    };

    // Make debug function available globally
    window.debugClientData = debugClientData;

    // Function to load clients (can be called to refresh)
    const loadClients = async () => {
        console.log('🔄 loadClients called');
        try {
            // Check if user is logged in first
            const token = window.storage?.getToken?.() || null;
            console.log('🔑 Token status:', token ? 'present' : 'none');
            
            if (!token) {
                console.log('No auth token, loading clients from localStorage only');
                const savedClients = safeStorage.getClients();
                console.log('📁 Saved clients from localStorage:', savedClients ? savedClients.length : 'none');
        if (savedClients && savedClients.length > 0) {
                    console.log('✅ Setting clients from localStorage');
                    setClients(savedClients);
                } else {
                    console.log('📁 No saved clients, loading initial clients data');
                    setClients(initialClients);
                    safeStorage.setClients(initialClients);
                }
            } else {
                try {
                    console.log('🌐 Calling API to list clients');
                    const res = await window.api.listClients();
                    const apiClients = res?.data?.clients || [];
                    console.log('📡 API returned clients:', apiClients.length);
                    
                    // Get localStorage clients to merge projectIds
                    const savedClients = storage.getClients ? safeStorage.getClients() || [] : [];
                    console.log('📁 Saved clients for merge:', savedClients.length);
                    
                    // If API returns no clients, use localStorage clients
                    if (apiClients.length === 0 && savedClients.length > 0) {
                        console.log('✅ No API clients, using localStorage clients');
                        setClients(savedClients);
                        return;
                    }
                    
                    const processedClients = apiClients.map(c => ({
                        id: c.id,
                        name: c.name,
                        status: c.status === 'active' ? 'Active' : 'Inactive',
                        industry: c.industry || 'Other',
                        type: c.type || 'client', // Use the type from database
                        revenue: c.revenue || 0,
                        lastContact: new Date(c.updatedAt || c.createdAt).toISOString().split('T')[0],
                        address: c.address || '', 
                        website: c.website || '', 
                        notes: c.notes || '', 
                        contacts: Array.isArray(c.contacts) ? c.contacts : [], 
                        followUps: Array.isArray(c.followUps) ? c.followUps : [], 
                        projectIds: Array.isArray(c.projectIds) ? c.projectIds : [],
                        comments: Array.isArray(c.comments) ? c.comments : [], 
                        sites: Array.isArray(c.sites) ? c.sites : [], 
                        opportunities: Array.isArray(c.opportunities) ? c.opportunities : [], 
                        contracts: Array.isArray(c.contracts) ? c.contracts : [],
                        activityLog: Array.isArray(c.activityLog) ? c.activityLog : [],
                        billingTerms: typeof c.billingTerms === 'object' ? c.billingTerms : {
                            paymentTerms: 'Net 30',
                            billingFrequency: 'Monthly',
                            currency: 'ZAR',
                            retainerAmount: 0,
                            taxExempt: false,
                            notes: ''
                        }
                    }));
                    
                    // Separate clients and leads based on type
                    const clientsOnly = processedClients.filter(c => c.type === 'client');
                    const leadsOnly = processedClients.filter(c => c.type === 'lead');
                    
                    console.log('✅ Processed clients:', clientsOnly.length);
                    console.log('✅ Processed leads:', leadsOnly.length);
                    
                    // Always prioritize API data - only use localStorage if API completely fails
                    setClients(clientsOnly);
                    setLeads(leadsOnly);
                    console.log('✅ Clients and leads set from API');
                    
                    // Save processed data to localStorage for offline access
                    // This ensures all users have the same data cached
                    safeStorage.setClients(clientsOnly);
                    safeStorage.setLeads(leadsOnly);
                    console.log('✅ Clients and leads saved to localStorage for consistency');
                    
                    // Log the separation for debugging
                    console.log('📊 Data separation summary:');
                    console.log('  - Clients (type: client):', clientsOnly.length, clientsOnly.map(c => c.name));
                    console.log('  - Leads (type: lead):', leadsOnly.length, leadsOnly.map(l => l.name));
                } catch (apiError) {
                    console.error('❌ API error loading clients:', apiError);
                    if (apiError.message.includes('Unauthorized') || apiError.message.includes('401')) {
                        console.log('🔑 Token expired, clearing and using localStorage');
                        window.storage?.removeToken?.();
                        window.storage?.removeUser?.();
                    }
                    // Always fall back to localStorage on any API error
                    const savedClients = safeStorage.getClients();
                    console.log('📁 API error occurred, checking localStorage:', savedClients ? savedClients.length : 'no clients');
                    if (savedClients && savedClients.length > 0) {
                        console.log('✅ Falling back to localStorage clients:', savedClients.length);
                        setClients(savedClients);
                        console.log('✅ Clients set from localStorage fallback');
                    } else {
                        console.log('📁 No clients in localStorage fallback, loading initial clients data');
                        setClients(initialClients);
                        safeStorage.setClients(initialClients);
                    }
                }
            }
        } catch (e) {
            console.error('❌ Failed to load clients:', e);
            const savedClients = safeStorage.getClients();
            console.log('📁 Final fallback - saved clients:', savedClients ? savedClients.length : 'none');
            if (savedClients && savedClients.length > 0) {
                console.log('✅ Final fallback - setting clients from localStorage');
                setClients(savedClients);
            } else {
                // Fallback to initial clients data if localStorage is empty
                console.log('📁 No saved clients, loading initial clients data');
                setClients(initialClients);
                safeStorage.setClients(initialClients);
            }
        }
        // Projects are now handled by ProjectsDatabaseFirst component only
        // No localStorage persistence for projects
    };

    // Load leads from API and localStorage
    const loadLeads = async () => {
        try {
            const token = window.storage?.getToken?.();
            if (token && window.api?.getLeads) {
                try {
                    console.log('🔄 Loading leads from API...');
                    const apiResponse = await window.api.getLeads();
                    const apiLeads = apiResponse?.data?.leads || apiResponse?.leads || [];
                    console.log('📡 API returned leads:', apiLeads.length);
                    
                    // Always use API data, even if empty (this ensures deletions persist)
                    setLeads(apiLeads);
                    safeStorage.setLeads(apiLeads);
                    console.log('✅ Leads loaded from API (including empty result)');
                    return;
                } catch (error) {
                    console.warn('⚠️ Failed to load leads from API:', error);
                    // Only fall back to localStorage if API completely fails
                    const savedLeads = safeStorage.getLeads();
                    if (savedLeads && savedLeads.length > 0) {
                        setLeads(savedLeads);
                        console.log('✅ Leads loaded from localStorage (API fallback)');
                    } else {
                        setLeads([]);
                        console.log('✅ No leads found (empty state)');
                    }
                    return;
                }
            }
            
            // No token or API available - use localStorage only
            const savedLeads = safeStorage.getLeads();
            if (savedLeads && savedLeads.length > 0) {
                setLeads(savedLeads);
                console.log('✅ Leads loaded from localStorage (no API)');
            } else {
                setLeads([]);
                console.log('✅ No leads found (empty state)');
            }
        } catch (error) {
            console.error('❌ Error loading leads:', error);
            // Fallback to empty state to avoid loading stale data
            setLeads([]);
        }
    };

    // Listen for storage changes to refresh clients (DISABLED - was causing infinite loop)
    // useEffect(() => {
    //     const handleStorageChange = () => {
    //         loadClients();
    //     };
    //     
    //     window.addEventListener('storage', handleStorageChange);
    //     // Also listen for custom events from other components
    //     window.addEventListener('clientsUpdated', handleStorageChange);
    //     
    //     return () => {
    //         window.removeEventListener('storage', handleStorageChange);
    //         window.removeEventListener('clientsUpdated', handleStorageChange);
    //     };
    // }, []);
    
    // Refresh data when switching to pipeline view
    useEffect(() => {
        if (viewMode === 'pipeline') {
            loadClients();
            loadLeads();
        }
    }, [viewMode, refreshKey]);
    
    // Save data
    useEffect(() => {
        safeStorage.setClients(clients);
    }, [clients]);
    
    useEffect(() => {
        safeStorage.setLeads(leads);
    }, [leads]);

    const handleSaveClient = async (clientFormData, stayInEditMode = false) => {
        console.log('=== SAVE CLIENT DEBUG ===');
        console.log('Received form data:', clientFormData);
        console.log('All fields:', Object.keys(clientFormData));
        console.log('Contacts in form data:', clientFormData.contacts);
        console.log('Sites in form data:', clientFormData.sites);
        console.log('Selected client:', selectedClient);
        
        try {
            // Check if user is logged in
            const token = window.storage?.getToken?.() || null;
            
            // Create comprehensive client object with ALL fields
            const comprehensiveClient = {
                id: selectedClient ? selectedClient.id : Date.now().toString(),
                name: clientFormData.name || '',
                status: clientFormData.status || 'Active',
                industry: clientFormData.industry || 'Other',
                type: 'client',
                revenue: clientFormData.revenue || 0,
                lastContact: clientFormData.lastContact || new Date().toISOString().split('T')[0],
                address: clientFormData.address || '',
                website: clientFormData.website || '',
                notes: clientFormData.notes || '',
                contacts: clientFormData.contacts || [],
                followUps: clientFormData.followUps || [],
                projectIds: clientFormData.projectIds || [],
                comments: clientFormData.comments || [],
                sites: Array.isArray(clientFormData.sites) ? clientFormData.sites : [],
                opportunities: clientFormData.opportunities || [],
                contracts: clientFormData.contracts || [],
                activityLog: clientFormData.activityLog || [],
                billingTerms: clientFormData.billingTerms || {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: ''
                }
            };
            
            console.log('📝 Comprehensive client created:', comprehensiveClient);
            console.log('📝 Contacts in comprehensive client:', comprehensiveClient.contacts);
            console.log('📝 Sites in comprehensive client:', comprehensiveClient.sites);
            console.log('📝 Opportunities in comprehensive client:', comprehensiveClient.opportunities);
            
            // Always save to localStorage first for immediate persistence
            console.log('Saving to localStorage with all fields:', comprehensiveClient);
            
        if (selectedClient) {
                const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                setClients(updated);
                safeStorage.setClients(updated);
                setSelectedClient(comprehensiveClient); // Update selectedClient to show new data immediately
                console.log('✅ Updated client in localStorage, new count:', updated.length);
        } else {
                const newClients = [...clients, comprehensiveClient];
                setClients(newClients);
                safeStorage.setClients(newClients);
                console.log('✅ Added new client to localStorage, new count:', newClients.length);
                
                // For new clients, redirect to main clients view to show the newly added client
                setViewMode('clients');
                setSelectedClient(null);
                setCurrentTab('overview');
            }
            
            if (!token) {
                // No token, localStorage save already done above
                console.log('No token, localStorage save completed');
            } else {
                // Use API - but still save comprehensive data to localStorage
                try {
                    if (selectedClient) {
                        // For updates, send ALL comprehensive data to API
                        const apiUpdateData = {
                            name: comprehensiveClient.name,
                            industry: comprehensiveClient.industry,
                            status: comprehensiveClient.status === 'Active' ? 'active' : 'inactive',
                            revenue: comprehensiveClient.revenue,
                            lastContact: comprehensiveClient.lastContact,
                            address: comprehensiveClient.address,
                            website: comprehensiveClient.website,
                            notes: comprehensiveClient.notes,
                            contacts: comprehensiveClient.contacts,
                            followUps: comprehensiveClient.followUps,
                            projectIds: comprehensiveClient.projectIds,
                            comments: comprehensiveClient.comments,
                            sites: comprehensiveClient.sites,
                            opportunities: comprehensiveClient.opportunities,
                            contracts: comprehensiveClient.contracts,
                            activityLog: comprehensiveClient.activityLog,
                            billingTerms: comprehensiveClient.billingTerms
                        };
                        
                        await window.api.updateClient(selectedClient.id, apiUpdateData);
                        console.log('✅ Client updated via API with ALL data');
                    } else {
                        // For new clients, send ALL comprehensive data to API
                        const apiCreateData = {
                            name: comprehensiveClient.name,
                            industry: comprehensiveClient.industry,
                            status: comprehensiveClient.status === 'Active' ? 'active' : 'inactive',
                            revenue: comprehensiveClient.revenue,
                            lastContact: comprehensiveClient.lastContact,
                            address: comprehensiveClient.address,
                            website: comprehensiveClient.website,
                            notes: comprehensiveClient.notes,
                            contacts: comprehensiveClient.contacts,
                            followUps: comprehensiveClient.followUps,
                            projectIds: comprehensiveClient.projectIds,
                            comments: comprehensiveClient.comments,
                            sites: comprehensiveClient.sites,
                            opportunities: comprehensiveClient.opportunities,
                            contracts: comprehensiveClient.contracts,
                            activityLog: comprehensiveClient.activityLog,
                            billingTerms: comprehensiveClient.billingTerms
                        };
                        
                        console.log('🚀 Creating client via API:', apiCreateData);
                        const created = await window.api.createClient(apiCreateData);
                        console.log('✅ Client created via API:', created);
                        
                        // Update comprehensive client with API response
                        if (created?.data?.client?.id) {
                            comprehensiveClient.id = created.data.client.id;
                            console.log('✅ Updated client ID from API:', comprehensiveClient.id);
                        } else {
                            console.error('❌ No client ID in API response!');
                            console.log('Full API response:', created);
                        }
                    }
                    
                    // Always save comprehensive data to localStorage regardless of API success
                    console.log('Saving comprehensive data to localStorage after API success');
                    console.log('Current clients before localStorage save:', clients.length);
                    
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        console.log('Before API update - clients count:', clients.length, 'updated count:', updated.length);
                        if (updated.length !== clients.length) {
                            console.error('❌ CRITICAL: Client count changed during API update!');
                            console.log('Original clients:', clients);
                            console.log('Updated clients:', updated);
                            // Don't update if count changed
                            return;
                        }
                        setClients(updated);
                        safeStorage.setClients(updated);
                        console.log('✅ Updated client in localStorage after API success, new count:', updated.length);
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        console.log('Before API add - clients count:', clients.length, 'new count:', newClients.length);
                        if (newClients.length !== clients.length + 1) {
                            console.error('❌ CRITICAL: Client count not increased by 1 during API add!');
                            console.log('Original clients:', clients);
                            console.log('New clients:', newClients);
                            // Don't update if count is wrong
                            return;
                        }
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        console.log('✅ Added new client to localStorage after API success, new count:', newClients.length);
                    }
                    console.log('✅ Comprehensive client data saved to localStorage');
                    
                } catch (apiError) {
                    console.error('API error saving client:', apiError);
                    if (apiError.message.includes('Unauthorized') || apiError.message.includes('401')) {
                        console.log('Token expired, falling back to localStorage only');
                        window.storage?.removeToken?.();
                        window.storage?.removeUser?.();
                    }
                    
                    // Always fall back to localStorage on any API error
                    console.log('Falling back to localStorage for client save');
                    console.log('Current clients before fallback:', clients.length);
                    console.log('Comprehensive client to save:', comprehensiveClient);
                    
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        setClients(updated);
                        safeStorage.setClients(updated);
                        console.log('✅ Updated client in localStorage, new count:', updated.length);
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        console.log('✅ Added new client to localStorage, new count:', newClients.length);
                    }
                    console.log('✅ Fallback: Client saved to localStorage only');
                }
            }
            
            // Silent save - no alert, just refresh and stay in view
            
        } catch (error) {
            console.error('Failed to save client:', error);
            alert('Failed to save client: ' + error.message);
        }
        
        if (!stayInEditMode) {
            setRefreshKey(k => k + 1);
        }
    };
    
    const handleSaveLead = async (leadFormData) => {
        console.log('=== SAVE LEAD DEBUG ===');
        console.log('Received lead data:', leadFormData);
        console.log('Selected lead:', selectedLead);
        
        try {
            if (selectedLead) {
                // Update existing lead
                const updatedLead = { ...selectedLead, ...leadFormData };
                
                // Try to save to database first
                const token = window.storage?.getToken?.();
                if (token && window.api?.updateLead) {
                    try {
                        console.log('🌐 Calling API to update lead:', updatedLead.id);
                        const apiResponse = await window.api.updateLead(updatedLead.id, updatedLead);
                        const updatedLeadFromAPI = apiResponse?.data?.lead || apiResponse?.lead || apiResponse;
                        console.log('✅ Lead updated in database');
                        
                        // Use the updated lead from API if available
                        if (updatedLeadFromAPI && updatedLeadFromAPI.id) {
                            const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLeadFromAPI : l);
                            setLeads(updatedLeads);
                            setSelectedLead(updatedLeadFromAPI);
                            window.storage?.setLeads?.(updatedLeads);
                        } else {
                            // Fallback to local update
                            const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                            setLeads(updatedLeads);
                            setSelectedLead(updatedLead);
                            window.storage?.setLeads?.(updatedLeads);
                        }
                    } catch (error) {
                        console.warn('⚠️ Failed to update lead in database, saving to localStorage:', error);
                        // Fallback to localStorage
                        const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                        setLeads(updatedLeads);
                        setSelectedLead(updatedLead);
                        window.storage?.setLeads?.(updatedLeads);
                    }
                } else {
                    // No API, save to localStorage only
                    const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                    setLeads(updatedLeads);
                    setSelectedLead(updatedLead);
                    window.storage?.setLeads?.(updatedLeads);
                }
                console.log('✅ Lead updated and saved to localStorage');
            } else {
                // Create new lead
                const newLead = {
                    id: Math.max(100, ...leads.map(l => l.id)) + 1,
                    ...leadFormData,
                    type: 'lead', // Ensure it's marked as a lead
                    lastContact: new Date().toISOString().split('T')[0],
                    activityLog: [{
                        id: Date.now(),
                        type: 'Lead Created',
                        description: `Lead created: ${leadFormData.name}`,
                        timestamp: new Date().toISOString(),
                        user: 'Current User'
                    }]
                };
                
                // Try to save to database first
                const token = window.storage?.getToken?.();
                if (token && window.api?.createLead) {
                    try {
                        console.log('🌐 Calling API to create lead:', newLead);
                        const apiResponse = await window.api.createLead(newLead);
                        const savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse;
                        console.log('✅ Lead created in database:', savedLead);
                        
                        // Use the saved lead from database (with proper ID)
                        const updatedLeads = [...leads, savedLead];
                        setLeads(updatedLeads);
                        window.storage?.setLeads?.(updatedLeads);
                        console.log('✅ New lead created and saved to database + localStorage');
                    } catch (error) {
                        console.warn('⚠️ Failed to create lead in database, saving to localStorage:', error);
                        // Fallback to localStorage
                        const updatedLeads = [...leads, newLead];
                        setLeads(updatedLeads);
                        window.storage?.setLeads?.(updatedLeads);
                        console.log('✅ New lead created and saved to localStorage (fallback)');
                    }
                } else {
                    // No token or API, save to localStorage only
                    const updatedLeads = [...leads, newLead];
                    setLeads(updatedLeads);
                    window.storage?.setLeads?.(updatedLeads);
                    console.log('✅ New lead created and saved to localStorage (no token)');
                }
                
                // For new leads, redirect to main leads view to show the newly added lead
                setViewMode('leads');
                setSelectedLead(null);
                setCurrentLeadTab('overview');
                
                // Force a refresh to ensure API data is loaded
                setTimeout(() => {
                    console.log('🔄 Refreshing leads after creation...');
                    loadLeads();
                }, 100);
            }
        } catch (error) {
            console.error('❌ Error saving lead:', error);
            // Still save to localStorage as fallback
            if (selectedLead) {
                const updatedLead = { ...selectedLead, ...leadFormData };
                const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                setLeads(updatedLeads);
                setSelectedLead(updatedLead);
                window.storage?.setLeads?.(updatedLeads);
            } else {
                const newLead = {
                    id: Math.max(100, ...leads.map(l => l.id)) + 1,
                    ...leadFormData,
                    type: 'lead',
                    lastContact: new Date().toISOString().split('T')[0],
                    activityLog: [{
                        id: Date.now(),
                        type: 'Lead Created',
                        description: `Lead created: ${leadFormData.name}`,
                        timestamp: new Date().toISOString(),
                        user: 'Current User'
                    }]
                };
                const updatedLeads = [...leads, newLead];
                setLeads(updatedLeads);
                window.storage?.setLeads?.(updatedLeads);
            }
        }
    };

    const handleDeleteClient = async (clientId) => {
        try {
            // Try to delete from database first
            const token = window.storage?.getToken?.();
            if (token && window.api?.deleteClient) {
                try {
                    await window.api.deleteClient(clientId);
                    console.log('✅ Client deleted from database');
                } catch (error) {
                    console.warn('⚠️ Failed to delete client from database:', error);
                }
            }
            
            // Update local state and localStorage
            const updatedClients = clients.filter(c => c.id !== clientId);
            setClients(updatedClients);
            safeStorage.setClients(updatedClients);
            console.log('✅ Client deleted from localStorage');
        } catch (error) {
            console.error('❌ Error deleting client:', error);
        }
    };

    const handleDeleteLead = async (leadId) => {
        try {
            console.log('🗑️ Deleting lead:', leadId);
            console.log('Current leads before deletion:', leads.length);
            
            // Try to delete from database first
            const token = window.storage?.getToken?.();
            if (token && window.api?.deleteLead) {
                try {
                    await window.api.deleteLead(leadId);
                    console.log('✅ Lead deleted from database');
                } catch (error) {
                    console.warn('⚠️ Failed to delete lead from database:', error);
                }
            }
            
            // Update local state and localStorage
            const updatedLeads = leads.filter(l => l.id !== leadId);
            setLeads(updatedLeads);
            safeStorage.setLeads(updatedLeads);
            console.log('✅ Lead deleted from localStorage, new count:', updatedLeads.length);
            
            // Force a refresh to ensure API data is loaded
            setTimeout(() => {
                console.log('🔄 Refreshing leads after deletion...');
                loadLeads();
            }, 100);
            
        } catch (error) {
            console.error('❌ Error deleting lead:', error);
        }
    };

    // Handle column sorting
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Sort function
    const sortClients = (clients) => {
        return [...clients].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];
            
            // Handle nested fields like contact name
            if (sortField === 'contact') {
                aValue = a.contacts?.[0]?.name || '';
                bValue = b.contacts?.[0]?.name || '';
            }
            
            // Handle date fields
            if (sortField === 'lastContact') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            }
            
            // Convert to strings for comparison
            if (typeof aValue === 'string') aValue = aValue.toLowerCase();
            if (typeof bValue === 'string') bValue = bValue.toLowerCase();
            
            if (sortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });
    };

    // Filter clients
    const filteredClients = clients.filter(client => {
        // Enhanced search across multiple fields
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = searchTerm === '' || 
            client.name.toLowerCase().includes(searchLower) ||
            client.industry.toLowerCase().includes(searchLower) ||
            client.address.toLowerCase().includes(searchLower) ||
            client.website.toLowerCase().includes(searchLower) ||
            client.notes.toLowerCase().includes(searchLower) ||
            // Search in all contacts
            (client.contacts || []).some(contact => 
                contact.name.toLowerCase().includes(searchLower) ||
                contact.email.toLowerCase().includes(searchLower) ||
                contact.phone.includes(searchTerm)
            ) ||
            // Search in all sites
            (client.sites || []).some(site => 
                site.name.toLowerCase().includes(searchLower) ||
                site.address.toLowerCase().includes(searchLower)
            );
        
        const matchesIndustry = filterIndustry === 'All Industries' || client.industry === filterIndustry;
        const matchesStatus = filterStatus === 'All Status' || client.status === filterStatus;
        
        return matchesSearch && matchesIndustry && matchesStatus;
    });

    // Sort the filtered clients
    const sortedClients = sortClients(filteredClients);

    // Filter leads
    const filteredLeads = leads.filter(lead => {
        const matchesSearch = searchTerm === '' || 
            lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (lead.contacts?.[0]?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        
        const matchesIndustry = filterIndustry === 'All Industries' || lead.industry === filterIndustry;
        const matchesStatus = filterStatus === 'All Status' || lead.status === filterStatus;
        
        return matchesSearch && matchesIndustry && matchesStatus;
    });

    const pipelineStages = ['Awareness', 'Interest', 'Desire', 'Action'];

    const handleOpenClient = (client) => {
        setSelectedClient(client);
        setSelectedLead(null);
        setViewMode('client-detail');
    };

    const handleOpenLead = (lead) => {
        setSelectedLead(lead);
        setSelectedClient(null);
        setViewMode('lead-detail'); // Open in full detail view like clients
    };

    const handleNavigateToProject = (projectId) => {
        sessionStorage.setItem('openProjectId', projectId);
        setViewMode('clients');
        setSelectedClient(null);
        window.dispatchEvent(new CustomEvent('navigateToPage', { 
            detail: { page: 'projects', projectId } 
        }));
    };

    const convertLeadToClient = (lead) => {
        const newClient = {
            id: Math.max(0, ...clients.map(c => c.id)) + 1,
            name: lead.name,
            industry: lead.industry,
            status: 'Active',
            type: 'client',
            revenue: 0,
            lastContact: new Date().toISOString().split('T')[0],
            address: '',
            website: '',
            notes: lead.notes,
            contacts: lead.contacts || [],
            followUps: lead.followUps || [],
            projectIds: lead.projectIds || [],
            comments: lead.comments || [],
            sites: [],
            opportunities: [],
            activityLog: [{
                id: Date.now(),
                type: 'Lead Converted',
                description: `Converted from lead to client`,
                timestamp: new Date().toISOString(),
                user: 'Current User'
            }]
        };
        setClients([...clients, newClient]);
        setLeads(leads.filter(l => l.id !== lead.id));
        setViewMode('clients');
        setSelectedLead(null);
        alert('Lead converted to client!');
    };

    // Pipeline View Component
    const PipelineView = () => {
        console.log('🔍 Pipeline View rendered - leads count:', leads.length);
        const [draggedItem, setDraggedItem] = useState(null);
        const [draggedType, setDraggedType] = useState(null);

        const clientOpportunities = clients.reduce((acc, client) => {
            if (client.opportunities && Array.isArray(client.opportunities)) {
                return acc.concat(client.opportunities.map(opp => ({
                    ...opp,
                    clientName: client.name,
                    clientId: client.id,
                    type: 'opportunity',
                    stage: opp.stage || 'Awareness',
                    status: opp.status || 'Active'
                })));
            }
            return acc;
        }, []);

        // Filter active leads and opportunities only
        console.log('🔍 Pipeline Debug - All leads:', leads.map(l => ({ id: l.id, name: l.name, status: l.status, stage: l.stage })));
        
        // TEMPORARY: Show all leads in pipeline for debugging (remove status filtering)
        const activeLeads = leads.filter(lead => {
            // Ensure lead has a stage
            if (!lead.stage) {
                console.log('⚠️ Lead missing stage:', lead.name);
                return false;
            }
            return true;
        });
        
        console.log('🔍 Pipeline Debug - Active leads (after stage filter):', activeLeads.map(l => ({ id: l.id, name: l.name, status: l.status, stage: l.stage })));
        const activeOpportunities = clientOpportunities.filter(opp => 
            opp.status !== 'Inactive' && 
            opp.status !== 'Closed Lost' && 
            opp.status !== 'Closed Won'
        );

        const handleDragStart = (item, type) => {
            setDraggedItem(item);
            setDraggedType(type);
        };

        const handleDragOver = (e) => {
            e.preventDefault();
        };

        const handleDrop = (e, targetStage) => {
            e.preventDefault();
            
            if (!draggedItem || !draggedType || draggedItem.stage === targetStage) {
                setDraggedItem(null);
                setDraggedType(null);
                return;
            }

            if (draggedType === 'lead') {
                const updatedLeads = leads.map(lead => 
                    lead.id === draggedItem.id ? { ...lead, stage: targetStage } : lead
                );
                setLeads(updatedLeads);
                safeStorage.setLeads(updatedLeads);
            } else if (draggedType === 'opportunity') {
                const updatedClients = clients.map(client => {
                    if (client.id === draggedItem.clientId) {
                        const updatedOpportunities = client.opportunities.map(opp =>
                            opp.id === draggedItem.id ? { ...opp, stage: targetStage } : opp
                        );
                        return { ...client, opportunities: updatedOpportunities };
                    }
                    return client;
                });
                setClients(updatedClients);
                safeStorage.setClients(updatedClients);
            }

            setDraggedItem(null);
            setDraggedType(null);
            setRefreshKey(k => k + 1);
        };

        const handleDragEnd = () => {
            setDraggedItem(null);
            setDraggedType(null);
        };

        return (
            <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Leads</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{activeLeads.length}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>New prospects</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Opportunities</div>
                        <div className="text-2xl font-bold text-primary-600">{activeOpportunities.length}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Client expansions</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Pipeline Value</div>
                        <div className="text-2xl font-bold text-green-600">
                            R {(activeLeads.reduce((sum, lead) => sum + (lead.value || 0), 0) + activeOpportunities.reduce((sum, opp) => sum + (opp.value || 0), 0)).toLocaleString('en-ZA')}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Total potential</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4 flex items-center justify-between`}>
                        <div>
                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Conversion Rate</div>
                            <div className="text-2xl font-bold text-purple-600">
                                {activeLeads.length > 0 ? Math.round((activeLeads.filter(l => l.stage === 'Action').length / activeLeads.length) * 100) : 0}%
                            </div>
                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>To action stage</div>
                        </div>
                    </div>
                </div>

                {/* Enhanced Pipeline Board */}
                <div className="flex gap-6 overflow-x-auto pb-6">
                    {pipelineStages.map(stage => {
                        const stageLeads = activeLeads.filter(lead => lead.stage === stage);
                        const stageOpps = activeOpportunities.filter(opp => opp.stage === stage);
                        const stageCount = stageLeads.length + stageOpps.length;
                        const isDraggedOver = draggedItem && draggedItem.stage !== stage;
                        
                        const stageIcons = {
                            'Awareness': 'fa-eye',
                            'Interest': 'fa-search',
                            'Desire': 'fa-heart',
                            'Action': 'fa-rocket'
                        };

                        const stageColors = {
                            'Awareness': 'from-gray-500 to-gray-600',
                            'Interest': 'from-blue-500 to-blue-600',
                            'Desire': 'from-yellow-500 to-yellow-600',
                            'Action': 'from-green-500 to-green-600'
                        };
                        
                        return (
                            <div 
                                key={stage} 
                                className={`flex-1 min-w-[320px] ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg border transition-all duration-300 ${
                                    isDark ? 'border-gray-700' : 'border-gray-200'
                                } ${
                                    isDraggedOver ? `ring-2 ring-primary-500 ${isDark ? 'bg-primary-900' : 'bg-primary-50'} transform scale-105` : 'hover:shadow-xl'
                                }`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                {/* Stage Header with Gradient */}
                                <div className={`bg-gradient-to-r ${stageColors[stage]} rounded-t-xl p-4 mb-4 -mx-1 -mt-1`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                                                <i className={`fas ${stageIcons[stage]} text-white text-sm`}></i>
                                            </div>
                                            <div>
                                                <h3 className="text-white font-semibold text-lg">{stage}</h3>
                                                <p className="text-white/80 text-sm">{stageCount} items</p>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-full text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} border`}>
                                            {stageLeads.length + stageOpps.length}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {stageLeads.length === 0 && stageOpps.length === 0 && (
                                        <div className={`text-center py-12 rounded-xl border-2 border-dashed transition-all duration-300 ${
                                            isDraggedOver ? `border-primary-400 ${isDark ? 'bg-primary-900' : 'bg-primary-50'} scale-105` : `${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'}`
                                        }`}>
                                            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                                <i className="fas fa-plus text-2xl text-gray-400"></i>
                                            </div>
                                            <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>No items yet</p>
                                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Drag items here or add new ones</p>
                                        </div>
                                    )}
                                    
                                    {stageLeads.map(lead => (
                                        <div 
                                            key={`lead-${lead.id}-${stage}-${lead.name}`}
                                            draggable
                                            onDragStart={() => handleDragStart(lead, 'lead')}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => handleOpenLead(lead)}
                                            className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-50'} rounded-xl p-4 border transition-all duration-300 cursor-move group ${
                                                isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'
                                            } ${
                                                draggedItem?.id === lead.id ? 'opacity-50 transform scale-95' : 'hover:shadow-lg hover:-translate-y-1'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="flex-1">
                                                    <h4 className={`font-semibold text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'} line-clamp-2 mb-1 ${isDark ? 'group-hover:text-primary-400' : 'group-hover:text-primary-600'} transition-colors`}>{lead.name}</h4>
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.industry}</p>
                                            </div>
                                                <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs rounded-full font-medium shrink-0 shadow-sm">LEAD</span>
                                            </div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-600' : 'bg-gray-100'}`}>
                                                    <i className="fas fa-user text-xs text-gray-500"></i>
                                                </div>
                                                <div className="flex-1">
                                                    <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{lead.contacts?.[0]?.name || 'No contact'}</p>
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.contacts?.[0]?.email || 'No email'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {stageOpps.map(opp => {
                                        const client = clients.find(c => c.id === opp.clientId);
                                        return (
                                            <div 
                                                key={`opp-${opp.id}`}
                                                draggable
                                                onDragStart={() => handleDragStart(opp, 'opportunity')}
                                                onDragEnd={handleDragEnd}
                                                onClick={() => handleOpenClient(client)}
                                                className={`${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-lg p-3 border shadow-sm hover:shadow-md cursor-move transition ${
                                                    draggedItem?.id === opp.id ? 'opacity-50' : ''
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className={`font-medium text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'} line-clamp-2 flex-1`}>{opp.name}</div>
                                                    <span className={`px-2 py-0.5 ${isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-700'} text-xs rounded-full font-medium shrink-0`}>OPP</span>
                                                </div>
                                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                                                    <i className="fas fa-building mr-1"></i>
                                                    {opp.clientName}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Existing client</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Clients List View
    const ClientsListView = () => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border`}>
            <div className="overflow-x-auto">
                <table className={`min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                        <tr>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center">
                                    Client
                                    {sortField === 'name' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('contact')}
                            >
                                <div className="flex items-center">
                                    Contact
                                    {sortField === 'contact' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('industry')}
                            >
                                <div className="flex items-center">
                                    Industry
                                    {sortField === 'industry' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('status')}
                            >
                                <div className="flex items-center">
                                    Status
                                    {sortField === 'status' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('lastContact')}
                            >
                                <div className="flex items-center">
                                    Last Contact
                                    {sortField === 'lastContact' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {sortedClients.length === 0 ? (
                            <tr>
                                    <td colSpan="5" className={`px-6 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <i className={`fas fa-inbox text-3xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-2`}></i>
                                    <p>No clients found</p>
                                </td>
                            </tr>
                        ) : (
                            sortedClients.map(client => (
                                <tr 
                                    key={client.id} 
                                    onClick={() => handleOpenClient(client)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{client.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{client.contacts?.[0]?.name || 'No contact'}</div>
                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{client.contacts?.[0]?.email || ''}</div>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{client.industry}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            (client.status === 'Active' || client.status === 'active') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {client.status === 'active' ? 'Active' : client.status}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{client.lastContact}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // Leads List View
    const handleLeadStatusChange = (leadId, newStatus) => {
        const updatedLeads = leads.map(l => l.id === leadId ? { ...l, status: newStatus } : l);
        setLeads(updatedLeads);
        window.storage?.setLeads?.(updatedLeads);
    };

    const LeadsListView = () => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border`}>
            <div className="overflow-x-auto">
                <table className={`min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                        <tr>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Lead</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Contact</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Industry</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Stage</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Status</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Time Since Contact</th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {filteredLeads.length === 0 ? (
                            <tr>
                                <td colSpan="6" className={`px-6 py-12 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                        <i className="fas fa-user-plus text-2xl text-gray-400"></i>
                                    </div>
                                    <p className="text-lg font-medium mb-2">No leads found</p>
                                    <p className="text-sm">Get started by adding your first lead</p>
                                </td>
                            </tr>
                        ) : (
                            filteredLeads.map(lead => (
                                <tr 
                                    key={`lead-${lead.id}-${lead.name}`}
                                    onClick={() => handleOpenLead(lead)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.contacts?.[0]?.name || 'No contact'}</div>
                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.contacts?.[0]?.email || ''}</div>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.industry}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                                            lead.stage === 'Awareness' ? (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800') :
                                            lead.stage === 'Interest' ? (isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                                            lead.stage === 'Desire' ? (isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800') :
                                            (isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800')
                                        }`}>
                                            {lead.stage}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <select
                                            value={lead.status}
                                            onChange={(e) => handleLeadStatusChange(lead.id, e.target.value)}
                                            className={`px-2 py-1 text-xs font-medium rounded ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-300'} border`}
                                        >
                                            <option>Potential</option>
                                            <option>Active</option>
                                            <option>Disinterested</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                            {getTimeSinceFirstContact(lead.firstContactDate)}
                                        </div>
                                        {lead.firstContactDate && (
                                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {new Date(lead.firstContactDate).toLocaleDateString()}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // Full-page Client Detail View
    const ClientDetailView = () => (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Header with breadcrumb */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button 
                            onClick={() => {
                                setViewMode('clients');
                                setSelectedClient(null);
                            }}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200`}
                            title="Go back"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-primary-400' : 'bg-primary-600'}`}></div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {selectedClient ? selectedClient.name : 'New Client'}
                            </h1>
                        </div>
                    </div>
                    {/* Edit mode removed - always allow editing */}
                </div>
            </div>

            {/* Full-page client detail content */}
            <div className="p-6">
                <ClientDetailModal
                    client={selectedClient}
                    onSave={handleSaveClient}
                    onClose={() => {
                        setViewMode('clients');
                        setSelectedClient(null);
                        setCurrentTab('overview');
                    }}
                    onDelete={handleDeleteClient}
                    allProjects={projects}
                    onNavigateToProject={handleNavigateToProject}
                    isFullPage={true}
                    isEditing={true}
                    hideSearchFilters={true}
                    initialTab={currentTab}
                    onTabChange={setCurrentTab}
                />
            </div>
        </div>
    );

    // Full-page Lead Detail View
    const LeadDetailView = () => (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Header with breadcrumb */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button 
                            onClick={() => {
                                setViewMode('leads');
                                setSelectedLead(null);
                            }}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200`}
                            title="Go back"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-yellow-400' : 'bg-yellow-500'}`}></div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {selectedLead ? selectedLead.name : 'New Lead'}
                            </h1>
                        </div>
                    </div>
                    {/* Edit mode removed - always allow editing */}
                </div>
            </div>

            {/* Full-page lead detail content */}
            <div className="p-6">
                <LeadDetailModal
                    lead={selectedLead}
                    onSave={handleSaveLead}
                    onClose={() => {
                        setViewMode('leads');
                        setSelectedLead(null);
                        setCurrentLeadTab('overview');
                    }}
                    onDelete={handleDeleteLead}
                    onConvertToClient={convertLeadToClient}
                    allProjects={projects}
                    isFullPage={true}
                    isEditing={true}
                    hideSearchFilters={true}
                    initialTab={currentLeadTab}
                    onTabChange={setCurrentLeadTab}
                />
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Modern Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                        <i className="fas fa-users text-white text-lg"></i>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clients and Leads</h1>
                        <p className="text-gray-600 dark:text-gray-400">Manage clients and leads</p>
                    </div>
                </div>
                
                {/* Modern Action Buttons */}
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => {
                            setSelectedClient(null);
                            setSelectedLead(null);
                            setViewMode('client-detail');
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                        <div className="w-5 h-5 bg-blue-100 rounded-md flex items-center justify-center">
                            <i className="fas fa-plus text-blue-600 text-xs"></i>
                        </div>
                        <span>Add Client</span>
                    </button>
                    <button 
                        onClick={() => {
                            setSelectedLead(null);
                            setSelectedClient(null);
                            setViewMode('lead-detail');
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                        <div className="w-5 h-5 bg-blue-500 rounded-md flex items-center justify-center">
                            <i className="fas fa-plus text-xs"></i>
                        </div>
                        <span>Add Lead</span>
                    </button>
                </div>
            </div>

            {/* Modern View Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex shadow-sm">
                <button
                    onClick={() => setViewMode('clients')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'clients' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-building mr-2"></i>
                    Clients ({clients.length})
                </button>
                <button
                    onClick={() => setViewMode('leads')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'leads' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-star mr-2"></i>
                    Leads ({leads.length})
                </button>
                <button
                    onClick={() => setViewMode('pipeline')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'pipeline' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-stream mr-2"></i>
                    Pipeline
                </button>
            </div>

            {/* Modern Search and Filters */}
            {viewMode !== 'client-detail' && viewMode !== 'lead-detail' && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="sm:col-span-2 lg:col-span-1">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search by name, industry, or contact..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                                />
                                <i className="fas fa-search absolute left-3 top-3.5 text-gray-400 text-sm"></i>
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                                        title="Clear search"
                                    >
                                        <i className="fas fa-times text-sm"></i>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div>
                            <select
                                value={filterIndustry}
                                onChange={(e) => setFilterIndustry(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                            >
                                <option value="All Industries">All Industries</option>
                                <option value="Mining">Mining</option>
                                <option value="Forestry">Forestry</option>
                                <option value="Agriculture">Agriculture</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                            >
                                <option value="All Status">All Status</option>
                                <option value="Potential">Potential</option>
                                <option value="Active">Active</option>
                                <option value="Disinterested">Disinterested</option>
                            </select>
                        </div>
                    </div>
                    
                    {/* Modern Search Results Counter */}
                    {(searchTerm || filterIndustry !== 'All Industries' || filterStatus !== 'All Status') && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    <span>
                                        Showing {filteredClients.length} of {clients.length} clients
                                        {searchTerm && ` matching "${searchTerm}"`}
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setFilterIndustry('All Industries');
                                        setFilterStatus('All Status');
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                    Clear filters
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Content based on view mode */}
            {viewMode === 'clients' && <ClientsListView />}
            {viewMode === 'leads' && <LeadsListView />}
            {viewMode === 'pipeline' && <PipelineView />}
            {viewMode === 'client-detail' && <ClientDetailView />}
            {viewMode === 'lead-detail' && <LeadDetailView />}
        </div>
    );
};

window.Clients = Clients;

