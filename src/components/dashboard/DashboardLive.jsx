// Live Dashboard Component - Connected to Real Mechanisms
// Version: 2025-11-04-fix-tdz-calculateStats-order
const { useState, useEffect, useCallback } = React;
const SectionCommentWidget = window.SectionCommentWidget;

const DashboardLive = () => {
    const [dashboardData, setDashboardData] = useState({
        clients: [],
        leads: [],
        projects: [],
        timeEntries: [],
        users: [],
        stats: {
            totalClients: 0,
            totalLeads: 0,
            totalProjects: 0,
            activeProjects: 0,
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
    const [userName, setUserName] = useState('User');
    const [calendarReady, setCalendarReady] = useState(false);

    // Calculate stats helper - MUST be declared before use in useEffect or loadDashboardData
    const calculateStats = useCallback((data) => {
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const timeEntriesArray = Array.isArray(data.timeEntries) ? data.timeEntries : [];
        
        const thisMonthEntries = timeEntriesArray.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= thisMonth;
        });
        const lastMonthEntries = timeEntriesArray.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= lastMonth && entryDate < thisMonth;
        });

        const hoursThisMonth = thisMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
        const hoursLastMonth = lastMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);

        // Ensure all data is arrays for safety
        const clientsArray = Array.isArray(data.clients) ? data.clients : [];
        const leadsArray = Array.isArray(data.leads) ? data.leads : [];
        const projectsArray = Array.isArray(data.projects) ? data.projects : [];
        
        const pipelineValue = leadsArray.reduce((sum, lead) => sum + (lead.value || 0), 0);
        const weightedPipeline = leadsArray.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0);

        return {
            totalClients: clientsArray.length,
            totalLeads: leadsArray.length,
            totalProjects: projectsArray.length,
            activeProjects: projectsArray.filter(p => p.status === 'Active' || p.status === 'In Progress').length,
            hoursThisMonth: hoursThisMonth,
            hoursLastMonth: hoursLastMonth,
            pipelineValue: pipelineValue,
            weightedPipeline: weightedPipeline
        };
    }, []);

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
            
            // Get clients and leads from separate localStorage keys
            const cachedClients = allClients.filter(c => c.type === 'client' || !c.type); // Default to client if no type
            const storedLeads = window.storage?.getLeads?.();
            const cachedLeads = Array.isArray(storedLeads) && storedLeads.length > 0 
                ? storedLeads 
                : (allClients.filter(c => c.type === 'lead') || []);
            
            const cachedProjects = window.storage?.getProjects?.() || [];
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

            const pipelineValue = cachedLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);
            const weightedPipeline = cachedLeads.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0);

            const cachedStats = {
                totalClients: cachedClients.length,
                totalLeads: cachedLeads.length,
                totalProjects: cachedProjects.length,
                activeProjects: cachedProjects.filter(p => p.status === 'Active' || p.status === 'In Progress').length,
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
                window.DatabaseAPI.getLeads().catch(err => {
                    console.warn('Lead sync failed:', err);
                    return { data: { leads: [] } };
                }),
                window.DatabaseAPI.getProjects().catch(err => {
                    console.warn('Project sync failed:', err);
                    return { data: [] };
                }),
                window.DatabaseAPI.getTimeEntries().catch(err => {
                    console.warn('Time entry sync failed:', err);
                    return { data: [] };
                })
            ];

            // Only fetch users for admins to avoid unnecessary 401s and load
            try {
                const role = window.storage?.getUser?.()?.role?.toLowerCase?.();
                if (role === 'admin') {
                    syncPromises.push(
                        window.DatabaseAPI.getUsers().catch(err => {
                            console.warn('User sync failed:', err);
                            return { data: [] };
                        })
                    );
                }
            } catch (_) {}

            // Update with fresh API data when available
            Promise.allSettled(syncPromises).then((results) => {
                // Map results to handle both fulfilled and rejected promises
                const mappedResults = results.map(r => r.status === 'fulfilled' ? r.value : { data: [] });
                
                // Get the role to determine if users promise was added
                const role = window.storage?.getUser?.()?.role?.toLowerCase?.();
                const isAdmin = role === 'admin';
                
                // Extract responses - usersRes might not exist if user is not admin
                const clientsRes = mappedResults[0] || { data: [] };
                const leadsRes = mappedResults[1] || { data: [] };
                const projectsRes = mappedResults[2] || { data: [] };
                const timeEntriesRes = mappedResults[3] || { data: [] };
                const usersRes = isAdmin && mappedResults[4] ? mappedResults[4] : { data: [] };

                // Get clients from clients API
                const clients = Array.isArray(clientsRes.data?.clients) ? clientsRes.data.clients.filter(c => c.type === 'client' || !c.type) : cachedClients;
                
                // Get leads from leads API endpoint
                const leadsFromAPI = Array.isArray(leadsRes.data?.leads) ? leadsRes.data.leads : [];
                const leads = leadsFromAPI.length > 0 ? leadsFromAPI : cachedLeads;
                
                // Store leads in localStorage for next load (even if empty to prevent stale cache)
                if (window.storage?.setLeads) {
                    window.storage.setLeads(leadsFromAPI);
                    console.log('✅ DashboardLive: Stored leads in localStorage:', leadsFromAPI.length);
                }
                
                // Store clients in localStorage for next load (even if empty to prevent stale cache)
                if (window.storage?.setClients) {
                    window.storage.setClients(clients);
                    console.log('✅ DashboardLive: Stored clients in localStorage:', clients.length);
                }
                
                // Handle different API response formats
                const projects = Array.isArray(projectsRes.data?.projects) ? projectsRes.data.projects : 
                                Array.isArray(projectsRes.data) ? projectsRes.data : cachedProjects;
                const timeEntries = Array.isArray(timeEntriesRes.data) ? timeEntriesRes.data : cachedTimeEntries;
                const users = Array.isArray(usersRes?.data?.users) ? usersRes.data.users : 
                             Array.isArray(usersRes?.data) ? usersRes.data : cachedUsers;

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

                const freshPipelineValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);
                const freshWeightedPipeline = leads.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0);

                const freshStats = {
                    totalClients: clients.length,
                    totalLeads: leads.length,
                    totalProjects: projects.length,
                    activeProjects: projects.filter(p => p.status === 'Active' || p.status === 'In Progress').length,
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
                    // Handle both direct arrays and API response format
                    let normalizedData = message.data;
                    if (message.data && typeof message.data === 'object' && message.data.data) {
                        // API response format: {data: {projects: [...]}}
                        normalizedData = message.data.data[message.dataType] || message.data[message.dataType] || message.data.data;
                    }
                    
                    setDashboardData(prev => {
                        // Calculate stats inline to avoid dependency issues
                        const newData = {
                            ...prev,
                            [message.dataType]: normalizedData
                        };
                        
                        // Calculate stats
                        const now = new Date();
                        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        const timeEntriesArray = Array.isArray(newData.timeEntries) ? newData.timeEntries : [];
                        const thisMonthEntries = timeEntriesArray.filter(entry => {
                            const entryDate = new Date(entry.date);
                            return entryDate >= thisMonth;
                        });
                        const lastMonthEntries = timeEntriesArray.filter(entry => {
                            const entryDate = new Date(entry.date);
                            return entryDate >= lastMonth && entryDate < thisMonth;
                        });
                        const hoursThisMonth = thisMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
                        const hoursLastMonth = lastMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
                        
                        const clientsArray = Array.isArray(newData.clients) ? newData.clients : [];
                        const leadsArray = Array.isArray(newData.leads) ? newData.leads : [];
                        const projectsArray = Array.isArray(newData.projects) ? newData.projects : [];
                        const pipelineValue = leadsArray.reduce((sum, lead) => sum + (lead.value || 0), 0);
                        const weightedPipeline = leadsArray.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0);
                        
                        const stats = {
                            totalClients: clientsArray.length,
                            totalLeads: leadsArray.length,
                            totalProjects: projectsArray.length,
                            activeProjects: projectsArray.filter(p => p.status === 'Active' || p.status === 'In Progress').length,
                            hoursThisMonth: hoursThisMonth,
                            hoursLastMonth: hoursLastMonth,
                            pipelineValue: pipelineValue,
                            weightedPipeline: weightedPipeline
                        };
                        
                        return {
                            ...newData,
                            stats
                        };
                    });
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
    }, []); // Removed calculateStats dependency - stats are calculated inline

    // Wait for Calendar to be available and force re-render when found
    React.useEffect(() => {
        let mounted = true;
        
        const checkCalendar = () => {
            if (window.Calendar && typeof window.Calendar === 'function') {
                if (mounted) {
                    setCalendarReady(true);
                }
                return true;
            }
            return false;
        };
        
        // Listen for calendar ready event
        const handleCalendarReady = () => {
            if (mounted) {
                checkCalendar();
            }
        };
        
        window.addEventListener('calendarComponentReady', handleCalendarReady);
        
        // Check immediately
        checkCalendar();
        
        // Retry periodically until Calendar is available
        const interval = setInterval(() => {
            if (mounted) {
                checkCalendar();
            }
        }, 100);
        
        // Stop checking after 10 seconds
        const timeout = setTimeout(() => {
            clearInterval(interval);
        }, 10000);
        
        return () => {
            mounted = false;
            clearInterval(interval);
            clearTimeout(timeout);
            window.removeEventListener('calendarComponentReady', handleCalendarReady);
        };
    }, []); // Only run once on mount

    // Load user name
    useEffect(() => {
        const user = window.storage?.getUser?.();
        if (user?.name) {
            setUserName(user.name);
        } else if (window.storage?.getUserInfo) {
            const userInfo = window.storage.getUserInfo();
            if (userInfo?.name) {
                setUserName(userInfo.name);
            }
        }
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

        // Get Calendar component - always check window.Calendar directly for latest value
        const CalendarComponent = window.Calendar;
        
        return (
        <div className="space-y-4">
            {/* Calendar Widget - Always render, Calendar will appear when ready */}
            <div className="flex justify-start">
                {CalendarComponent && typeof CalendarComponent === 'function' ? (
                    <CalendarComponent />
                ) : (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 min-w-[280px]`}>
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading calendar...</p>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Other dashboard items coming soon */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                <p className={`text-sm text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Other dashboard items coming soon
                </p>
            </div>
        </div>
    );
};

// Make available globally
window.DashboardLive = DashboardLive;
