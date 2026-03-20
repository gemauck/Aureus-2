// Get React hooks from window
const { useState, useEffect } = React;
const storage = window.storage;

const Payroll = () => {
    const [payrollRecords, setPayrollRecords] = useState([]);
    const [showPayslipModal, setShowPayslipModal] = useState(false);
    const [selectedPayslip, setSelectedPayslip] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [filterEmployee, setFilterEmployee] = useState('all');
    const [showQBSyncModal, setShowQBSyncModal] = useState(false);
    const [qbConnected, setQBConnected] = useState(false);

    const employees = storage.getEmployees() || [];

    useEffect(() => {
        loadPayrollRecords();
        checkQBConnection();
    }, []);

    const checkQBConnection = () => {
        const connection = storage.getQBConnection();
        setQBConnected(!!connection && !!connection.accessToken);
    };

    const loadPayrollRecords = () => {
        const saved = storage.getPayrollRecords() || [];
        setPayrollRecords(saved);
    };

    useEffect(() => {
        if (payrollRecords.length > 0) {
            storage.setPayrollRecords(payrollRecords);
        }
    }, [payrollRecords]);

    // South African PAYE tax brackets 2025
    const calculatePAYE = (monthlyIncome) => {
        const annualIncome = monthlyIncome * 12;
        let tax = 0;

        if (annualIncome <= 237100) {
            tax = annualIncome * 0.18;
        } else if (annualIncome <= 370500) {
            tax = 42678 + (annualIncome - 237100) * 0.26;
        } else if (annualIncome <= 512800) {
            tax = 77362 + (annualIncome - 370500) * 0.31;
        } else if (annualIncome <= 673000) {
            tax = 121475 + (annualIncome - 512800) * 0.36;
        } else if (annualIncome <= 857900) {
            tax = 179147 + (annualIncome - 673000) * 0.39;
        } else if (annualIncome <= 1817000) {
            tax = 251258 + (annualIncome - 857900) * 0.41;
        } else {
            tax = 644489 + (annualIncome - 1817000) * 0.45;
        }

        // Primary rebate
        tax = Math.max(0, tax - 17235);
        
        return tax / 12; // Monthly PAYE
    };

    // UIF calculation (1% of gross, capped at R17.32)
    const calculateUIF = (grossSalary) => {
        return Math.min(grossSalary * 0.01, 17.32);
    };

    // SDL calculation (1% of gross)
    const calculateSDL = (grossSalary) => {
        return grossSalary * 0.01;
    };

    const generatePayslip = (employee) => {
        const grossSalary = parseFloat(employee.salary) || 0;
        const paye = calculatePAYE(grossSalary);
        const uif = calculateUIF(grossSalary);
        const sdl = calculateSDL(grossSalary);
        
        // Additional deductions
        const medicalAid = 1500; // Example amount
        const pensionFund = grossSalary * 0.075; // 7.5%
        
        const totalDeductions = paye + uif + medicalAid + pensionFund;
        const netSalary = grossSalary - totalDeductions;

        const payslip = {
            id: Date.now(),
            employee: employee.name,
            employeeNumber: employee.employeeNumber,
            month: selectedMonth,
            grossSalary,
            deductions: {
                paye: paye.toFixed(2),
                uif: uif.toFixed(2),
                sdl: sdl.toFixed(2),
                medicalAid: medicalAid.toFixed(2),
                pensionFund: pensionFund.toFixed(2)
            },
            totalDeductions: totalDeductions.toFixed(2),
            netSalary: netSalary.toFixed(2),
            paymentDate: new Date().toISOString().split('T')[0],
            status: 'Pending',
            source: 'System', // System or QuickBooks
            qbSynced: false
        };

        return payslip;
    };

    const handleGeneratePayroll = () => {
        if (confirm(`Generate payroll for ${selectedMonth}?`)) {
            const newPayslips = employees
                .filter(emp => emp.status === 'Active' && emp.salary)
                .map(emp => generatePayslip(emp));
            
            setPayrollRecords([...payrollRecords, ...newPayslips]);
        }
    };

    const handleProcessPayment = (id) => {
        if (confirm('Mark this payslip as paid?')) {
            setPayrollRecords(payrollRecords.map(record =>
                record.id === id ? { ...record, status: 'Paid', paidDate: new Date().toISOString().split('T')[0] } : record
            ));
        }
    };

    const handleDeletePayslip = (id) => {
        if (confirm('Delete this payslip?')) {
            setPayrollRecords(payrollRecords.filter(r => r.id !== id));
        }
    };

    const getFilteredRecords = () => {
        return payrollRecords.filter(record => {
            const matchesMonth = record.month === selectedMonth;
            const matchesEmployee = filterEmployee === 'all' || record.employee === filterEmployee;
            return matchesMonth && matchesEmployee;
        });
    };

    const getMonthlyTotals = () => {
        const monthRecords = getFilteredRecords();
        return {
            totalGross: monthRecords.reduce((sum, r) => sum + parseFloat(r.grossSalary), 0),
            totalPAYE: monthRecords.reduce((sum, r) => sum + parseFloat(r.deductions.paye), 0),
            totalUIF: monthRecords.reduce((sum, r) => sum + parseFloat(r.deductions.uif), 0),
            totalNet: monthRecords.reduce((sum, r) => sum + parseFloat(r.netSalary), 0),
            totalEmployees: monthRecords.length
        };
    };

    const formatZAR = (amount) => {
        return `R ${parseFloat(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'Pending': return 'bg-yellow-100 text-yellow-800';
            case 'Paid': return 'bg-green-100 text-green-800';
            case 'Failed': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // Payslip Detail Modal
    const PayslipModal = () => {
        const payslip = selectedPayslip;
        if (!payslip) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-2xl">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">Payslip Details</h2>
                        <button 
                            onClick={() => {
                                setShowPayslipModal(false);
                                setSelectedPayslip(null);
                            }}
                            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <div className="p-4 space-y-4">
                        {/* Header */}
                        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold text-primary-900">Abcotronics</h3>
                                    <p className="text-xs text-primary-700">Fuel Management Services</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-primary-700">Pay Period</p>
                                    <p className="text-sm font-semibold text-primary-900">{payslip.month}</p>
                                </div>
                            </div>
                        </div>

                        {/* Employee Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] text-gray-500 mb-0.5">EMPLOYEE NAME</p>
                                <p className="text-sm font-semibold text-gray-900">{payslip.employee}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 mb-0.5">EMPLOYEE NUMBER</p>
                                <p className="text-sm font-semibold text-gray-900">{payslip.employeeNumber}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 mb-0.5">PAYMENT DATE</p>
                                <p className="text-sm font-semibold text-gray-900">{payslip.paymentDate}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 mb-0.5">STATUS</p>
                                <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${getStatusColor(payslip.status)}`}>
                                    {payslip.status}
                                </span>
                            </div>
                        </div>

                        {/* Earnings & Deductions */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Earnings */}
                            <div className="border border-gray-200 rounded-lg p-3">
                                <h4 className="text-xs font-semibold text-gray-900 mb-2 pb-2 border-b">EARNINGS</h4>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-700">Basic Salary</span>
                                        <span className="font-medium text-gray-900">{formatZAR(payslip.grossSalary)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs pt-2 border-t border-gray-200">
                                        <span className="font-semibold text-gray-900">GROSS SALARY</span>
                                        <span className="font-bold text-gray-900">{formatZAR(payslip.grossSalary)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Deductions */}
                            <div className="border border-gray-200 rounded-lg p-3">
                                <h4 className="text-xs font-semibold text-gray-900 mb-2 pb-2 border-b">DEDUCTIONS</h4>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-700">PAYE (Tax)</span>
                                        <span className="font-medium text-red-600">{formatZAR(payslip.deductions.paye)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-700">UIF</span>
                                        <span className="font-medium text-red-600">{formatZAR(payslip.deductions.uif)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-700">Medical Aid</span>
                                        <span className="font-medium text-red-600">{formatZAR(payslip.deductions.medicalAid)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-700">Pension Fund</span>
                                        <span className="font-medium text-red-600">{formatZAR(payslip.deductions.pensionFund)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs pt-2 border-t border-gray-200">
                                        <span className="font-semibold text-gray-900">TOTAL DEDUCTIONS</span>
                                        <span className="font-bold text-red-600">{formatZAR(payslip.totalDeductions)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Net Salary */}
                        <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-xs text-green-700 mb-0.5">NET SALARY (Take Home)</p>
                                    <p className="text-2xl font-bold text-green-900">{formatZAR(payslip.netSalary)}</p>
                                </div>
                                <i className="fas fa-money-bill-wave text-3xl text-green-600"></i>
                            </div>
                        </div>

                        {/* Tax Information */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-[10px] text-blue-900 font-medium mb-1">Tax Information</p>
                            <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                                <div>PAYE: {formatZAR(payslip.deductions.paye)}</div>
                                <div>UIF: {formatZAR(payslip.deductions.uif)}</div>
                                <div>SDL: {formatZAR(payslip.deductions.sdl)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                        <button
                            onClick={() => {
                                setShowPayslipModal(false);
                                setSelectedPayslip(null);
                            }}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            <i className="fas fa-print mr-1.5"></i>
                            Print
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const filteredRecords = getFilteredRecords();
    const totals = getMonthlyTotals();

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-base font-semibold text-gray-900">Payroll Management</h2>
                    <p className="text-xs text-gray-600">Process employee salaries and tax deductions</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowQBSyncModal(true)}
                        className={`px-3 py-1.5 border rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                            qbConnected 
                                ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100' 
                                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <img src="https://plugin.intuitcdn.net/designsystem/assets/2023-06-13/icons-and-images/qbo-logo.svg" 
                             alt="QB" className="h-4" 
                             onError={(e) => e.target.style.display = 'none'} />
                        {qbConnected ? (
                            <>
                                <i className="fas fa-check-circle text-xs"></i>
                                QuickBooks
                            </>
                        ) : (
                            <>
                                <i className="fas fa-link text-xs"></i>
                                Connect QB
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleGeneratePayroll}
                        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                    >
                        <i className="fas fa-calculator mr-1.5"></i>
                        Generate Payroll
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Employees</p>
                    <p className="text-xl font-bold text-gray-900">{totals.totalEmployees}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Gross Total</p>
                    <p className="text-base font-bold text-blue-600">{formatZAR(totals.totalGross)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Total PAYE</p>
                    <p className="text-base font-bold text-red-600">{formatZAR(totals.totalPAYE)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Total UIF</p>
                    <p className="text-base font-bold text-orange-600">{formatZAR(totals.totalUIF)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Net Total</p>
                    <p className="text-base font-bold text-green-600">{formatZAR(totals.totalNet)}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex gap-2.5">
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />

                    <select
                        value={filterEmployee}
                        onChange={(e) => setFilterEmployee(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Employees</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.name}>{emp.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Payroll Records */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Employee</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Month</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase">Gross</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase">PAYE</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase">Deductions</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase">Net</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Status</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredRecords.length > 0 ? filteredRecords.map(record => (
                            <tr key={record.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">{record.employee}</div>
                                            <div className="text-[10px] text-gray-500">{record.employeeNumber}</div>
                                        </div>
                                        {record.source === 'QuickBooks' && (
                                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] rounded font-medium" title="Synced from QuickBooks">
                                                QB
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-2.5 text-xs text-gray-900">{record.month}</td>
                                <td className="px-3 py-2.5 text-xs text-right font-medium text-gray-900">
                                    {formatZAR(record.grossSalary)}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-right text-red-600">
                                    {formatZAR(record.deductions.paye)}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-right text-red-600">
                                    {formatZAR(record.totalDeductions)}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-right font-semibold text-green-600">
                                    {formatZAR(record.netSalary)}
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${getStatusColor(record.status)}`}>
                                        {record.status}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-xs">
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => {
                                                setSelectedPayslip(record);
                                                setShowPayslipModal(true);
                                            }}
                                            className="text-primary-600 hover:text-primary-700 p-1"
                                            title="View Payslip"
                                        >
                                            <i className="fas fa-file-invoice"></i>
                                        </button>
                                        {record.status === 'Pending' && (
                                            <button
                                                onClick={() => handleProcessPayment(record.id)}
                                                className="text-green-600 hover:text-green-700 p-1"
                                                title="Process Payment"
                                            >
                                                <i className="fas fa-check"></i>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDeletePayslip(record.id)}
                                            className="text-red-600 hover:text-red-700 p-1"
                                            title="Delete"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                                    <i className="fas fa-money-bill-wave text-3xl mb-2"></i>
                                    <p className="text-sm">No payroll records for {selectedMonth}</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modals */}
            {showPayslipModal && <PayslipModal />}
            {showQBSyncModal && (
                <window.QuickBooksPayrollSync 
                    onClose={() => {
                        setShowQBSyncModal(false);
                        checkQBConnection();
                        loadPayrollRecords();
                    }} 
                />
            )}
        </div>
    );
};

// Make available globally
window.Payroll = Payroll;
