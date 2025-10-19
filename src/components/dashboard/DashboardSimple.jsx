// Simple Dashboard Component - No API calls, loads immediately
const { useState, useEffect } = React;

const DashboardSimple = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Check authentication status
        const token = window.storage?.getToken?.();
        setIsAuthenticated(!!token);
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-600">
                        {isAuthenticated ? 'Welcome back!' : 'Please log in to view your data'}
                    </p>
                </div>
                {/* Refresh button removed - data persists automatically */}
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
                            <p className="text-2xl font-semibold text-gray-900">-</p>
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
                            <p className="text-2xl font-semibold text-gray-900">-</p>
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
                            <p className="text-2xl font-semibold text-gray-900">-</p>
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
                            <p className="text-2xl font-semibold text-gray-900">-</p>
                        </div>
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
                        <button 
                            onClick={() => window.location.hash = '#/clients'}
                            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <i className="fas fa-plus text-blue-600 mb-2"></i>
                            <p className="font-medium text-gray-900">Add Client</p>
                            <p className="text-sm text-gray-500">Create a new client</p>
                        </button>
                        <button 
                            onClick={() => window.location.hash = '#/clients?tab=leads'}
                            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <i className="fas fa-user-plus text-green-600 mb-2"></i>
                            <p className="font-medium text-gray-900">Add Lead</p>
                            <p className="text-sm text-gray-500">Create a new lead</p>
                        </button>
                        <button 
                            onClick={() => window.location.hash = '#/projects'}
                            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <i className="fas fa-project-diagram text-purple-600 mb-2"></i>
                            <p className="font-medium text-gray-900">New Project</p>
                            <p className="text-sm text-gray-500">Start a new project</p>
                        </button>
                    </div>
                </div>
            </div>

            {/* Status Message */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                    <i className="fas fa-info-circle text-blue-600 mr-3"></i>
                    <div>
                        <h3 className="text-sm font-medium text-blue-800">System Status</h3>
                        <p className="text-sm text-blue-700 mt-1">
                            Dashboard loaded successfully. Navigate to different sections to load specific data.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.DashboardSimple = DashboardSimple;
