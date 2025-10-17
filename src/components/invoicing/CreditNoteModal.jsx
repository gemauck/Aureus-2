const { useState } = window;

export const CreditNoteModal = ({ invoice, onSave, onClose }) => {
    const [formData, setFormData] = useState({
        creditNoteNumber: `CN-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
        date: new Date().toISOString().split('T')[0],
        reason: '',
        lineItems: invoice.lineItems.map(item => ({
            ...item,
            creditQuantity: 0,
            creditAmount: 0
        })),
        notes: ''
    });

    const handleLineItemChange = (index, field, value) => {
        const newLineItems = [...formData.lineItems];
        const originalQty = invoice.lineItems[index].quantity;
        const originalRate = invoice.lineItems[index].rate;

        if (field === 'creditQuantity') {
            const qty = parseFloat(value) || 0;
            if (qty > originalQty) {
                alert('Credit quantity cannot exceed original quantity');
                return;
            }
            newLineItems[index].creditQuantity = qty;
            newLineItems[index].creditAmount = qty * originalRate;
        }

        setFormData({ ...formData, lineItems: newLineItems });
    };

    const creditSubtotal = formData.lineItems.reduce((sum, item) => sum + (item.creditAmount || 0), 0);
    const creditVat = creditSubtotal * 0.15;
    const creditTotal = creditSubtotal + creditVat;

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (creditTotal <= 0) {
            alert('Please specify items to credit');
            return;
        }

        if (!formData.reason) {
            alert('Please provide a reason for the credit note');
            return;
        }

        onSave({
            ...formData,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            client: invoice.client,
            project: invoice.project,
            subtotal: creditSubtotal,
            vat: creditVat,
            total: creditTotal
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">Create Credit Note</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <div className="p-4">
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="text-xs text-gray-600">Original Invoice</div>
                                <div className="text-base font-bold text-gray-800">{invoice.invoiceNumber}</div>
                                <div className="text-xs text-gray-600 mt-0.5">{invoice.client}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-gray-600">Invoice Total</div>
                                <div className="text-base font-bold text-gray-800">
                                    R{invoice.total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Credit Note Number</label>
                                <input
                                    type="text"
                                    value={formData.creditNoteNumber}
                                    onChange={(e) => setFormData({...formData, creditNoteNumber: e.target.value})}
                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-50"
                                    readOnly
                                />
                            </div>
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
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Reason for Credit</label>
                            <select
                                value={formData.reason}
                                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                required
                            >
                                <option value="">Select Reason</option>
                                <option>Product/Service not delivered</option>
                                <option>Incorrect pricing</option>
                                <option>Quality issues</option>
                                <option>Customer dissatisfaction</option>
                                <option>Duplicate charge</option>
                                <option>Cancellation</option>
                                <option>Other</option>
                            </select>
                        </div>

                        {/* Line Items */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Select Items to Credit</label>
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Description</th>
                                            <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Original Qty</th>
                                            <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Rate</th>
                                            <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Credit Qty</th>
                                            <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Credit Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {formData.lineItems.map((item, index) => (
                                            <tr key={index}>
                                                <td className="px-3 py-1.5 text-xs text-gray-800">{item.description}</td>
                                                <td className="px-3 py-1.5 text-xs text-gray-600 text-right">{invoice.lineItems[index].quantity}</td>
                                                <td className="px-3 py-1.5 text-xs text-gray-600 text-right">
                                                    R{invoice.lineItems[index].rate.toFixed(2)}
                                                </td>
                                                <td className="px-3 py-1.5">
                                                    <input
                                                        type="number"
                                                        step="0.25"
                                                        value={item.creditQuantity}
                                                        onChange={(e) => handleLineItemChange(index, 'creditQuantity', e.target.value)}
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-right"
                                                        min="0"
                                                        max={invoice.lineItems[index].quantity}
                                                    />
                                                </td>
                                                <td className="px-3 py-1.5 text-xs font-medium text-red-600 text-right">
                                                    -R{item.creditAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Totals */}
                        <div className="flex justify-end">
                            <div className="w-72 space-y-1.5 border-t border-gray-200 pt-3">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Credit Subtotal:</span>
                                    <span className="font-medium text-red-600">
                                        -R{creditSubtotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">VAT (15%):</span>
                                    <span className="font-medium text-red-600">
                                        -R{creditVat.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
                                    <span>Total Credit:</span>
                                    <span className="text-red-600">
                                        -R{creditTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                    </span>
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
                                placeholder="Additional notes about this credit note..."
                            ></textarea>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                                Cancel
                            </button>
                            <button type="submit" className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">
                                Issue Credit Note
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreditNoteModal;
