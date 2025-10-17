const { useState } = window;

export const PaymentModal = ({ invoice, onSave, onClose }) => {
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        amount: invoice.amountDue || invoice.total,
        paymentMethod: 'Bank Transfer',
        reference: '',
        notes: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (parseFloat(formData.amount) <= 0) {
            alert('Payment amount must be greater than zero');
            return;
        }
        if (parseFloat(formData.amount) > invoice.amountDue) {
            if (!confirm('Payment amount exceeds amount due. Continue?')) {
                return;
            }
        }
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">Record Payment</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <div className="p-4">
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-xs text-gray-600">Invoice {invoice.invoiceNumber}</div>
                        <div className="text-lg font-bold text-gray-900 mt-0.5">
                            R{(invoice.amountDue || invoice.total).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">Amount Due</div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Payment Date</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Payment Amount (ZAR)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                required
                                min="0.01"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Payment Method</label>
                            <select
                                value={formData.paymentMethod}
                                onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option>Bank Transfer</option>
                                <option>Credit Card</option>
                                <option>Cash</option>
                                <option>Cheque</option>
                                <option>EFT</option>
                                <option>Other</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Reference Number</label>
                            <input
                                type="text"
                                value={formData.reference}
                                onChange={(e) => setFormData({...formData, reference: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="Transaction reference"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes</label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows="2"
                                placeholder="Payment notes..."
                            ></textarea>
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
                                Record Payment
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;

// Make available globally
window.PaymentModal = PaymentModal;
