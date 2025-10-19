// Get React hooks from window
const { useState, useEffect } = React;
const storage = window.storage;

const ProjectModal = ({ project, onSave, onClose, onDelete }) => {
    const [formData, setFormData] = useState(project || {
        name: '',
        client: '',
        type: 'Monthly Review',
        startDate: '',
        dueDate: '',
        assignedTo: '',
        description: '',
        status: 'Active',
        manager: ''
    });

    const [clients, setClients] = useState([]);
    const [showNewClientInput, setShowNewClientInput] = useState(false);
    const [newClientName, setNewClientName] = useState('');

    useEffect(() => {
        // Load clients from localStorage
        const savedClients = storage.getClients() || [];
        setClients(savedClients);
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // If user is entering a new client name
        if (showNewClientInput && newClientName.trim()) {
            onSave({...formData, client: newClientName.trim()});
        } else {
            onSave(formData);
        }
    };

    const handleClientChange = (e) => {
        const value = e.target.value;
        if (value === '__new__') {
            setShowNewClientInput(true);
            setNewClientName('');
        } else {
            setShowNewClientInput(false);
            setFormData({...formData, client: value});
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {project ? 'Edit Project' : 'Create New Project'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Project Name</label>
                        <input 
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            placeholder="Enter project name"
                            required
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Client</label>
                            {!showNewClientInput ? (
                                <select 
                                    value={formData.client}
                                    onChange={handleClientChange}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    required
                                >
                                    <option value="">Select Client</option>
                                    {clients.sort((a, b) => a.name.localeCompare(b.name)).map(client => (
                                        <option key={client.id} value={client.name}>
                                            {client.name}
                                        </option>
                                    ))}
                                    <option value="__new__">+ Add New Client</option>
                                </select>
                            ) : (
                                <div className="space-y-1.5">
                                    <input
                                        type="text"
                                        value={newClientName}
                                        onChange={(e) => setNewClientName(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Enter new client name"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowNewClientInput(false);
                                            setNewClientName('');
                                        }}
                                        className="text-xs text-gray-600 hover:text-gray-800"
                                    >
                                        <i className="fas fa-arrow-left mr-1"></i>
                                        Back to client list
                                    </button>
                                </div>
                            )}
                            {clients.length === 0 && !showNewClientInput && (
                                <p className="text-[10px] text-gray-500 mt-1">
                                    No clients found. Add clients in the Clients section first, or enter a new client name.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Project Type</label>
                            <select 
                                value={formData.type}
                                onChange={(e) => setFormData({...formData, type: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option>Monthly Review</option>
                                <option>Audit</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Start Date</label>
                            <input 
                                type="date" 
                                value={formData.startDate}
                                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Due Date</label>
                            <input 
                                type="date"
                                value={formData.dueDate}
                                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Project Manager</label>
                            <select 
                                value={formData.manager}
                                onChange={(e) => setFormData({...formData, manager: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="">Select Manager</option>
                                <option>Gareth Mauck</option>
                                <option>David Buttemer</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Assign To</label>
                            <select 
                                value={formData.assignedTo}
                                onChange={(e) => setFormData({...formData, assignedTo: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="">Select Team Member</option>
                                <option>Gareth Mauck</option>
                                <option>David Buttemer</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
                        <select 
                            value={formData.status}
                            onChange={(e) => setFormData({...formData, status: e.target.value})}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                            <option value="Active">Active</option>
                            <option value="In Progress">In Progress</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
                        <textarea 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            rows="3" 
                            placeholder="Project description and objectives"
                        ></textarea>
                    </div>
                    
                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
                            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                                Cancel
                            </button>
                            <button type="submit" className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                                {project ? 'Update Project' : 'Create Project'}
                            </button>
                        </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.ProjectModal = ProjectModal;
