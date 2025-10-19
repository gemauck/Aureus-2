// Database-First Clients Component - No localStorage dependency
const { useState, useEffect } = React;

const ClientsDatabaseFirst = () => {
    const [viewMode, setViewMode] = useState('clients');
    const [clients, setClients] = useState([]);
    const [leads, setLeads] = useState([]);
    const [projects, setProjects] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedLead, setSelectedLead] = useState(null);
    const [currentTab, setCurrentTab] = useState('overview');
    const [currentLeadTab, setCurrentLeadTab] = useState('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('All Industries');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [refreshKey, setRefreshKey] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const { isDark } = window.useTheme();

    // Utility function to calculate time since first contact
    const getTimeSinceFirstContact = (firstContactDate) => {
        if (!firstContactDate) return 'Not set';
        
        const firstContact = new Date(firstContactDate);
        const now = new Date();
        const diffTime = Math.abs(now - firstContact);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
        return `${Math.ceil(diffDays / 365)} years ago`;
    };

    // Database-first data loading
    const loadClients = async () => {
        console.log('🔄 Loading clients from database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token - redirecting to login');
                window.location.hash = '#/login';
                return;
            }

            const res = await window.api.listClients();
            const apiClients = res?.data?.clients || [];
            console.log('📡 Database returned clients:', apiClients.length);
            
            const processedClients = apiClients.map(c => ({
                id: c.id,
                name: c.name,
                status: c.status === 'active' ? 'Active' : 'Inactive',
                industry: c.industry || 'Other',
                type: 'client',
                revenue: c.revenue || 0,
                lastContact: c.lastContact || new Date().toISOString().split('T')[0],
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
            
            setClients(processedClients);
            console.log('✅ Clients loaded from database');
            
        } catch (error) {
            console.error('❌ Failed to load clients from database:', error);
            if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                console.log('🔑 Authentication expired - redirecting to login');
                window.storage.removeToken();
                window.storage.removeUser();
                window.location.hash = '#/login';
            } else {
                alert('Failed to load clients from database. Please try again.');
            }
        }
    };

    // Load leads from database
    const loadLeads = async () => {
        console.log('🔄 Loading leads from database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;

            const leadsRes = await window.api.getLeads?.();
            const apiLeads = leadsRes?.data || [];
            console.log('📡 Database returned leads:', apiLeads.length);
            
            setLeads(apiLeads);
            console.log('✅ Leads loaded from database');
            
        } catch (error) {
            console.error('❌ Failed to load leads from database:', error);
        }
    };

    // Load projects from database
    const loadProjects = async () => {
        console.log('🔄 Loading projects from database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;

            const projectsRes = await window.api.getProjects?.();
            const apiProjects = projectsRes?.data || [];
            console.log('📡 Database returned projects:', apiProjects.length);
            
            setProjects(apiProjects);
            console.log('✅ Projects loaded from database');
            
        } catch (error) {
            console.error('❌ Failed to load projects from database:', error);
        }
    };

    // Load all data from database
    const loadAllData = async () => {
        setIsLoading(true);
        try {
            await Promise.all([
                loadClients(),
                loadLeads(),
                loadProjects()
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    // Save client to database
    const handleSaveClient = async (clientFormData, stayInEditMode = false) => {
        console.log('💾 Saving client to database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to save client data');
                return;
            }

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

            // Save to database
            if (selectedClient) {
                // Update existing client
                await window.api.updateClient(comprehensiveClient.id, comprehensiveClient);
                console.log('✅ Client updated in database');
                
                // Update local state
                const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                setClients(updated);
                setSelectedClient(comprehensiveClient);
            } else {
                // Create new client
                const newClient = await window.api.createClient(comprehensiveClient);
                console.log('✅ Client created in database');
                
                // Add to local state
                setClients(prev => [...prev, newClient]);
                
                // Redirect to main view
                setViewMode('clients');
                setSelectedClient(null);
                setCurrentTab('overview');
            }
            
            if (!stayInEditMode) {
                setRefreshKey(k => k + 1);
            }
            
        } catch (error) {
            console.error('❌ Failed to save client to database:', error);
            alert('Failed to save client to database. Please try again.');
        }
    };

    // Save lead to database
    const handleSaveLead = async (leadFormData) => {
        console.log('💾 Saving lead to database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to save lead data');
                return;
            }

            if (selectedLead) {
                // Update existing lead
                const updatedLead = { ...selectedLead, ...leadFormData };
                await window.api.updateLead(updatedLead.id, updatedLead);
                console.log('✅ Lead updated in database');
                
                const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                setLeads(updatedLeads);
                setSelectedLead(updatedLead);
            } else {
                // Create new lead
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
                
                await window.api.createLead(newLead);
                console.log('✅ Lead created in database');
                
                const updatedLeads = [...leads, newLead];
                setLeads(updatedLeads);
                
                // Redirect to main view
                setViewMode('leads');
                setSelectedLead(null);
                setCurrentLeadTab('overview');
            }
            
        } catch (error) {
            console.error('❌ Failed to save lead to database:', error);
            alert('Failed to save lead to database. Please try again.');
        }
    };

    // Convert lead to client
    const convertLeadToClient = async (lead) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to convert lead');
                return;
            }

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
                    user: 'Current User'
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
            
            // Create client in database
            await window.api.createClient(newClient);
            
            // Delete lead from database
            await window.api.deleteLead(lead.id);
            
            // Update local state
            setClients(prev => [...prev, newClient]);
            setLeads(prev => prev.filter(l => l.id !== lead.id));
            setViewMode('clients');
            setSelectedLead(null);
            
        } catch (error) {
            console.error('❌ Failed to convert lead to client:', error);
            alert('Failed to convert lead to client. Please try again.');
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

    // Filter and search
    const filteredClients = clients.filter(client => {
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
        loadAllData();
    }, []);

    // Auto-refresh data every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadAllData();
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-4"></i>
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading data from database...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-xl ${isDark ? 'bg-primary-600' : 'bg-primary-500'} flex items-center justify-center`}>
                            <i className="fas fa-users text-white text-lg"></i>
                        </div>
                        <div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>CRM & Sales</h1>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Database-synchronized client and lead management</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => {
                                setSelectedClient(null);
                                setSelectedLead(null);
                                setViewMode('client-detail');
                            }}
                            className={`flex items-center space-x-2 px-4 py-2 ${isDark ? 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'} border rounded-lg text-sm font-medium transition-all duration-200`}
                        >
                            <i className="fas fa-plus text-xs"></i>
                            <span>Add Client</span>
                        </button>
                        <button 
                            onClick={() => {
                                setSelectedLead(null);
                                setSelectedClient(null);
                                setViewMode('lead-detail');
                            }}
                            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all duration-200"
                        >
                            <i className="fas fa-plus text-xs"></i>
                            <span>Add Lead</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* View Tabs */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-1 inline-flex shadow-sm`}>
                <button
                    onClick={() => setViewMode('clients')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'clients' 
                            ? 'bg-primary-600 text-white shadow-sm' 
                            : `${isDark ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`
                    }`}
                >
                    <i className="fas fa-building mr-2"></i>
                    Clients ({clients.length})
                </button>
                <button
                    onClick={() => setViewMode('leads')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'leads' 
                            ? 'bg-primary-600 text-white shadow-sm' 
                            : `${isDark ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`
                    }`}
                >
                    <i className="fas fa-user-plus mr-2"></i>
                    Leads ({leads.length})
                </button>
                <button
                    onClick={() => setViewMode('pipeline')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'pipeline' 
                            ? 'bg-primary-600 text-white shadow-sm' 
                            : `${isDark ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`
                    }`}
                >
                    <i className="fas fa-chart-line mr-2"></i>
                    Pipeline
                </button>
            </div>

            {/* Search and Filters - Hidden in detail views */}
            {viewMode !== 'client-detail' && viewMode !== 'lead-detail' && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                    <div className="space-y-4">
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
                        
                        <div className="grid grid-cols-2 gap-4">
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
                    </div>
                </div>
            )}

            {/* Content based on view mode */}
            {viewMode === 'clients' && (
                <div className="space-y-4">
                    {filteredClients.length === 0 ? (
                        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-8 text-center`}>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredClients.map(client => (
                                <div 
                                    key={client.id}
                                    onClick={() => handleOpenClient(client)}
                                    className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-xl p-6 cursor-pointer transition-all duration-200 hover:shadow-lg`}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <h3 className={`font-semibold text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-1`}>
                                                {client.name}
                                            </h3>
                                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {client.industry}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            client.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {client.status}
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Revenue:</span>
                                            <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                R{client.revenue.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Contacts:</span>
                                            <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {client.contacts?.length || 0}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Sites:</span>
                                            <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {client.sites?.length || 0}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {viewMode === 'leads' && (
                <div className="space-y-4">
                    {filteredLeads.length === 0 ? (
                        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-8 text-center`}>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredLeads.map(lead => (
                                <div 
                                    key={lead.id}
                                    onClick={() => handleOpenLead(lead)}
                                    className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-xl p-6 cursor-pointer transition-all duration-200 hover:shadow-lg`}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <h3 className={`font-semibold text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-1`}>
                                                {lead.name}
                                            </h3>
                                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {lead.industry}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            lead.status === 'New' ? 'bg-yellow-100 text-yellow-800' : 
                                            lead.status === 'Qualified' ? 'bg-blue-100 text-blue-800' :
                                            lead.status === 'Closed Won' ? 'bg-green-100 text-green-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {lead.status}
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Value:</span>
                                            <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                R{lead.value?.toLocaleString() || 0}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Contacts:</span>
                                            <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {lead.contacts?.length || 0}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>First Contact:</span>
                                            <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {getTimeSinceFirstContact(lead.firstContactDate)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Client Detail View */}
            {viewMode === 'client-detail' && (
                <div className="flex-1 overflow-hidden">
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
                                    <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`}></div>
                                    <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                        {selectedClient ? selectedClient.name : 'Add New Client'}
                                    </h1>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        <ClientDetailModal
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
                    </div>
                </div>
            )}

            {/* Lead Detail View */}
            {viewMode === 'lead-detail' && (
                <div className="flex-1 overflow-hidden">
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
                                        {selectedLead ? selectedLead.name : 'Add New Lead'}
                                    </h1>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        <LeadDetailModal
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
                    </div>
                </div>
            )}

            {/* Pipeline View */}
            {viewMode === 'pipeline' && (
                <div className="space-y-6">
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                        <h2 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-4`}>
                            Sales Pipeline
                        </h2>
                        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Pipeline view with database-synchronized data
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.ClientsDatabaseFirst = ClientsDatabaseFirst;
