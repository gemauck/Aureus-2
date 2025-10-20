// Fallback Dashboard Component - Always Works
const { useState, useEffect } = React;

const DashboardFallback = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const { isDark } = window.useTheme();

    useEffect(() => {
        // Simulate loading
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h1 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    Dashboard
                </h1>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Business overview
                </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Clients</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>0</p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No data</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-users text-white"></i>
                        </div>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Projects</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>0</p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No data</p>
                        </div>
                        <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-project-diagram text-white"></i>
                        </div>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Hours This Month</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>0.0</p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No data</p>
                        </div>
                        <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-clock text-white"></i>
                        </div>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Total Revenue</p>
                            <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>R0</p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No data</p>
                        </div>
                        <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center">
                            <i className="fas fa-dollar-sign text-white"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Welcome Message */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-6`}>
                <div className="text-center">
                    <i className="fas fa-chart-line text-4xl text-gray-300 mb-4"></i>
                    <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>
                        Welcome to Abcotronics ERP
                    </h2>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                        Your dashboard is ready. Start by adding clients, projects, or time entries to see live data here.
                    </p>
                    <div className="flex justify-center space-x-4">
                        <button 
                            onClick={() => {
                                const event = new CustomEvent('navigateToPage', { detail: { page: 'clients' } });
                                window.dispatchEvent(event);
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <i className="fas fa-users mr-2"></i>
                            Manage Clients
                        </button>
                        <button 
                            onClick={() => {
                                const event = new CustomEvent('navigateToPage', { detail: { page: 'projects' } });
                                window.dispatchEvent(event);
                            }}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <i className="fas fa-project-diagram mr-2"></i>
                            Manage Projects
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-3`}>
                    Quick Actions
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button 
                        onClick={() => {
                            const event = new CustomEvent('navigateToPage', { detail: { page: 'clients' } });
                            window.dispatchEvent(event);
                        }}
                        className={`p-3 rounded-lg border transition-colors ${
                            isDark 
                                ? 'border-gray-700 hover:bg-gray-700 text-gray-200' 
                                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                    >
                        <i className="fas fa-user-plus text-blue-600 mb-2"></i>
                        <p className="text-xs font-medium">Add Client</p>
                    </button>
                    <button 
                        onClick={() => {
                            const event = new CustomEvent('navigateToPage', { detail: { page: 'projects' } });
                            window.dispatchEvent(event);
                        }}
                        className={`p-3 rounded-lg border transition-colors ${
                            isDark 
                                ? 'border-gray-700 hover:bg-gray-700 text-gray-200' 
                                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                    >
                        <i className="fas fa-project-diagram text-green-600 mb-2"></i>
                        <p className="text-xs font-medium">New Project</p>
                    </button>
                    <button 
                        onClick={() => {
                            const event = new CustomEvent('navigateToPage', { detail: { page: 'time' } });
                            window.dispatchEvent(event);
                        }}
                        className={`p-3 rounded-lg border transition-colors ${
                            isDark 
                                ? 'border-gray-700 hover:bg-gray-700 text-gray-200' 
                                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                    >
                        <i className="fas fa-clock text-purple-600 mb-2"></i>
                        <p className="text-xs font-medium">Log Time</p>
                    </button>
                    <button 
                        onClick={() => {
                            const event = new CustomEvent('navigateToPage', { detail: { page: 'reports' } });
                            window.dispatchEvent(event);
                        }}
                        className={`p-3 rounded-lg border transition-colors ${
                            isDark 
                                ? 'border-gray-700 hover:bg-gray-700 text-gray-200' 
                                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                    >
                        <i className="fas fa-chart-bar text-yellow-600 mb-2"></i>
                        <p className="text-xs font-medium">View Reports</p>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.DashboardFallback = DashboardFallback;
