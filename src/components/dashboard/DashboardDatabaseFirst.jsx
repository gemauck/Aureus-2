// Database-First Dashboard Component
const { useState, useEffect } = React;

const DashboardDatabaseFirst = () => {
    const [dashboardData, setDashboardData] = useState({
        clients: [],
        leads: [],
        projects: [],
        timeEntries: [],
        stats: {
            totalClients: 0,
            totalLeads: 0,
            totalProjects: 0,
            activeProjects: 0
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
                    timeEntries: [],
                    stats: {
                        totalClients: 0,
                        totalLeads: 0,
                        totalProjects: 0,
                        activeProjects: 0
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
                    return { data: { clients: [] } };
                }),
                window.DatabaseAPI.getLeads().catch(err => {
                    console.warn('Failed to load leads:', err);
                    return { data: { leads: [] } };
                }),
                window.DatabaseAPI.getProjects().catch(err => {
                    console.warn('Failed to load projects:', err);
                    return { data: { projects: [] } };
                }),
                window.DatabaseAPI.getTimeEntries().catch(err => {
                    console.warn('Failed to load time entries:', err);
                    return { data: { timeEntries: [] } };
                })
            ]);

            const [clientsResponse, leadsResponse, projectsResponse, timeEntriesResponse] = await Promise.race([dataPromise, timeoutPromise]);
            
            // Extract data from responses
            const clients = clientsResponse?.data?.clients || [];
            const leads = leadsResponse?.data?.leads || [];
            const projects = projectsResponse?.data?.projects || [];
            const timeEntries = timeEntriesResponse?.data?.timeEntries || [];

            // Calculate statistics
            const stats = {
                totalClients: clients.length,
                totalLeads: leads.length,
                totalProjects: projects.length,
                activeProjects: projects.filter(p => p.status === 'Active').length
            };

            // Save to localStorage for instant load next time
            if (window.storage) {
                window.storage.setClients(clients);
                window.storage.setLeads(leads);
                window.storage.setProjects(projects);
                window.storage.setTimeEntries(timeEntries);
                console.log('✅ Dashboard: Cached all data to localStorage');
            }

            setDashboardData({
                clients,
                leads,
                projects,
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

    // Get Calendar component (may be lazy loaded)
    const Calendar = window.Calendar || (() => <div>Loading calendar...</div>);
    const { isDark } = window.useTheme();
    
    return (
        <div className="space-y-4">
            {/* Calendar Component */}
            <div>
                <Calendar />
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
window.DashboardDatabaseFirst = DashboardDatabaseFirst;
