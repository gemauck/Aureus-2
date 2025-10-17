const { useState } = window;

export const DepositModal = ({ invoices, clients, onSave, onClose }) => {
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        client: '',
        invoiceId: null,
        type: 'Retainer',
        amount: 0,
        paymentMethod: 'Bank Transfer',
        reference: '',
        notes: '',
        appliedAmount: 0
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.client) {
            alert('Please select a client');
            return;
        }
        if (parseFloat(formData.amount) <= 0) {
            alert('Amount must be greater than zero');
            return;
        }
        onSave(formData);
    };

    const availableInvoices = invoices.filter(inv => inv.client === formData.client);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">Record Deposit/Retainer</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start">
                            <i className="fas fa-info-circle text-blue-600 mt-0.5 mr-2 text-sm"></i>
                            <div className="text-xs text-blue-800">
                                <strong>Deposits & Retainers:</strong> Record advance payments from clients that can be applied to future invoices.
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Type <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({...formData, type: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            >
                                <option>Retainer</option>
                                <option>Deposit</option>
                                <option>Advance Payment</option>
                                <option>Prepayment</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            Client <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.client}
                            onChange={(e) => setFormData({...formData, client: e.target.value, invoiceId: null})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            required
                        >
                            <option value="">Select Client</option>
                            {clients && clients.map(client => (
                                <option key={client.id} value={client.name}>{client.name}</option>
                            ))}
                        </select>
                    </div>

                    {formData.client && availableInvoices.length > 0 && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Apply to Invoice (Optional)
                            </label>
                            <select
                                value={formData.invoiceId || ''}
                                onChange={(e) => setFormData({...formData, invoiceId: e.target.value ? parseInt(e.target.value) : null})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            >
                                <option value="">Keep as Unapplied Credit</option>
                                {availableInvoices.map(invoice => (
                                    <option key={invoice.id} value={invoice.id}>
                                        {invoice.invoiceNumber} - R{(invoice.amountDue || invoice.total).toLocaleString('en-ZA')} due
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Amount (ZAR) <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                required
                                min="0.01"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Payment Method
                            </label>
                            <select
                                value={formData.paymentMethod}
                                onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            >
                                <option>Bank Transfer</option>
                                <option>Credit Card</option>
                                <option>Cash</option>
                                <option>Cheque</option>
                                <option>EFT</option>
                                <option>Other</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            Reference Number
                        </label>
                        <input
                            type="text"
                            value={formData.reference}
                            onChange={(e) => setFormData({...formData, reference: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            placeholder="Transaction reference"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            Notes
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            rows="2"
                            placeholder="Additional notes about this deposit..."
                        ></textarea>
                    </div>

                    {/* Summary */}
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="text-xs text-gray-600">Deposit Amount</div>
                                <div className="text-xl font-bold text-green-600">
                                    R{parseFloat(formData.amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            {formData.invoiceId && (
                                <div className="text-right">
                                    <div className="text-xs text-gray-600">Will be applied to</div>
                                    <div className="font-medium text-sm text-gray-900">
                                        {availableInvoices.find(inv => inv.id === parseInt(formData.invoiceId))?.invoiceNumber}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
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
                            className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                        >
                            <i className="fas fa-check mr-1.5"></i>
                            Record Deposit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DepositModal;
