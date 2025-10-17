const { useState, useEffect } = window;

export const InvoiceModal = ({ invoice, clients, projects, timeEntries, onSave, onClose, notesTemplates }) => {
    const [formData, setFormData] = useState(invoice || {
        invoiceNumber: '',
        client: '',
        project: '',
        date: new Date().toISOString().split('T')[0],
        dueDate: '',
        currency: 'ZAR',
        exchangeRate: 1,
        lineItems: [{ description: '', quantity: 1, rate: 0, amount: 0, taxRate: 15, taxable: true }],
        notes: '',
        status: 'Draft',
        customFields: []
    });
    
    const [showNotesTemplates, setShowNotesTemplates] = useState(false);
    const [selectedTimeEntries, setSelectedTimeEntries] = useState([]);
    const [showTimeEntries, setShowTimeEntries] = useState(false);
    
    const currencies = [
        { code: 'ZAR', symbol: 'R', name: 'South African Rand', taxRate: 15 },
        { code: 'USD', symbol: '$', name: 'US Dollar', taxRate: 0 },
        { code: 'EUR', symbol: '€', name: 'Euro', taxRate: 0 },
        { code: 'GBP', symbol: '£', name: 'British Pound', taxRate: 0 }
    ];
    
    const currentCurrency = currencies.find(c => c.code === formData.currency) || currencies[0];

    useEffect(() => {
        // Auto-generate invoice number if new invoice
        if (!invoice) {
            const invoiceNum = `INV-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
            setFormData(prev => ({ ...prev, invoiceNumber: invoiceNum }));
        }
    }, [invoice]);

    useEffect(() => {
        // Calculate due date (30 days from invoice date)
        if (formData.date) {
            const date = new Date(formData.date);
            date.setDate(date.getDate() + 30);
            setFormData(prev => ({ 
                ...prev, 
                dueDate: date.toISOString().split('T')[0] 
            }));
        }
    }, [formData.date]);

    const handleLineItemChange = (index, field, value) => {
        const newLineItems = [...formData.lineItems];
        newLineItems[index][field] = value;
        
        // Auto-calculate amount
        if (field === 'quantity' || field === 'rate') {
            newLineItems[index].amount = 
                (parseFloat(newLineItems[index].quantity) || 0) * 
                (parseFloat(newLineItems[index].rate) || 0);
        }
        
        // Set default tax rate based on currency if taxable changed
        if (field === 'taxable' && value) {
            newLineItems[index].taxRate = currentCurrency.taxRate;
        }
        
        setFormData({ ...formData, lineItems: newLineItems });
    };

    const addLineItem = () => {
        setFormData({
            ...formData,
            lineItems: [...formData.lineItems, { 
                description: '', 
                quantity: 1, 
                rate: 0, 
                amount: 0, 
                taxRate: currentCurrency.taxRate,
                taxable: true 
            }]
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

    const handleImportTimeEntries = () => {
        if (!formData.client || !formData.project) {
            alert('Please select a client and project first');
            return;
        }
        setShowTimeEntries(true);
    };

    const toggleTimeEntry = (entryId) => {
        if (selectedTimeEntries.includes(entryId)) {
            setSelectedTimeEntries(selectedTimeEntries.filter(id => id !== entryId));
        } else {
            setSelectedTimeEntries([...selectedTimeEntries, entryId]);
        }
    };

    const importSelectedTimeEntries = () => {
        const entries = timeEntries.filter(e => selectedTimeEntries.includes(e.id));
        const newLineItems = entries.map(entry => ({
            description: `${entry.task} - ${entry.date}`,
            quantity: entry.hours,
            rate: 1500, // Default hourly rate R1,500
            amount: entry.hours * 1500,
            taxRate: currentCurrency.taxRate,
            taxable: true
        }));
        
        setFormData({
            ...formData,
            lineItems: [...formData.lineItems, ...newLineItems]
        });
        setShowTimeEntries(false);
        setSelectedTimeEntries([]);
    };

    const insertNotesTemplate = (templateContent) => {
        const currentNotes = formData.notes;
        const newNotes = currentNotes ? `${currentNotes}\n\n${templateContent}` : templateContent;
        setFormData({...formData, notes: newNotes});
        setShowNotesTemplates(false);
    };

    const subtotal = formData.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const vat = formData.lineItems.reduce((sum, item) => {
        if (item.taxable) {
            return sum + (item.amount * (item.taxRate || 0) / 100);
        }
        return sum;
    }, 0);
    const total = subtotal + vat;

    const availableTimeEntries = timeEntries?.filter(entry => 
        entry.project === formData.project && 
        entry.billable &&
        entry.client === clients.find(c => c.name === formData.client)?.name
    ) || [];

    const handleSubmit = (e) => {
        e.preventDefault();
        if (formData.lineItems.some(item => !item.description || item.rate <= 0)) {
            alert('Please fill in all line items with valid amounts');
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
            <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">
                        {invoice ? 'Edit Invoice' : 'Create Invoice'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Invoice Details */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Invoice Number</label>
                            <input 
                                type="text" 
                                value={formData.invoiceNumber}
                                onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-50" 
                                readOnly
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Currency <i className="fas fa-globe text-blue-500 ml-1"></i>
                            </label>
                            <select 
                                value={formData.currency}
                                onChange={(e) => {
                                    const newCurrency = e.target.value;
                                    const newCurrencyObj = currencies.find(c => c.code === newCurrency);
                                    setFormData({
                                        ...formData, 
                                        currency: newCurrency,
                                        lineItems: formData.lineItems.map(item => ({
                                            ...item,
                                            taxRate: item.taxable ? (newCurrencyObj?.taxRate || 0) : 0
                                        }))
                                    });
                                }}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            >
                                {currencies.map(curr => (
                                    <option key={curr.code} value={curr.code}>
                                        {curr.symbol} {curr.code}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
                            <select 
                                value={formData.status}
                                onChange={(e) => setFormData({...formData, status: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            >
                                <option>Draft</option>
                                <option>Sent</option>
                                <option>Paid</option>
                                <option>Overdue</option>
                            </select>
                        </div>
                    </div>

                    {formData.currency !== 'ZAR' && (
                        <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                <i className="fas fa-exchange-alt mr-1.5"></i>
                                Exchange Rate to ZAR
                            </label>
                            <input 
                                type="number"
                                step="0.0001"
                                value={formData.exchangeRate}
                                onChange={(e) => setFormData({...formData, exchangeRate: parseFloat(e.target.value) || 1})}
                                className="w-48 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                placeholder="1.0000"
                            />
                            <div className="text-[10px] text-gray-600 mt-1">
                                1 {formData.currency} = {formData.exchangeRate} ZAR
                            </div>
                        </div>
                    )}

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

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Invoice Date</label>
                            <input 
                                type="date" 
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg" 
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Due Date</label>
                            <input 
                                type="date"
                                value={formData.dueDate}
                                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg" 
                                required
                            />
                        </div>
                    </div>

                    {/* Import Time Entries Button */}
                    {formData.project && availableTimeEntries.length > 0 && (
                        <div>
                            <button
                                type="button"
                                onClick={handleImportTimeEntries}
                                className="px-3 py-1.5 text-sm border-2 border-dashed border-primary-500 text-primary-600 rounded-lg hover:bg-primary-50 transition"
                            >
                                <i className="fas fa-clock mr-1.5"></i>
                                Import Time Entries ({availableTimeEntries.length} available)
                            </button>
                        </div>
                    )}

                    {/* Line Items */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Line Items</label>
                        <div className="border border-gray-200 rounded-lg overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Description</th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide w-16">Qty</th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide w-24">Rate</th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide w-20">Tax%</th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide w-24">Amount</th>
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
                                            <td className="px-3 py-1.5">
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="checkbox"
                                                        checked={item.taxable}
                                                        onChange={(e) => handleLineItemChange(index, 'taxable', e.target.checked)}
                                                        className="w-3 h-3"
                                                    />
                                                    <input 
                                                        type="number"
                                                        step="0.1"
                                                        value={item.taxRate}
                                                        onChange={(e) => handleLineItemChange(index, 'taxRate', e.target.value)}
                                                        disabled={!item.taxable}
                                                        className="w-14 px-1 py-1 text-xs border border-gray-300 rounded disabled:bg-gray-100"
                                                        min="0"
                                                        max="100"
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-3 py-1.5 text-gray-900 font-medium text-xs">
                                                {currentCurrency.symbol}{item.amount.toFixed(2)}
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
                                <span className="font-medium">{currentCurrency.symbol}{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-600">Tax/VAT:</span>
                                <span className="font-medium">{currentCurrency.symbol}{vat.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
                                <span>Total ({formData.currency}):</span>
                                <span className="text-primary-600">{currentCurrency.symbol}{total.toFixed(2)}</span>
                            </div>
                            {formData.currency !== 'ZAR' && (
                                <div className="flex justify-between text-xs text-gray-600 italic">
                                    <span>≈ ZAR:</span>
                                    <span>R{(total * formData.exchangeRate).toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Notes with Templates */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-medium text-gray-700">Notes</label>
                            {notesTemplates && notesTemplates.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowNotesTemplates(!showNotesTemplates)}
                                    className="text-xs text-primary-600 hover:text-primary-700"
                                >
                                    <i className="fas fa-sticky-note mr-1"></i>
                                    Insert Template
                                </button>
                            )}
                        </div>
                        {showNotesTemplates && notesTemplates && (
                            <div className="mb-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                                <div className="space-y-1">
                                    {notesTemplates.map(template => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => insertNotesTemplate(template.content)}
                                            className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-white rounded border border-transparent hover:border-primary-300"
                                        >
                                            <div className="font-medium text-gray-900">{template.name}</div>
                                            <div className="text-[10px] text-gray-500 truncate">{template.content.substring(0, 60)}...</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <textarea 
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg" 
                            rows="2" 
                            placeholder="Payment terms, thank you note, etc."
                        ></textarea>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                            Cancel
                        </button>
                        <button 
                            type="button"
                            onClick={() => {
                                setFormData({...formData, status: 'Draft'});
                                handleSubmit({ preventDefault: () => {} });
                            }}
                            className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                        >
                            Save as Draft
                        </button>
                        <button type="submit" className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                            {invoice ? 'Update Invoice' : 'Create & Send'}
                        </button>
                    </div>
                </form>

                {/* Time Entries Import Modal */}
                {showTimeEntries && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
                        <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] overflow-y-auto">
                            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                                <h3 className="text-base font-semibold text-gray-900">Import Time Entries</h3>
                                <button onClick={() => setShowTimeEntries(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                                    <i className="fas fa-times text-sm"></i>
                                </button>
                            </div>
                            
                            <div className="p-4 space-y-2">
                                {availableTimeEntries.map(entry => (
                                    <label key={entry.id} className="flex items-center p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer border border-transparent hover:border-primary-300">
                                        <input 
                                            type="checkbox"
                                            checked={selectedTimeEntries.includes(entry.id)}
                                            onChange={() => toggleTimeEntry(entry.id)}
                                            className="mr-2.5 w-4 h-4"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-sm text-gray-900">{entry.task}</div>
                                            <div className="text-xs text-gray-600">
                                                {entry.date} • {entry.hours}h @ R1,500/h = R{(entry.hours * 1500).toLocaleString()}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                                <button 
                                    onClick={() => setShowTimeEntries(false)}
                                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={importSelectedTimeEntries}
                                    disabled={selectedTimeEntries.length === 0}
                                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                                >
                                    Import {selectedTimeEntries.length} Entries
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvoiceModal;
