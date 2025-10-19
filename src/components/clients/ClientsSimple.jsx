// Simple Clients Component - No API calls, loads immediately
const { useState, useEffect } = React;

const ClientsSimple = () => {
    const [activeTab, setActiveTab] = useState('clients');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [clients, setClients] = useState([]);
    const [leads, setLeads] = useState([]);
    const [showAddClientForm, setShowAddClientForm] = useState(false);
    const [showAddLeadForm, setShowAddLeadForm] = useState(false);
    const [newClient, setNewClient] = useState({
        name: '',
        industry: '',
        status: 'Active',
        email: '',
        phone: '',
        address: ''
    });
    const [newLead, setNewLead] = useState({
        name: '',
        industry: '',
        status: 'New',
        value: '',
        source: '',
        email: '',
        phone: ''
    });

    useEffect(() => {
        // Check authentication status
        const token = window.storage?.getToken?.();
        setIsAuthenticated(!!token);
    }, []);

    const handleAddClient = () => {
        if (newClient.name && newClient.industry) {
            const client = {
                id: Date.now(),
                ...newClient,
                createdAt: new Date().toISOString()
            };
            setClients(prev => [...prev, client]);
            setNewClient({
                name: '',
                industry: '',
                status: 'Active',
                email: '',
                phone: '',
                address: ''
            });
            setShowAddClientForm(false);
        }
    };

    const handleAddLead = () => {
        if (newLead.name && newLead.industry) {
            const lead = {
                id: Date.now(),
                ...newLead,
                createdAt: new Date().toISOString()
            };
            setLeads(prev => [...prev, lead]);
            setNewLead({
                name: '',
                industry: '',
                status: 'New',
                value: '',
                source: '',
                email: '',
                phone: ''
            });
            setShowAddLeadForm(false);
        }
    };

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
                            <button 
                                onClick={() => setShowAddClientForm(true)}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                            >
                                <i className="fas fa-plus mr-2"></i>
                                Add Client
                            </button>
                        </div>

                        {/* Add Client Form */}
                        {showAddClientForm && (
                            <div className="bg-white rounded-lg shadow p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Client</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                        <input
                                            type="text"
                                            value={newClient.name}
                                            onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter company name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                                        <input
                                            type="text"
                                            value={newClient.industry}
                                            onChange={(e) => setNewClient({...newClient, industry: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter industry"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                        <input
                                            type="email"
                                            value={newClient.email}
                                            onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter email"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                        <input
                                            type="tel"
                                            value={newClient.phone}
                                            onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter phone"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                        <input
                                            type="text"
                                            value={newClient.address}
                                            onChange={(e) => setNewClient({...newClient, address: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter address"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end space-x-3 mt-4">
                                    <button
                                        onClick={() => setShowAddClientForm(false)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAddClient}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                    >
                                        Add Client
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {/* Clients List */}
                        {clients.length > 0 ? (
                            <div className="bg-white rounded-lg shadow">
                                <div className="px-6 py-4 border-b border-gray-200">
                                    <h3 className="text-lg font-medium text-gray-900">Your Clients</h3>
                                </div>
                                <div className="p-6">
                                    <div className="space-y-4">
                                        {clients.map(client => (
                                            <div key={client.id} className="border border-gray-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-medium text-gray-900">{client.name}</h4>
                                                        <p className="text-sm text-gray-500">Industry: {client.industry}</p>
                                                        {client.email && <p className="text-sm text-gray-600">Email: {client.email}</p>}
                                                        {client.phone && <p className="text-sm text-gray-600">Phone: {client.phone}</p>}
                                                    </div>
                                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                        {client.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-lg shadow">
                                <div className="p-6">
                                    <div className="text-center py-12">
                                        <i className="fas fa-users text-gray-300 text-4xl mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No clients yet</h3>
                                        <p className="text-gray-500 mb-4">Get started by adding your first client</p>
                                        <button 
                                            onClick={() => setShowAddClientForm(true)}
                                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                                        >
                                            Add Your First Client
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
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
                            <button 
                                onClick={() => setShowAddLeadForm(true)}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                            >
                                <i className="fas fa-plus mr-2"></i>
                                Add Lead
                            </button>
                        </div>

                        {/* Add Lead Form */}
                        {showAddLeadForm && (
                            <div className="bg-white rounded-lg shadow p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Lead</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                        <input
                                            type="text"
                                            value={newLead.name}
                                            onChange={(e) => setNewLead({...newLead, name: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter company name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                                        <input
                                            type="text"
                                            value={newLead.industry}
                                            onChange={(e) => setNewLead({...newLead, industry: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter industry"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                        <select
                                            value={newLead.status}
                                            onChange={(e) => setNewLead({...newLead, status: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="New">New</option>
                                            <option value="Qualified">Qualified</option>
                                            <option value="Proposal">Proposal</option>
                                            <option value="Negotiation">Negotiation</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                                        <input
                                            type="text"
                                            value={newLead.value}
                                            onChange={(e) => setNewLead({...newLead, value: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter estimated value"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                                        <input
                                            type="text"
                                            value={newLead.source}
                                            onChange={(e) => setNewLead({...newLead, source: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="How did you find them?"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                        <input
                                            type="email"
                                            value={newLead.email}
                                            onChange={(e) => setNewLead({...newLead, email: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter email"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                        <input
                                            type="tel"
                                            value={newLead.phone}
                                            onChange={(e) => setNewLead({...newLead, phone: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter phone"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end space-x-3 mt-4">
                                    <button
                                        onClick={() => setShowAddLeadForm(false)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAddLead}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                    >
                                        Add Lead
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {/* Leads List */}
                        {leads.length > 0 ? (
                            <div className="bg-white rounded-lg shadow">
                                <div className="px-6 py-4 border-b border-gray-200">
                                    <h3 className="text-lg font-medium text-gray-900">Your Leads</h3>
                                </div>
                                <div className="p-6">
                                    <div className="space-y-4">
                                        {leads.map(lead => (
                                            <div key={lead.id} className="border border-gray-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-medium text-gray-900">{lead.name}</h4>
                                                        <p className="text-sm text-gray-500">Industry: {lead.industry}</p>
                                                        {lead.value && <p className="text-sm text-gray-600">Value: {lead.value}</p>}
                                                        {lead.source && <p className="text-sm text-gray-600">Source: {lead.source}</p>}
                                                        {lead.email && <p className="text-sm text-gray-600">Email: {lead.email}</p>}
                                                    </div>
                                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                        lead.status === 'New' ? 'bg-blue-100 text-blue-800' :
                                                        lead.status === 'Qualified' ? 'bg-green-100 text-green-800' :
                                                        lead.status === 'Proposal' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-purple-100 text-purple-800'
                                                    }`}>
                                                        {lead.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-lg shadow">
                                <div className="p-6">
                                    <div className="text-center py-12">
                                        <i className="fas fa-user-plus text-gray-300 text-4xl mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No leads yet</h3>
                                        <p className="text-gray-500 mb-4">Start building your sales pipeline</p>
                                        <button 
                                            onClick={() => setShowAddLeadForm(true)}
                                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                                        >
                                            Add Your First Lead
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
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
