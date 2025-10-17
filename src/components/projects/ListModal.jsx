// Get React hooks from window
const { useState } = React;

const ListModal = ({ list, onSave, onClose }) => {
    const [formData, setFormData] = useState(list || {
        name: '',
        color: 'blue',
        description: ''
    });

    const colors = ['blue', 'green', 'purple', 'red', 'yellow', 'pink', 'indigo', 'gray'];

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-4 w-full max-w-md">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {list ? 'Edit List' : 'Create New List'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">List Name</label>
                        <input 
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            placeholder="e.g., Technical Tasks, Deliverables"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                        <textarea 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            rows="2"
                            placeholder="Brief description of this list..."
                        ></textarea>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Color</label>
                        <div className="grid grid-cols-4 gap-2">
                            {colors.map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setFormData({...formData, color})}
                                    className={`p-2.5 rounded-lg border-2 ${
                                        formData.color === color 
                                            ? 'border-gray-800' 
                                            : 'border-transparent'
                                    } bg-${color}-500 hover:border-gray-400 transition-colors`}
                                >
                                    {formData.color === color && (
                                        <i className="fas fa-check text-white text-xs"></i>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                            Cancel
                        </button>
                        <button type="submit" className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                            {list ? 'Update List' : 'Create List'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.ListModal = ListModal;
