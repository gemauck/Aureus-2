// Simple Dashboard Component - No API calls, loads immediately
const { useState, useEffect } = React;

const DashboardSimple = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const { isDark } = window.useTheme();

    useEffect(() => {
        // Check authentication status
        const token = window.storage?.getToken?.();
        setIsAuthenticated(!!token);
    }, []);
    
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
window.DashboardSimple = DashboardSimple;
