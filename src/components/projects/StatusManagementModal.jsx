// Get React hooks from window
const { useState } = React;

const StatusManagementModal = ({ statuses, onSave, onClose }) => {
    const [statusList, setStatusList] = useState(statuses || [
        { id: 1, name: 'To Do', color: 'gray' },
        { id: 2, name: 'In Progress', color: 'blue' },
        { id: 3, name: 'Done', color: 'green' }
    ]);
    const [newStatusName, setNewStatusName] = useState('');
    const [newStatusColor, setNewStatusColor] = useState('purple');

    const colorOptions = [
        { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
        { value: 'red', label: 'Red', class: 'bg-red-500' },
        { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
        { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
        { value: 'green', label: 'Green', class: 'bg-green-500' },
        { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
        { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
        { value: 'pink', label: 'Pink', class: 'bg-pink-500' }
    ];

    const handleAddStatus = () => {
        if (newStatusName.trim()) {
            const newStatus = {
                id: Math.max(0, ...statusList.map(s => s.id)) + 1,
                name: newStatusName.trim(),
                color: newStatusColor
            };
            setStatusList([...statusList, newStatus]);
            setNewStatusName('');
            setNewStatusColor('purple');
        }
    };

    const handleDeleteStatus = (statusId) => {
        // Prevent deletion if only 1 status remains
        if (statusList.length === 1) {
            alert('Cannot delete the last status. Projects must have at least one status.');
            return;
        }
        
        if (confirm('Delete this status? Tasks with this status will be moved to the first remaining status.')) {
            setStatusList(statusList.filter(s => s.id !== statusId));
        }
    };

    const handleSave = () => {
        onSave(statusList);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">Manage Task Statuses</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Existing Statuses */}
                    <div>
                        <h3 className="text-xs font-medium text-gray-700 mb-2">Current Statuses</h3>
                        <div className="space-y-1.5">
                            {statusList.map(status => (
                                <div key={status.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded ${colorOptions.find(c => c.value === status.color)?.class}`}></div>
                                        <span className="font-medium text-gray-800 text-sm">{status.name}</span>
                                    </div>
                                    {statusList.length > 1 && (
                                        <button
                                            onClick={() => handleDeleteStatus(status.id)}
                                            className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded transition-colors"
                                            title="Delete Status"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Add New Status */}
                    <div className="border-t border-gray-200 pt-4">
                        <h3 className="text-xs font-medium text-gray-700 mb-2">Add New Status</h3>
                        <div className="space-y-2.5">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Status Name</label>
                                <input
                                    type="text"
                                    value={newStatusName}
                                    onChange={(e) => setNewStatusName(e.target.value)}
                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="e.g., Under Review, Blocked, etc."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Color</label>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {colorOptions.map(color => (
                                        <button
                                            key={color.value}
                                            type="button"
                                            onClick={() => setNewStatusColor(color.value)}
                                            className={`flex items-center gap-1.5 p-1.5 rounded-lg border-2 transition ${
                                                newStatusColor === color.value
                                                    ? 'border-primary-500 bg-primary-50'
                                                    : 'border-gray-300 hover:border-gray-400'
                                            }`}
                                        >
                                            <div className={`w-3 h-3 rounded ${color.class}`}></div>
                                            <span className="text-xs">{color.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleAddStatus}
                                className="w-full px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                            >
                                <i className="fas fa-plus mr-1.5"></i>
                                Add Status
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                    >
                        <i className="fas fa-save mr-1.5"></i>
                        Save Statuses
                    </button>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.StatusManagementModal = StatusManagementModal;
