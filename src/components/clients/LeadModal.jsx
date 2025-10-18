// Get React hooks from window
const { useState } = React;

const LeadModal = ({ lead, onSave, onClose }) => {
    const [formData, setFormData] = useState(lead || {
        name: '',
        industry: '',
        contact: '',
        email: '',
        phone: '',
        source: 'Website',
        stage: 'Initial Contact',
        value: 0,
        assignedTo: 'Sarah Johnson',
        notes: '',
        nextAction: '',
        status: 'New'
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">
                        {lead ? 'Edit Lead' : 'Add New Lead'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Entity Name</label>
                            <input 
                                type="text" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                required 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Industry</label>
                            <select
                                value={formData.industry}
                                onChange={(e) => setFormData({...formData, industry: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Contact Person</label>
                            <input 
                                type="text" 
                                value={formData.contact}
                                onChange={(e) => setFormData({...formData, contact: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
                            <input 
                                type="email" 
                                value={formData.email}
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone</label>
                            <input 
                                type="tel" 
                                value={formData.phone}
                                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Lead Source</label>
                            <select 
                                value={formData.source}
                                onChange={(e) => setFormData({...formData, source: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option>Website</option>
                                <option>Referral</option>
                                <option>LinkedIn</option>
                                <option>Cold Outreach</option>
                                <option>Trade Show</option>
                                <option>Other</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Stage</label>
                            <select 
                                value={formData.stage}
                                onChange={(e) => setFormData({...formData, stage: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option>Initial Contact</option>
                                <option>Discovery</option>
                                <option>Proposal</option>
                                <option>Negotiation</option>
                                <option>Closed Won</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Deal Value</label>
                            <input 
                                type="number" 
                                value={formData.value}
                                onChange={(e) => setFormData({...formData, value: parseInt(e.target.value) || 0})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Assigned To</label>
                        <select 
                            value={formData.assignedTo}
                            onChange={(e) => setFormData({...formData, assignedTo: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                            <option>Sarah Johnson</option>
                            <option>Mike Chen</option>
                            <option>Emily Davis</option>
                            <option>John Smith</option>
                        </select>
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
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Next Action</label>
                        <input 
                            type="text" 
                            value={formData.nextAction}
                            onChange={(e) => setFormData({...formData, nextAction: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            placeholder="e.g., Schedule follow-up call" 
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                            Cancel
                        </button>
                        <button type="submit" className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                            {lead ? 'Update Lead' : 'Add Lead'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.LeadModal = LeadModal;
