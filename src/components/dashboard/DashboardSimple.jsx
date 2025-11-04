// Simple Dashboard Component - No API calls, loads immediately
const { useState, useEffect } = React;

const DashboardSimple = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [calendarReady, setCalendarReady] = useState(false);
    const { isDark } = window.useTheme();

    useEffect(() => {
        // Check authentication status
        const token = window.storage?.getToken?.();
        setIsAuthenticated(!!token);
        
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
    
    // Get Calendar component (may be lazy loaded)
    const Calendar = window.Calendar || (() => (
        <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'} p-4`}>
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading calendar...</p>
            </div>
        </div>
    ));

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
window.DashboardSimple = DashboardSimple;
