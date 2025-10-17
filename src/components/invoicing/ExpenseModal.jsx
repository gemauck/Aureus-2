const { useState } = window;

export const ExpenseModal = ({ expense, clients, projects, onSave, onClose }) => {
    const [formData, setFormData] = useState(expense || {
        date: new Date().toISOString().split('T')[0],
        client: '',
        project: '',
        category: '',
        description: '',
        amount: 0,
        receipt: null,
        billable: true,
        markup: 0,
        invoiced: false,
        notes: ''
    });

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData({...formData, receipt: file.name});
        }
    };

    const billedAmount = formData.amount * (1 + formData.markup / 100);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">
                        {expense ? 'Edit Expense' : 'Add Expense'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({...formData, category: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                required
                            >
                                <option value="">Select Category</option>
                                <option>Travel</option>
                                <option>Accommodation</option>
                                <option>Meals</option>
                                <option>Materials</option>
                                <option>Equipment</option>
                                <option>Software/Subscriptions</option>
                                <option>Professional Services</option>
                                <option>Other</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Client</label>
                            <select
                                value={formData.client}
                                onChange={(e) => setFormData({...formData, client: e.target.value, project: ''})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                required
                            >
                                <option value="">Select Client</option>
                                {clients && clients.map(client => (
                                    <option key={client.id} value={client.name}>{client.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Project (Optional)</label>
                            <select
                                value={formData.project}
                                onChange={(e) => setFormData({...formData, project: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            >
                                <option value="">Select Project</option>
                                {projects && projects
                                    .filter(p => p.client === formData.client)
                                    .map(project => (
                                        <option key={project.id} value={project.name}>{project.name}</option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
                        <input
                            type="text"
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            placeholder="Expense description"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Amount (ZAR)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                required
                                min="0"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Markup %</label>
                            <input
                                type="number"
                                step="1"
                                value={formData.markup}
                                onChange={(e) => setFormData({...formData, markup: parseFloat(e.target.value) || 0})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                min="0"
                                max="100"
                            />
                        </div>
                    </div>

                    {formData.markup > 0 && (
                        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-600">Cost:</span>
                                <span className="font-medium">R{formData.amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-600">Markup ({formData.markup}%):</span>
                                <span className="font-medium">R{(formData.amount * formData.markup / 100).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs pt-1.5 border-t border-blue-200">
                                <span className="font-medium">Billed Amount:</span>
                                <span className="font-bold text-primary-600">R{billedAmount.toFixed(2)}</span>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Receipt/Attachment</label>
                        <input
                            type="file"
                            onChange={handleFileChange}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            accept="image/*,.pdf"
                        />
                        {formData.receipt && (
                            <div className="mt-1.5 text-xs text-gray-600 flex items-center">
                                <i className="fas fa-paperclip mr-1.5"></i>
                                {formData.receipt}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            rows="2"
                            placeholder="Additional notes..."
                        ></textarea>
                    </div>

                    <div className="flex items-center">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={formData.billable}
                                onChange={(e) => setFormData({...formData, billable: e.target.checked})}
                                className="mr-2 w-4 h-4"
                            />
                            <span className="text-xs text-gray-700">Billable to client</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                        >
                            {expense ? 'Update Expense' : 'Add Expense'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ExpenseModal;
