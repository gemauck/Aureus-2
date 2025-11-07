// Dashboard Fallback Component - Simple version when main dashboard fails
const { useState, useEffect } = React;

const DashboardFallback = () => {
    const [basicData, setBasicData] = useState({
        clients: 0,
        projects: 0,
        leads: 0
    });
    const [isLoading, setIsLoading] = useState(true);
    const [calendarReady, setCalendarReady] = useState(false);
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
        
        // Wait for Calendar to be available
        const checkCalendar = () => {
            if (window.Calendar && typeof window.Calendar === 'function') {
                setCalendarReady(true);
            } else {
                // Retry after a short delay
                setTimeout(checkCalendar, 100);
            }
        };
        
        // Start checking immediately and also after a delay
        checkCalendar();
        const timer = setTimeout(() => {
            if (!calendarReady) {
                checkCalendar();
            }
        }, 500);
        
        return () => clearTimeout(timer);
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
    const Calendar = window.Calendar || (() => (
        <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'} p-4`}>
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading calendar...</p>
            </div>
        </div>
    ));
    
    // Get TaskManagement component (may be lazy loaded)
    const TaskManagement = window.TaskManagement || (() => <div>Loading task management...</div>);
    
    return (
        <div className="space-y-4">
            {/* Calendar Component */}
            <div>
                <Calendar />
            </div>
            
            {/* Task Management Component */}
            <div>
                <TaskManagement />
            </div>
        </div>
    );
};

// Make available globally
window.DashboardFallback = DashboardFallback;