// Simple Clients Component - No API calls, loads immediately
const { useState, useEffect } = React;

const ClientsSimple = () => {
    const [activeTab, setActiveTab] = useState('clients');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Check authentication status
        const token = window.storage?.getToken?.();
        setIsAuthenticated(!!token);
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'clients':
                return (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">Clients</h2>
                                <p className="text-gray-600">Manage your client relationships</p>
                            </div>
                            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                                <i className="fas fa-plus mr-2"></i>
                                Add Client
                            </button>
                        </div>
                        
                        <div className="bg-white rounded-lg shadow">
                            <div className="p-6">
                                <div className="text-center py-12">
                                    <i className="fas fa-users text-gray-300 text-4xl mb-4"></i>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No clients yet</h3>
                                    <p className="text-gray-500 mb-4">Get started by adding your first client</p>
                                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                                        Add Your First Client
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            
            case 'leads':
                return (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">Leads</h2>
                                <p className="text-gray-600">Track potential customers</p>
                            </div>
                            <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                                <i className="fas fa-plus mr-2"></i>
                                Add Lead
                            </button>
                        </div>
                        
                        <div className="bg-white rounded-lg shadow">
                            <div className="p-6">
                                <div className="text-center py-12">
                                    <i className="fas fa-user-plus text-gray-300 text-4xl mb-4"></i>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No leads yet</h3>
                                    <p className="text-gray-500 mb-4">Start building your sales pipeline</p>
                                    <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                                        Add Your First Lead
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            
            case 'pipeline':
                return (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">Sales Pipeline</h2>
                                <p className="text-gray-600">Visualize your sales process</p>
                            </div>
                        </div>
                        
                        <div className="bg-white rounded-lg shadow">
                            <div className="p-6">
                                <div className="text-center py-12">
                                    <i className="fas fa-chart-line text-gray-300 text-4xl mb-4"></i>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">Pipeline coming soon</h3>
                                    <p className="text-gray-500">Visual pipeline view will be available here</p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Clients & Leads</h1>
                    <p className="text-gray-600">
                        {isAuthenticated ? 'Manage your client relationships' : 'Please log in to manage clients'}
                    </p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('clients')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'clients'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Clients
                    </button>
                    <button
                        onClick={() => setActiveTab('leads')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'leads'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Leads
                    </button>
                    <button
                        onClick={() => setActiveTab('pipeline')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'pipeline'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Pipeline
                    </button>
                </nav>
            </div>

            {/* Content */}
            {renderContent()}

            {/* Status Message */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                    <i className="fas fa-check-circle text-green-600 mr-3"></i>
                    <div>
                        <h3 className="text-sm font-medium text-green-800">Clients Section Ready</h3>
                        <p className="text-sm text-green-700 mt-1">
                            Navigation working correctly. Ready to add functionality when needed.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.ClientsSimple = ClientsSimple;
