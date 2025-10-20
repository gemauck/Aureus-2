// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;
const InvoiceModal = window.InvoiceModal;
const PaymentModal = window.PaymentModal;
const RecurringInvoiceModal = window.RecurringInvoiceModal;
const CreditNoteModal = window.CreditNoteModal;
const ExpenseModal = window.ExpenseModal;
const InvoiceReports = window.InvoiceReports;
const BankReconciliation = window.BankReconciliation;
const InvoiceTemplateSelector = window.InvoiceTemplateSelector;
const BatchInvoiceActions = window.BatchInvoiceActions;
const InvoiceApprovalModal = window.InvoiceApprovalModal;
const DepositModal = window.DepositModal;
const ReminderSettings = window.ReminderSettings;
const NotesTemplateModal = window.NotesTemplateModal;

const initialInvoices = [
    { 
        id: 1,
        invoiceNumber: 'INV-001', 
        client: 'ABC Corporation', 
        project: 'Fleet Optimization Project', 
        date: '2024-03-01', 
        dueDate: '2024-03-31', 
        subtotal: 195652.17,
        vat: 29347.83,
        total: 225000, 
        status: 'Paid',
        lineItems: [
            { description: 'Fleet Analysis & Optimization Services', quantity: 120, rate: 1500, amount: 180000 },
            { description: 'Data Analysis & Reporting', quantity: 10, rate: 1565.217, amount: 15652.17 }
        ],
        notes: 'Thank you for your business!'
    },
    { 
        id: 2,
        invoiceNumber: 'INV-002', 
        client: 'XYZ Industries', 
        project: 'Annual Fuel Audit', 
        date: '2024-03-05', 
        dueDate: '2024-04-05', 
        subtotal: 136956.52,
        vat: 20543.48,
        total: 157500, 
        status: 'Sent',
        lineItems: [
            { description: 'Site Inspection & Compliance Review', quantity: 80, rate: 1500, amount: 120000 },
            { description: 'Documentation & Reporting', quantity: 11, rate: 1541.502, amount: 16956.52 }
        ],
        notes: 'Payment terms: Net 30 days'
    },
    { 
        id: 3,
        invoiceNumber: 'INV-003', 
        client: 'Logistics Ltd', 
        project: 'Cost Analysis Study', 
        date: '2024-03-10', 
        dueDate: '2024-04-10', 
        subtotal: 97043.48,
        vat: 14556.52,
        total: 111600, 
        status: 'Overdue',
        lineItems: [
            { description: 'Cost Analysis Research', quantity: 60, rate: 1500, amount: 90000 },
            { description: 'Report Preparation', quantity: 4.695653, rate: 1500, amount: 7043.48 }
        ],
        notes: 'Overdue - Please remit payment'
    }
];

const Invoicing = () => {
    const [invoices, setInvoices] = useState(initialInvoices);
    const [clients, setClients] = useState([]);
    const [projects, setProjects] = useState([]);
    const [timeEntries, setTimeEntries] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [searchTerm, setSearchTerm] = useState('');
    const [quickbooksConnected, setQuickbooksConnected] = useState(true);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showRecurringModal, setShowRecurringModal] = useState(false);
    const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showReports, setShowReports] = useState(false);
    const [showBankRec, setShowBankRec] = useState(false);
    const [recurringInvoices, setRecurringInvoices] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [creditNotes, setCreditNotes] = useState([]);
    const [selectedRecurring, setSelectedRecurring] = useState(null);
    const [selectedExpense, setSelectedExpense] = useState(null);
    const [activeTab, setActiveTab] = useState('invoices');
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);
    const [showBatchActions, setShowBatchActions] = useState(false);
    const [selectedInvoices, setSelectedInvoices] = useState([]);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showReminderSettings, setShowReminderSettings] = useState(false);
    const [showNotesTemplate, setShowNotesTemplate] = useState(false);
    const [invoiceTemplate, setInvoiceTemplate] = useState('modern');
    const [deposits, setDeposits] = useState([]);
    const [notesTemplates, setNotesTemplates] = useState([]);
    const [reminderSettings, setReminderSettings] = useState({
        enabled: true,
        days: [7, 3, 0, 7],
        autoSend: true
    });

    // Load data from localStorage
    useEffect(() => {
        const savedInvoices = localStorage.getItem('abcotronics_invoices');
        const savedClients = (storage && typeof storage.getClients === 'function') ? storage.getClients() : [];
        const savedProjects = (storage && typeof storage.getProjects === 'function') ? storage.getProjects() : [];
        const savedTimeEntries = (storage && typeof storage.getTimeEntries === 'function') ? storage.getTimeEntries() : [];
        const savedRecurring = localStorage.getItem('abcotronics_recurring_invoices');
        const savedExpenses = localStorage.getItem('abcotronics_expenses');
        const savedCreditNotes = localStorage.getItem('abcotronics_credit_notes');

        if (savedInvoices) {
            try {
                setInvoices(JSON.parse(savedInvoices));
            } catch (e) {
                console.error('Error loading invoices:', e);
            }
        }
        if (savedClients) setClients(savedClients);
        if (savedProjects) setProjects(savedProjects);
        if (savedTimeEntries) setTimeEntries(savedTimeEntries);
        if (savedRecurring) {
            try {
                setRecurringInvoices(JSON.parse(savedRecurring));
            } catch (e) {
                console.error('Error loading recurring invoices:', e);
            }
        }
        if (savedExpenses) {
            try {
                setExpenses(JSON.parse(savedExpenses));
            } catch (e) {
                console.error('Error loading expenses:', e);
            }
        }
        if (savedCreditNotes) {
            try {
                setCreditNotes(JSON.parse(savedCreditNotes));
            } catch (e) {
                console.error('Error loading credit notes:', e);
            }
        }
        
        const savedDeposits = localStorage.getItem('abcotronics_deposits');
        const savedNotesTemplates = localStorage.getItem('abcotronics_notes_templates');
        const savedReminderSettings = localStorage.getItem('abcotronics_reminder_settings');
        const savedInvoiceTemplate = localStorage.getItem('abcotronics_invoice_template');
        
        if (savedDeposits) {
            try {
                setDeposits(JSON.parse(savedDeposits));
            } catch (e) {
                console.error('Error loading deposits:', e);
            }
        }
        if (savedNotesTemplates) {
            try {
                setNotesTemplates(JSON.parse(savedNotesTemplates));
            } catch (e) {
                console.error('Error loading notes templates:', e);
            }
        }
        if (savedReminderSettings) {
            try {
                setReminderSettings(JSON.parse(savedReminderSettings));
            } catch (e) {
                console.error('Error loading reminder settings:', e);
            }
        }
        if (savedInvoiceTemplate) {
            setInvoiceTemplate(savedInvoiceTemplate);
        }
    }, []);

    // Save data whenever it changes
    useEffect(() => {
        localStorage.setItem('abcotronics_invoices', JSON.stringify(invoices));
    }, [invoices]);

    useEffect(() => {
        localStorage.setItem('abcotronics_recurring_invoices', JSON.stringify(recurringInvoices));
    }, [recurringInvoices]);

    useEffect(() => {
        localStorage.setItem('abcotronics_expenses', JSON.stringify(expenses));
    }, [expenses]);

    useEffect(() => {
        localStorage.setItem('abcotronics_credit_notes', JSON.stringify(creditNotes));
    }, [creditNotes]);
    
    useEffect(() => {
        localStorage.setItem('abcotronics_deposits', JSON.stringify(deposits));
    }, [deposits]);
    
    useEffect(() => {
        localStorage.setItem('abcotronics_notes_templates', JSON.stringify(notesTemplates));
    }, [notesTemplates]);
    
    useEffect(() => {
        localStorage.setItem('abcotronics_reminder_settings', JSON.stringify(reminderSettings));
    }, [reminderSettings]);
    
    useEffect(() => {
        localStorage.setItem('abcotronics_invoice_template', invoiceTemplate);
    }, [invoiceTemplate]);

    const handleAddInvoice = () => {
        setSelectedInvoice(null);
        setShowModal(true);
    };

    const handleEditInvoice = (invoice) => {
        setSelectedInvoice(invoice);
        setShowModal(true);
    };

    const handleSaveInvoice = (invoiceData) => {
        if (selectedInvoice) {
            setInvoices(invoices.map(inv => 
                inv.id === selectedInvoice.id ? { ...inv, ...invoiceData } : inv
            ));
        } else {
            const newInvoice = {
                id: Math.max(0, ...invoices.map(inv => inv.id)) + 1,
                ...invoiceData
            };
            setInvoices([newInvoice, ...invoices]);
        }
        setShowModal(false);
        setSelectedInvoice(null);
    };

    const handleDeleteInvoice = (invoiceId) => {
        if (confirm('Delete this invoice?')) {
            setInvoices(invoices.filter(inv => inv.id !== invoiceId));
        }
    };

    const handleSyncQuickBooks = () => {
        alert('Syncing with QuickBooks...\n\n✓ ' + invoices.length + ' invoices synced\n✓ Payment status updated\n✓ Client accounts matched\n✓ Revenue totals reconciled');
    };

    const handleDownloadInvoice = (invoice) => {
        alert(`Downloading invoice ${invoice.invoiceNumber} as PDF...\n\nThis feature would generate a professional PDF invoice.`);
    };

    const handleSendInvoice = (invoice) => {
        const clientEmail = clients.find(c => c.name === invoice.client)?.email || 'client@example.com';
        alert(`Sending invoice ${invoice.invoiceNumber} to ${clientEmail}...\n\nEmail sent successfully!`);
        
        // Update status to Sent if it was Draft
        if (invoice.status === 'Draft') {
            setInvoices(invoices.map(inv => 
                inv.id === invoice.id ? { ...inv, status: 'Sent' } : inv
            ));
        }
    };

    const handleRecordPayment = (paymentData) => {
        const invoice = selectedInvoice;
        const newPayment = {
            id: Math.random(),
            ...paymentData
        };

        const updatedInvoice = {
            ...invoice,
            payments: [...(invoice.payments || []), newPayment],
            amountPaid: (invoice.amountPaid || 0) + parseFloat(paymentData.amount),
            amountDue: (invoice.amountDue || invoice.total) - parseFloat(paymentData.amount)
        };

        // Update status if fully paid
        if (updatedInvoice.amountDue <= 0.01) {
            updatedInvoice.status = 'Paid';
            updatedInvoice.amountDue = 0;
        }

        setInvoices(invoices.map(inv => inv.id === invoice.id ? updatedInvoice : inv));
        setShowPaymentModal(false);
        alert('Payment recorded successfully!');
    };

    const handleSaveRecurring = (recurringData) => {
        if (selectedRecurring) {
            setRecurringInvoices(recurringInvoices.map(rec => 
                rec.id === selectedRecurring.id ? { ...rec, ...recurringData } : rec
            ));
        } else {
            const newRecurring = {
                id: Math.max(0, ...recurringInvoices.map(r => r.id)) + 1,
                ...recurringData
            };
            setRecurringInvoices([newRecurring, ...recurringInvoices]);
        }
        setShowRecurringModal(false);
        setSelectedRecurring(null);
    };

    const handleSaveCreditNote = (creditNoteData) => {
        const newCreditNote = {
            id: Math.max(0, ...creditNotes.map(cn => cn.id)) + 1,
            ...creditNoteData,
            createdAt: new Date().toISOString()
        };
        setCreditNotes([newCreditNote, ...creditNotes]);
        
        // Update the original invoice
        const invoice = invoices.find(inv => inv.id === creditNoteData.invoiceId);
        if (invoice) {
            const updatedInvoice = {
                ...invoice,
                amountDue: (invoice.amountDue || invoice.total) - creditNoteData.total,
                creditNotes: [...(invoice.creditNotes || []), newCreditNote.id]
            };
            setInvoices(invoices.map(inv => inv.id === invoice.id ? updatedInvoice : inv));
        }
        
        setShowCreditNoteModal(false);
        alert('Credit note issued successfully!');
    };

    const handleSaveExpense = (expenseData) => {
        if (selectedExpense) {
            setExpenses(expenses.map(exp => 
                exp.id === selectedExpense.id ? { ...exp, ...expenseData } : exp
            ));
        } else {
            const newExpense = {
                id: Math.max(0, ...expenses.map(e => e.id)) + 1,
                ...expenseData
            };
            setExpenses([newExpense, ...expenses]);
        }
        setShowExpenseModal(false);
        setSelectedExpense(null);
    };

    const handleBankRecMatch = (invoiceId, paymentData) => {
        handleRecordPayment(paymentData);
    };

    const handleToggleInvoiceSelection = (invoiceId) => {
        if (selectedInvoices.includes(invoiceId)) {
            setSelectedInvoices(selectedInvoices.filter(id => id !== invoiceId));
        } else {
            setSelectedInvoices([...selectedInvoices, invoiceId]);
        }
    };

    const handleSelectAllInvoices = () => {
        if (selectedInvoices.length === filteredInvoices.length) {
            setSelectedInvoices([]);
        } else {
            setSelectedInvoices(filteredInvoices.map(inv => inv.id));
        }
    };

    const handleSaveDeposit = (depositData) => {
        const newDeposit = {
            id: Math.max(0, ...deposits.map(d => d.id)) + 1,
            ...depositData,
            createdAt: new Date().toISOString()
        };
        setDeposits([newDeposit, ...deposits]);
        
        // Apply deposit to invoice
        const invoice = invoices.find(inv => inv.id === depositData.invoiceId);
        if (invoice) {
            const updatedInvoice = {
                ...invoice,
                deposits: [...(invoice.deposits || []), newDeposit.id],
                amountPaid: (invoice.amountPaid || 0) + parseFloat(depositData.amount),
                amountDue: (invoice.amountDue || invoice.total) - parseFloat(depositData.amount)
            };
            setInvoices(invoices.map(inv => inv.id === invoice.id ? updatedInvoice : inv));
        }
        
        setShowDepositModal(false);
        alert('Deposit recorded successfully!');
    };

    const handleSaveNotesTemplate = (template) => {
        if (template.id) {
            setNotesTemplates(notesTemplates.map(t => t.id === template.id ? template : t));
        } else {
            const newTemplate = {
                id: Math.max(0, ...notesTemplates.map(t => t.id)) + 1,
                ...template
            };
            setNotesTemplates([newTemplate, ...notesTemplates]);
        }
    };

    const handleApproveInvoice = (invoiceId, approvalData) => {
        const invoice = invoices.find(inv => inv.id === invoiceId);
        const updatedInvoice = {
            ...invoice,
            status: approvalData.approved ? 'Sent' : 'Draft',
            approvedBy: approvalData.approvedBy,
            approvedAt: new Date().toISOString(),
            approvalNotes: approvalData.notes
        };
        setInvoices(invoices.map(inv => inv.id === invoiceId ? updatedInvoice : inv));
        setShowApprovalModal(false);
        
        if (approvalData.approved) {
            alert(`Invoice ${invoice.invoiceNumber} approved and sent!`);
        } else {
            alert(`Invoice ${invoice.invoiceNumber} returned for revision.`);
        }
    };

    const handleGenerateRecurringInvoice = (recurring) => {
        const newInvoice = {
            id: Math.max(0, ...invoices.map(inv => inv.id)) + 1,
            invoiceNumber: `INV-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
            client: recurring.client,
            project: recurring.project,
            date: new Date().toISOString().split('T')[0],
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            lineItems: recurring.lineItems,
            notes: recurring.notes,
            status: recurring.autoSend ? 'Sent' : 'Draft',
            subtotal: recurring.subtotal,
            vat: recurring.vat,
            total: recurring.total,
            recurringId: recurring.id
        };
        setInvoices([newInvoice, ...invoices]);
        
        // Update next invoice date
        const nextDate = new Date(recurring.nextInvoiceDate);
        switch(recurring.frequency) {
            case 'Weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            case 'Monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
            case 'Quarterly':
                nextDate.setMonth(nextDate.getMonth() + 3);
                break;
            case 'Annually':
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                break;
        }
        setRecurringInvoices(recurringInvoices.map(r => 
            r.id === recurring.id ? { ...r, nextInvoiceDate: nextDate.toISOString().split('T')[0] } : r
        ));
        
        alert(`Invoice ${newInvoice.invoiceNumber} generated from recurring template!`);
    };

    // Filter invoices
    const filteredInvoices = invoices.filter(invoice => {
        const matchesStatus = filterStatus === 'All Status' || invoice.status === filterStatus;
        const matchesSearch = invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             invoice.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             invoice.project?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    // Calculate stats
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const paidInvoices = invoices.filter(i => i.status === 'Paid').reduce((sum, inv) => sum + inv.total, 0);
    const pendingInvoices = invoices.filter(i => i.status === 'Sent').reduce((sum, inv) => sum + inv.total, 0);
    const overdueInvoices = invoices.filter(i => i.status === 'Overdue').reduce((sum, inv) => sum + inv.total, 0);

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
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Invoicing & Billing</h1>
                    <p className="text-gray-600">Manage invoices and track payments • QuickBooks sync enabled</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowReminderSettings(true)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center"
                    >
                        <i className="fas fa-bell mr-2"></i>
                        Reminders
                    </button>
                    <button 
                        onClick={() => setShowNotesTemplate(true)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center"
                    >
                        <i className="fas fa-sticky-note mr-2"></i>
                        Templates
                    </button>
                    <button 
                        onClick={() => setShowReports(true)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center"
                    >
                        <i className="fas fa-chart-bar mr-2"></i>
                        Reports
                    </button>
                    <button 
                        onClick={() => setShowBankRec(true)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center"
                    >
                        <i className="fas fa-university mr-2"></i>
                        Bank Reconciliation
                    </button>
                    {quickbooksConnected && (
                        <button 
                            onClick={handleSyncQuickBooks}
                            className="px-4 py-2 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition flex items-center"
                        >
                            <i className="fas fa-sync mr-2"></i>
                            Sync QuickBooks
                        </button>
                    )}
                    <button 
                        onClick={handleAddInvoice}
                        className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition flex items-center"
                    >
                        <i className="fas fa-plus mr-2"></i>
                        Create Invoice
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                            <p className="text-2xl font-bold text-gray-800">R{totalRevenue.toLocaleString('en-ZA')}</p>
                            <p className="text-xs text-gray-500 mt-1">{invoices.length} invoices</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-coins text-blue-600 text-xl"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 mb-1">Paid</p>
                            <p className="text-2xl font-bold text-green-600">R{paidInvoices.toLocaleString('en-ZA')}</p>
                            <p className="text-xs text-gray-500 mt-1">{invoices.filter(i => i.status === 'Paid').length} invoices</p>
                        </div>
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-check-circle text-green-600 text-xl"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 mb-1">Pending</p>
                            <p className="text-2xl font-bold text-blue-600">R{pendingInvoices.toLocaleString('en-ZA')}</p>
                            <p className="text-xs text-gray-500 mt-1">{invoices.filter(i => i.status === 'Sent').length} invoices</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-clock text-blue-600 text-xl"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 mb-1">Overdue</p>
                            <p className="text-2xl font-bold text-red-600">R{overdueInvoices.toLocaleString('en-ZA')}</p>
                            <p className="text-xs text-gray-500 mt-1">{invoices.filter(i => i.status === 'Overdue').length} invoices</p>
                        </div>
                        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-exclamation-triangle text-red-600 text-xl"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* QuickBooks Status */}
            {quickbooksConnected && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <i className="fas fa-file-invoice-dollar text-green-600 text-2xl"></i>
                            <div>
                                <div className="font-medium text-green-800">QuickBooks Connected</div>
                                <div className="text-sm text-green-600">
                                    Last synced: 2 hours ago • Auto-sync enabled
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={handleSyncQuickBooks}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                        >
                            <i className="fas fa-sync mr-2"></i>
                            Sync Now
                        </button>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-lg shadow">
                <div className="flex border-b">
                    <button
                        onClick={() => setActiveTab('invoices')}
                        className={`px-6 py-3 font-medium transition ${
                            activeTab === 'invoices'
                                ? 'border-b-2 border-primary-600 text-primary-600'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        <i className="fas fa-file-invoice mr-2"></i>
                        Invoices ({invoices.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('recurring')}
                        className={`px-6 py-3 font-medium transition ${
                            activeTab === 'recurring'
                                ? 'border-b-2 border-primary-600 text-primary-600'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        <i className="fas fa-redo mr-2"></i>
                        Recurring ({recurringInvoices.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('expenses')}
                        className={`px-6 py-3 font-medium transition ${
                            activeTab === 'expenses'
                                ? 'border-b-2 border-primary-600 text-primary-600'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        <i className="fas fa-receipt mr-2"></i>
                        Expenses ({expenses.filter(e => e.billable && !e.invoiced).length})
                    </button>
                    <button
                        onClick={() => setActiveTab('creditnotes')}
                        className={`px-6 py-3 font-medium transition ${
                            activeTab === 'creditnotes'
                                ? 'border-b-2 border-primary-600 text-primary-600'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        <i className="fas fa-file-medical mr-2"></i>
                        Credit Notes ({creditNotes.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('deposits')}
                        className={`px-6 py-3 font-medium transition ${
                            activeTab === 'deposits'
                                ? 'border-b-2 border-primary-600 text-primary-600'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        <i className="fas fa-hand-holding-usd mr-2"></i>
                        Deposits ({deposits.length})
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex gap-4 items-center justify-between">
                    <div className="flex gap-4 flex-1">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search invoices..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>
                    {activeTab === 'invoices' && (
                        <select 
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                            <option>All Status</option>
                            <option>Draft</option>
                            <option>Sent</option>
                            <option>Paid</option>
                            <option>Overdue</option>
                        </select>
                    )}
                    </div>
                    <div className="flex gap-2">
                        {activeTab === 'invoices' && selectedInvoices.length > 0 && (
                            <button
                                onClick={() => setShowBatchActions(true)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center"
                            >
                                <i className="fas fa-tasks mr-2"></i>
                                Batch Actions ({selectedInvoices.length})
                            </button>
                        )}
                        {activeTab === 'recurring' && (
                            <button
                                onClick={() => {
                                    setSelectedRecurring(null);
                                    setShowRecurringModal(true);
                                }}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center"
                            >
                                <i className="fas fa-plus mr-2"></i>
                                New Template
                            </button>
                        )}
                        {activeTab === 'expenses' && (
                            <button
                                onClick={() => {
                                    setSelectedExpense(null);
                                    setShowExpenseModal(true);
                                }}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center"
                            >
                                <i className="fas fa-plus mr-2"></i>
                                Add Expense
                            </button>
                        )}
                        {activeTab === 'deposits' && (
                            <button
                                onClick={() => {
                                    setSelectedInvoice(null);
                                    setShowDepositModal(true);
                                }}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center"
                            >
                                <i className="fas fa-plus mr-2"></i>
                                Record Deposit
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Tables */}
            {activeTab === 'invoices' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0}
                                    onChange={handleSelectAllInvoices}
                                    className="w-4 h-4 rounded"
                                />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredInvoices.length > 0 ? (
                            filteredInvoices.map((invoice) => (
                                <tr key={invoice.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <input
                                            type="checkbox"
                                            checked={selectedInvoices.includes(invoice.id)}
                                            onChange={() => handleToggleInvoiceSelection(invoice.id)}
                                            className="w-4 h-4 rounded"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                        {invoice.invoiceNumber}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {invoice.client}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {invoice.project || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {new Date(invoice.date).toLocaleDateString('en-ZA', { 
                                            year: 'numeric', 
                                            month: 'short', 
                                            day: 'numeric' 
                                        })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {new Date(invoice.dueDate).toLocaleDateString('en-ZA', { 
                                            year: 'numeric', 
                                            month: 'short', 
                                            day: 'numeric' 
                                        })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        R{invoice.total.toLocaleString('en-ZA')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs rounded ${getStatusColor(invoice.status)}`}>
                                            {invoice.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button 
                                            onClick={() => handleEditInvoice(invoice)}
                                            className="text-primary-600 hover:text-primary-900 mr-3"
                                            title="Edit"
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button 
                                            onClick={() => handleDownloadInvoice(invoice)}
                                            className="text-primary-600 hover:text-primary-900 mr-3"
                                            title="Download PDF"
                                        >
                                            <i className="fas fa-download"></i>
                                        </button>
                                        <button 
                                            onClick={() => handleSendInvoice(invoice)}
                                            className="text-primary-600 hover:text-primary-900 mr-3"
                                            title="Send to Client"
                                        >
                                            <i className="fas fa-paper-plane"></i>
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSelectedInvoice(invoice);
                                                setShowPaymentModal(true);
                                            }}
                                            className="text-primary-600 hover:text-primary-900 mr-3"
                                            title="Record Payment"
                                        >
                                            <i className="fas fa-money-bill"></i>
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSelectedInvoice(invoice);
                                                setShowCreditNoteModal(true);
                                            }}
                                            className="text-primary-600 hover:text-primary-900 mr-3"
                                            title="Issue Credit Note"
                                        >
                                            <i className="fas fa-file-medical"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="9" className="px-6 py-12 text-center">
                                    <div className="text-gray-500">
                                        <i className="fas fa-file-invoice text-4xl mb-3"></i>
                                        <p className="text-lg">No invoices found</p>
                                        <p className="text-sm mt-1">Create your first invoice to get started!</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {/* Recurring Invoices Table */}
            {activeTab === 'recurring' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Invoice</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {recurringInvoices.length > 0 ? (
                            recurringInvoices.map((recurring) => (
                                <tr key={recurring.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                        {recurring.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {recurring.client}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {recurring.frequency}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {new Date(recurring.nextInvoiceDate).toLocaleDateString('en-ZA')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        R{recurring.total.toLocaleString('en-ZA')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs rounded ${recurring.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                            {recurring.active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button 
                                            onClick={() => handleGenerateRecurringInvoice(recurring)}
                                            className="text-primary-600 hover:text-primary-900 mr-3"
                                            title="Generate Invoice"
                                        >
                                            <i className="fas fa-play"></i>
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSelectedRecurring(recurring);
                                                setShowRecurringModal(true);
                                            }}
                                            className="text-primary-600 hover:text-primary-900 mr-3"
                                            title="Edit"
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="7" className="px-6 py-12 text-center">
                                    <div className="text-gray-500">
                                        <i className="fas fa-redo text-4xl mb-3"></i>
                                        <p className="text-lg">No recurring invoice templates</p>
                                        <p className="text-sm mt-1">Create a template to auto-generate invoices!</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {/* Expenses Table */}
            {activeTab === 'expenses' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Billed Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {expenses.length > 0 ? (
                            expenses.map((expense) => {
                                const billedAmount = expense.amount * (1 + expense.markup / 100);
                                return (
                                    <tr key={expense.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {new Date(expense.date).toLocaleDateString('en-ZA')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {expense.category}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {expense.description}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {expense.client}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            R{expense.amount.toLocaleString('en-ZA')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            R{billedAmount.toLocaleString('en-ZA')}
                                            {expense.markup > 0 && (
                                                <span className="text-xs text-gray-500 ml-1">(+{expense.markup}%)</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs rounded ${
                                                expense.invoiced ? 'bg-green-100 text-green-800' : 
                                                expense.billable ? 'bg-yellow-100 text-yellow-800' : 
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {expense.invoiced ? 'Invoiced' : expense.billable ? 'Billable' : 'Non-billable'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button 
                                                onClick={() => {
                                                    setSelectedExpense(expense);
                                                    setShowExpenseModal(true);
                                                }}
                                                className="text-primary-600 hover:text-primary-900 mr-3"
                                                title="Edit"
                                            >
                                                <i className="fas fa-edit"></i>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="8" className="px-6 py-12 text-center">
                                    <div className="text-gray-500">
                                        <i className="fas fa-receipt text-4xl mb-3"></i>
                                        <p className="text-lg">No expenses tracked</p>
                                        <p className="text-sm mt-1">Add expenses to bill them to clients!</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {/* Credit Notes Table */}
            {activeTab === 'creditnotes' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit Note #</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {creditNotes.length > 0 ? (
                            creditNotes.map((creditNote) => (
                                <tr key={creditNote.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                        {creditNote.creditNoteNumber}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {creditNote.invoiceNumber}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {creditNote.client}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {new Date(creditNote.date).toLocaleDateString('en-ZA')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {creditNote.reason}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                                        -R{creditNote.total.toLocaleString('en-ZA')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button 
                                            onClick={() => alert(`Download credit note ${creditNote.creditNoteNumber} as PDF`)}
                                            className="text-primary-600 hover:text-primary-900 mr-3"
                                            title="Download"
                                        >
                                            <i className="fas fa-download"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="7" className="px-6 py-12 text-center">
                                    <div className="text-gray-500">
                                        <i className="fas fa-file-medical text-4xl mb-3"></i>
                                        <p className="text-lg">No credit notes issued</p>
                                        <p className="text-sm mt-1">Issue credit notes for refunds or adjustments</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {/* Deposits Table */}
            {activeTab === 'deposits' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applied</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {deposits.length > 0 ? (
                            deposits.map((deposit) => {
                                const invoice = invoices.find(inv => inv.id === deposit.invoiceId);
                                return (
                                    <tr key={deposit.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {new Date(deposit.date).toLocaleDateString('en-ZA')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {invoice?.invoiceNumber || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {deposit.client}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {deposit.type}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            R{deposit.amount.toLocaleString('en-ZA')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            R{(deposit.appliedAmount || 0).toLocaleString('en-ZA')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs rounded ${
                                                deposit.appliedAmount >= deposit.amount ? 'bg-green-100 text-green-800' :
                                                deposit.appliedAmount > 0 ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-blue-100 text-blue-800'
                                            }`}>
                                                {deposit.appliedAmount >= deposit.amount ? 'Fully Applied' :
                                                 deposit.appliedAmount > 0 ? 'Partially Applied' : 'Unapplied'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="8" className="px-6 py-12 text-center">
                                    <div className="text-gray-500">
                                        <i className="fas fa-hand-holding-usd text-4xl mb-3"></i>
                                        <p className="text-lg">No deposits recorded</p>
                                        <p className="text-sm mt-1">Record advance payments or retainers!</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {/* Create/Edit Invoice Modal */}
            {showModal && (
                <InvoiceModal
                    invoice={selectedInvoice}
                    clients={clients}
                    projects={projects}
                    timeEntries={timeEntries}
                    onSave={handleSaveInvoice}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedInvoice(null);
                    }}
                    notesTemplates={notesTemplates}
                />
            )}

            {/* Batch Actions Modal */}
            {showBatchActions && (
                <BatchInvoiceActions
                    selectedInvoices={invoices.filter(inv => selectedInvoices.includes(inv.id))}
                    onSend={(invoiceIds) => {
                        invoiceIds.forEach(id => {
                            const invoice = invoices.find(inv => inv.id === id);
                            if (invoice) handleSendInvoice(invoice);
                        });
                        setSelectedInvoices([]);
                    }}
                    onDelete={(invoiceIds) => {
                        setInvoices(invoices.filter(inv => !invoiceIds.includes(inv.id)));
                        setSelectedInvoices([]);
                    }}
                    onUpdateStatus={(invoiceIds, status) => {
                        setInvoices(invoices.map(inv => 
                            invoiceIds.includes(inv.id) ? { ...inv, status } : inv
                        ));
                        setSelectedInvoices([]);
                    }}
                    onClose={() => {
                        setShowBatchActions(false);
                        setSelectedInvoices([]);
                    }}
                />
            )}

            {/* Approval Modal */}
            {showApprovalModal && selectedInvoice && (
                <InvoiceApprovalModal
                    invoice={selectedInvoice}
                    onApprove={(approvalData) => handleApproveInvoice(selectedInvoice.id, approvalData)}
                    onClose={() => {
                        setShowApprovalModal(false);
                        setSelectedInvoice(null);
                    }}
                />
            )}

            {/* Deposit Modal */}
            {showDepositModal && (
                <DepositModal
                    invoices={invoices.filter(inv => inv.status !== 'Paid')}
                    clients={clients}
                    onSave={handleSaveDeposit}
                    onClose={() => setShowDepositModal(false)}
                />
            )}

            {/* Reminder Settings Modal */}
            {showReminderSettings && (
                <ReminderSettings
                    settings={reminderSettings}
                    onSave={(settings) => {
                        setReminderSettings(settings);
                        setShowReminderSettings(false);
                    }}
                    onClose={() => setShowReminderSettings(false)}
                />
            )}

            {/* Notes Template Modal */}
            {showNotesTemplate && (
                <NotesTemplateModal
                    templates={notesTemplates}
                    onSave={handleSaveNotesTemplate}
                    onDelete={(templateId) => {
                        setNotesTemplates(notesTemplates.filter(t => t.id !== templateId));
                    }}
                    onClose={() => setShowNotesTemplate(false)}
                />
            )}

            {/* Template Selector Modal */}
            {showTemplateSelector && (
                <InvoiceTemplateSelector
                    currentTemplate={invoiceTemplate}
                    onSelect={(template) => {
                        setInvoiceTemplate(template);
                        setShowTemplateSelector(false);
                    }}
                    onClose={() => setShowTemplateSelector(false)}
                />
            )}
        </div>
    );
};

// Make available globally
window.Invoicing = Invoicing;
