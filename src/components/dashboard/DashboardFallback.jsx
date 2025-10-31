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

    // Get Calendar component (may be lazy loaded)
    const Calendar = window.Calendar || (() => <div>Loading calendar...</div>);
    
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
window.DashboardFallback = DashboardFallback;