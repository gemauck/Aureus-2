// Dashboard Fallback Component - Simple version when main dashboard fails
const { useState, useEffect } = React;

const DashboardFallback = () => {
    const [basicData, setBasicData] = useState({
        clients: 0,
        projects: 0,
        leads: 0
    });
    const [isLoading, setIsLoading] = useState(true);
    const { isDark } = window.useTheme();

    useEffect(() => {
        // Simple data loading without complex error handling
        const loadBasicData = async () => {
            try {
                setIsLoading(true);
                
                // Try to load basic data with minimal error handling
                const token = window.storage?.getToken?.();
                if (!token) {
                    setIsLoading(false);
                    return;
                }

                // Simple fetch requests
                const requests = [
                    fetch('/api/clients', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).catch(() => null),
                    fetch('/api/projects', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).catch(() => null),
                    fetch('/api/leads', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).catch(() => null)
                ];

                const responses = await Promise.all(requests);
                
                let clients = 0, projects = 0, leads = 0;

                for (let i = 0; i < responses.length; i++) {
                    const response = responses[i];
                    if (response && response.ok) {
                        try {
                            const data = await response.json();
                            switch (i) {
                                case 0: clients = data.data?.clients?.length || 0; break;
                                case 1: projects = data.data?.length || 0; break;
                                case 2: leads = data.data?.length || 0; break;
                            }
                        } catch (e) {
                            console.warn('Failed to parse response:', e);
                        }
                    }
                }

                setBasicData({ clients, projects, leads });
            } catch (error) {
                console.warn('Basic data loading failed:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadBasicData();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading basic dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    Dashboard (Basic View)
                </h1>
                <div className="text-xs text-gray-500">
                    Simplified view - full dashboard unavailable
                </div>
            </div>

            {/* Basic Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Clients</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {basicData.clients}
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-users text-white"></i>
                        </div>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Projects</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {basicData.projects}
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-project-diagram text-white"></i>
                        </div>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Leads</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {basicData.leads}
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-user-plus text-white"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* System Status */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-3`}>
                    System Status
                </h2>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {basicData.clients}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Clients</div>
                    </div>
                    <div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {basicData.leads}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Leads</div>
                    </div>
                    <div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {basicData.projects}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Projects</div>
                    </div>
                </div>
            </div>

            {/* Help Message */}
            <div className={`${isDark ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-4`}>
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                        <i className="fas fa-info-circle text-blue-400"></i>
                    </div>
                    <div className="ml-3">
                        <h3 className={`text-sm font-medium ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                            Basic Dashboard Mode
                        </h3>
                        <div className={`mt-2 text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                            <p>You're seeing a simplified dashboard view. The full dashboard is temporarily unavailable due to API connectivity issues.</p>
                            <p className="mt-1">Try refreshing the page or contact support if the issue persists.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.DashboardFallback = DashboardFallback;