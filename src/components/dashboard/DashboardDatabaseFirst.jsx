// Database-First Dashboard Component
const { useState, useEffect } = React;

const DashboardDatabaseFirst = () => {
    const [dashboardData, setDashboardData] = useState({
        clients: [],
        leads: [],
        projects: [],
        invoices: [],
        timeEntries: [],
        stats: {
            totalClients: 0,
            totalLeads: 0,
            totalProjects: 0,
            totalInvoices: 0,
            totalRevenue: 0,
            activeProjects: 0,
            pendingInvoices: 0
        }
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());

    // Load dashboard data from database
    const loadDashboardData = async () => {
        console.log('📊 Loading dashboard data from database...');
        setIsLoading(true);
        setError(null);

        try {
            // Check if user is authenticated
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No auth token, showing empty dashboard');
                setDashboardData({
                    clients: [],
                    leads: [],
                    projects: [],
                    invoices: [],
                    timeEntries: [],
                    stats: {
                        totalClients: 0,
                        totalLeads: 0,
                        totalProjects: 0,
                        totalInvoices: 0,
                        totalRevenue: 0,
                        activeProjects: 0,
                        pendingInvoices: 0
                    }
                });
                setIsLoading(false);
                return;
            }

            if (!window.DatabaseAPI) {
                throw new Error('DatabaseAPI not available');
            }

            // Load all data in parallel with timeout
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), 10000)
            );

            const dataPromise = Promise.all([
                window.DatabaseAPI.getClients().catch(err => {
                    console.warn('Failed to load clients:', err);
                    return [];
                }),
                window.DatabaseAPI.getLeads().catch(err => {
                    console.warn('Failed to load leads:', err);
                    return [];
                }),
                window.DatabaseAPI.getProjects().catch(err => {
                    console.warn('Failed to load projects:', err);
                    return [];
                }),
                window.DatabaseAPI.getInvoices().catch(err => {
                    console.warn('Failed to load invoices:', err);
                    return [];
                }),
                window.DatabaseAPI.getTimeEntries().catch(err => {
                    console.warn('Failed to load time entries:', err);
                    return [];
                })
            ]);

            const [clients, leads, projects, invoices, timeEntries] = await Promise.race([dataPromise, timeoutPromise]);

            // Calculate statistics
            const stats = {
                totalClients: clients.length,
                totalLeads: leads.length,
                totalProjects: projects.length,
                totalInvoices: invoices.length,
                totalRevenue: invoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0),
                activeProjects: projects.filter(p => p.status === 'Active').length,
                pendingInvoices: invoices.filter(i => i.status === 'Pending' || i.status === 'Draft').length
            };

            setDashboardData({
                clients,
                leads,
                projects,
                invoices,
                timeEntries,
                stats
            });

            setLastUpdated(new Date());
            console.log('✅ Dashboard data loaded successfully');

        } catch (error) {
            console.error('❌ Failed to load dashboard data:', error);
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Load data on component mount
    useEffect(() => {
        loadDashboardData();
    }, []);

    // Refresh data
    const handleRefresh = () => {
        loadDashboardData();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading dashboard data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                        <i className="fas fa-exclamation-triangle text-red-400"></i>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">
                            Error loading dashboard data
                        </h3>
                        <div className="mt-2 text-sm text-red-700">
                            <p>{error}</p>
                        </div>
                        <div className="mt-4">
                            <button
                                onClick={handleRefresh}
                                className="bg-red-100 text-red-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-red-200"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-600">Last updated: {lastUpdated.toLocaleTimeString()}</p>
                </div>
                <button
                    onClick={handleRefresh}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <i className="fas fa-sync-alt mr-2"></i>
                    Refresh
                </button>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-users text-blue-600"></i>
                            </div>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Total Clients</p>
                            <p className="text-2xl font-semibold text-gray-900">{dashboardData.stats.totalClients}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-user-plus text-green-600"></i>
                            </div>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Total Leads</p>
                            <p className="text-2xl font-semibold text-gray-900">{dashboardData.stats.totalLeads}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-project-diagram text-purple-600"></i>
                            </div>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Active Projects</p>
                            <p className="text-2xl font-semibold text-gray-900">{dashboardData.stats.activeProjects}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-dollar-sign text-yellow-600"></i>
                            </div>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                            <p className="text-2xl font-semibold text-gray-900">
                                R{dashboardData.stats.totalRevenue.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Clients */}
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Recent Clients</h3>
                    </div>
                    <div className="p-6">
                        {dashboardData.clients.length > 0 ? (
                            <div className="space-y-4">
                                {dashboardData.clients.slice(0, 5).map(client => (
                                    <div key={client.id} className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{client.name}</p>
                                            <p className="text-sm text-gray-500">{client.industry}</p>
                                        </div>
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            client.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {client.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-4">No clients found</p>
                        )}
                    </div>
                </div>

                {/* Recent Leads */}
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Recent Leads</h3>
                    </div>
                    <div className="p-6">
                        {dashboardData.leads.length > 0 ? (
                            <div className="space-y-4">
                                {dashboardData.leads.slice(0, 5).map(lead => (
                                    <div key={lead.id} className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                                            <p className="text-sm text-gray-500">{lead.industry}</p>
                                        </div>
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            lead.status === 'New' ? 'bg-blue-100 text-blue-800' :
                                            lead.status === 'Qualified' ? 'bg-green-100 text-green-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {lead.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-4">No leads found</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            <i className="fas fa-plus text-blue-600 mb-2"></i>
                            <p className="font-medium text-gray-900">Add Client</p>
                            <p className="text-sm text-gray-500">Create a new client</p>
                        </button>
                        <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            <i className="fas fa-user-plus text-green-600 mb-2"></i>
                            <p className="font-medium text-gray-900">Add Lead</p>
                            <p className="text-sm text-gray-500">Create a new lead</p>
                        </button>
                        <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            <i className="fas fa-project-diagram text-purple-600 mb-2"></i>
                            <p className="font-medium text-gray-900">New Project</p>
                            <p className="text-sm text-gray-500">Start a new project</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.DashboardDatabaseFirst = DashboardDatabaseFirst;
