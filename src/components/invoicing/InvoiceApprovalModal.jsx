const { useState } = window;

export const InvoiceApprovalModal = ({ invoice, onApprove, onClose }) => {
    const [formData, setFormData] = useState({
        approvedBy: '',
        notes: '',
        approved: null
    });

    const handleSubmit = (approved) => {
        if (!formData.approvedBy) {
            alert('Please enter your name');
            return;
        }
        onApprove({
            ...formData,
            approved
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">Invoice Approval</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <div className="p-4">
                    {/* Invoice Summary */}
                    <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="text-xs text-gray-600">Invoice Number</div>
                                <div className="text-base font-bold text-gray-900">{invoice.invoiceNumber}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-600">Client</div>
                                <div className="text-base font-medium text-gray-900">{invoice.client}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-600">Date</div>
                                <div className="text-sm text-gray-900">
                                    {new Date(invoice.date).toLocaleDateString('en-ZA')}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-600">Amount</div>
                                <div className="text-base font-bold text-primary-600">
                                    R{invoice.total.toLocaleString('en-ZA')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Line Items Review */}
                    <div className="mb-4">
                        <h3 className="text-sm font-bold text-gray-800 mb-2">Invoice Details</h3>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Description</th>
                                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Qty</th>
                                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Rate</th>
                                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {invoice.lineItems.map((item, index) => (
                                        <tr key={index}>
                                            <td className="px-3 py-1.5 text-xs text-gray-900">{item.description}</td>
                                            <td className="px-3 py-1.5 text-xs text-gray-600 text-right">{item.quantity}</td>
                                            <td className="px-3 py-1.5 text-xs text-gray-600 text-right">R{item.rate.toFixed(2)}</td>
                                            <td className="px-3 py-1.5 text-xs font-medium text-gray-900 text-right">
                                                R{item.amount.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals */}
                        <div className="flex justify-end mt-3">
                            <div className="w-60 space-y-1.5 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Subtotal:</span>
                                    <span className="font-medium">R{invoice.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">VAT (15%):</span>
                                    <span className="font-medium">R{invoice.vat.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
                                    <span>Total:</span>
                                    <span className="text-primary-600">R{invoice.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Approval Form */}
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Approver Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.approvedBy}
                                onChange={(e) => setFormData({...formData, approvedBy: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                placeholder="Your full name"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Approval Notes
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                rows="2"
                                placeholder="Add any notes or comments about this approval..."
                            ></textarea>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleSubmit(false)}
                            className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center transition-colors font-medium"
                        >
                            <i className="fas fa-times-circle mr-1.5"></i>
                            Reject
                        </button>
                        <button
                            onClick={() => handleSubmit(true)}
                            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center transition-colors font-medium"
                        >
                            <i className="fas fa-check-circle mr-1.5"></i>
                            Approve & Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceApprovalModal;
