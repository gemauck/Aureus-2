// Get React hooks from window
const { useState, useEffect } = React;

const ClientModal = ({ client, onSave, onClose }) => {
    const [formData, setFormData] = useState({
        name: '',
        industry: 'Other',
        status: 'Active',
        address: '',
        website: '',
        notes: '',
        contacts: [],
        sites: []
    });
    const { isDark } = window.useTheme();

    // Initialize form data when client prop changes
    useEffect(() => {
        if (client) {
            setFormData({
                name: client.name || '',
                industry: client.industry || 'Other',
                status: client.status || 'Active',
                address: client.address || '',
                website: client.website || '',
                notes: client.notes || '',
                contacts: client.contacts || [],
                sites: client.sites || []
            });
        }
    }, [client]);

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log('=== SIMPLE CLIENT MODAL SUBMIT ===');
        console.log('Form data:', formData);
        console.log('Sites array:', formData.sites);
        console.log('Sites length:', formData.sites.length);
        console.log('Sites type:', typeof formData.sites);
        console.log('Is sites array?', Array.isArray(formData.sites));
        onSave(formData);
    };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto`}>
                    <div className={`flex justify-between items-center px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <h2 className={`text-base font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {client ? 'Edit Client' : 'Add New Client'}
                        </h2>
                        <button onClick={onClose} className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} p-1 rounded transition-colors`}>
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={`block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1.5`}>Entity Name</label>
                            <input 
                                type="text" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' 
                                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                }`} 
                                required 
                            />
                        </div>
                        <div>
                            <label className={`block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1.5`}>Industry</label>
                            <select
                                value={formData.industry}
                                onChange={(e) => setFormData({...formData, industry: e.target.value})}
                                className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' 
                                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                }`}
                            >
                                <option value="">Select Industry</option>
                                <option>Mining</option>
                                <option>Forestry</option>
                                <option>Agriculture</option>
                                <option>Other</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={`block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1.5`}>Website</label>
                            <input 
                                type="url" 
                                value={formData.website}
                                onChange={(e) => setFormData({...formData, website: e.target.value})}
                                className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' 
                                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                }`} 
                                placeholder="https://example.com"
                            />
                        </div>
                        <div>
                            <label className={`block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1.5`}>Status</label>
                            <select 
                                value={formData.status}
                                onChange={(e) => setFormData({...formData, status: e.target.value})}
                                className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' 
                                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                }`}
                            >
                                <option>Active</option>
                                <option>Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Address</label>
                        <textarea 
                            value={formData.address}
                            onChange={(e) => setFormData({...formData, address: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            rows="2"
                        ></textarea>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes</label>
                        <textarea 
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            rows="2"
                        ></textarea>
                    </div>
                    
                    {/* Sites Section */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Sites</label>
                        <div className="space-y-2">
                            {(formData.sites || []).map((site, index) => (
                                <div key={index} className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={typeof site === 'string' ? site : site.name || ''}
                                        onChange={(e) => {
                                            const newSites = [...(formData.sites || [])];
                                            if (typeof site === 'string') {
                                                newSites[index] = e.target.value;
                                            } else {
                                                newSites[index] = { ...site, name: e.target.value };
                                            }
                                            setFormData({...formData, sites: newSites});
                                        }}
                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        placeholder="Site name or location"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const newSites = (formData.sites || []).filter((_, i) => i !== index);
                                            setFormData({...formData, sites: newSites});
                                        }}
                                        className="px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            ))}
                            <button 
                                type="button"
                                onClick={() => {
                                    const newSites = [...(formData.sites || []), ''];
                                    setFormData({...formData, sites: newSites});
                                }}
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                <i className="fas fa-plus mr-1"></i>
                                Add Site
                            </button>
                        </div>
                    </div>
                        <div className={`flex justify-end gap-2 pt-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <button type="button" onClick={onClose} className={`px-3 py-1.5 text-sm border rounded-lg transition-colors font-medium ${
                                isDark 
                                    ? 'border-gray-600 text-gray-300 hover:bg-gray-700' 
                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}>
                                Cancel
                            </button>
                            <button type="submit" className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                                {client ? 'Update Client' : 'Add Client'}
                            </button>
                        </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.ClientModal = ClientModal;
