// Get React hooks from window
const { useState } = React;

const HR = () => {
    const [currentTab, setCurrentTab] = useState('employees');

    // Get HR components from window
    const EmployeeManagement = window.EmployeeManagement;
    const LeaveManagement = window.LeaveManagement;
    const LeaveBalance = window.LeaveBalance;
    const Attendance = window.Attendance;
    const Payroll = window.Payroll;

    const tabs = [
        { id: 'employees', label: 'Employees', icon: 'fa-users', component: EmployeeManagement },
        { id: 'leave', label: 'Leave Management', icon: 'fa-calendar-check', component: LeaveManagement },
        { id: 'balance', label: 'Leave Balances', icon: 'fa-chart-pie', component: LeaveBalance },
        { id: 'attendance', label: 'Attendance', icon: 'fa-clock', component: Attendance },
        { id: 'payroll', label: 'Payroll', icon: 'fa-money-bill-wave', component: Payroll }
    ];

    const renderContent = () => {
        const activeTab = tabs.find(t => t.id === currentTab);
        if (!activeTab || !activeTab.component) {
            return <div className="text-center py-12 text-gray-500">Loading...</div>;
        }
        
        const Component = activeTab.component;
        return <Component />;
    };

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Human Resources</h1>
                    <p className="text-xs text-gray-600 mt-0.5">Employee leave management and HR administration</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                        <p className="text-[10px] text-green-700 font-medium">South African BCEA Compliant</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-lg border border-gray-200">
                <div className="flex border-b border-gray-200">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setCurrentTab(tab.id)}
                            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                                currentTab === tab.id
                                    ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                            <i className={`fas ${tab.icon} mr-1.5`}></i>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="p-4">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.HR = HR;
