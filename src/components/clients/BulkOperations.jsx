// Bulk Operations Component for Clients and Leads
const { useState, useEffect } = React;

const BulkOperations = ({ 
    items = [], 
    onBulkAction, 
    type = 'clients',
    isDark = false 
}) => {
    const [selectedItems, setSelectedItems] = useState([]);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [bulkAction, setBulkAction] = useState('');
    const [bulkActionData, setBulkActionData] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);

    // Reset selections when items change
    useEffect(() => {
        setSelectedItems([]);
        setShowBulkActions(false);
    }, [items]);

    // Handle item selection
    const handleItemSelect = (itemId) => {
        setSelectedItems(prev => 
            prev.includes(itemId) 
                ? prev.filter(id => id !== itemId)
                : [...prev, itemId]
        );
    };

    // Handle select all
    const handleSelectAll = () => {
        if (selectedItems.length === items.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(items.map(item => item.id));
        }
    };

    // Handle bulk action
    const handleBulkAction = async () => {
        if (!bulkAction || selectedItems.length === 0) return;

        setIsProcessing(true);
        try {
            const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
            
            await onBulkAction(bulkAction, selectedItemsData, bulkActionData);
            
            // Reset after successful action
            setSelectedItems([]);
            setShowBulkActions(false);
            setBulkAction('');
            setBulkActionData({});
        } catch (error) {
            console.error('Bulk action failed:', error);
            alert('Bulk action failed. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Get available bulk actions based on type
    const getAvailableActions = () => {
        const baseActions = [
            { id: 'export', label: 'Export Selected', icon: 'fas fa-download' },
            { id: 'delete', label: 'Delete Selected', icon: 'fas fa-trash', destructive: true }
        ];

        if (type === 'clients') {
            return [
                ...baseActions,
                { id: 'update_status', label: 'Update Status', icon: 'fas fa-edit' },
                { id: 'assign_project', label: 'Assign to Project', icon: 'fas fa-project-diagram' },
                { id: 'send_email', label: 'Send Email', icon: 'fas fa-envelope' },
                { id: 'create_invoice', label: 'Create Invoice', icon: 'fas fa-file-invoice' }
            ];
        } else if (type === 'leads') {
            return [
                ...baseActions,
                { id: 'update_status', label: 'Update Status', icon: 'fas fa-edit' },
                { id: 'convert_to_client', label: 'Convert to Client', icon: 'fas fa-user-check' },
                { id: 'send_email', label: 'Send Email', icon: 'fas fa-envelope' },
                { id: 'assign_owner', label: 'Assign Owner', icon: 'fas fa-user-tie' }
            ];
        }

        return baseActions;
    };

    // Render bulk action form based on selected action
    const renderBulkActionForm = () => {
        switch (bulkAction) {
            case 'update_status':
                return (
                    <div className="space-y-4">
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            New Status
                        </label>
                        <select
                            value={bulkActionData.status || ''}
                            onChange={(e) => setBulkActionData({ ...bulkActionData, status: e.target.value })}
                            className={`w-full px-3 py-2 rounded-lg border ${
                                isDark 
                                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                    : 'bg-white border-gray-300 text-gray-900'
                            }`}
                        >
                            <option value="">Select Status</option>
                            {type === 'clients' ? (
                                <>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="Prospect">Prospect</option>
                                </>
                            ) : (
                                <>
                                    <option value="New">New</option>
                                    <option value="Contacted">Contacted</option>
                                    <option value="Qualified">Qualified</option>
                                    <option value="Proposal">Proposal</option>
                                    <option value="Negotiation">Negotiation</option>
                                    <option value="Closed Won">Closed Won</option>
                                    <option value="Closed Lost">Closed Lost</option>
                                </>
                            )}
                        </select>
                    </div>
                );

            case 'send_email':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Email Subject
                            </label>
                            <input
                                type="text"
                                value={bulkActionData.subject || ''}
                                onChange={(e) => setBulkActionData({ ...bulkActionData, subject: e.target.value })}
                                className={`w-full px-3 py-2 rounded-lg border ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                        : 'bg-white border-gray-300 text-gray-900'
                                }`}
                                placeholder="Enter email subject"
                            />
                        </div>
                        <div>
                            <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Email Message
                            </label>
                            <textarea
                                value={bulkActionData.message || ''}
                                onChange={(e) => setBulkActionData({ ...bulkActionData, message: e.target.value })}
                                rows={4}
                                className={`w-full px-3 py-2 rounded-lg border ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                        : 'bg-white border-gray-300 text-gray-900'
                                }`}
                                placeholder="Enter email message"
                            />
                        </div>
                    </div>
                );

            case 'assign_project':
                return (
                    <div className="space-y-4">
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Select Project
                        </label>
                        <select
                            value={bulkActionData.projectId || ''}
                            onChange={(e) => setBulkActionData({ ...bulkActionData, projectId: e.target.value })}
                            className={`w-full px-3 py-2 rounded-lg border ${
                                isDark 
                                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                    : 'bg-white border-gray-300 text-gray-900'
                            }`}
                        >
                            <option value="">Select Project</option>
                            {/* This would be populated with actual projects */}
                            <option value="project-1">Project Alpha</option>
                            <option value="project-2">Project Beta</option>
                            <option value="project-3">Project Gamma</option>
                        </select>
                    </div>
                );

            case 'assign_owner':
                return (
                    <div className="space-y-4">
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Select Owner
                        </label>
                        <select
                            value={bulkActionData.ownerId || ''}
                            onChange={(e) => setBulkActionData({ ...bulkActionData, ownerId: e.target.value })}
                            className={`w-full px-3 py-2 rounded-lg border ${
                                isDark 
                                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                    : 'bg-white border-gray-300 text-gray-900'
                            }`}
                        >
                            <option value="">Select Owner</option>
                            <option value="user-1">John Doe</option>
                            <option value="user-2">Jane Smith</option>
                            <option value="user-3">Mike Johnson</option>
                        </select>
                    </div>
                );

            default:
                return null;
        }
    };

    if (items.length === 0) return null;

    return (
        <div className="space-y-4">
            {/* Selection Controls */}
            <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} rounded-lg p-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                checked={selectedItems.length === items.length}
                                onChange={handleSelectAll}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Select All ({items.length})
                            </span>
                        </label>
                        
                        {selectedItems.length > 0 && (
                            <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                {selectedItems.length} selected
                            </span>
                        )}
                    </div>

                    {selectedItems.length > 0 && (
                        <button
                            onClick={() => setShowBulkActions(!showBulkActions)}
                            className={`px-3 py-2 rounded-lg text-sm ${
                                isDark 
                                    ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' 
                                    : 'bg-white text-gray-900 hover:bg-gray-100'
                            } border border-gray-300`}
                        >
                            <i className="fas fa-tasks mr-2"></i>
                            Bulk Actions
                        </button>
                    )}
                </div>
            </div>

            {/* Bulk Actions Panel */}
            {showBulkActions && selectedItems.length > 0 && (
                <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} border border-gray-200 rounded-lg p-6`}>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                Bulk Actions
                            </h3>
                            <button
                                onClick={() => setShowBulkActions(false)}
                                className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {getAvailableActions().map(action => (
                                <button
                                    key={action.id}
                                    onClick={() => setBulkAction(action.id)}
                                    className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                                        bulkAction === action.id
                                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                                            : action.destructive
                                                ? isDark
                                                    ? 'border-red-600 bg-red-900 text-red-300 hover:bg-red-800'
                                                    : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                                                : isDark
                                                    ? 'border-gray-600 bg-gray-700 text-gray-100 hover:bg-gray-600'
                                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <i className={`${action.icon} mb-1 block`}></i>
                                    {action.label}
                                </button>
                            ))}
                        </div>

                        {bulkAction && renderBulkActionForm()}

                        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                            <button
                                onClick={() => {
                                    setBulkAction('');
                                    setBulkActionData({});
                                    setShowBulkActions(false);
                                }}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkAction}
                                disabled={isProcessing || !bulkAction}
                                className={`px-4 py-2 text-sm font-medium rounded-lg ${
                                    isProcessing
                                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                        : 'bg-primary-600 text-white hover:bg-primary-700'
                                }`}
                            >
                                {isProcessing ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin mr-2"></i>
                                        Processing...
                                    </>
                                ) : (
                                    `Apply to ${selectedItems.length} ${type}`
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.BulkOperations = BulkOperations;
