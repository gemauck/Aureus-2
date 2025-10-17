const { useState } = window;

export const BatchInvoiceActions = ({ selectedInvoices, onSend, onDelete, onUpdateStatus, onClose }) => {
    const [action, setAction] = useState('');

    const handleExecute = () => {
        const invoiceIds = selectedInvoices.map(inv => inv.id);
        
        switch(action) {
            case 'send':
                if (confirm(`Send ${selectedInvoices.length} invoices to clients?`)) {
                    onSend(invoiceIds);
                    onClose();
                }
                break;
            case 'delete':
                if (confirm(`Delete ${selectedInvoices.length} invoices? This cannot be undone.`)) {
                    onDelete(invoiceIds);
                    onClose();
                }
                break;
            case 'mark-sent':
                onUpdateStatus(invoiceIds, 'Sent');
                onClose();
                break;
            case 'mark-paid':
                onUpdateStatus(invoiceIds, 'Paid');
                onClose();
                break;
            case 'mark-draft':
                onUpdateStatus(invoiceIds, 'Draft');
                onClose();
                break;
            case 'download':
                alert(`Downloading ${selectedInvoices.length} invoices as PDF...`);
                onClose();
                break;
            default:
                alert('Please select an action');
        }
    };

    const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.total, 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg w-full max-w-2xl">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">Batch Invoice Actions</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <div className="p-4">
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs text-gray-600">Selected Invoices</div>
                                <div className="text-xl font-bold text-gray-800">{selectedInvoices.length}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-gray-600">Total Value</div>
                                <div className="text-xl font-bold text-primary-600">
                                    R{totalAmount.toLocaleString('en-ZA')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Selected Invoices List */}
                    <div className="mb-4 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Invoice</th>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Client</th>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {selectedInvoices.map(invoice => (
                                    <tr key={invoice.id}>
                                        <td className="px-3 py-1.5 text-xs font-medium text-gray-900">{invoice.invoiceNumber}</td>
                                        <td className="px-3 py-1.5 text-xs text-gray-600">{invoice.client}</td>
                                        <td className="px-3 py-1.5">
                                            <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                                                invoice.status === 'Paid' ? 'bg-green-100 text-green-800' :
                                                invoice.status === 'Sent' ? 'bg-blue-100 text-blue-800' :
                                                invoice.status === 'Overdue' ? 'bg-red-100 text-red-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {invoice.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-xs font-medium text-gray-900 text-right">
                                            R{invoice.total.toLocaleString('en-ZA')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Action Selection */}
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-700 mb-2">Select Action</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setAction('send')}
                                className={`p-3 border-2 rounded-lg text-left hover:border-primary-500 transition ${
                                    action === 'send' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
                                }`}
                            >
                                <i className="fas fa-paper-plane text-primary-600 mr-1.5 text-sm"></i>
                                <span className="font-medium text-sm">Send to Clients</span>
                                <p className="text-[10px] text-gray-600 mt-0.5">Email all invoices</p>
                            </button>

                            <button
                                onClick={() => setAction('download')}
                                className={`p-3 border-2 rounded-lg text-left hover:border-primary-500 transition ${
                                    action === 'download' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
                                }`}
                            >
                                <i className="fas fa-download text-primary-600 mr-1.5 text-sm"></i>
                                <span className="font-medium text-sm">Download PDFs</span>
                                <p className="text-[10px] text-gray-600 mt-0.5">Save as ZIP file</p>
                            </button>

                            <button
                                onClick={() => setAction('mark-sent')}
                                className={`p-3 border-2 rounded-lg text-left hover:border-blue-500 transition ${
                                    action === 'mark-sent' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                                }`}
                            >
                                <i className="fas fa-check-circle text-blue-600 mr-1.5 text-sm"></i>
                                <span className="font-medium text-sm">Mark as Sent</span>
                                <p className="text-[10px] text-gray-600 mt-0.5">Update status</p>
                            </button>

                            <button
                                onClick={() => setAction('mark-paid')}
                                className={`p-3 border-2 rounded-lg text-left hover:border-green-500 transition ${
                                    action === 'mark-paid' ? 'border-green-600 bg-green-50' : 'border-gray-200'
                                }`}
                            >
                                <i className="fas fa-check-double text-green-600 mr-1.5 text-sm"></i>
                                <span className="font-medium text-sm">Mark as Paid</span>
                                <p className="text-[10px] text-gray-600 mt-0.5">Update status</p>
                            </button>

                            <button
                                onClick={() => setAction('mark-draft')}
                                className={`p-3 border-2 rounded-lg text-left hover:border-gray-500 transition ${
                                    action === 'mark-draft' ? 'border-gray-600 bg-gray-50' : 'border-gray-200'
                                }`}
                            >
                                <i className="fas fa-file text-gray-600 mr-1.5 text-sm"></i>
                                <span className="font-medium text-sm">Mark as Draft</span>
                                <p className="text-[10px] text-gray-600 mt-0.5">Update status</p>
                            </button>

                            <button
                                onClick={() => setAction('delete')}
                                className={`p-3 border-2 rounded-lg text-left hover:border-red-500 transition ${
                                    action === 'delete' ? 'border-red-600 bg-red-50' : 'border-gray-200'
                                }`}
                            >
                                <i className="fas fa-trash text-red-600 mr-1.5 text-sm"></i>
                                <span className="font-medium text-sm">Delete Invoices</span>
                                <p className="text-[10px] text-gray-600 mt-0.5">Permanent deletion</p>
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleExecute}
                            disabled={!action}
                            className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                            Execute Action
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BatchInvoiceActions;
