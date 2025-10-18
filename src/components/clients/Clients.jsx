// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;
const ClientDetailModal = window.ClientDetailModal;
const LeadDetailModal = window.LeadDetailModal;

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
                id: 2,
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
        name: 'Green Fleet Solutions',
        industry: 'Forestry',
        status: 'New',
        source: 'Website',
        stage: 'Awareness',
        notes: 'Inquiry about fuel monitoring systems for 50 vehicle fleet',
        contacts: [
            {
                id: 101,
                name: 'Michael Chen',
                role: 'Fleet Operations Manager',
                department: 'Operations',
                email: 'michael@greenfleet.co.za',
                phone: '011-555-0201',
                isPrimary: true
            }
        ],
        followUps: [],
        projectIds: [],
        comments: [],
        activityLog: []
    },
    {
        id: 102,
        name: 'TransLogix SA',
        industry: 'Agriculture',
        status: 'Contacted',
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
        activityLog: []
    },
    {
        id: 103,
        name: 'Coastal Mining Corp',
        industry: 'Mining',
        status: 'Qualified',
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
        status: 'Qualified',
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
        activityLog: []
    }
];

const Clients = () => {
    const [viewMode, setViewMode] = useState('clients');
    const [clients, setClients] = useState([]); // Start empty to prevent flash
    const [leads, setLeads] = useState(initialLeads);
    const [projects, setProjects] = useState([]);
    const [showClientModal, setShowClientModal] = useState(false);
    const [showLeadModal, setShowLeadModal] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedLead, setSelectedLead] = useState(null);
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
        const savedClients = storage.getClients();
        console.log('💾 localStorage clients:', savedClients ? savedClients.length : 'none');
    }, [refreshKey]);
    
    // Load clients from API immediately on mount
    useEffect(() => {
        loadClients();
    }, []);

    // Function to clear localStorage and reload fresh data
    const clearCacheAndReload = async () => {
        console.log('🧹 Clearing localStorage cache and reloading fresh data');
        storage.setClients([]);
        await loadClients();
    };

    // Function to load clients (can be called to refresh)
    const loadClients = async () => {
        console.log('🔄 loadClients called');
        try {
            // Check if user is logged in first
            const token = window.storage?.getToken?.();
            console.log('🔑 Token status:', token ? 'present' : 'none');
            
            if (!token) {
                console.log('No auth token, loading clients from localStorage only');
                const savedClients = storage.getClients();
                console.log('📁 Saved clients from localStorage:', savedClients ? savedClients.length : 'none');
        if (savedClients) {
                    console.log('✅ Setting clients from localStorage');
                    setClients(savedClients);
                } else {
                    console.log('⚠️ No saved clients, keeping empty state');
                }
            } else {
                try {
                    console.log('🌐 Calling API to list clients');
                    const res = await window.api.listClients();
                    const apiClients = res?.data?.clients || [];
                    console.log('📡 API returned clients:', apiClients.length);
                    
                    // Get localStorage clients to merge projectIds
                    const savedClients = storage.getClients() || [];
                    console.log('📁 Saved clients for merge:', savedClients.length);
                    
                    const processedClients = apiClients.map(c => ({
                        id: c.id,
                        name: c.name,
                        status: c.status === 'active' ? 'Active' : 'Inactive',
                        industry: c.industry || 'Other',
                        type: 'client',
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
                    
                    console.log('✅ Processed clients:', processedClients.length);
                    
                    // Always prioritize API data - only use localStorage if API completely fails
                    setClients(processedClients);
                    console.log('✅ Clients set from API');
                    
                    // Save processed data to localStorage for offline access
                    storage.setClients(processedClients);
                    console.log('✅ Clients saved to localStorage');
                } catch (apiError) {
                    console.error('❌ API error loading clients:', apiError);
                    if (apiError.message.includes('Unauthorized') || apiError.message.includes('401')) {
                        console.log('🔑 Token expired, clearing and using localStorage');
                        window.storage.removeToken();
                        window.storage.removeUser();
                    }
                    // Always fall back to localStorage on any API error
                    const savedClients = storage.getClients();
                    console.log('📁 API error occurred, checking localStorage:', savedClients ? savedClients.length : 'no clients');
                    if (savedClients) {
                        console.log('✅ Falling back to localStorage clients:', savedClients.length);
                        setClients(savedClients);
                        console.log('✅ Clients set from localStorage fallback');
                    } else {
                        console.log('❌ No clients found in localStorage fallback');
                    }
                }
            }
        } catch (e) {
            console.error('❌ Failed to load clients:', e);
            const savedClients = storage.getClients();
            console.log('📁 Final fallback - saved clients:', savedClients ? savedClients.length : 'none');
            if (savedClients) {
                console.log('✅ Final fallback - setting clients from localStorage');
                setClients(savedClients);
            } else {
                console.log('⚠️ Final fallback - no saved clients, keeping initial state');
            }
        }
        const savedLeads = storage.getLeads();
        const savedProjects = storage.getProjects();
        if (savedLeads) setLeads(savedLeads);
        if (savedProjects) setProjects(savedProjects);
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
            const savedClients = storage.getClients();
            const savedLeads = storage.getLeads();
            if (savedClients) {
                const clientsWithOpportunities = savedClients.map(client => ({
                    ...client,
                    opportunities: client.opportunities || []
                }));
                setClients(clientsWithOpportunities);
            }
            if (savedLeads) setLeads(savedLeads);
        }
    }, [viewMode, refreshKey]);
    
    // Save data
    useEffect(() => {
        storage.setClients(clients);
    }, [clients]);
    
    useEffect(() => {
        storage.setLeads(leads);
    }, [leads]);

    const handleSaveClient = async (clientFormData) => {
        console.log('=== SAVE CLIENT DEBUG ===');
        console.log('Received form data:', clientFormData);
        console.log('All fields:', Object.keys(clientFormData));
        console.log('Contacts in form data:', clientFormData.contacts);
        console.log('Sites in form data:', clientFormData.sites);
        console.log('Selected client:', selectedClient);
        
        try {
            // Check if user is logged in
            const token = window.storage?.getToken?.();
            
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
            
            if (!token) {
                // Save to localStorage only - comprehensive save
                console.log('Saving to localStorage with all fields:', comprehensiveClient);
                console.log('Current clients before localStorage save:', clients.length);
                
        if (selectedClient) {
                    const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                    console.log('Before update - clients count:', clients.length, 'updated count:', updated.length);
                    if (updated.length !== clients.length) {
                        console.error('❌ CRITICAL: Client count changed during update!');
                        console.log('Original clients:', clients);
                        console.log('Updated clients:', updated);
                        // Don't update if count changed
                        return;
                    }
                    setClients(updated);
                    storage.setClients(updated);
                    console.log('✅ Client updated in localStorage, new count:', updated.length);
        } else {
                    const newClients = [...clients, comprehensiveClient];
                    console.log('Before add - clients count:', clients.length, 'new count:', newClients.length);
                    if (newClients.length !== clients.length + 1) {
                        console.error('❌ CRITICAL: Client count not increased by 1!');
                        console.log('Original clients:', clients);
                        console.log('New clients:', newClients);
                        // Don't update if count is wrong
                        return;
                    }
                    setClients(newClients);
                    storage.setClients(newClients);
                    console.log('✅ New client added to localStorage, new count:', newClients.length);
                }
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
                        storage.setClients(updated);
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
                        storage.setClients(newClients);
                        console.log('✅ Added new client to localStorage after API success, new count:', newClients.length);
                    }
                    console.log('✅ Comprehensive client data saved to localStorage');
                    
                } catch (apiError) {
                    console.error('API error saving client:', apiError);
                    if (apiError.message.includes('Unauthorized') || apiError.message.includes('401')) {
                        console.log('Token expired, falling back to localStorage only');
                        window.storage.removeToken();
                        window.storage.removeUser();
                    }
                    
                    // Always fall back to localStorage on any API error
                    console.log('Falling back to localStorage for client save');
                    console.log('Current clients before fallback:', clients.length);
                    console.log('Comprehensive client to save:', comprehensiveClient);
                    
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        setClients(updated);
                        storage.setClients(updated);
                        console.log('✅ Updated client in localStorage, new count:', updated.length);
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        setClients(newClients);
                        storage.setClients(newClients);
                        console.log('✅ Added new client to localStorage, new count:', newClients.length);
                    }
                    console.log('✅ Fallback: Client saved to localStorage only');
                }
            }
            
            // Silent save - no alert, just close modal and refresh
            setShowClientModal(false);
            setSelectedClient(null);
            
        } catch (error) {
            console.error('Failed to save client:', error);
            alert('Failed to save client: ' + error.message);
        }
        
        setShowClientModal(false);
        setSelectedClient(null);
        setRefreshKey(k => k + 1);
    };
    
    const handleSaveLead = (leadFormData) => {
        if (selectedLead) {
            setLeads(leads.map(l => l.id === selectedLead.id ? { ...selectedLead, ...leadFormData } : l));
        } else {
            const newLead = {
                id: Math.max(100, ...leads.map(l => l.id)) + 1,
                ...leadFormData,
                lastContact: new Date().toISOString().split('T')[0],
                activityLog: [{
                    id: Date.now(),
                    type: 'Lead Created',
                    description: `Lead created: ${leadFormData.name}`,
                    timestamp: new Date().toISOString(),
                    user: 'Current User'
                }]
            };
            setLeads([...leads, newLead]);
        }
        setShowLeadModal(false);
        setSelectedLead(null);
    };

    const handleDeleteClient = async (clientId) => {
        if (confirm('Delete this client?')) {
            try { await window.api.deleteClient(clientId); } catch {}
            setClients(clients.filter(c => c.id !== clientId));
        }
    };

    const handleDeleteLead = (leadId) => {
        if (confirm('Delete this lead?')) {
            setLeads(leads.filter(l => l.id !== leadId));
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
        setShowClientModal(true);
    };

    const handleOpenLead = (lead) => {
        setSelectedLead(lead);
        setShowLeadModal(true);
    };

    const handleNavigateToProject = (projectId) => {
        sessionStorage.setItem('openProjectId', projectId);
        setShowClientModal(false);
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
        setShowLeadModal(false);
        alert('Lead converted to client!');
    };

    // Pipeline View Component with AIDA explanation
    const PipelineView = () => {
        const [draggedItem, setDraggedItem] = useState(null);
        const [draggedType, setDraggedType] = useState(null);

        const clientOpportunities = clients.reduce((acc, client) => {
            if (client.opportunities && Array.isArray(client.opportunities)) {
                return acc.concat(client.opportunities.map(opp => ({
                    ...opp,
                    clientName: client.name,
                    clientId: client.id,
                    type: 'opportunity'
                })));
            }
            return acc;
        }, []);

        const totalLeads = leads.length;

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
                storage.setLeads(updatedLeads);
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
                storage.setClients(updatedClients);
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
                {/* AIDA Framework Explanation */}
                <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg border border-primary-200 p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                                <i className="fas fa-lightbulb text-white text-sm"></i>
                            </div>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">AIDA Sales Framework</h3>
                            <p className="text-xs text-gray-600 mb-2">
                                Track sales opportunities through proven AIDA methodology. Drag cards between stages to update progress.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                        <div className="bg-white rounded p-2 border border-gray-200">
                            <div className="font-medium text-xs text-gray-900 mb-0.5">
                                <i className="fas fa-eye text-gray-500 mr-1"></i>
                                Awareness
                            </div>
                            <p className="text-[10px] text-gray-600">Initial contact made</p>
                        </div>
                        <div className="bg-white rounded p-2 border border-gray-200">
                            <div className="font-medium text-xs text-gray-900 mb-0.5">
                                <i className="fas fa-search text-blue-500 mr-1"></i>
                                Interest
                            </div>
                            <p className="text-[10px] text-gray-600">Actively exploring</p>
                        </div>
                        <div className="bg-white rounded p-2 border border-gray-200">
                            <div className="font-medium text-xs text-gray-900 mb-0.5">
                                <i className="fas fa-heart text-yellow-500 mr-1"></i>
                                Desire
                            </div>
                            <p className="text-[10px] text-gray-600">Wants solution</p>
                        </div>
                        <div className="bg-white rounded p-2 border border-gray-200">
                            <div className="font-medium text-xs text-gray-900 mb-0.5">
                                <i className="fas fa-rocket text-green-500 mr-1"></i>
                                Action
                            </div>
                            <p className="text-[10px] text-gray-600">Ready to close</p>
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div className="text-sm text-gray-600 mb-1">Total Leads</div>
                        <div className="text-2xl font-bold text-gray-900">{leads.length}</div>
                        <div className="text-xs text-gray-500 mt-1">Active opportunities</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div className="text-sm text-gray-600 mb-1">Total Opportunities</div>
                        <div className="text-2xl font-bold text-primary-600">{leads.length + clientOpportunities.length}</div>
                        <div className="text-xs text-gray-500 mt-1">{leads.length} leads + {clientOpportunities.length} expansions</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between">
                        <div>
                            <div className="text-sm text-gray-600 mb-1">Conversion Rate</div>
                            <div className="text-2xl font-bold text-purple-600">
                                {leads.length > 0 ? Math.round((leads.filter(l => l.stage === 'Action').length / leads.length) * 100) : 0}%
                            </div>
                            <div className="text-xs text-gray-500 mt-1">To action stage</div>
                        </div>
                        <button
                            onClick={() => setRefreshKey(k => k + 1)}
                            className="p-2 rounded-lg hover:bg-gray-100 transition"
                            title="Refresh Pipeline"
                        >
                            <i className="fas fa-sync-alt text-sm text-gray-400"></i>
                        </button>
                    </div>
                </div>

                {/* Pipeline Board */}
                <div className="flex gap-4 overflow-x-auto pb-4">
                    {pipelineStages.map(stage => {
                        const stageLeads = leads.filter(lead => lead.stage === stage);
                        const stageOpps = clientOpportunities.filter(opp => opp.stage === stage);
                        const stageCount = stageLeads.length;
                        const isDraggedOver = draggedItem && draggedItem.stage !== stage;
                        
                        const stageIcons = {
                            'Awareness': 'fa-eye',
                            'Interest': 'fa-search',
                            'Desire': 'fa-heart',
                            'Action': 'fa-rocket'
                        };
                        
                        return (
                            <div 
                                key={stage} 
                                className={`flex-1 min-w-[280px] bg-gray-50 rounded-lg p-4 transition-all ${
                                    isDraggedOver ? 'ring-2 ring-primary-500 bg-primary-50' : ''
                                }`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                <div className="mb-3 px-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                            <i className={`fas ${stageIcons[stage]} text-gray-500`}></i>
                                            {stage}
                                        </h3>
                                        <span className="px-2 py-1 bg-white rounded-full text-xs font-medium text-gray-700 border border-gray-200">
                                            {stageLeads.length + stageOpps.length}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-600 font-medium">{stageCount} leads</div>
                                </div>

                                <div className="space-y-2">
                                    {stageLeads.length === 0 && stageOpps.length === 0 && (
                                        <div className={`text-center py-8 rounded-lg border-2 border-dashed transition ${
                                            isDraggedOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300'
                                        }`}>
                                            <i className="fas fa-inbox text-2xl text-gray-300 mb-2"></i>
                                            <p className="text-xs text-gray-400">No items</p>
                                        </div>
                                    )}
                                    
                                    {stageLeads.map(lead => (
                                        <div 
                                            key={`lead-${lead.id}`}
                                            draggable
                                            onDragStart={() => handleDragStart(lead, 'lead')}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => handleOpenLead(lead)}
                                            className={`bg-white rounded-lg p-3 border border-gray-200 shadow-sm hover:shadow-md cursor-move transition ${
                                                draggedItem?.id === lead.id ? 'opacity-50' : ''
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="font-medium text-sm text-gray-900 line-clamp-2 flex-1">{lead.name}</div>
                                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium shrink-0">LEAD</span>
                                            </div>
                                            <div className="text-xs text-gray-600 mb-2">
                                                <i className="fas fa-user mr-1"></i>
                                                {lead.contacts?.[0]?.name || 'No contact'}
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-500">{lead.status}</span>
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
                                                className={`bg-white rounded-lg p-3 border border-gray-200 shadow-sm hover:shadow-md cursor-move transition ${
                                                    draggedItem?.id === opp.id ? 'opacity-50' : ''
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="font-medium text-sm text-gray-900 line-clamp-2 flex-1">{opp.name}</div>
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium shrink-0">OPP</span>
                                                </div>
                                                <div className="text-xs text-gray-600 mb-2">
                                                    <i className="fas fa-building mr-1"></i>
                                                    {opp.clientName}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Existing client</span>
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
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {sortedClients.length === 0 ? (
                            <tr>
                                    <td colSpan="6" className={`px-6 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
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
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteClient(client.id);
                                            }}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // Leads List View
    const LeadsListView = () => (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Industry</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {filteredLeads.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-sm text-gray-500">
                                    <i className="fas fa-inbox text-3xl text-gray-300 mb-2"></i>
                                    <p>No leads found</p>
                                </td>
                            </tr>
                        ) : (
                            filteredLeads.map(lead => (
                                <tr 
                                    key={lead.id} 
                                    onClick={() => handleOpenLead(lead)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{lead.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">{lead.contacts?.[0]?.name || 'No contact'}</div>
                                        <div className="text-xs text-gray-500">{lead.contacts?.[0]?.email || ''}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lead.industry}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            lead.stage === 'Awareness' ? 'bg-gray-100 text-gray-800' :
                                            lead.stage === 'Interest' ? 'bg-blue-100 text-blue-800' :
                                            lead.stage === 'Desire' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {lead.stage}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            lead.status === 'New' ? 'bg-blue-100 text-blue-800' :
                                            lead.status === 'Contacted' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {lead.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteLead(lead.id);
                                            }}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">CRM & Sales</h1>
                    <p className="text-xs text-gray-600">Manage clients and leads</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={loadClients}
                        className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50"
                        title="Refresh data"
                    >
                        <i className="fas fa-sync-alt mr-1"></i>
                        Refresh
                    </button>
                    <button 
                        onClick={() => {
                            setSelectedClient(null);
                            setShowClientModal(true);
                        }}
                        className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50"
                    >
                        <i className="fas fa-plus mr-1"></i>
                        Client
                    </button>
                    <button 
                        onClick={() => {
                            setSelectedLead(null);
                            setShowLeadModal(true);
                        }}
                        className="px-2 py-1 bg-primary-600 text-white rounded text-xs font-medium hover:bg-primary-700"
                    >
                        <i className="fas fa-plus mr-1"></i>
                        Lead
                    </button>
                </div>
            </div>

            {/* View Tabs - Clients First */}
            <div className="bg-white rounded border border-gray-200 p-0.5 inline-flex">
                <button
                    onClick={() => setViewMode('clients')}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                        viewMode === 'clients' 
                            ? 'bg-primary-600 text-white' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                    <i className="fas fa-building mr-2"></i>
                    Clients ({clients.length})
                </button>
                <button
                    onClick={() => setViewMode('leads')}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                        viewMode === 'leads' 
                            ? 'bg-primary-600 text-white' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                    <i className="fas fa-star mr-2"></i>
                    Leads ({leads.length})
                </button>
                <button
                    onClick={() => setViewMode('pipeline')}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                        viewMode === 'pipeline' 
                            ? 'bg-primary-600 text-white' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                    <i className="fas fa-stream mr-2"></i>
                    Pipeline
                </button>
                <button
                    onClick={clearCacheAndReload}
                    className="px-2 py-1 rounded text-xs font-medium transition bg-yellow-500 text-white hover:bg-yellow-600"
                    title="Clear cache and reload fresh data"
                >
                    <i className="fas fa-sync-alt mr-2"></i>
                    Refresh Data
                </button>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div className="sm:col-span-2 lg:col-span-1">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search by name, industry, or contact..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                            />
                            <i className="fas fa-search absolute left-3 top-3 text-gray-400 text-sm"></i>
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
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
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
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
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                        >
                            <option value="All Status">All Status</option>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                            <option value="New">New</option>
                            <option value="Contacted">Contacted</option>
                            <option value="Qualified">Qualified</option>
                        </select>
                    </div>
                </div>
                
                {/* Search Results Counter */}
                {(searchTerm || filterIndustry !== 'All Industries' || filterStatus !== 'All Status') && (
                    <div className="mt-3 px-1">
                        <div className="flex items-center justify-between text-sm text-gray-600">
                            <span>
                                Showing {filteredClients.length} of {clients.length} clients
                                {searchTerm && ` matching "${searchTerm}"`}
                            </span>
                            {(searchTerm || filterIndustry !== 'All Industries' || filterStatus !== 'All Status') && (
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setFilterIndustry('All Industries');
                                        setFilterStatus('All Status');
                                    }}
                                    className="text-primary-600 hover:text-primary-700 font-medium"
                                >
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Content based on view mode */}
            {viewMode === 'clients' && <ClientsListView />}
            {viewMode === 'leads' && <LeadsListView />}
            {viewMode === 'pipeline' && <PipelineView />}

            {/* Modals */}
            {showClientModal && (
                <ClientDetailModal
                    client={selectedClient}
                    onSave={handleSaveClient}
                    onClose={() => {
                        setShowClientModal(false);
                        setSelectedClient(null);
                    }}
                    allProjects={projects}
                    onNavigateToProject={handleNavigateToProject}
                />
            )}

            {showLeadModal && (
                <LeadDetailModal
                    lead={selectedLead}
                    onSave={handleSaveLead}
                    onClose={() => {
                        setShowLeadModal(false);
                        setSelectedLead(null);
                    }}
                    onConvertToClient={convertLeadToClient}
                    allProjects={projects}
                />
            )}
        </div>
    );
};

window.Clients = Clients;

