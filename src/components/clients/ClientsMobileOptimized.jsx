// Enhanced Mobile-Optimized Clients and Leads Component
const { useState, useEffect } = React;

const ClientsMobileOptimized = () => {
    const [viewMode, setViewMode] = useState('clients');
    const [clients, setClients] = useState(() => {
        const savedClients = window.storage?.getClients?.();
        if (savedClients && savedClients.length > 0) {
            // Filter to only include clients (not leads)
            return savedClients.filter(c => 
                c.type === 'client' || c.type === null || c.type === undefined
            );
        }
        return [];
    });
    const [leads, setLeads] = useState([]); // Leads are database-only
    const [projects, setProjects] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedLead, setSelectedLead] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('All Industries');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [refreshKey, setRefreshKey] = useState(0);
    const [currentTab, setCurrentTab] = useState('overview');
    const [currentLeadTab, setCurrentLeadTab] = useState('overview');
    const [showFilters, setShowFilters] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { isDark } = window.useTheme();

    // Load clients from API and localStorage
    const loadClients = async () => {
        setIsLoading(true);
        try {
            const token = window.storage?.getToken?.();
            if (token) {
                const apiResponse = await window.api.getClients();
                
                // Extract clients from response - handle different response structures
                let apiClients = [];
                if (Array.isArray(apiResponse)) {
                    apiClients = apiResponse;
                } else if (apiResponse?.data?.clients) {
                    apiClients = apiResponse.data.clients;
                } else if (apiResponse?.clients) {
                    apiClients = apiResponse.clients;
                } else if (apiResponse?.data && Array.isArray(apiResponse.data)) {
                    apiClients = apiResponse.data;
                }
                
                
                if (apiClients && apiClients.length > 0) {
                    // Filter to only include clients (type === 'client' or null/undefined for legacy)
                    const clientsOnly = apiClients.filter(c => 
                        c.type === 'client' || c.type === null || c.type === undefined
                    );
                    setClients(clientsOnly);
                } else {
                    const savedClients = window.storage?.getClients?.();
                    if (savedClients && savedClients.length > 0) {
                        // Filter to only include clients
                        const clientsOnly = savedClients.filter(c => 
                            c.type === 'client' || c.type === null || c.type === undefined
                        );
                        setClients(clientsOnly);
                    }
                }
            } else {
                const savedClients = window.storage?.getClients?.();
                if (savedClients) {
                    // Filter to only include clients
                    const clientsOnly = savedClients.filter(c => 
                        c.type === 'client' || c.type === null || c.type === undefined
                    );
                    setClients(clientsOnly);
                }
            }
        } catch (error) {
            console.error('Error loading clients:', error);
            // Fallback to localStorage
            const savedClients = window.storage?.getClients?.();
            if (savedClients) {
                // Filter to only include clients
                const clientsOnly = savedClients.filter(c => 
                    c.type === 'client' || c.type === null || c.type === undefined
                );
                setClients(clientsOnly);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Load leads from API and localStorage
    const loadLeads = async () => {
        try {
            // Try localStorage first
            const savedLeads = window.storage?.getLeads?.();
            if (savedLeads && savedLeads.length > 0) {
                setLeads(savedLeads);
            }

            // Then load from API
            const token = window.storage?.getToken?.();
            if (token && window.api?.getLeads) {
                const apiLeads = await window.api.getLeads();
                if (apiLeads?.data?.leads || apiLeads?.leads) {
                    const leadsData = apiLeads.data?.leads || apiLeads.leads;
                    if (leadsData.length > 0) {
                        setLeads(leadsData);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading leads:', error);
        }
    };

    // Save functions
    const handleSaveClient = async (clientFormData, stayInEditMode = false) => {
        
        try {
            const token = window.storage?.getToken?.();
            
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
            
            if (selectedClient) {
                const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                setClients(updated);
                window.storage?.setClients?.(updated);
                setSelectedClient(comprehensiveClient);
            } else {
                const newClients = [...clients, comprehensiveClient];
                setClients(newClients);
                window.storage?.setClients?.(newClients);
                
                // For new clients, redirect to main clients view
                setViewMode('clients');
                setSelectedClient(null);
                setCurrentTab('overview');
            }
            
            if (!stayInEditMode) {
                setRefreshKey(k => k + 1);
            }
        } catch (error) {
            console.error('Failed to save client:', error);
        }
    };

    const handleSaveLead = async (leadFormData) => {
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                throw new Error('No authentication token found. Please log in.');
            }

            if (selectedLead) {
                // Update existing lead
                const updatedLead = { ...selectedLead, ...leadFormData };
                
                const apiResponse = await window.api.updateLead(updatedLead.id, updatedLead);
                const updatedLeadFromAPI = apiResponse?.data?.lead || apiResponse?.lead || apiResponse;
                
                // CRITICAL: Reload leads from database to ensure UI shows persisted data
                await loadLeads();
                
                // Use the updated lead from API if available, otherwise use the updated lead
                if (updatedLeadFromAPI && updatedLeadFromAPI.id) {
                    setSelectedLead(updatedLeadFromAPI);
                } else {
                    // Fallback: find the updated lead from the reloaded list
                    const reloadedLeads = await window.api.getLeads();
                    const leadsData = reloadedLeads?.data?.leads || reloadedLeads?.leads || [];
                    const reloadedLead = leadsData.find(l => l.id === selectedLead.id);
                    if (reloadedLead) {
                        setSelectedLead(reloadedLead);
                    } else {
                        setSelectedLead(updatedLead);
                    }
                }
            } else {
                // Create new lead - don't include ID, let database generate it
                // Get current user info
                const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
                
                const newLeadData = {
                    ...leadFormData,
                    lastContact: new Date().toISOString().split('T')[0],
                    activityLog: [{
                        id: Date.now(),
                        type: 'Lead Created',
                        description: `Lead created: ${leadFormData.name}`,
                        timestamp: new Date().toISOString(),
                        user: currentUser.name,
                        userId: currentUser.id,
                        userEmail: currentUser.email
                    }]
                };
                
                const apiResponse = await window.api.createLead(newLeadData);
                const savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse;
                
                // CRITICAL: Reload leads from database to ensure UI shows persisted data
                // This ensures the lead appears in the UI even if the API response was incomplete
                await loadLeads();
                
                // For new leads, redirect to main leads view
                setViewMode('leads');
                setSelectedLead(null);
                setCurrentLeadTab('overview');
            }
        } catch (error) {
            console.error('❌ Error saving lead:', error);
            alert('Failed to save lead: ' + error.message);
        }
    };

    // Navigation handlers
    const handleOpenClient = (client) => {
        setSelectedClient(client);
        setSelectedLead(null);
        setViewMode('client-detail');
    };

    const handleOpenLead = (lead) => {
        setSelectedLead(lead);
        setSelectedClient(null);
        setViewMode('lead-detail');
    };

    const convertLeadToClient = (lead) => {
        const newClient = {
            id: Date.now().toString(),
            name: lead.name,
            industry: lead.industry,
            status: 'Active',
            type: 'client',
            revenue: lead.value || 0,
            lastContact: new Date().toISOString().split('T')[0],
            address: '',
            website: '',
            notes: lead.notes || '',
            contacts: lead.contacts || [],
            followUps: [],
            projectIds: [],
            comments: lead.comments || [],
            sites: [],
            opportunities: [],
            contracts: [],
            activityLog: [{
                id: Date.now(),
                type: 'Lead Converted',
                description: `Converted from lead: ${lead.name}`,
                timestamp: new Date().toISOString(),
                user: (window.storage?.getUserInfo() || { name: 'System' }).name,
                userId: (window.storage?.getUserInfo() || { id: 'system' }).id,
                userEmail: (window.storage?.getUserInfo() || { email: 'system' }).email
            }],
            billingTerms: {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            }
        };
        
        setClients([...clients, newClient]);
        setLeads(leads.filter(l => l.id !== lead.id));
        setViewMode('clients');
        setSelectedLead(null);
    };

    // Filter and search
    const filteredClients = clients.filter(client => {
        // Ensure we only show clients (not leads)
        const isClient = client.type === 'client' || client.type === null || client.type === undefined;
        if (!isClient) return false;
        
        const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            client.industry.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesIndustry = filterIndustry === 'All Industries' || client.industry === filterIndustry;
        const matchesStatus = filterStatus === 'All Status' || client.status === filterStatus;
        return matchesSearch && matchesIndustry && matchesStatus;
    });

    const filteredLeads = leads.filter(lead => {
        const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            lead.industry.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesIndustry = filterIndustry === 'All Industries' || lead.industry === filterIndustry;
        const matchesStatus = filterStatus === 'All Status' || lead.status === filterStatus;
        return matchesSearch && matchesIndustry && matchesStatus;
    });

    // Load data on mount
    useEffect(() => {
        loadClients();
        loadLeads();
    }, []);

    // Mobile-optimized header
    const MobileHeader = ({ title, onBack, showFilters = false }) => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-3 sticky top-14 z-30`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    {onBack && (
                        <button 
                            onClick={onBack}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'} p-2 rounded-lg transition-colors`}
                        >
                            <i className="fas fa-arrow-left text-lg"></i>
                        </button>
                    )}
                    <h1 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {title}
                    </h1>
                </div>
                <div className="flex items-center space-x-2">
                    {showFilters && (
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'} p-2 rounded-lg transition-colors`}
                        >
                            <i className="fas fa-filter text-lg"></i>
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (viewMode === 'clients') {
                                setViewMode('client-detail');
                                setSelectedClient(null);
                            } else {
                                setViewMode('lead-detail');
                                setSelectedLead(null);
                            }
                        }}
                        className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                    >
                        <i className="fas fa-plus mr-1"></i>
                        Add {viewMode === 'clients' ? 'Client' : 'Lead'}
                    </button>
                </div>
            </div>
        </div>
    );

    // Mobile-optimized search and filters
    const MobileSearchFilters = () => (
        <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} border-b px-4 py-3 space-y-3 sticky top-[calc(56px+49px)] z-20`}>
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search clients and leads..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full px-4 py-3 pl-10 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500`}
                />
                <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            </div>
            
            {showFilters && (
                <div className="grid grid-cols-2 gap-3">
                    <select
                        value={filterIndustry}
                        onChange={(e) => setFilterIndustry(e.target.value)}
                        className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                    >
                        <option>All Industries</option>
                        <option>Technology</option>
                        <option>Manufacturing</option>
                        <option>Healthcare</option>
                        <option>Finance</option>
                        <option>Retail</option>
                        <option>Education</option>
                        <option>Government</option>
                        <option>Diesel Supply</option>
                        <option>Logistics</option>
                        <option>Other</option>
                    </select>
                    
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                    >
                        <option>All Status</option>
                        <option>Active</option>
                        <option>Inactive</option>
                        <option>New</option>
                        <option>Contacted</option>
                        <option>Qualified</option>
                        <option>Proposal</option>
                        <option>Negotiation</option>
                        <option>Closed Won</option>
                        <option>Closed Lost</option>
                    </select>
                </div>
            )}
        </div>
    );

    // Mobile-optimized card component
    const MobileCard = ({ item, type, onClick }) => (
        <div 
            onClick={() => onClick(item)}
            className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-xl p-4 mb-3 cursor-pointer transition-all duration-200 active:scale-98`}
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                    <h3 className={`font-semibold text-base ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-1`}>
                        {item.name}
                    </h3>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {item.industry}
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        type === 'client' 
                            ? (item.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800')
                            : (item.status === 'New' ? 'bg-yellow-100 text-yellow-800' : 
                               item.status === 'Qualified' ? 'bg-blue-100 text-blue-800' :
                               item.status === 'Closed Won' ? 'bg-green-100 text-green-800' :
                               'bg-gray-100 text-gray-800')
                    }`}>
                        {item.status}
                    </span>
                    <i className={`fas fa-chevron-right text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                </div>
            </div>
            
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-4">
                    <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        <i className="fas fa-users mr-1"></i>
                        {item.contacts?.length || 0} contacts
                    </span>
                    {type === 'client' && (
                        <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            <i className="fas fa-map-marker-alt mr-1"></i>
                            {item.sites?.length || 0} sites
                        </span>
                    )}
                </div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {type === 'client' && item.revenue && `R${item.revenue.toLocaleString()}`}
                    {type === 'lead' && item.value && `R${item.value.toLocaleString()}`}
                </div>
            </div>
        </div>
    );

    // Mobile-optimized tabs
    const MobileTabs = () => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 sticky top-14 z-40`}>
            <div className="flex space-x-0">
                <button
                    onClick={() => setViewMode('clients')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                        viewMode === 'clients'
                            ? 'border-primary-600 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                            : isDark 
                                ? 'border-transparent text-gray-400 hover:text-gray-200'
                                : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                >
                    <i className="fas fa-building mr-2"></i>
                    Clients ({filteredClients.length})
                </button>
                <button
                    onClick={() => setViewMode('leads')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                        viewMode === 'leads'
                            ? 'border-primary-600 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                            : isDark 
                                ? 'border-transparent text-gray-400 hover:text-gray-200'
                                : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                >
                    <i className="fas fa-user-plus mr-2"></i>
                    Leads ({filteredLeads.length})
                </button>
            </div>
        </div>
    );

    // Main content area
    const MainContent = () => {
        if (viewMode === 'client-detail') {
            return (
                <div className="flex-1 overflow-hidden">
                    <MobileHeader 
                        title={selectedClient ? selectedClient.name : 'Add Client'} 
                        onBack={() => {
                            setViewMode('clients');
                            setSelectedClient(null);
                        }}
                    />
                    <div className="flex-1 overflow-y-auto">
                        {(() => {
                            const Modal = window.ClientDetailModal;
                            return Modal ? (
                                <Modal
                                    client={selectedClient}
                                    onSave={handleSaveClient}
                                    onClose={() => {
                                        setViewMode('clients');
                                        setSelectedClient(null);
                                        setCurrentTab('overview');
                                    }}
                                    allProjects={projects}
                                    onNavigateToProject={() => {}}
                                    isFullPage={true}
                                    isEditing={true}
                                    hideSearchFilters={true}
                                    initialTab={currentTab}
                                    onTabChange={setCurrentTab}
                                />
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <i className="fas fa-exclamation-triangle text-3xl mb-2"></i>
                                    <p>ClientDetailModal not loaded. Please refresh.</p>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            );
        }

        if (viewMode === 'lead-detail') {
            return (
                <div className="flex-1 overflow-hidden">
                    <MobileHeader 
                        title={selectedLead ? selectedLead.name : 'Add Lead'} 
                        onBack={() => {
                            setViewMode('leads');
                            setSelectedLead(null);
                        }}
                    />
                    <div className="flex-1 overflow-y-auto">
                        {(() => {
                            const Modal = window.LeadDetailModal;
                            return Modal ? (
                                <Modal
                                    lead={selectedLead}
                                    onSave={handleSaveLead}
                                    onClose={() => {
                                        setViewMode('leads');
                                        setSelectedLead(null);
                                        setCurrentLeadTab('overview');
                                    }}
                                    onConvertToClient={convertLeadToClient}
                                    allProjects={projects}
                                    isFullPage={true}
                                    isEditing={true}
                                    hideSearchFilters={true}
                                    initialTab={currentLeadTab}
                                    onTabChange={setCurrentLeadTab}
                                />
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <i className="fas fa-exclamation-triangle text-3xl mb-2"></i>
                                    <p>LeadDetailModal not loaded. Please refresh.</p>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            );
        }

        return (
            <div className="flex-1 overflow-y-auto">
                <MobileSearchFilters />
                <div className="px-4 py-3 pb-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <i className="fas fa-spinner fa-spin text-2xl text-primary-600"></i>
                        </div>
                    ) : (
                        <>
                            {viewMode === 'clients' ? (
                                <>
                                    {filteredClients.length === 0 ? (
                                        <div className="text-center py-8">
                                            <i className="fas fa-building text-4xl text-gray-400 mb-4"></i>
                                            <h3 className={`text-lg font-medium ${isDark ? 'text-gray-300' : 'text-gray-900'} mb-2`}>
                                                No clients found
                                            </h3>
                                            <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                                                Get started by adding your first client
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setViewMode('client-detail');
                                                    setSelectedClient(null);
                                                }}
                                                className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                            >
                                                Add Client
                                            </button>
                                        </div>
                                    ) : (
                                        filteredClients.map(client => (
                                            <MobileCard
                                                key={client.id}
                                                item={client}
                                                type="client"
                                                onClick={handleOpenClient}
                                            />
                                        ))
                                    )}
                                </>
                            ) : (
                                <>
                                    {filteredLeads.length === 0 ? (
                                        <div className="text-center py-8">
                                            <i className="fas fa-user-plus text-4xl text-gray-400 mb-4"></i>
                                            <h3 className={`text-lg font-medium ${isDark ? 'text-gray-300' : 'text-gray-900'} mb-2`}>
                                                No leads found
                                            </h3>
                                            <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                                                Start building your pipeline with your first lead
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setViewMode('lead-detail');
                                                    setSelectedLead(null);
                                                }}
                                                className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                            >
                                                Add Lead
                                            </button>
                                        </div>
                                    ) : (
                                        filteredLeads.map(lead => (
                                            <MobileCard
                                                key={lead.id}
                                                item={lead}
                                                type="lead"
                                                onClick={handleOpenLead}
                                            />
                                        ))
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 relative">
            <MobileTabs />
            <div className="flex-1 overflow-hidden">
                <MainContent />
            </div>
        </div>
    );
};

// Make available globally
window.ClientsMobileOptimized = ClientsMobileOptimized;
