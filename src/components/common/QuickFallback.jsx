// Quick Fallback Components for immediate loading
const { useState, useEffect } = React;

// Quick Dashboard Fallback
const QuickDashboard = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-600">Loading dashboard data...</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1,2,3,4].map(i => (
                    <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                            </div>
                            <div className="ml-4">
                                <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
                                <div className="h-6 bg-gray-200 rounded w-12"></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Quick Clients Fallback
const QuickClients = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
                    <p className="text-gray-600">Loading clients data...</p>
                </div>
            </div>
            
            <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                    <div className="animate-pulse space-y-4">
                        {[1,2,3].map(i => (
                            <div key={i} className="flex items-center space-x-4">
                                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Quick Projects Fallback
const QuickProjects = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
                    <p className="text-gray-600">Loading projects data...</p>
                </div>
            </div>
            
            <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                    <div className="animate-pulse space-y-4">
                        {[1,2,3].map(i => (
                            <div key={i} className="flex items-center space-x-4">
                                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Quick Invoicing Fallback
const QuickInvoicing = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Invoicing</h1>
                    <p className="text-gray-600">Loading invoicing data...</p>
                </div>
            </div>
            
            <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                    <div className="animate-pulse space-y-4">
                        {[1,2,3].map(i => (
                            <div key={i} className="flex items-center space-x-4">
                                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Quick Time Tracking Fallback
const QuickTimeTracking = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Time Tracking</h1>
                    <p className="text-gray-600">Loading time tracking data...</p>
                </div>
            </div>
            
            <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                    <div className="animate-pulse space-y-4">
                        {[1,2,3].map(i => (
                            <div key={i} className="flex items-center space-x-4">
                                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.QuickDashboard = QuickDashboard;
window.QuickClients = QuickClients;
window.QuickProjects = QuickProjects;
window.QuickInvoicing = QuickInvoicing;
window.QuickTimeTracking = QuickTimeTracking;
