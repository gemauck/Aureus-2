// Get React hooks from window
const { useState } = React;

const HR = () => {
    const { user: currentUser } = window.useAuth ? window.useAuth() : { user: null };
    
    // Check if current user is admin (case-insensitive) - strict check
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
    
    // Show access denied message if user is not admin
    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">You need administrator privileges to access the HR page.</p>
                    <button
                        onClick={() => {
                            // Navigate to dashboard
                            window.dispatchEvent(new CustomEvent('navigateToPage', { detail: { page: 'dashboard' } }));
                        }}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }
    
    const [currentTab, setCurrentTab] = useState('employees');

    // Get HR components from window
    const EmployeeManagement = window.EmployeeManagement;
    const LeaveManagement = window.LeaveManagement;
    const LeaveBalance = window.LeaveBalance;
    const Attendance = window.Attendance;
    const Payroll = window.Payroll;

    // Log component availability
    React.useEffect(() => {
        console.log('🔄 HR: Checking component availability', {
            EmployeeManagement: !!EmployeeManagement,
            LeaveManagement: !!LeaveManagement,
            LeaveBalance: !!LeaveBalance,
            Attendance: !!Attendance,
            Payroll: !!Payroll
        });
    }, []);

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
            console.error('❌ HR: Component not available for tab:', currentTab);
            return (
                <div className="text-center py-12 text-gray-500">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Component Not Available</h3>
                        <p className="text-sm text-yellow-600 mb-3">
                            The {activeTab?.label || currentTab} component is not loaded.
                        </p>
                        <p className="text-xs text-yellow-500">
                            Check the browser console for more details.
                        </p>
                    </div>
                </div>
            );
        }
        
        try {
            const Component = activeTab.component;
            return <Component />;
        } catch (error) {
            console.error('❌ HR: Error rendering component:', error);
            return (
                <div className="text-center py-12 text-gray-500">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Component</h3>
                        <p className="text-sm text-red-600 mb-3">
                            There was an error loading the {activeTab.label} component.
                        </p>
                        <p className="text-xs text-red-500 mb-3">Error: {error.message}</p>
                        <button 
                            onClick={() => window.location.reload()}
                            className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm font-medium"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }
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
