// Database-First Invoicing Component - No localStorage dependency
const { useState, useEffect } = React;

const InvoicingDatabaseFirst = () => {
    const [invoices, setInvoices] = useState([]);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('invoice'); // invoice, payment, recurring, credit, expense
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterClient, setFilterClient] = useState('All Clients');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const { isDark } = window.useTheme();

    // Load invoices from database
    const loadInvoices = async () => {
        console.log('🔄 Loading invoices from database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token - redirecting to login');
                window.location.hash = '#/login';
                return;
            }

            const response = await window.api.getInvoices();
            const apiInvoices = response?.data || [];
            console.log('📡 Database returned invoices:', apiInvoices.length);
            
            // Process invoices data
            const processedInvoices = apiInvoices.map(i => ({
                id: i.id,
                invoiceNumber: i.invoiceNumber || '',
                client: i.client || '',
                project: i.project || '',
                date: i.date || new Date().toISOString().split('T')[0],
                dueDate: i.dueDate || '',
                subtotal: i.subtotal || 0,
                vat: i.vat || 0,
                total: i.total || 0,
                status: i.status || 'Draft',
                lineItems: Array.isArray(i.lineItems) ? i.lineItems : [],
                notes: i.notes || '',
                payments: Array.isArray(i.payments) ? i.payments : [],
                recurring: i.recurring || false,
                recurringFrequency: i.recurringFrequency || '',
                recurringEndDate: i.recurringEndDate || '',
                attachments: Array.isArray(i.attachments) ? i.attachments : [],
                approvalStatus: i.approvalStatus || 'Pending',
                approvedBy: i.approvedBy || '',
                approvedDate: i.approvedDate || '',
                sentDate: i.sentDate || '',
                paidDate: i.paidDate || '',
                lastReminder: i.lastReminder || '',
                nextReminder: i.nextReminder || '',
                activityLog: Array.isArray(i.activityLog) ? i.activityLog : []
            }));
            
            setInvoices(processedInvoices);
            console.log('✅ Invoices loaded from database');
            
        } catch (error) {
            console.error('❌ Failed to load invoices from database:', error);
            if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                console.log('🔑 Authentication expired - redirecting to login');
                window.storage.removeToken();
                window.storage.removeUser();
                window.location.hash = '#/login';
            } else {
                alert('Failed to load invoices from database. Please try again.');
            }
        }
    };

    // Save invoice to database
    const handleSaveInvoice = async (invoiceData) => {
        console.log('💾 Saving invoice to database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to save invoice data');
                return;
            }

            const comprehensiveInvoice = {
                id: selectedInvoice ? selectedInvoice.id : Date.now().toString(),
                invoiceNumber: invoiceData.invoiceNumber || '',
                client: invoiceData.client || '',
                project: invoiceData.project || '',
                date: invoiceData.date || new Date().toISOString().split('T')[0],
                dueDate: invoiceData.dueDate || '',
                subtotal: invoiceData.subtotal || 0,
                vat: invoiceData.vat || 0,
                total: invoiceData.total || 0,
                status: invoiceData.status || 'Draft',
                lineItems: invoiceData.lineItems || [],
                notes: invoiceData.notes || '',
                payments: invoiceData.payments || [],
                recurring: invoiceData.recurring || false,
                recurringFrequency: invoiceData.recurringFrequency || '',
                recurringEndDate: invoiceData.recurringEndDate || '',
                attachments: invoiceData.attachments || [],
                approvalStatus: invoiceData.approvalStatus || 'Pending',
                approvedBy: invoiceData.approvedBy || '',
                approvedDate: invoiceData.approvedDate || '',
                sentDate: invoiceData.sentDate || '',
                paidDate: invoiceData.paidDate || '',
                lastReminder: invoiceData.lastReminder || '',
                nextReminder: invoiceData.nextReminder || '',
                activityLog: invoiceData.activityLog || []
            };

            if (selectedInvoice) {
                // Update existing invoice
                await window.api.updateInvoice(comprehensiveInvoice.id, comprehensiveInvoice);
                console.log('✅ Invoice updated in database');
                
                // Update local state
                const updated = invoices.map(i => i.id === selectedInvoice.id ? comprehensiveInvoice : i);
                setInvoices(updated);
                setSelectedInvoice(comprehensiveInvoice);
            } else {
                // Create new invoice
                const newInvoice = await window.api.createInvoice(comprehensiveInvoice);
                console.log('✅ Invoice created in database');
                
                // Add to local state
                setInvoices(prev => [...prev, newInvoice]);
                
                // Close modal and refresh
                setShowModal(false);
                setSelectedInvoice(null);
            }
            
            setRefreshKey(k => k + 1);
            
        } catch (error) {
            console.error('❌ Failed to save invoice to database:', error);
            alert('Failed to save invoice to database. Please try again.');
        }
    };

    // Delete invoice from database
    const handleDeleteInvoice = async (invoiceId) => {
        if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
            return;
        }

        console.log(`💾 Deleting invoice ${invoiceId} from database...`);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to delete invoice');
                return;
            }

            await window.api.deleteInvoice(invoiceId);
            console.log('✅ Invoice deleted from database');
            
            // Update local state
            setInvoices(prev => prev.filter(i => i.id !== invoiceId));
            setSelectedInvoice(null);
            setRefreshKey(k => k + 1);
            
        } catch (error) {
            console.error('❌ Failed to delete invoice from database:', error);
            alert('Failed to delete invoice from database. Please try again.');
        }
    };

    // Filter and search
    const filteredInvoices = invoices.filter(invoice => {
        const matchesSearch = invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            invoice.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            invoice.project.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'All Status' || invoice.status === filterStatus;
        const matchesClient = filterClient === 'All Clients' || invoice.client === filterClient;
        return matchesSearch && matchesStatus && matchesClient;
    });

    // Get unique clients for filter
    const uniqueClients = [...new Set(invoices.map(invoice => invoice.client))].filter(Boolean);

    // Calculate totals
    const totalAmount = filteredInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const paidAmount = filteredInvoices.filter(i => i.status === 'Paid').reduce((sum, invoice) => sum + invoice.total, 0);
    const pendingAmount = filteredInvoices.filter(i => i.status === 'Sent').reduce((sum, invoice) => sum + invoice.total, 0);

    // Load data on mount
    useEffect(() => {
        loadInvoices();
    }, []);

    // Auto-refresh data every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadInvoices();
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-4"></i>
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading invoices from database...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-xl ${isDark ? 'bg-primary-600' : 'bg-primary-500'} flex items-center justify-center`}>
                            <i className="fas fa-file-invoice text-white text-lg"></i>
                        </div>
                        <div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Invoicing</h1>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Database-synchronized invoice management</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => {
                                setModalType('invoice');
                                setSelectedInvoice(null);
                                setShowModal(true);
                            }}
                            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all duration-200"
                        >
                            <i className="fas fa-plus text-xs"></i>
                            <span>New Invoice</span>
                        </button>
                        <button 
                            onClick={() => {
                                setModalType('payment');
                                setSelectedInvoice(null);
                                setShowModal(true);
                            }}
                            className={`flex items-center space-x-2 px-4 py-2 ${isDark ? 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'} border rounded-lg text-sm font-medium transition-all duration-200`}
                        >
                            <i className="fas fa-credit-card text-xs"></i>
                            <span>Record Payment</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Amount</p>
                            <p className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                R{totalAmount.toLocaleString()}
                            </p>
                        </div>
                        <i className="fas fa-file-invoice text-2xl text-blue-600"></i>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Paid Amount</p>
                            <p className={`text-2xl font-bold text-green-600`}>
                                R{paidAmount.toLocaleString()}
                            </p>
                        </div>
                        <i className="fas fa-check-circle text-2xl text-green-600"></i>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Pending Amount</p>
                            <p className={`text-2xl font-bold text-orange-600`}>
                                R{pendingAmount.toLocaleString()}
                            </p>
                        </div>
                        <i className="fas fa-clock text-2xl text-orange-600"></i>
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="space-y-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search invoices..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full px-4 py-3 pl-10 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        />
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All Status</option>
                            <option>Draft</option>
                            <option>Sent</option>
                            <option>Paid</option>
                            <option>Overdue</option>
                            <option>Cancelled</option>
                        </select>
                        
                        <select
                            value={filterClient}
                            onChange={(e) => setFilterClient(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All Clients</option>
                            {uniqueClients.map(client => (
                                <option key={client} value={client}>{client}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Invoices Table */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <tr>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Invoice
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Client
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Date
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Amount
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Status
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className={`${isDark ? 'divide-gray-700' : 'divide-gray-200'} divide-y`}>
                            {filteredInvoices.map(invoice => (
                                <tr key={invoice.id} className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer`}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {invoice.invoiceNumber}
                                        </div>
                                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {invoice.project}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {invoice.client}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {new Date(invoice.date).toLocaleDateString()}
                                        </div>
                                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            Due: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'No due date'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            R{invoice.total.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            invoice.status === 'Paid' ? 'bg-green-100 text-green-800' : 
                                            invoice.status === 'Sent' ? 'bg-blue-100 text-blue-800' :
                                            invoice.status === 'Draft' ? 'bg-gray-100 text-gray-800' :
                                            invoice.status === 'Overdue' ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {invoice.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => setSelectedInvoice(invoice)}
                                                className={`${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-900'}`}
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedInvoice(invoice);
                                                    setShowModal(true);
                                                }}
                                                className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteInvoice(invoice.id)}
                                                className={`${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-900'}`}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {showModal && modalType === 'invoice' && (
                <InvoiceModal
                    invoice={selectedInvoice}
                    onSave={handleSaveInvoice}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedInvoice(null);
                    }}
                    allClients={[]} // Will be loaded from database
                    allProjects={[]} // Will be loaded from database
                />
            )}

            {showModal && modalType === 'payment' && (
                <PaymentModal
                    onSave={(paymentData) => {
                        // Handle payment saving
                        console.log('Payment saved:', paymentData);
                        setShowModal(false);
                    }}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedInvoice(null);
                    }}
                    invoices={invoices}
                />
            )}

            {/* Invoice Detail Modal */}
            {selectedInvoice && !showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto`}>
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    Invoice Details - {selectedInvoice.invoiceNumber}
                                </h3>
                                <button
                                    onClick={() => setSelectedInvoice(null)}
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>Client Information</h4>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedInvoice.client}</p>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedInvoice.project}</p>
                                    </div>
                                    <div>
                                        <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>Invoice Details</h4>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Date: {new Date(selectedInvoice.date).toLocaleDateString()}</p>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Due: {selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate).toLocaleDateString() : 'No due date'}</p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>Line Items</h4>
                                    <div className="space-y-2">
                                        {selectedInvoice.lineItems.map((item, index) => (
                                            <div key={index} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} p-3 rounded-lg`}>
                                                <div className="flex justify-between">
                                                    <span className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{item.description}</span>
                                                    <span className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>R{item.amount.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <div className="text-right">
                                        <div className="flex justify-between py-2">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Subtotal:</span>
                                            <span className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>R{selectedInvoice.subtotal.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between py-2">
                                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>VAT:</span>
                                            <span className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>R{selectedInvoice.vat.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between py-2 border-t pt-2">
                                            <span className={`font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Total:</span>
                                            <span className={`font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>R{selectedInvoice.total.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.InvoicingDatabaseFirst = InvoicingDatabaseFirst;
