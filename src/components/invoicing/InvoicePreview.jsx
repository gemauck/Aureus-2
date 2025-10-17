export const InvoicePreview = ({ invoice, onClose, onEdit, onDelete, onUpdateStatus }) => {
    const handlePrint = () => {
        window.print();
    };

    const handleDownload = () => {
        alert('Invoice downloaded as PDF!\n\n(In production, this would generate a PDF file)');
    };

    const handleSend = () => {
        alert(`Invoice ${invoice.invoiceNumber} sent to client!\n\n(In production, this would email the invoice)`);
        if (invoice.status === 'Draft') {
            onUpdateStatus(invoice.id, 'Sent');
        }
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'Paid': return 'bg-green-100 text-green-800';
            case 'Sent': return 'bg-blue-100 text-blue-800';
            case 'Overdue': return 'bg-red-100 text-red-800';
            case 'Draft': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                {/* Header Actions */}
                <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center print:hidden">
                    <h2 className="text-xl font-bold text-gray-800">Invoice Preview</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrint}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                        >
                            <i className="fas fa-print mr-1"></i> Print
                        </button>
                        <button
                            onClick={handleDownload}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                        >
                            <i className="fas fa-download mr-1"></i> PDF
                        </button>
                        <button
                            onClick={handleSend}
                            className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
                        >
                            <i className="fas fa-paper-plane mr-1"></i> Send
                        </button>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 ml-2">
                            <i className="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>

                {/* Invoice Content */}
                <div className="p-8 print:p-0">
                    {/* Company Header */}
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-primary-600 mb-2">Abcotronics</h1>
                            <p className="text-gray-600">Fuel Management Services</p>
                            <p className="text-sm text-gray-600 mt-2">
                                123 Business Street<br />
                                Johannesburg, 2000<br />
                                South Africa<br />
                                VAT: 4123456789
                            </p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">INVOICE</h2>
                            <p className="text-sm text-gray-600">
                                <span className="font-medium">Invoice #:</span> {invoice.invoiceNumber}
                            </p>
                            <p className="text-sm text-gray-600">
                                <span className="font-medium">Date:</span> {new Date(invoice.date).toLocaleDateString('en-ZA')}
                            </p>
                            <p className="text-sm text-gray-600">
                                <span className="font-medium">Due Date:</span> {new Date(invoice.dueDate).toLocaleDateString('en-ZA')}
                            </p>
                            <div className="mt-2">
                                <span className={`px-3 py-1 text-sm rounded ${getStatusColor(invoice.status)}`}>
                                    {invoice.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Bill To */}
                    <div className="mb-8">
                        <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Bill To:</h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="font-medium text-gray-800">{invoice.client}</p>
                            {invoice.project && (
                                <p className="text-sm text-gray-600 mt-1">
                                    <span className="font-medium">Project:</span> {invoice.project}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Line Items */}
                    <div className="mb-8">
                        <table className="min-w-full">
                            <thead className="bg-gray-50 border-b-2 border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
                                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Qty/Hours</th>
                                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Rate</th>
                                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {invoice.lineItems.map((item, index) => (
                                    <tr key={index}>
                                        <td className="px-4 py-3 text-sm text-gray-800">{item.description}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600 text-right">{item.quantity}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600 text-right">R{item.rate.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-800 text-right">R{item.amount.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end mb-8">
                        <div className="w-80">
                            <div className="space-y-2 bg-gray-50 p-4 rounded-lg">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Subtotal:</span>
                                    <span className="font-medium">R{invoice.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">VAT ({invoice.taxRate}%):</span>
                                    <span className="font-medium">R{invoice.tax.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-xl border-t pt-2 text-primary-600">
                                    <span>Total:</span>
                                    <span>R{invoice.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {invoice.notes && (
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Notes:</h3>
                            <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                                {invoice.notes}
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="border-t pt-6 text-center text-sm text-gray-600">
                        <p>Thank you for your business!</p>
                        <p className="mt-2">
                            For questions about this invoice, contact us at billing@abcotronics.co.za
                        </p>
                    </div>
                </div>

                {/* Bottom Actions */}
                <div className="sticky bottom-0 bg-gray-50 border-t p-4 flex justify-between print:hidden">
                    <div className="flex gap-2">
                        <button
                            onClick={() => onEdit(invoice)}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm"
                        >
                            <i className="fas fa-edit mr-1"></i> Edit
                        </button>
                        <button
                            onClick={() => {
                                if (confirm('Delete this invoice?')) {
                                    onDelete(invoice.id);
                                    onClose();
                                }
                            }}
                            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm"
                        >
                            <i className="fas fa-trash mr-1"></i> Delete
                        </button>
                    </div>
                    <div className="flex gap-2">
                        {invoice.status !== 'Paid' && (
                            <button
                                onClick={() => {
                                    onUpdateStatus(invoice.id, 'Paid');
                                    alert('Invoice marked as paid!');
                                }}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                            >
                                <i className="fas fa-check mr-1"></i> Mark as Paid
                            </button>
                        )}
                        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoicePreview;
