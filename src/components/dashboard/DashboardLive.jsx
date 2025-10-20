// Live Dashboard Component - Connected to Real Mechanisms
const { useState, useEffect, useCallback } = React;

const DashboardLive = () => {
    const [dashboardData, setDashboardData] = useState({
        clients: [],
        leads: [],
        projects: [],
        invoices: [],
        timeEntries: [],
        users: [],
        stats: {
            totalClients: 0,
            totalLeads: 0,
            totalProjects: 0,
            totalInvoices: 0,
            totalRevenue: 0,
            activeProjects: 0,
            pendingInvoices: 0,
            overdueInvoices: 0,
            overdueAmount: 0,
            hoursThisMonth: 0,
            hoursLastMonth: 0,
            pipelineValue: 0,
            weightedPipeline: 0
        }
    });
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
    const [liveSyncStatus, setLiveSyncStatus] = useState('disconnected');
    const { isDark } = window.useTheme();

    // Optimized real-time data loading with immediate localStorage display
    const loadDashboardData = useCallback(async (showLoading = true) => {
        console.log('🔄 DashboardLive: Starting optimized data load...');
        
        if (showLoading) {
            setIsLoading(true);
        } else {
            setIsRefreshing(true);
        }
        setError(null);
        setConnectionStatus('connecting');

        try {
            // IMMEDIATE: Load from localStorage first for instant display
            console.log('⚡ DashboardLive: Loading cached data immediately...');
            const allClients = window.storage?.getClients?.() || [];
            
            // Separate clients and leads based on type field
            const cachedClients = allClients.filter(c => c.type === 'client' || !c.type); // Default to client if no type
            const cachedLeads = allClients.filter(c => c.type === 'lead');
            
            const cachedProjects = window.storage?.getProjects?.() || [];
            const cachedInvoices = window.storage?.getInvoices?.() || [];
            const cachedTimeEntries = window.storage?.getTimeEntries?.() || [];
            const cachedUsers = window.storage?.getUsers?.() || [];

            // Calculate stats from cached data immediately
            const now = new Date();
            const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

            const thisMonthEntries = cachedTimeEntries.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate >= thisMonth;
            });
            const lastMonthEntries = cachedTimeEntries.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate >= lastMonth && entryDate < thisMonth;
            });

            const hoursThisMonth = thisMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
            const hoursLastMonth = lastMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);

            const overdueInvoices = cachedInvoices.filter(inv => {
                const dueDate = new Date(inv.dueDate);
                return inv.status === 'Unpaid' && dueDate < now;
            });
            const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

            const pipelineValue = cachedLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);
            const weightedPipeline = cachedLeads.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0);

            const cachedStats = {
                totalClients: cachedClients.length,
                totalLeads: cachedLeads.length,
                totalProjects: cachedProjects.length,
                totalInvoices: cachedInvoices.length,
                totalRevenue: cachedInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0),
                activeProjects: cachedProjects.filter(p => p.status === 'Active' || p.status === 'In Progress').length,
                pendingInvoices: cachedInvoices.filter(i => i.status === 'Pending' || i.status === 'Draft').length,
                overdueInvoices: overdueInvoices.length,
                overdueAmount: overdueAmount,
                hoursThisMonth: hoursThisMonth,
                hoursLastMonth: hoursLastMonth,
                pipelineValue: pipelineValue,
                weightedPipeline: weightedPipeline
            };

            // Set cached data immediately for instant display
            setDashboardData({
                clients: cachedClients,
                leads: cachedLeads,
                projects: cachedProjects,
                invoices: cachedInvoices,
                timeEntries: cachedTimeEntries,
                users: cachedUsers,
                stats: cachedStats
            });

            setIsLoading(false);
            setIsRefreshing(false);
            setConnectionStatus('connected');
            console.log('✅ DashboardLive: Cached data displayed instantly');

            // Check authentication for API sync
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ DashboardLive: No auth token, using cached data only');
                return;
            }

            // Check if DatabaseAPI is available
            if (!window.DatabaseAPI) {
                console.warn('⚠️ DashboardLive: DatabaseAPI not available, using cached data');
                return;
            }

            // BACKGROUND: Sync with API in parallel (non-blocking)
            console.log('🔄 DashboardLive: Syncing with API in background...');
            const syncPromises = [
                window.DatabaseAPI.getClients().catch(err => {
                    console.warn('Client sync failed:', err);
                    return { data: { clients: [] } };
                }),
                window.DatabaseAPI.getProjects().catch(err => {
                    console.warn('Project sync failed:', err);
                    return { data: [] };
                }),
                window.DatabaseAPI.getInvoices().catch(err => {
                    console.warn('Invoice sync failed:', err);
                    return { data: [] };
                }),
                window.DatabaseAPI.getTimeEntries().catch(err => {
                    console.warn('Time entry sync failed:', err);
                    return { data: [] };
                }),
                window.DatabaseAPI.getUsers().catch(err => {
                    console.warn('User sync failed:', err);
                    return { data: [] };
                })
            ];

            // Update with fresh API data when available
            Promise.allSettled(syncPromises).then((results) => {
                const [clientsRes, projectsRes, invoicesRes, timeEntriesRes, usersRes] = results.map(r => r.status === 'fulfilled' ? r.value : { data: [] });

                const allClientsFromAPI = Array.isArray(clientsRes.data?.clients) ? clientsRes.data.clients : cachedClients.concat(cachedLeads);
                
                // Separate clients and leads from API data
                const clients = allClientsFromAPI.filter(c => c.type === 'client' || !c.type); // Default to client if no type
                const leads = allClientsFromAPI.filter(c => c.type === 'lead');
                
                const projects = Array.isArray(projectsRes.data) ? projectsRes.data : cachedProjects;
                const invoices = Array.isArray(invoicesRes.data) ? invoicesRes.data : cachedInvoices;
                const timeEntries = Array.isArray(timeEntriesRes.data) ? timeEntriesRes.data : cachedTimeEntries;
                const users = Array.isArray(usersRes.data) ? usersRes.data : cachedUsers;

                // Recalculate stats with fresh data
                const freshThisMonthEntries = timeEntries.filter(entry => {
                    const entryDate = new Date(entry.date);
                    return entryDate >= thisMonth;
                });
                const freshLastMonthEntries = timeEntries.filter(entry => {
                    const entryDate = new Date(entry.date);
                    return entryDate >= lastMonth && entryDate < thisMonth;
                });

                const freshHoursThisMonth = freshThisMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
                const freshHoursLastMonth = freshLastMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);

                const freshOverdueInvoices = invoices.filter(inv => {
                    const dueDate = new Date(inv.dueDate);
                    return inv.status === 'Unpaid' && dueDate < now;
                });
                const freshOverdueAmount = freshOverdueInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

                const freshPipelineValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);
                const freshWeightedPipeline = leads.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0);

                const freshStats = {
                    totalClients: clients.length,
                    totalLeads: leads.length,
                    totalProjects: projects.length,
                    totalInvoices: invoices.length,
                    totalRevenue: invoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0),
                    activeProjects: projects.filter(p => p.status === 'Active' || p.status === 'In Progress').length,
                    pendingInvoices: invoices.filter(i => i.status === 'Pending' || i.status === 'Draft').length,
                    overdueInvoices: freshOverdueInvoices.length,
                    overdueAmount: freshOverdueAmount,
                    hoursThisMonth: freshHoursThisMonth,
                    hoursLastMonth: freshHoursLastMonth,
                    pipelineValue: freshPipelineValue,
                    weightedPipeline: freshWeightedPipeline
                };

                // Update with fresh data
                setDashboardData({
                    clients,
                    leads,
                    projects,
                    invoices,
                    timeEntries,
                    users,
                    stats: freshStats
                });

                setLastUpdated(new Date());
                console.log('✅ DashboardLive: Fresh API data synced');
            });

        } catch (error) {
            console.error('❌ Failed to load dashboard data:', error);
            setError(error.message);
            setConnectionStatus('error');
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Live data sync integration
    useEffect(() => {
        if (!window.LiveDataSync) {
            console.warn('LiveDataSync not available, falling back to manual refresh');
            return;
        }

        const subscriptionId = 'dashboard-live';
        
        // Subscribe to live updates
        window.LiveDataSync.subscribe(subscriptionId, (message) => {
            console.log('📡 Dashboard received live update:', message);
            
            switch (message.type) {
                case 'connection':
                    setLiveSyncStatus(message.status);
                    break;
                    
                case 'data':
                    // Update specific data type
                    setDashboardData(prev => ({
                        ...prev,
                        [message.dataType]: message.data,
                        stats: calculateStats({
                            ...prev,
                            [message.dataType]: message.data
                        })
                    }));
                    setLastUpdated(message.timestamp);
                    break;
                    
                case 'sync':
                    if (message.status === 'success') {
                        setLastUpdated(message.timestamp);
                        setError(null);
                    } else if (message.status === 'error') {
                        setError(message.error);
                    }
                    break;
            }
        });

        // Start live sync if not running
        if (!window.LiveDataSync.getStatus().isRunning) {
            window.LiveDataSync.start();
        }

        // Cleanup
        return () => {
            window.LiveDataSync.unsubscribe(subscriptionId);
        };
    }, []);

    // Calculate stats helper
    const calculateStats = useCallback((data) => {
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const thisMonthEntries = (data.timeEntries || []).filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= thisMonth;
        });
        const lastMonthEntries = (data.timeEntries || []).filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= lastMonth && entryDate < thisMonth;
        });

        const hoursThisMonth = thisMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
        const hoursLastMonth = lastMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);

        const overdueInvoices = (data.invoices || []).filter(inv => {
            const dueDate = new Date(inv.dueDate);
            return inv.status === 'Unpaid' && dueDate < now;
        });
        const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

        // Ensure leads is an array
        const leadsArray = Array.isArray(data.leads) ? data.leads : [];
        const pipelineValue = leadsArray.reduce((sum, lead) => sum + (lead.value || 0), 0);
        const weightedPipeline = leadsArray.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0);

        return {
            totalClients: (data.clients || []).length,
            totalLeads: leadsArray.length,
            totalProjects: (data.projects || []).length,
            totalInvoices: (data.invoices || []).length,
            totalRevenue: (data.invoices || []).reduce((sum, invoice) => sum + (invoice.total || 0), 0),
            activeProjects: (data.projects || []).filter(p => p.status === 'Active' || p.status === 'In Progress').length,
            pendingInvoices: (data.invoices || []).filter(i => i.status === 'Pending' || i.status === 'Draft').length,
            overdueInvoices: overdueInvoices.length,
            overdueAmount: overdueAmount,
            hoursThisMonth: hoursThisMonth,
            hoursLastMonth: hoursLastMonth,
            pipelineValue: pipelineValue,
            weightedPipeline: weightedPipeline
        };
    }, []);

    // Initial load
    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    // Manual refresh
    const handleRefresh = () => {
        if (window.LiveDataSync) {
            window.LiveDataSync.forceSync();
        } else {
            loadDashboardData(false);
        }
    };

    // Toggle live sync
    const toggleLiveSync = () => {
        if (window.LiveDataSync) {
            if (window.LiveDataSync.getStatus().isRunning) {
                window.LiveDataSync.stop();
            } else {
                window.LiveDataSync.start();
            }
        }
    };

    // Connection status indicator
    const getConnectionStatusColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'text-green-600';
            case 'connecting': return 'text-yellow-600';
            case 'error': return 'text-red-600';
            default: return 'text-gray-600';
        }
    };

    const getConnectionStatusIcon = () => {
        switch (connectionStatus) {
            case 'connected': return 'fa-check-circle';
            case 'connecting': return 'fa-spinner fa-spin';
            case 'error': return 'fa-exclamation-triangle';
            default: return 'fa-question-circle';
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading live dashboard data...</p>
                    <p className="text-xs text-gray-500 mt-2">Connecting to live data sources...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                        <i className="fas fa-exclamation-triangle text-red-400"></i>
                    </div>
                    <div className="ml-3">
                        <h3 className={`text-sm font-medium ${isDark ? 'text-red-200' : 'text-red-800'}`}>
                            Error loading dashboard data
                        </h3>
                        <div className={`mt-2 text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>
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
        <div className="space-y-4">
            {/* Header with Live Status */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        Live Dashboard
                    </h1>
                    <div className="flex items-center space-x-2">
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Last updated: {lastUpdated.toLocaleTimeString()}
                        </p>
                        <div className={`flex items-center space-x-1 ${getConnectionStatusColor()}`}>
                            <i className={`fas ${getConnectionStatusIcon()} text-xs`}></i>
                            <span className="text-xs font-medium capitalize">{connectionStatus}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {/* Live sync toggle */}
                    <button
                        onClick={toggleLiveSync}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                            liveSyncStatus === 'connected' || liveSyncStatus === 'syncing'
                                ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        <i className={`fas fa-${liveSyncStatus === 'connected' || liveSyncStatus === 'syncing' ? 'wifi' : 'wifi-slash'} mr-1`}></i>
                        Live Sync
                    </button>
                    {/* Refresh button */}
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                            isRefreshing 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                        }`}
                    >
                        <i className={`fas fa-sync-alt ${isRefreshing ? 'fa-spin' : ''} mr-1`}></i>
                        Refresh
                    </button>
                </div>
            </div>

            {/* Live Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Active Clients */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Clients</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {Array.isArray(dashboardData.clients) ? dashboardData.clients.filter(c => c.status === 'active' || c.status === 'Active').length : 0}
                            </p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                {dashboardData.stats.totalClients} total
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-users text-white"></i>
                        </div>
                    </div>
                </div>

                {/* Active Leads */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Leads</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {Array.isArray(dashboardData.leads) ? dashboardData.leads.filter(l => l.status === 'New' || l.status === 'Qualified' || l.status === 'Contacted').length : 0}
                            </p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                {dashboardData.stats.totalLeads} total
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-user-plus text-white"></i>
                        </div>
                    </div>
                </div>

                {/* Active Projects */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Projects</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {dashboardData.stats.activeProjects}
                            </p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                {dashboardData.stats.totalProjects} total
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-project-diagram text-white"></i>
                        </div>
                    </div>
                </div>

                {/* Hours This Month */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Hours This Month</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {dashboardData.stats.hoursThisMonth.toFixed(1)}
                            </p>
                            <p className={`text-[10px] ${
                                dashboardData.stats.hoursThisMonth > dashboardData.stats.hoursLastMonth 
                                    ? 'text-green-600' 
                                    : dashboardData.stats.hoursThisMonth < dashboardData.stats.hoursLastMonth 
                                        ? 'text-red-600' 
                                        : 'text-gray-500'
                            }`}>
                                {dashboardData.stats.hoursLastMonth > 0 
                                    ? `${((dashboardData.stats.hoursThisMonth - dashboardData.stats.hoursLastMonth) / dashboardData.stats.hoursLastMonth * 100).toFixed(0)}% vs last month`
                                    : 'No previous data'
                                }
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-clock text-white"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Alerts Row */}
            {dashboardData.stats.overdueInvoices > 0 && (
                <div className="grid grid-cols-1 gap-3">
                    {/* Overdue Invoices Alert */}
                    <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-4 text-white">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold">Overdue Invoices</h2>
                            <i className="fas fa-exclamation-triangle text-xl opacity-80"></i>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs opacity-90">Overdue Count</span>
                                <span className="text-2xl font-bold">{dashboardData.stats.overdueInvoices}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-red-400">
                                <span className="text-xs font-medium">Total Amount</span>
                                <span className="text-xl font-bold">R {dashboardData.stats.overdueAmount.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Recent Activity & Data Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Recent Clients */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2.5`}>
                        Recent Clients ({Array.isArray(dashboardData.clients) ? dashboardData.clients.length : 0})
                    </h2>
                    {Array.isArray(dashboardData.clients) && dashboardData.clients.length > 0 ? (
                        <div className="space-y-2">
                            {dashboardData.clients.slice(0, 5).map(client => (
                                <div key={client.id} className={`${isDark ? 'border-gray-700' : 'border-gray-200'} border-b pb-2 last:border-b-0 last:pb-0`}>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} text-sm`}>
                                                {client.name}
                                            </h3>
                                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {client.industry || 'No industry'}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 text-[10px] rounded font-medium ${
                                            client.status === 'active' || client.status === 'Active' 
                                                ? 'bg-green-100 text-green-800' 
                                                : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {client.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <i className="fas fa-users text-3xl text-gray-300 mb-2"></i>
                            <p className="text-xs text-gray-500">No clients found</p>
                        </div>
                    )}
                </div>

                {/* Recent Leads */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2.5`}>
                        Recent Leads ({Array.isArray(dashboardData.leads) ? dashboardData.leads.length : 0})
                    </h2>
                    {Array.isArray(dashboardData.leads) && dashboardData.leads.length > 0 ? (
                        <div className="space-y-2">
                            {dashboardData.leads.slice(0, 5).map(lead => (
                                <div key={lead.id} className={`${isDark ? 'border-gray-700' : 'border-gray-200'} border-b pb-2 last:border-b-0 last:pb-0`}>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} text-sm`}>
                                                {lead.name}
                                            </h3>
                                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {lead.industry || 'No industry'}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 text-[10px] rounded font-medium ${
                                            lead.status === 'New' 
                                                ? 'bg-blue-100 text-blue-800' 
                                                : lead.status === 'Qualified' 
                                                    ? 'bg-green-100 text-green-800'
                                                    : lead.status === 'Contacted'
                                                        ? 'bg-yellow-100 text-yellow-800'
                                                        : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {lead.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <i className="fas fa-user-plus text-3xl text-gray-300 mb-2"></i>
                            <p className="text-xs text-gray-500">No leads found</p>
                        </div>
                    )}
                </div>

                {/* Recent Projects */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2.5`}>
                        Recent Projects ({Array.isArray(dashboardData.projects) ? dashboardData.projects.length : 0})
                    </h2>
                    {Array.isArray(dashboardData.projects) && dashboardData.projects.length > 0 ? (
                        <div className="space-y-2">
                            {dashboardData.projects.slice(0, 5).map(project => (
                                <div key={project.id} className={`${isDark ? 'border-gray-700' : 'border-gray-200'} border-b pb-2 last:border-b-0 last:pb-0`}>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} text-sm`}>
                                                {project.name}
                                            </h3>
                                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {project.client || 'No client'}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 text-[10px] rounded font-medium ${
                                            project.status === 'Active' || project.status === 'In Progress' 
                                                ? 'bg-blue-100 text-blue-800' 
                                                : project.status === 'Completed' 
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {project.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <i className="fas fa-project-diagram text-3xl text-gray-300 mb-2"></i>
                            <p className="text-xs text-gray-500">No projects found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* System Status */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2.5`}>
                    System Status
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {dashboardData.stats.totalClients}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Clients</div>
                    </div>
                    <div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {dashboardData.stats.totalLeads}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Leads</div>
                    </div>
                    <div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {dashboardData.stats.totalProjects}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Projects</div>
                    </div>
                    <div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {dashboardData.stats.totalInvoices}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Invoices</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.DashboardLive = DashboardLive;
