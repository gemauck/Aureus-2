const { useState } = window;

export const InvoiceReports = ({ invoices, onClose }) => {
    const [reportType, setReportType] = useState('aging');
    const [dateRange, setDateRange] = useState('all');

    // Calculate aging buckets
    const today = new Date();
    const agingBuckets = {
        current: 0,
        '1-30': 0,
        '31-60': 0,
        '61-90': 0,
        '90+': 0
    };

    invoices.filter(inv => inv.status !== 'Paid').forEach(inv => {
        const dueDate = new Date(inv.dueDate);
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        const amount = inv.amountDue || inv.total;

        if (daysOverdue <= 0) {
            agingBuckets.current += amount;
        } else if (daysOverdue <= 30) {
            agingBuckets['1-30'] += amount;
        } else if (daysOverdue <= 60) {
            agingBuckets['31-60'] += amount;
        } else if (daysOverdue <= 90) {
            agingBuckets['61-90'] += amount;
        } else {
            agingBuckets['90+'] += amount;
        }
    });

    // Revenue by client
    const revenueByClient = {};
    invoices.forEach(inv => {
        if (!revenueByClient[inv.client]) {
            revenueByClient[inv.client] = { total: 0, paid: 0, pending: 0, count: 0 };
        }
        revenueByClient[inv.client].total += inv.total;
        revenueByClient[inv.client].count += 1;
        if (inv.status === 'Paid') {
            revenueByClient[inv.client].paid += inv.total;
        } else {
            revenueByClient[inv.client].pending += inv.amountDue || inv.total;
        }
    });

    // Monthly revenue
    const monthlyRevenue = {};
    invoices.forEach(inv => {
        const date = new Date(inv.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyRevenue[monthKey]) {
            monthlyRevenue[monthKey] = { invoiced: 0, paid: 0, count: 0 };
        }
        monthlyRevenue[monthKey].invoiced += inv.total;
        monthlyRevenue[monthKey].count += 1;
        if (inv.status === 'Paid') {
            monthlyRevenue[monthKey].paid += inv.total;
        }
    });

    // Payment trends
    const paymentStats = {
        avgDaysToPay: 0,
        onTimePayments: 0,
        latePayments: 0,
        totalPaid: 0
    };

    const paidInvoices = invoices.filter(inv => inv.status === 'Paid');
    if (paidInvoices.length > 0) {
        let totalDays = 0;
        paidInvoices.forEach(inv => {
            const invoiceDate = new Date(inv.date);
            const dueDate = new Date(inv.dueDate);
            const paidDate = inv.payments?.[inv.payments.length - 1]?.date 
                ? new Date(inv.payments[inv.payments.length - 1].date) 
                : dueDate;
            
            const daysToPay = Math.floor((paidDate - invoiceDate) / (1000 * 60 * 60 * 24));
            const daysUntilDue = Math.floor((dueDate - invoiceDate) / (1000 * 60 * 60 * 24));
            
            totalDays += daysToPay;
            paymentStats.totalPaid += inv.total;
            
            if (daysToPay <= daysUntilDue) {
                paymentStats.onTimePayments += 1;
            } else {
                paymentStats.latePayments += 1;
            }
        });
        paymentStats.avgDaysToPay = Math.round(totalDays / paidInvoices.length);
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Invoice Reports & Analytics</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => window.print()}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                        >
                            <i className="fas fa-print mr-1"></i> Print
                        </button>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <i className="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Report Type Selector */}
                    <div className="flex gap-2 border-b pb-4">
                        <button
                            onClick={() => setReportType('aging')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                                reportType === 'aging' 
                                    ? 'bg-primary-600 text-white' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            Aging Report
                        </button>
                        <button
                            onClick={() => setReportType('client')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                                reportType === 'client' 
                                    ? 'bg-primary-600 text-white' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            By Client
                        </button>
                        <button
                            onClick={() => setReportType('monthly')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                                reportType === 'monthly' 
                                    ? 'bg-primary-600 text-white' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            Monthly Revenue
                        </button>
                        <button
                            onClick={() => setReportType('payment')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                                reportType === 'payment' 
                                    ? 'bg-primary-600 text-white' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            Payment Trends
                        </button>
                    </div>

                    {/* Aging Report */}
                    {reportType === 'aging' && (
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Accounts Receivable Aging</h3>
                            <div className="grid grid-cols-5 gap-4 mb-6">
                                <div className="bg-green-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">Current</div>
                                    <div className="text-2xl font-bold text-green-600">
                                        R{agingBuckets.current.toLocaleString('en-ZA')}
                                    </div>
                                </div>
                                <div className="bg-yellow-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">1-30 Days</div>
                                    <div className="text-2xl font-bold text-yellow-600">
                                        R{agingBuckets['1-30'].toLocaleString('en-ZA')}
                                    </div>
                                </div>
                                <div className="bg-orange-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">31-60 Days</div>
                                    <div className="text-2xl font-bold text-orange-600">
                                        R{agingBuckets['31-60'].toLocaleString('en-ZA')}
                                    </div>
                                </div>
                                <div className="bg-red-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">61-90 Days</div>
                                    <div className="text-2xl font-bold text-red-600">
                                        R{agingBuckets['61-90'].toLocaleString('en-ZA')}
                                    </div>
                                </div>
                                <div className="bg-red-100 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">90+ Days</div>
                                    <div className="text-2xl font-bold text-red-800">
                                        R{agingBuckets['90+'].toLocaleString('en-ZA')}
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {invoices
                                            .filter(inv => inv.status !== 'Paid')
                                            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                                            .map(inv => {
                                                const daysOverdue = Math.floor((today - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
                                                return (
                                                    <tr key={inv.id}>
                                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.invoiceNumber}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-600">{inv.client}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-600">
                                                            {new Date(inv.dueDate).toLocaleDateString('en-ZA')}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                                            R{(inv.amountDue || inv.total).toLocaleString('en-ZA')}
                                                        </td>
                                                        <td className={`px-4 py-3 text-sm font-medium text-right ${
                                                            daysOverdue > 90 ? 'text-red-800' :
                                                            daysOverdue > 60 ? 'text-red-600' :
                                                            daysOverdue > 30 ? 'text-orange-600' :
                                                            daysOverdue > 0 ? 'text-yellow-600' : 'text-green-600'
                                                        }`}>
                                                            {daysOverdue > 0 ? daysOverdue : 'Current'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Revenue by Client */}
                    {reportType === 'client' && (
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Revenue by Client</h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoices</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Revenue</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% Paid</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {Object.entries(revenueByClient)
                                            .sort((a, b) => b[1].total - a[1].total)
                                            .map(([client, stats]) => (
                                                <tr key={client}>
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{client}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{stats.count}</td>
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                                        R{stats.total.toLocaleString('en-ZA')}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-green-600 text-right">
                                                        R{stats.paid.toLocaleString('en-ZA')}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-orange-600 text-right">
                                                        R{stats.pending.toLocaleString('en-ZA')}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                                        {((stats.paid / stats.total) * 100).toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Monthly Revenue */}
                    {reportType === 'monthly' && (
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Monthly Revenue Trend</h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoices</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoiced</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Collected</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Collection Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {Object.entries(monthlyRevenue)
                                            .sort((a, b) => b[0].localeCompare(a[0]))
                                            .map(([month, stats]) => (
                                                <tr key={month}>
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                        {new Date(month + '-01').toLocaleDateString('en-ZA', { 
                                                            year: 'numeric', 
                                                            month: 'long' 
                                                        })}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{stats.count}</td>
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                                        R{stats.invoiced.toLocaleString('en-ZA')}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-green-600 text-right">
                                                        R{stats.paid.toLocaleString('en-ZA')}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                                        {((stats.paid / stats.invoiced) * 100).toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Payment Trends */}
                    {reportType === 'payment' && (
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Trends & KPIs</h3>
                            <div className="grid grid-cols-4 gap-4 mb-6">
                                <div className="bg-blue-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">Avg Days to Pay</div>
                                    <div className="text-3xl font-bold text-blue-600">{paymentStats.avgDaysToPay}</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">On-Time Payments</div>
                                    <div className="text-3xl font-bold text-green-600">{paymentStats.onTimePayments}</div>
                                </div>
                                <div className="bg-red-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">Late Payments</div>
                                    <div className="text-3xl font-bold text-red-600">{paymentStats.latePayments}</div>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-600 mb-1">Total Collected</div>
                                    <div className="text-2xl font-bold text-purple-600">
                                        R{paymentStats.totalPaid.toLocaleString('en-ZA')}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white border rounded-lg p-6">
                                <h4 className="font-bold text-gray-800 mb-4">Payment Performance</h4>
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span>On-Time Rate</span>
                                            <span className="font-medium">
                                                {paidInvoices.length > 0 
                                                    ? ((paymentStats.onTimePayments / paidInvoices.length) * 100).toFixed(1)
                                                    : 0}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div 
                                                className="bg-green-600 h-2 rounded-full"
                                                style={{ 
                                                    width: paidInvoices.length > 0 
                                                        ? `${(paymentStats.onTimePayments / paidInvoices.length) * 100}%`
                                                        : '0%'
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span>Late Payment Rate</span>
                                            <span className="font-medium">
                                                {paidInvoices.length > 0 
                                                    ? ((paymentStats.latePayments / paidInvoices.length) * 100).toFixed(1)
                                                    : 0}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div 
                                                className="bg-red-600 h-2 rounded-full"
                                                style={{ 
                                                    width: paidInvoices.length > 0 
                                                        ? `${(paymentStats.latePayments / paidInvoices.length) * 100}%`
                                                        : '0%'
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InvoiceReports;
