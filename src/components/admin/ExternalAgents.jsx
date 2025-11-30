// External Agents Management Component (Admin Only)
const { useState, useEffect } = React;

const ExternalAgents = () => {
    const { user: currentUser } = window.useAuth ? window.useAuth() : { user: null };
    
    // Check if current user is admin (case-insensitive)
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
    
    const [externalAgents, setExternalAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingAgent, setEditingAgent] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        company: '',
        notes: '',
        isActive: true
    });

    useEffect(() => {
        if (isAdmin) {
            loadExternalAgents();
        }
    }, [isAdmin]);

    const loadExternalAgents = async () => {
        try {
            setLoading(true);
            const token = window.storage?.getToken?.();
            if (!token) {
                console.error('No authentication token found');
                return;
            }

            const response = await fetch('/api/external-agents', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const agents = data.data?.externalAgents || data.externalAgents || [];
                setExternalAgents(agents);
            } else {
                console.error('Failed to load external agents:', response.statusText);
            }
        } catch (error) {
            console.error('Error loading external agents:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        setEditingAgent(null);
        setFormData({
            name: '',
            email: '',
            phone: '',
            company: '',
            notes: '',
            isActive: true
        });
        setShowModal(true);
    };

    const handleEdit = (agent) => {
        setEditingAgent(agent);
        setFormData({
            name: agent.name || '',
            email: agent.email || '',
            phone: agent.phone || '',
            company: agent.company || '',
            notes: agent.notes || '',
            isActive: agent.isActive !== undefined ? agent.isActive : true
        });
        setShowModal(true);
    };

    const handleDelete = async (agent) => {
        if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) {
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication error: Please refresh the page and try again');
                return;
            }

            const response = await fetch(`/api/external-agents/${agent.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                await loadExternalAgents();
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData.message || 'Failed to delete external agent');
            }
        } catch (error) {
            console.error('Error deleting external agent:', error);
            alert('Error deleting external agent: ' + error.message);
        }
    };

    const handleSave = async () => {
        if (!formData.name || formData.name.trim() === '') {
            alert('Name is required');
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication error: Please refresh the page and try again');
                return;
            }

            const url = editingAgent 
                ? `/api/external-agents/${editingAgent.id}`
                : '/api/external-agents';
            
            const method = editingAgent ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                setShowModal(false);
                await loadExternalAgents();
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData.message || `Failed to ${editingAgent ? 'update' : 'create'} external agent`);
            }
        } catch (error) {
            console.error('Error saving external agent:', error);
            alert('Error saving external agent: ' + error.message);
        }
    };

    const filteredAgents = externalAgents.filter(agent => {
        const searchLower = searchTerm.toLowerCase();
        return (
            agent.name?.toLowerCase().includes(searchLower) ||
            agent.email?.toLowerCase().includes(searchLower) ||
            agent.company?.toLowerCase().includes(searchLower) ||
            agent.phone?.toLowerCase().includes(searchLower)
        );
    });

    if (!isAdmin) {
        return (
            <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">Access denied. Admin privileges required.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">External Agents Management</h1>
                <p className="text-gray-600">Manage external agents that can be assigned to leads and clients</p>
            </div>

            {/* Search and Add Button */}
            <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex-1 max-w-md">
                    <input
                        type="text"
                        placeholder="Search external agents..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <button
                    onClick={handleAdd}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <i className="fas fa-plus"></i>
                    Add External Agent
                </button>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="text-center py-8">
                    <p className="text-gray-500">Loading external agents...</p>
                </div>
            )}

            {/* Table */}
            {!loading && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredAgents.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                                        {searchTerm ? 'No external agents found matching your search' : 'No external agents yet. Click "Add External Agent" to create one.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredAgents.map((agent) => (
                                    <tr key={agent.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-gray-500">{agent.company || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-gray-500">{agent.email || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-gray-500">{agent.phone || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                agent.isActive 
                                                    ? 'bg-green-100 text-green-800' 
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {agent.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleEdit(agent)}
                                                    className="text-blue-600 hover:text-blue-900"
                                                    title="Edit"
                                                >
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(agent)}
                                                    className="text-red-600 hover:text-red-900"
                                                    title="Delete"
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">
                            {editingAgent ? 'Edit External Agent' : 'Add External Agent'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Agent name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Company
                                </label>
                                <input
                                    type="text"
                                    value={formData.company}
                                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Company name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="email@example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Phone number"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Notes
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    rows="3"
                                    placeholder="Additional notes..."
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Active</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                {editingAgent ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Export for use in other components
if (typeof window !== 'undefined') {
    window.ExternalAgents = ExternalAgents;
}

export default ExternalAgents;

