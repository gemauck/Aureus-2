// Mobile-optimized Clients component
const { useState, useEffect } = React;
const ClientDetailModal = window.ClientDetailModal;
const LeadDetailModal = window.LeadDetailModal;

const ClientsMobile = () => {
    const [viewMode, setViewMode] = useState('clients');
    const [clients, setClients] = useState(() => {
        // Initialize with localStorage data if available
        const savedClients = storage.getClients();
        return savedClients || [];
    });
    const [leads, setLeads] = useState(initialLeads);
    const [projects, setProjects] = useState([]);
    const [viewMode, setViewMode] = useState('clients');
    const [isEditing, setIsEditing] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedLead, setSelectedLead] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('All Industries');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [refreshKey, setRefreshKey] = useState(0);
    const [sortField, setSortField] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const { isDark } = window.useTheme();

    // Load clients from API and localStorage
    const loadClients = async () => {
        try {
            const token = storage.getToken();
            if (token) {
                const apiClients = await window.api.getClients();
                console.log('API clients:', apiClients);
                
                if (apiClients && apiClients.length > 0) {
                    setClients(apiClients);
                    console.log('✅ Using API clients:', apiClients.length);
                } else {
                    // If API returns no clients, use localStorage clients
                    const savedClients = storage.getClients();
                    if (savedClients && savedClients.length > 0) {
                        console.log('✅ No API clients, using localStorage clients');
                        setClients(savedClients);
                        return;
                    }
                }
            } else {
                // No token, use localStorage
                const savedClients = storage.getClients();
                if (savedClients) {
                    setClients(savedClients);
                }
            }
        } catch (error) {
            console.error('Error loading clients:', error);
            // Fallback to localStorage
            const savedClients = storage.getClients();
            if (savedClients) {
                setClients(savedClients);
            }
        }
    };

    // Initialize data
    useEffect(() => {
        loadClients();
    }, []);

    // Save data
    useEffect(() => {
        storage.setClients(clients);
    }, [clients]);
    
    useEffect(() => {
        storage.setLeads(leads);
    }, [leads]);

    const handleSaveClient = async (clientFormData) => {
        try {
            const token = storage.getToken();
            
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
            
            // Always save to localStorage first for immediate persistence
            if (selectedClient) {
                const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                setClients(updated);
                storage.setClients(updated);
            } else {
                const newClients = [...clients, comprehensiveClient];
                setClients(newClients);
                storage.setClients(newClients);
            }
            
            // Try API save if token exists
            if (token) {
                try {
                    if (selectedClient) {
                        await window.api.updateClient(selectedClient.id, comprehensiveClient);
                    } else {
                        await window.api.createClient(comprehensiveClient);
                    }
                } catch (apiError) {
                    console.error('API save failed:', apiError);
                }
            }
            
            setIsEditing(false);
            
        } catch (error) {
            console.error('Error saving client:', error);
        }
    };

    const handleOpenClient = (client) => {
        setSelectedClient(client);
        setSelectedLead(null);
        setViewMode('client-detail');
        setIsEditing(false);
    };

    const handleOpenLead = (lead) => {
        setSelectedLead(lead);
        setSelectedClient(null);
        setViewMode('lead-detail');
        setIsEditing(false);
    };

    const filteredClients = clients.filter(client => {
        const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            client.industry.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesIndustry = filterIndustry === 'All Industries' || client.industry === filterIndustry;
        const matchesStatus = filterStatus === 'All Status' || client.status === filterStatus;
        return matchesSearch && matchesIndustry && matchesStatus;
    });

    const sortedClients = [...filteredClients].sort((a, b) => {
        const aVal = a[sortField] || '';
        const bVal = b[sortField] || '';
        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    // Mobile-optimized render
    const renderMobileClients = () => (
        <div className="space-y-4">
            {/* Mobile Search and Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="space-y-3">
                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search clients..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    </div>
                    
                    {/* Filters */}
                    <div className="grid grid-cols-2 gap-3">
                        <select
                            value={filterIndustry}
                            onChange={(e) => setFilterIndustry(e.target.value)}
                            className="w-full px-3 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                            <option value="All Industries">All Industries</option>
                            <option value="Technology">Technology</option>
                            <option value="Manufacturing">Manufacturing</option>
                            <option value="Healthcare">Healthcare</option>
                            <option value="Finance">Finance</option>
                        </select>
                        
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full px-3 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                            <option value="All Status">All Status</option>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                            <option value="Prospect">Prospect</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Mobile Client Cards */}
            <div className="space-y-3">
                {sortedClients.map(client => (
                    <div 
                        key={client.id}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 active:bg-gray-50 dark:active:bg-gray-700"
                        onClick={() => handleOpenClient(client)}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {client.name}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {client.industry}
                                </p>
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                client.status === 'Active' 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            }`}>
                                {client.status}
                            </span>
                        </div>
                        
                        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            {client.address && (
                                <div className="flex items-center">
                                    <i className="fas fa-map-marker-alt w-4 mr-2"></i>
                                    <span className="truncate">{client.address}</span>
                                </div>
                            )}
                            {client.website && (
                                <div className="flex items-center">
                                    <i className="fas fa-globe w-4 mr-2"></i>
                                    <span className="truncate">{client.website}</span>
                                </div>
                            )}
                            {client.revenue > 0 && (
                                <div className="flex items-center">
                                    <i className="fas fa-dollar-sign w-4 mr-2"></i>
                                    <span>R{client.revenue.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                                <span>{client.contacts?.length || 0} contacts</span>
                                <span>{client.sites?.length || 0} sites</span>
                                <span>{client.opportunities?.length || 0} opportunities</span>
                            </div>
                            <i className="fas fa-chevron-right text-gray-400"></i>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State */}
            {sortedClients.length === 0 && (
                <div className="text-center py-12">
                    <i className="fas fa-users text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No clients found</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        {searchTerm || filterIndustry !== 'All Industries' || filterStatus !== 'All Status'
                            ? 'Try adjusting your search or filters'
                            : 'Get started by adding your first client'
                        }
                    </p>
                    <button
                        onClick={() => setShowClientModal(true)}
                        className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                    >
                        Add Client
                    </button>
                </div>
            )}
        </div>
    );

    // Mobile-optimized render
    const renderMobileLeads = () => (
        <div className="space-y-4">
            {/* Mobile Lead Cards */}
            <div className="space-y-3">
                {leads.map(lead => (
                    <div 
                        key={lead.id}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 active:bg-gray-50 dark:active:bg-gray-700"
                        onClick={() => handleOpenLead(lead)}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {lead.name}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {lead.industry}
                                </p>
                            </div>
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {lead.stage}
                            </span>
                        </div>
                        
                        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            {lead.contacts?.[0] && (
                                <div className="flex items-center">
                                    <i className="fas fa-user w-4 mr-2"></i>
                                    <span>{lead.contacts[0].name}</span>
                                </div>
                            )}
                            {lead.value > 0 && (
                                <div className="flex items-center">
                                    <i className="fas fa-dollar-sign w-4 mr-2"></i>
                                    <span>R{lead.value.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {lead.status}
                            </span>
                            <i className="fas fa-chevron-right text-gray-400"></i>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State */}
            {leads.length === 0 && (
                <div className="text-center py-12">
                    <i className="fas fa-user-plus text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No leads found</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Start building your pipeline by adding leads
                    </p>
                    <button
                        onClick={() => setShowLeadModal(true)}
                        className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                    >
                        Add Lead
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Mobile Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Clients</h1>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setShowClientModal(true)}
                                className="bg-primary-600 text-white p-2 rounded-lg hover:bg-primary-700 transition-colors"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                            <button
                                onClick={() => setShowLeadModal(true)}
                                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <i className="fas fa-user-plus"></i>
                            </button>
                        </div>
                    </div>
                    
                    {/* Mobile Tabs */}
                    <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('clients')}
                            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                                viewMode === 'clients'
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                        >
                            Clients ({clients.length})
                        </button>
                        <button
                            onClick={() => setViewMode('leads')}
                            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                                viewMode === 'leads'
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                        >
                            Leads ({leads.length})
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Content */}
            <div className="p-4">
                {viewMode === 'clients' ? renderMobileClients() : renderMobileLeads()}
            </div>

            {/* Floating Action Button */}
            <button
                onClick={() => {
                    setSelectedClient(null);
                    setSelectedLead(null);
                    setViewMode('client-detail');
                    setIsEditing(true);
                }}
                className="fixed bottom-6 right-6 bg-primary-600 text-white w-14 h-14 rounded-full shadow-lg hover:bg-primary-700 transition-colors flex items-center justify-center z-50"
            >
                <i className="fas fa-plus text-xl"></i>
            </button>

            {/* Full-page views */}
            {viewMode === 'client-detail' && (
                <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 overflow-y-auto">
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-6">
                            <button
                                onClick={() => {
                                    setViewMode('clients');
                                    setSelectedClient(null);
                                    setIsEditing(false);
                                }}
                                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
                            >
                                <i className="fas fa-arrow-left"></i>
                                <span>Back</span>
                            </button>
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                            >
                                {isEditing ? 'View' : 'Edit'}
                            </button>
                        </div>
                        <ClientDetailModal
                            client={selectedClient}
                            onSave={handleSaveClient}
                            onClose={() => {
                                setViewMode('clients');
                                setSelectedClient(null);
                                setIsEditing(false);
                            }}
                            allProjects={projects}
                            isFullPage={true}
                            isEditing={isEditing}
                        />
                    </div>
                </div>
            )}

            {viewMode === 'lead-detail' && (
                <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 overflow-y-auto">
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-6">
                            <button
                                onClick={() => {
                                    setViewMode('leads');
                                    setSelectedLead(null);
                                    setIsEditing(false);
                                }}
                                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
                            >
                                <i className="fas fa-arrow-left"></i>
                                <span>Back</span>
                            </button>
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                            >
                                {isEditing ? 'View' : 'Edit'}
                            </button>
                        </div>
                        <LeadDetailModal
                            lead={selectedLead}
                            onSave={(leadData) => {
                                if (selectedLead) {
                                    const updated = leads.map(l => l.id === selectedLead.id ? leadData : l);
                                    setLeads(updated);
                                } else {
                                    setLeads([...leads, leadData]);
                                }
                                setIsEditing(false);
                            }}
                            onClose={() => {
                                setViewMode('leads');
                                setSelectedLead(null);
                                setIsEditing(false);
                            }}
                            isFullPage={true}
                            isEditing={isEditing}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.ClientsMobile = ClientsMobile;
