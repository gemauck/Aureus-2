// Recurring Invoices Management Component
const { useState, useEffect } = React;

const RecurringInvoices = ({ clients = [], onSave, onDelete }) => {
    const [recurringInvoices, setRecurringInvoices] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        clientId: '',
        frequency: 'monthly',
        nextInvoiceDate: '',
        autoSend: false,
        lineItems: [],
        notes: '',
        active: true
    });
    const [newLineItem, setNewLineItem] = useState({
        description: '',
        quantity: 1,
        rate: 0,
        taxRate: 15
    });
    const [isLoading, setIsLoading] = useState(false);
    const { isDark } = window.useTheme();

    // Load recurring invoices from localStorage
    useEffect(() => {
        const savedInvoices = window.storage?.getRecurringInvoices?.() || [];
        setRecurringInvoices(savedInvoices);
    }, []);

    // Save recurring invoices to localStorage
    const saveRecurringInvoices = (invoices) => {
        setRecurringInvoices(invoices);
        window.storage?.setRecurringInvoices?.(invoices);
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const invoiceData = {
                ...formData,
                id: editingInvoice ? editingInvoice.id : Date.now().toString(),
                createdAt: editingInvoice ? editingInvoice.createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            let updatedInvoices;
            if (editingInvoice) {
                updatedInvoices = recurringInvoices.map(inv => 
                    inv.id === editingInvoice.id ? invoiceData : inv
                );
            } else {
                updatedInvoices = [...recurringInvoices, invoiceData];
            }

            saveRecurringInvoices(updatedInvoices);
            
            if (onSave) {
                await onSave(invoiceData);
            }

            resetForm();
            setShowModal(false);
        } catch (error) {
            console.error('Error saving recurring invoice:', error);
            alert('Failed to save recurring invoice. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Handle delete
    const handleDelete = async (invoice) => {
        if (!confirm(`Are you sure you want to delete "${invoice.name}"?`)) return;

        try {
            const updatedInvoices = recurringInvoices.filter(inv => inv.id !== invoice.id);
            saveRecurringInvoices(updatedInvoices);
            
            if (onDelete) {
                await onDelete(invoice);
            }
        } catch (error) {
            console.error('Error deleting recurring invoice:', error);
            alert('Failed to delete recurring invoice. Please try again.');
        }
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            name: '',
            clientId: '',
            frequency: 'monthly',
            nextInvoiceDate: '',
            autoSend: false,
            lineItems: [],
            notes: '',
            active: true
        });
        setEditingInvoice(null);
        setNewLineItem({
            description: '',
            quantity: 1,
            rate: 0,
            taxRate: 15
        });
    };

    // Add line item
    const handleAddLineItem = () => {
        if (!newLineItem.description) {
            alert('Please enter a description for the line item.');
            return;
        }

        const lineItem = {
            ...newLineItem,
            id: Date.now().toString(),
            amount: newLineItem.quantity * newLineItem.rate
        };

        setFormData(prev => ({
            ...prev,
            lineItems: [...prev.lineItems, lineItem]
        }));

        setNewLineItem({
            description: '',
            quantity: 1,
            rate: 0,
            taxRate: 15
        });
    };

    // Remove line item
    const handleRemoveLineItem = (itemId) => {
        setFormData(prev => ({
            ...prev,
            lineItems: prev.lineItems.filter(item => item.id !== itemId)
        }));
    };

    // Calculate totals
    const calculateTotals = (lineItems) => {
        const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
        const totalTax = lineItems.reduce((sum, item) => sum + (item.amount * item.taxRate / 100), 0);
        const total = subtotal + totalTax;

        return { subtotal, totalTax, total };
    };

    // Get next invoice date based on frequency
    const getNextInvoiceDate = (frequency, lastDate) => {
        const date = new Date(lastDate || new Date());
        
        switch (frequency) {
            case 'weekly':
                date.setDate(date.getDate() + 7);
                break;
            case 'monthly':
                date.setMonth(date.getMonth() + 1);
                break;
            case 'quarterly':
                date.setMonth(date.getMonth() + 3);
                break;
            case 'annually':
                date.setFullYear(date.getFullYear() + 1);
                break;
        }
        
        return date.toISOString().split('T')[0];
    };

    // Generate invoice from template
    const handleGenerateInvoice = async (recurringInvoice) => {
        try {
            const client = clients.find(c => c.id === recurringInvoice.clientId);
            if (!client) {
                alert('Client not found.');
                return;
            }

            const invoiceData = {
                clientId: recurringInvoice.clientId,
                clientName: client.name,
                invoiceNumber: `INV-${Date.now()}`,
                date: new Date().toISOString().split('T')[0],
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                lineItems: recurringInvoice.lineItems,
                notes: recurringInvoice.notes,
                status: 'Draft',
                ...calculateTotals(recurringInvoice.lineItems)
            };

            // Save the generated invoice
            const savedInvoices = window.storage?.getInvoices?.() || [];
            savedInvoices.push(invoiceData);
            window.storage?.setInvoices?.(savedInvoices);

            // Update next invoice date
            const updatedInvoices = recurringInvoices.map(inv => 
                inv.id === recurringInvoice.id 
                    ? { ...inv, nextInvoiceDate: getNextInvoiceDate(inv.frequency, inv.nextInvoiceDate) }
                    : inv
            );
            saveRecurringInvoices(updatedInvoices);

            alert('Invoice generated successfully!');
        } catch (error) {
            console.error('Error generating invoice:', error);
            alert('Failed to generate invoice. Please try again.');
        }
    };

    // Edit recurring invoice
    const handleEdit = (invoice) => {
        setEditingInvoice(invoice);
        setFormData({
            ...invoice,
            nextInvoiceDate: invoice.nextInvoiceDate || getNextInvoiceDate(invoice.frequency)
        });
        setShowModal(true);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Recurring Invoices
                        </h2>
                        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                            Manage automated invoice templates
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            resetForm();
                            setShowModal(true);
                        }}
                        className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        <i className="fas fa-plus mr-2"></i>
                        Create Template
                    </button>
                </div>
            </div>

            {/* Recurring Invoices List */}
            <div className="space-y-4">
                {recurringInvoices.length === 0 ? (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-8 text-center`}>
                        <i className="fas fa-repeat text-4xl text-gray-400 mb-4"></i>
                        <h3 className={`text-lg font-medium ${isDark ? 'text-gray-300' : 'text-gray-900'} mb-2`}>
                            No Recurring Invoices
                        </h3>
                        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                            Create your first recurring invoice template to automate billing
                        </p>
                        <button
                            onClick={() => {
                                resetForm();
                                setShowModal(true);
                            }}
                            className="bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors"
                        >
                            Create Template
                        </button>
                    </div>
                ) : (
                    recurringInvoices.map(invoice => {
                        const client = clients.find(c => c.id === invoice.clientId);
                        const totals = calculateTotals(invoice.lineItems);
                        
                        return (
                            <div key={invoice.id} className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-3 mb-2">
                                            <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {invoice.name}
                                            </h3>
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                invoice.active 
                                                    ? 'bg-green-100 text-green-800' 
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {invoice.active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Client:</span>
                                                <span className={`ml-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {client?.name || 'Unknown Client'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Frequency:</span>
                                                <span className={`ml-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {invoice.frequency.charAt(0).toUpperCase() + invoice.frequency.slice(1)}
                                                </span>
                                            </div>
                                            <div>
                                                <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Next Invoice:</span>
                                                <span className={`ml-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {invoice.nextInvoiceDate ? new Date(invoice.nextInvoiceDate).toLocaleDateString() : 'Not set'}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-3">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Amount:</span>
                                            <span className={`ml-2 font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                R{totals.total.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => handleGenerateInvoice(invoice)}
                                            className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors"
                                            title="Generate Invoice Now"
                                        >
                                            <i className="fas fa-file-invoice"></i>
                                        </button>
                                        <button
                                            onClick={() => handleEdit(invoice)}
                                            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
                                            title="Edit Template"
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(invoice)}
                                            className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
                                            title="Delete Template"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto`}>
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    {editingInvoice ? 'Edit Recurring Invoice' : 'Create Recurring Invoice'}
                                </h3>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                            Template Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className={`w-full px-3 py-2 rounded-lg border ${
                                                isDark 
                                                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                    : 'bg-white border-gray-300 text-gray-900'
                                            }`}
                                            placeholder="e.g., Monthly Retainer"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                            Client *
                                        </label>
                                        <select
                                            value={formData.clientId}
                                            onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                                            className={`w-full px-3 py-2 rounded-lg border ${
                                                isDark 
                                                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                    : 'bg-white border-gray-300 text-gray-900'
                                            }`}
                                            required
                                        >
                                            <option value="">Select Client</option>
                                            {clients.map(client => (
                                                <option key={client.id} value={client.id}>
                                                    {client.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                            Frequency *
                                        </label>
                                        <select
                                            value={formData.frequency}
                                            onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                                            className={`w-full px-3 py-2 rounded-lg border ${
                                                isDark 
                                                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                    : 'bg-white border-gray-300 text-gray-900'
                                            }`}
                                            required
                                        >
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                            <option value="quarterly">Quarterly</option>
                                            <option value="annually">Annually</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                            Next Invoice Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.nextInvoiceDate}
                                            onChange={(e) => setFormData({ ...formData, nextInvoiceDate: e.target.value })}
                                            className={`w-full px-3 py-2 rounded-lg border ${
                                                isDark 
                                                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                    : 'bg-white border-gray-300 text-gray-900'
                                            }`}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Line Items */}
                                <div>
                                    <h4 className={`text-lg font-medium ${isDark ? 'text-gray-蓬勃' : 'text-gray-900'} mb-4`}>
                                        Line Items
                                    </h4>
                                    
                                    <div className="space-y-4">
                                        {formData.lineItems.map((item, index) => (
                                            <div key={item.id} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                                    <div className="md:col-span-2">
                                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                                            Description
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={item.description}
                                                            className={`w-full px-3 py-2 rounded-lg border ${
                                                                isDark 
                                                                    ? 'bg-gray-600 border-gray-500 text-gray-100' 
                                                                    : 'bg-white border-gray-300 text-gray-900'
                                                            }`}
                                                            readOnly
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                                            Quantity
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            className={`w-full px-3 py-2 rounded-lg border ${
                                                                isDark 
                                                                    ? 'bg-gray-600 border-gray-500 text-gray-100' 
                                                                    : 'bg-white border-gray-300 text-gray-900'
                                                            }`}
                                                            readOnly
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                                            Rate
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={item.rate}
                                                            className={`w-full px-3 py-2 rounded-lg border ${
                                                                isDark 
                                                                    ? 'bg-gray-600 border-gray-500 text-gray-100' 
                                                                    : 'bg-white border-gray-300 text-gray-900'
                                                            }`}
                                                            readOnly
                                                        />
                                                    </div>
                                                    <div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveLineItem(item.id)}
                                                            className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Add Line Item */}
                                        <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                                <div className="md:col-span-2">
                                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                                        Description
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={newLineItem.description}
                                                        onChange={(e) => setNewLineItem({ ...newLineItem, description: e.target.value })}
                                                        className={`w-full px-3 py-2 rounded-lg border ${
                                                            isDark 
                                                                ? 'bg-gray-600 border-gray-500 text-gray-100' 
                                                                : 'bg-white border-gray-300 text-gray-900'
                                                        }`}
                                                        placeholder="Enter description"
                                                    />
                                                </div>
                                                <div>
                                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                                        Quantity
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={newLineItem.quantity}
                                                        onChange={(e) => setNewLineItem({ ...newLineItem, quantity: parseFloat(e.target.value) || 0 })}
                                                        className={`w-full px-3 py-2 rounded-lg border ${
                                                            isDark 
                                                                ? 'bg-gray-600 border-gray-500 text-gray-100' 
                                                                : 'bg-white border-gray-300 text-gray-900'
                                                        }`}
                                                        min="0"
                                                        step="0.01"
                                                    />
                                                </div>
                                                <div>
                                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                                        Rate
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={newLineItem.rate}
                                                        onChange={(e) => setNewLineItem({ ...newLineItem, rate: parseFloat(e.target.value) || 0 })}
                                                        className={`w-full px-3 py-2 rounded-lg border ${
                                                            isDark 
                                                                ? 'bg-gray-600 border-gray-500 text-gray-100' 
                                                                : 'bg-white border-gray-300 text-gray-900'
                                                        }`}
                                                        min="0"
                                                        step="0.01"
                                                    />
                                                </div>
                                                <div>
                                                    <button
                                                        type="button"
                                                        onClick={handleAddLineItem}
                                                        className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors"
                                                    >
                                                        <i className="fas fa-plus"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                        Notes
                                    </label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        rows={3}
                                        className={`w-full px-3 py-2 rounded-lg border ${
                                            isDark 
                                                ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                : 'bg-white border-gray-300 text-gray-900'
                                        }`}
                                        placeholder="Additional notes for the invoice..."
                                    />
                                </div>

                                {/* Options */}
                                <div className="flex items-center space-x-4">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.autoSend}
                                            onChange={(e) => setFormData({ ...formData, autoSend: e.target.checked })}
                                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span className={`ml-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                            Auto-send invoices
                                        </span>
                                    </label>
                                    
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.active}
                                            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span className={`ml-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                            Active
                                        </span>
                                    </label>
                                </div>

                                {/* Form Actions */}
                                <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className={`px-6 py-2 text-sm font-medium rounded-lg ${
                                            isLoading
                                                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                                : 'bg-primary-600 text-white hover:bg-primary-700'
                                        }`}
                                    >
                                        {isLoading ? (
                                            <>
                                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                                Saving...
                                            </>
                                        ) : (
                                            editingInvoice ? 'Update Template' : 'Create Template'
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.RecurringInvoices = RecurringInvoices;
