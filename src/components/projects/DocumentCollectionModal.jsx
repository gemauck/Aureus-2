// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const DocumentCollectionModal = ({ document, onSave, onClose, users }) => {
    const [formData, setFormData] = useState(document || {
        name: '',
        description: '',
        requiredFrom: '',
        dueDate: '',
        status: 'Pending',
        priority: 'Medium',
        category: 'General'
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
                // Only close if clicking directly on the backdrop, not on the modal content
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div 
                className="bg-white rounded-lg w-full max-w-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">
                        {document ? 'Edit Document Request' : 'Request Document'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Document Name *</label>
                        <input 
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            placeholder="e.g., Tax Certificate, Company Registration"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
                        <textarea 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            rows="2" 
                            placeholder="Additional details or requirements"
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Required From *</label>
                            <select 
                                value={formData.requiredFrom}
                                onChange={(e) => setFormData({...formData, requiredFrom: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                required
                            >
                                <option value="">Select person</option>
                                {users && users.map(user => (
                                    <option key={user.id} value={user.name}>{user.name}</option>
                                ))}
                                <option value="Client">Client</option>
                                <option value="External Vendor">External Vendor</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Due Date</label>
                            <input 
                                type="date"
                                value={formData.dueDate}
                                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
                            <select 
                                value={formData.category}
                                onChange={(e) => setFormData({...formData, category: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option>General</option>
                                <option>Legal</option>
                                <option>Financial</option>
                                <option>Technical</option>
                                <option>Compliance</option>
                                <option>Operational</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Priority</label>
                            <select 
                                value={formData.priority}
                                onChange={(e) => setFormData({...formData, priority: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option>Low</option>
                                <option>Medium</option>
                                <option>High</option>
                                <option>Urgent</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                            Cancel
                        </button>
                        <button type="submit" className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                            {document ? 'Update' : 'Create'} Request
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
if (typeof window !== 'undefined') {
    window.DocumentCollectionModal = DocumentCollectionModal;
    // Dispatch event to notify that component is loaded
    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('componentLoaded', { 
            detail: { component: 'DocumentCollectionModal' } 
        }));
    }
    console.log('✅ DocumentCollectionModal registered to window');
}
