const { useState } = window;

export const BankReconciliation = ({ invoices, onMatch, onClose }) => {
    const [transactions, setTransactions] = useState([
        { id: 1, date: '2024-03-15', description: 'ABC Corporation Transfer', amount: 225000, matched: false, reference: 'REF12345' },
        { id: 2, date: '2024-03-18', description: 'Payment from XYZ Industries', amount: 157500, matched: false, reference: 'REF12346' },
        { id: 3, date: '2024-03-20', description: 'Wire Transfer', amount: 50000, matched: false, reference: 'REF12347' }
    ]);
    
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [fileUploaded, setFileUploaded] = useState(false);

    const unmatchedInvoices = invoices.filter(inv => 
        inv.status !== 'Paid' && inv.status !== 'Draft'
    );

    const unmatchedTransactions = transactions.filter(t => !t.matched);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFileUploaded(true);
            alert(`Bank statement "${file.name}" uploaded successfully!\n\nParsing transactions...`);
            // In production, this would parse the CSV/OFX file and populate transactions
        }
    };

    const handleMatch = () => {
        if (!selectedTransaction || !selectedInvoice) {
            alert('Please select both a transaction and an invoice to match');
            return;
        }

        if (Math.abs(selectedTransaction.amount - (selectedInvoice.amountDue || selectedInvoice.total)) > 0.01) {
            if (!confirm(`Amount mismatch!\n\nTransaction: R${selectedTransaction.amount.toLocaleString('en-ZA')}\nInvoice: R${(selectedInvoice.amountDue || selectedInvoice.total).toLocaleString('en-ZA')}\n\nMatch anyway?`)) {
                return;
            }
        }

        // Mark transaction as matched
        setTransactions(transactions.map(t => 
            t.id === selectedTransaction.id ? { ...t, matched: true, invoiceId: selectedInvoice.id } : t
        ));

        // Record payment on invoice
        onMatch(selectedInvoice.id, {
            date: selectedTransaction.date,
            amount: selectedTransaction.amount,
            reference: selectedTransaction.reference,
            paymentMethod: 'Bank Transfer'
        });

        alert(`✓ Matched transaction to invoice ${selectedInvoice.invoiceNumber}\n✓ Payment recorded\n✓ Invoice status updated`);
        
        setSelectedTransaction(null);
        setSelectedInvoice(null);
    };

    const handleAutoMatch = () => {
        let matchCount = 0;
        const newTransactions = [...transactions];

        unmatchedTransactions.forEach(transaction => {
            // Try to find matching invoice by amount
            const matchingInvoice = unmatchedInvoices.find(inv => {
                const amount = inv.amountDue || inv.total;
                return Math.abs(transaction.amount - amount) < 0.01;
            });

            if (matchingInvoice) {
                const txIndex = newTransactions.findIndex(t => t.id === transaction.id);
                newTransactions[txIndex] = { 
                    ...newTransactions[txIndex], 
                    matched: true, 
                    invoiceId: matchingInvoice.id 
                };
                
                onMatch(matchingInvoice.id, {
                    date: transaction.date,
                    amount: transaction.amount,
                    reference: transaction.reference,
                    paymentMethod: 'Bank Transfer'
                });

                matchCount++;
            }
        });

        setTransactions(newTransactions);
        alert(`✓ Auto-matched ${matchCount} transactions\n✓ ${unmatchedTransactions.length - matchCount} transactions require manual review`);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Bank Reconciliation</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Upload Bank Statement */}
                    <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <i className="fas fa-file-upload text-blue-600 text-2xl"></i>
                                <div>
                                    <div className="font-medium text-gray-800">Upload Bank Statement</div>
                                    <div className="text-sm text-gray-600">Import CSV, OFX, or QFX file from your bank</div>
                                </div>
                            </div>
                            <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
                                <i className="fas fa-upload mr-2"></i>
                                Upload File
                                <input
                                    type="file"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    accept=".csv,.ofx,.qfx"
                                />
                            </label>
                        </div>
                        {fileUploaded && (
                            <div className="mt-3 text-sm text-green-600">
                                <i className="fas fa-check-circle mr-1"></i>
                                Statement uploaded • {transactions.length} transactions found
                            </div>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="bg-white border rounded-lg p-4">
                            <div className="text-sm text-gray-600 mb-1">Unmatched Transactions</div>
                            <div className="text-2xl font-bold text-orange-600">{unmatchedTransactions.length}</div>
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <div className="text-sm text-gray-600 mb-1">Unpaid Invoices</div>
                            <div className="text-2xl font-bold text-blue-600">{unmatchedInvoices.length}</div>
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <div className="text-sm text-gray-600 mb-1">Matched</div>
                            <div className="text-2xl font-bold text-green-600">
                                {transactions.filter(t => t.matched).length}
                            </div>
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <button
                                onClick={handleAutoMatch}
                                disabled={unmatchedTransactions.length === 0 || unmatchedInvoices.length === 0}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                                <i className="fas fa-magic mr-2"></i>
                                Auto-Match
                            </button>
                        </div>
                    </div>

                    {/* Matching Interface */}
                    <div className="grid grid-cols-2 gap-6">
                        {/* Bank Transactions */}
                        <div>
                            <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                                <i className="fas fa-university mr-2 text-blue-600"></i>
                                Bank Transactions
                            </h3>
                            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                                {unmatchedTransactions.length > 0 ? (
                                    <div className="divide-y divide-gray-200">
                                        {unmatchedTransactions.map(transaction => (
                                            <div
                                                key={transaction.id}
                                                onClick={() => setSelectedTransaction(transaction)}
                                                className={`p-4 cursor-pointer hover:bg-gray-50 ${
                                                    selectedTransaction?.id === transaction.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                                                }`}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-medium text-gray-900">{transaction.description}</div>
                                                        <div className="text-sm text-gray-600 mt-1">
                                                            {new Date(transaction.date).toLocaleDateString('en-ZA')}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            Ref: {transaction.reference}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-bold text-green-600">
                                                            R{transaction.amount.toLocaleString('en-ZA')}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-gray-500">
                                        <i className="fas fa-check-circle text-4xl mb-3"></i>
                                        <p>All transactions matched!</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Unpaid Invoices */}
                        <div>
                            <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                                <i className="fas fa-file-invoice mr-2 text-orange-600"></i>
                                Unpaid Invoices
                            </h3>
                            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                                {unmatchedInvoices.length > 0 ? (
                                    <div className="divide-y divide-gray-200">
                                        {unmatchedInvoices.map(invoice => (
                                            <div
                                                key={invoice.id}
                                                onClick={() => setSelectedInvoice(invoice)}
                                                className={`p-4 cursor-pointer hover:bg-gray-50 ${
                                                    selectedInvoice?.id === invoice.id ? 'bg-orange-50 border-l-4 border-orange-600' : ''
                                                }`}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-medium text-gray-900">{invoice.invoiceNumber}</div>
                                                        <div className="text-sm text-gray-600 mt-1">{invoice.client}</div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            Due: {new Date(invoice.dueDate).toLocaleDateString('en-ZA')}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-bold text-gray-900">
                                                            R{(invoice.amountDue || invoice.total).toLocaleString('en-ZA')}
                                                        </div>
                                                        <span className={`text-xs px-2 py-1 rounded mt-1 inline-block ${
                                                            invoice.status === 'Overdue' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                            {invoice.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-gray-500">
                                        <i className="fas fa-check-circle text-4xl mb-3"></i>
                                        <p>No unpaid invoices!</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Match Button */}
                    {selectedTransaction && selectedInvoice && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div>
                                        <div className="text-sm text-gray-600">Selected Transaction</div>
                                        <div className="font-medium text-gray-900">{selectedTransaction.description}</div>
                                        <div className="text-sm text-green-600">R{selectedTransaction.amount.toLocaleString('en-ZA')}</div>
                                    </div>
                                    <i className="fas fa-arrow-right text-gray-400 text-2xl"></i>
                                    <div>
                                        <div className="text-sm text-gray-600">Selected Invoice</div>
                                        <div className="font-medium text-gray-900">{selectedInvoice.invoiceNumber}</div>
                                        <div className="text-sm text-orange-600">
                                            R{(selectedInvoice.amountDue || selectedInvoice.total).toLocaleString('en-ZA')}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleMatch}
                                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                                >
                                    <i className="fas fa-link mr-2"></i>
                                    Match & Record Payment
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Matched Transactions History */}
                    {transactions.filter(t => t.matched).length > 0 && (
                        <div>
                            <h3 className="font-bold text-gray-800 mb-3">Recently Matched</h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {transactions
                                            .filter(t => t.matched)
                                            .map(transaction => {
                                                const invoice = invoices.find(inv => inv.id === transaction.invoiceId);
                                                return (
                                                    <tr key={transaction.id}>
                                                        <td className="px-4 py-3 text-sm text-gray-600">
                                                            {new Date(transaction.date).toLocaleDateString('en-ZA')}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-900">{transaction.description}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-900">
                                                            {invoice?.invoiceNumber || 'N/A'}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                                            R{transaction.amount.toLocaleString('en-ZA')}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                                                                Matched
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BankReconciliation;
