// Enhanced Contracts Tab Component for ClientDetailModal
// Place this after line 1023 (after the basic contracts code)
// Replace the basic contracts tab content with this comprehensive version

/* ====== CONTRACT MANAGEMENT STATE (Add to top of ClientDetailModal) ====== */
// Add these state variables near the other useState declarations:
/*
const [showContractForm, setShowContractForm] = useState(false);
const [editingContract, setEditingContract] = useState(null);
const [newContract, setNewContract] = useState({
    title: '',
    type: 'Service Agreement',
    value: 0,
    startDate: '',
    endDate: '',
    status: 'Active',
    signedDate: '',
    renewalDate: '',
    autoRenew: false,
    paymentTerms: 'Net 30',
    billingFrequency: 'Monthly',
    notes: '',
    attachments: []
});
*/

/* ====== CONTRACT HANDLERS (Add after other handlers) ====== */

const handleAddContract = () => {
    if (!newContract.title || !newContract.startDate) {
        alert('Contract title and start date are required');
        return;
    }

    const contractToAdd = {
        ...newContract,
        id: Date.now(),
        createdAt: new Date().toISOString()
    };

    const currentContracts = Array.isArray(formData.contracts) ? formData.contracts : [];
    const updatedContracts = [...currentContracts, contractToAdd];
    setFormData({...formData, contracts: updatedContracts});
    logActivity('Contract Added', `Added contract: ${newContract.title}`);

    // Reset form
    setNewContract({
        title: '',
        type: 'Service Agreement',
        value: 0,
        startDate: '',
        endDate: '',
        status: 'Active',
        signedDate: '',
        renewalDate: '',
        autoRenew: false,
        paymentTerms: 'Net 30',
        billingFrequency: 'Monthly',
        notes: '',
        attachments: []
    });
    setShowContractForm(false);
};

const handleEditContract = (contract) => {
    setEditingContract(contract);
    setNewContract(contract);
    setShowContractForm(true);
};

const handleUpdateContract = () => {
    const updatedContracts = (formData.contracts || []).map(c =>
        c.id === editingContract.id ? { ...newContract, id: c.id } : c
    );
    setFormData({...formData, contracts: updatedContracts});
    logActivity('Contract Updated', `Updated contract: ${newContract.title}`);

    setEditingContract(null);
    setNewContract({
        title: '',
        type: 'Service Agreement',
        value: 0,
        startDate: '',
        endDate: '',
        status: 'Active',
        signedDate: '',
        renewalDate: '',
        autoRenew: false,
        paymentTerms: 'Net 30',
        billingFrequency: 'Monthly',
        notes: '',
        attachments: []
    });
    setShowContractForm(false);
};

const handleDeleteContract = (contractId) => {
    const contract = (formData.contracts || []).find(c => c.id === contractId);
    if (confirm('Delete this contract?')) {
        setFormData({
            ...formData,
            contracts: (formData.contracts || []).filter(c => c.id !== contractId)
        });
        logActivity('Contract Deleted', `Deleted contract: ${contract?.title}`);
    }
};

const getDaysUntilExpiry = (endDate) => {
    if (!endDate) return null;
    const days = Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
};

/* ====== ENHANCED CONTRACTS TAB JSX (Replace existing contracts tab) ====== */

{activeTab === 'contracts' && (
    <div className="space-y-4">
        {/* Contract Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                <div className="text-xs text-green-700 font-medium mb-1">Active Contracts</div>
                <div className="text-2xl font-bold text-green-900">
                    {(formData.contracts || []).filter(c => c.status === 'Active').length}
                </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="text-xs text-blue-700 font-medium mb-1">Total Value</div>
                <div className="text-2xl font-bold text-blue-900">
                    R {(formData.contracts || [])
                        .filter(c => c.status === 'Active')
                        .reduce((sum, c) => sum + (c.value || 0), 0)
                        .toLocaleString('en-ZA')}
                </div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                <div className="text-xs text-yellow-700 font-medium mb-1">Expiring Soon</div>
                <div className="text-2xl font-bold text-yellow-900">
                    {(formData.contracts || []).filter(c => {
                        if (!c.endDate || c.status !== 'Active') return false;
                        const days = getDaysUntilExpiry(c.endDate);
                        return days > 0 && days <= 90;
                    }).length}
                </div>
            </div>
        </div>

        {/* Add Contract Button */}
        <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-900">Contract Documents</h3>
            <button
                type="button"
                onClick={() => setShowContractForm(!showContractForm)}
                className="bg-primary-600 text-white px-3 py-1.5 text-xs rounded-lg hover:bg-primary-700"
            >
                <i className="fas fa-plus mr-1.5"></i>
                Add Contract
            </button>
        </div>

        {/* Contract Form */}
        {showContractForm && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3 text-sm">
                    {editingContract ? 'Edit Contract' : 'New Contract'}
                </h4>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                            <input
                                type="text"
                                value={newContract.title}
                                onChange={(e) => setNewContract({...newContract, title: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                                placeholder="e.g., Annual Service Agreement"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                            <select
                                value={newContract.type}
                                onChange={(e) => setNewContract({...newContract, type: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            >
                                <option>Service Agreement</option>
                                <option>Master Service Agreement</option>
                                <option>Equipment Lease</option>
                                <option>Maintenance Contract</option>
                                <option>Support Contract</option>
                                <option>NDA</option>
                                <option>Other</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Value (ZAR)</label>
                            <input
                                type="number"
                                value={newContract.value}
                                onChange={(e) => setNewContract({...newContract, value: Number(e.target.value)})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
                            <input
                                type="date"
                                value={newContract.startDate}
                                onChange={(e) => setNewContract({...newContract, startDate: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                            <input
                                type="date"
                                value={newContract.endDate}
                                onChange={(e) => setNewContract({...newContract, endDate: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                            <select
                                value={newContract.status}
                                onChange={(e) => setNewContract({...newContract, status: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            >
                                <option>Active</option>
                                <option>Pending</option>
                                <option>Under Review</option>
                                <option>Expired</option>
                                <option>Cancelled</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Signed Date</label>
                            <input
                                type="date"
                                value={newContract.signedDate}
                                onChange={(e) => setNewContract({...newContract, signedDate: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Renewal Date</label>
                            <input
                                type="date"
                                value={newContract.renewalDate}
                                onChange={(e) => setNewContract({...newContract, renewalDate: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Payment Terms</label>
                            <select
                                value={newContract.paymentTerms}
                                onChange={(e) => setNewContract({...newContract, paymentTerms: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            >
                                <option>Net 15</option>
                                <option>Net 30</option>
                                <option>Net 45</option>
                                <option>Net 60</option>
                                <option>Due on Receipt</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Billing Frequency</label>
                            <select
                                value={newContract.billingFrequency}
                                onChange={(e) => setNewContract({...newContract, billingFrequency: e.target.value})}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            >
                                <option>Monthly</option>
                                <option>Quarterly</option>
                                <option>Semi-Annually</option>
                                <option>Annually</option>
                                <option>One-Time</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="autoRenew"
                            checked={newContract.autoRenew}
                            onChange={(e) => setNewContract({...newContract, autoRenew: e.target.checked})}
                            className="mr-2"
                        />
                        <label htmlFor="autoRenew" className="text-xs font-medium text-gray-700">
                            Auto-Renew Contract
                        </label>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                            value={newContract.notes}
                            onChange={(e) => setNewContract({...newContract, notes: e.target.value})}
                            rows="2"
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                            placeholder="Terms, conditions, or special notes..."
                        ></textarea>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setShowContractForm(false);
                                setEditingContract(null);
                                setNewContract({
                                    title: '',
                                    type: 'Service Agreement',
                                    value: 0,
                                    startDate: '',
                                    endDate: '',
                                    status: 'Active',
                                    signedDate: '',
                                    renewalDate: '',
                                    autoRenew: false,
                                    paymentTerms: 'Net 30',
                                    billingFrequency: 'Monthly',
                                    notes: '',
                                    attachments: []
                                });
                            }}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={editingContract ? handleUpdateContract : handleAddContract}
                            className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                            {editingContract ? 'Update' : 'Add'} Contract
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Contracts List */}
        <div className="space-y-2">
            {(!formData.contracts || formData.contracts.length === 0) ? (
                <div className="text-center py-8 text-gray-500 text-xs">
                    <i className="fas fa-file-contract text-3xl mb-2"></i>
                    <p>No contracts on file</p>
                </div>
            ) : (
                (formData.contracts || []).map(contract => {
                    const daysUntilExpiry = getDaysUntilExpiry(contract.endDate);
                    const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 90;
                    const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                    const statusColors = {
                        'Active': 'bg-green-100 text-green-800',
                        'Pending': 'bg-yellow-100 text-yellow-800',
                        'Expired': 'bg-red-100 text-red-800',
                        'Cancelled': 'bg-gray-100 text-gray-800',
                        'Under Review': 'bg-blue-100 text-blue-800'
                    };

                    return (
                        <div
                            key={contract.id}
                            className={`bg-white border rounded-lg p-3 hover:border-primary-300 transition ${
                                isExpired ? 'border-red-300 bg-red-50' :
                                isExpiringSoon ? 'border-yellow-300 bg-yellow-50' :
                                'border-gray-200'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <i className="fas fa-file-contract text-primary-600 text-sm"></i>
                                        <h4 className="font-semibold text-gray-900 text-xs">{contract.title}</h4>
                                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[contract.status] || 'bg-gray-100 text-gray-800'}`}>
                                            {contract.status}
                                        </span>
                                        {contract.autoRenew && (
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                                                Auto-Renew
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
                                        <div className="text-gray-600">
                                            <i className="fas fa-tag mr-1.5 w-4"></i>{contract.type}
                                        </div>
                                        <div className="text-gray-600">
                                            <i className="fas fa-dollar-sign mr-1.5 w-4"></i>
                                            R {(contract.value || 0).toLocaleString('en-ZA')}
                                        </div>
                                        {contract.startDate && (
                                            <div className="text-gray-600">
                                                <i className="fas fa-calendar-alt mr-1.5 w-4"></i>
                                                Start: {contract.startDate}
                                            </div>
                                        )}
                                        {contract.endDate && (
                                            <div className="text-gray-600">
                                                <i className="fas fa-calendar-check mr-1.5 w-4"></i>
                                                End: {contract.endDate}
                                            </div>
                                        )}
                                        {contract.paymentTerms && (
                                            <div className="text-gray-600">
                                                <i className="fas fa-money-check-alt mr-1.5 w-4"></i>
                                                {contract.paymentTerms}
                                            </div>
                                        )}
                                        {contract.billingFrequency && (
                                            <div className="text-gray-600">
                                                <i className="fas fa-clock mr-1.5 w-4"></i>
                                                {contract.billingFrequency}
                                            </div>
                                        )}
                                    </div>

                                    {/* Expiry Warnings */}
                                    {isExpiringSoon && (
                                        <div className="bg-yellow-100 border border-yellow-300 rounded p-2 mb-2">
                                            <div className="flex items-center gap-2 text-yellow-800 text-xs">
                                                <i className="fas fa-exclamation-triangle"></i>
                                                <span className="font-medium">
                                                    Expires in {daysUntilExpiry} days
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {isExpired && (
                                        <div className="bg-red-100 border border-red-300 rounded p-2 mb-2">
                                            <div className="flex items-center gap-2 text-red-800 text-xs">
                                                <i className="fas fa-times-circle"></i>
                                                <span className="font-medium">
                                                    Expired {Math.abs(daysUntilExpiry)} days ago
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {contract.notes && (
                                        <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2">
                                            {contract.notes}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 ml-4">
                                    <button
                                        type="button"
                                        onClick={() => handleEditContract(contract)}
                                        className="text-primary-600 hover:text-primary-700 p-1"
                                        title="Edit"
                                    >
                                        <i className="fas fa-edit text-xs"></i>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteContract(contract.id)}
                                        className="text-red-600 hover:text-red-700 p-1"
                                        title="Delete"
                                    >
                                        <i className="fas fa-trash text-xs"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    </div>
)}
