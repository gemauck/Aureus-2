const { useState, useEffect } = window;

export const RecurringInvoiceModal = ({ recurringInvoice, clients, projects, onSave, onClose }) => {
    const [formData, setFormData] = useState(recurringInvoice || {
        name: '',
        client: '',
        project: '',
        frequency: 'Monthly',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        nextInvoiceDate: new Date().toISOString().split('T')[0],
        lineItems: [{ description: '', quantity: 1, rate: 0, amount: 0 }],
        notes: '',
        autoSend: true,
        active: true
    });

    const handleLineItemChange = (index, field, value) => {
        const newLineItems = [...formData.lineItems];
        newLineItems[index][field] = value;
        
        if (field === 'quantity' || field === 'rate') {
            newLineItems[index].amount = 
                (parseFloat(newLineItems[index].quantity) || 0) * 
                (parseFloat(newLineItems[index].rate) || 0);
        }
        
        setFormData({ ...formData, lineItems: newLineItems });
    };

    const addLineItem = () => {
        setFormData({
            ...formData,
            lineItems: [...formData.lineItems, { description: '', quantity: 1, rate: 0, amount: 0 }]
        });
    };

    const removeLineItem = (index) => {
        if (formData.lineItems.length > 1) {
            setFormData({
                ...formData,
                lineItems: formData.lineItems.filter((_, i) => i !== index)
            });
        }
    };

    const subtotal = formData.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const vat = subtotal * 0.15;
    const total = subtotal + vat;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.client) {
            alert('Please fill in required fields');
            return;
        }
        onSave({
            ...formData,
            subtotal,
            vat,
            total
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">
                        {recurringInvoice ? 'Edit Recurring Invoice' : 'Create Recurring Invoice'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Template Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                placeholder="e.g., Monthly Retainer - ABC Corp"
                                required
                            />
                        </div>

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

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Frequency</label>
                            <select
                                value={formData.frequency}
                                onChange={(e) => setFormData({...formData, frequency: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            >
                                <option>Weekly</option>
                                <option>Monthly</option>
                                <option>Quarterly</option>
                                <option>Annually</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Start Date</label>
                            <input
                                type="date"
                                value={formData.startDate}
                                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">End Date (Optional)</label>
                            <input
                                type="date"
                                value={formData.endDate}
                                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Next Invoice Date</label>
                        <input
                            type="date"
                            value={formData.nextInvoiceDate}
                            onChange={(e) => setFormData({...formData, nextInvoiceDate: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            required
                        />
                    </div>

                    {/* Line Items */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Line Items</label>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Description</th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide w-20">Quantity</th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide w-28">Rate</th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide w-28">Amount</th>
                                        <th className="px-3 py-1.5 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {formData.lineItems.map((item, index) => (
                                        <tr key={index}>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="text"
                                                    value={item.description}
                                                    onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                                    placeholder="Description"
                                                    required
                                                />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="number"
                                                    step="0.25"
                                                    value={item.quantity}
                                                    onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                                    min="0.25"
                                                />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="number"
                                                    value={item.rate}
                                                    onChange={(e) => handleLineItemChange(index, 'rate', e.target.value)}
                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                                    placeholder="0.00"
                                                    min="0"
                                                />
                                            </td>
                                            <td className="px-3 py-1.5 text-gray-900 font-medium text-xs">
                                                R{item.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => removeLineItem(index)}
                                                    className="text-red-600 hover:text-red-800"
                                                    disabled={formData.lineItems.length === 1}
                                                >
                                                    <i className="fas fa-trash text-xs"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <button
                            type="button"
                            onClick={addLineItem}
                            className="mt-2 text-primary-600 text-xs flex items-center hover:text-primary-700"
                        >
                            <i className="fas fa-plus mr-1"></i> Add Line Item
                        </button>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end">
                        <div className="w-72 space-y-1.5 border-t border-gray-200 pt-3">
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-600">Subtotal:</span>
                                <span className="font-medium">R{subtotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-600">VAT (15%):</span>
                                <span className="font-medium">R{vat.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
                                <span>Total per invoice:</span>
                                <span className="text-primary-600">R{total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            rows="2"
                            placeholder="Default notes for invoices..."
                        ></textarea>
                    </div>

                    <div className="flex items-center gap-6">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={formData.autoSend}
                                onChange={(e) => setFormData({...formData, autoSend: e.target.checked})}
                                className="mr-2 w-4 h-4"
                            />
                            <span className="text-xs text-gray-700">Auto-send invoices to client</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={formData.active}
                                onChange={(e) => setFormData({...formData, active: e.target.checked})}
                                className="mr-2 w-4 h-4"
                            />
                            <span className="text-xs text-gray-700">Active</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                            Cancel
                        </button>
                        <button type="submit" className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                            {recurringInvoice ? 'Update Template' : 'Create Template'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RecurringInvoiceModal;
