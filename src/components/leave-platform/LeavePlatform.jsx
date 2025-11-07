// Get React hooks from window
const { useState, useEffect } = React;

const LeavePlatform = () => {
    try {
        // Get auth hook safely
        const authHook = window.useAuth || (() => ({ user: null }));
        let user = null;
        try {
            const authResult = authHook();
            user = authResult?.user || authResult || null;
        } catch (e) {
            console.warn('⚠️ LeavePlatform: Error getting user from useAuth:', e);
            user = null;
        }
        
        const [currentTab, setCurrentTab] = useState('my-leave');
        const [loading, setLoading] = useState(false);
        const [leaveApplications, setLeaveApplications] = useState([]);
        const [leaveBalances, setLeaveBalances] = useState([]);
        const [employees, setEmployees] = useState([]);
        const [departments, setDepartments] = useState([]);
        const [leaveApprovers, setLeaveApprovers] = useState([]);
        const [birthdays, setBirthdays] = useState([]);
        const [calendarView, setCalendarView] = useState('month');
        
        console.log('✅ LeavePlatform component rendering, user:', user?.email || 'none');

    // South African leave types as per BCEA
    const leaveTypes = [
        { value: 'annual', label: 'Annual Leave', days: 21, color: 'blue' },
        { value: 'sick', label: 'Sick Leave', days: 30, color: 'red' },
        { value: 'family', label: 'Family Responsibility', days: 3, color: 'purple' },
        { value: 'maternity', label: 'Maternity Leave', days: 120, color: 'pink' },
        { value: 'paternity', label: 'Paternity Leave', days: 10, color: 'teal' },
        { value: 'study', label: 'Study Leave', days: 0, color: 'orange' },
        { value: 'unpaid', label: 'Unpaid Leave', days: 0, color: 'gray' },
        { value: 'compassionate', label: 'Compassionate Leave', days: 3, color: 'indigo' },
        { value: 'religious', label: 'Religious Holiday', days: 0, color: 'amber' }
    ];

    // Load data on mount - only essential data initially
    useEffect(() => {
        // Don't block rendering - load data in background
        if (window.storage?.getToken?.()) {
            loadEssentialData();
        } else {
            // Wait for storage to be ready
            const checkStorage = setInterval(() => {
                if (window.storage?.getToken?.()) {
                    clearInterval(checkStorage);
                    loadEssentialData();
                }
            }, 100);
            
            // Timeout after 5 seconds
            setTimeout(() => clearInterval(checkStorage), 5000);
        }
    }, []);

    // Load essential data first (applications and balances for current user)
    const loadEssentialData = async () => {
        try {
            const headers = getAuthHeaders();
            if (!headers.Authorization) {
                console.warn('⚠️ Leave Platform: No auth token available');
                return;
            }
            
            console.log('⚡ Leave Platform: Loading essential data...');
            const startTime = performance.now();
            
            // Only load what's needed for the initial "My Leave" tab
            const [appsResponse, balancesResponse] = await Promise.allSettled([
                fetch('/api/leave-platform/applications', { headers }).catch(e => {
                    console.warn('Leave applications fetch error:', e);
                    return { ok: false, status: 0 };
                }),
                fetch('/api/leave-platform/balances', { headers }).catch(e => {
                    console.warn('Leave balances fetch error:', e);
                    return { ok: false, status: 0 };
                })
            ]);

            if (appsResponse.status === 'fulfilled' && appsResponse.value.ok) {
                try {
                    const apps = await appsResponse.value.json();
                    setLeaveApplications(apps.applications || apps.data?.applications || []);
                    console.log(`✅ Loaded ${apps.applications?.length || apps.data?.applications?.length || 0} leave applications`);
                } catch (e) {
                    console.warn('Error parsing applications:', e);
                }
            } else if (appsResponse.value?.status === 401) {
                console.warn('⚠️ Leave Platform: Authentication failed for applications');
            }

            if (balancesResponse.status === 'fulfilled' && balancesResponse.value.ok) {
                try {
                    const balances = await balancesResponse.value.json();
                    setLeaveBalances(balances.balances || balances.data?.balances || []);
                    console.log(`✅ Loaded ${balances.balances?.length || balances.data?.balances?.length || 0} leave balances`);
                } catch (e) {
                    console.warn('Error parsing balances:', e);
                }
            } else if (balancesResponse.value?.status === 401) {
                console.warn('⚠️ Leave Platform: Authentication failed for balances');
            }

            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`⚡ Leave Platform: Essential data loaded (${loadTime}s)`);

            // Load remaining data in background (non-blocking)
            setTimeout(() => {
                loadRemainingData();
            }, 100);
        } catch (error) {
            console.error('Error loading essential data:', error);
        }
    };

    // Load remaining data in background
    const loadRemainingData = async () => {
        try {
            const headers = getAuthHeaders();
            if (!headers.Authorization) {
                console.warn('⚠️ Leave Platform: No auth token for remaining data');
                return;
            }
            
            console.log('⚡ Leave Platform: Loading remaining data in background...');
            const startTime = performance.now();
            
            const [employeesResponse, deptsResponse, approversResponse, birthdaysResponse] = await Promise.allSettled([
                fetch('/api/users', { headers }).catch(e => ({ ok: false, status: 0 })),
                fetch('/api/leave-platform/departments', { headers }).catch(e => ({ ok: false, status: 0 })),
                fetch('/api/leave-platform/approvers', { headers }).catch(e => ({ ok: false, status: 0 })),
                fetch('/api/leave-platform/birthdays', { headers }).catch(e => ({ ok: false, status: 0 }))
            ]);

            if (employeesResponse.status === 'fulfilled' && employeesResponse.value.ok) {
                try {
                    const users = await employeesResponse.value.json();
                    setEmployees(users.users || users.data?.users || []);
                    console.log(`✅ Loaded ${users.users?.length || users.data?.users?.length || 0} employees`);
                } catch (e) {
                    console.warn('Error parsing employees:', e);
                }
            }

            if (deptsResponse.status === 'fulfilled' && deptsResponse.value.ok) {
                try {
                    const depts = await deptsResponse.value.json();
                    setDepartments(depts.departments || depts.data?.departments || []);
                } catch (e) {
                    console.warn('Error parsing departments:', e);
                }
            }

            if (approversResponse.status === 'fulfilled' && approversResponse.value.ok) {
                try {
                    const approvers = await approversResponse.value.json();
                    setLeaveApprovers(approvers.approvers || approvers.data?.approvers || []);
                } catch (e) {
                    console.warn('Error parsing approvers:', e);
                }
            }

            if (birthdaysResponse.status === 'fulfilled' && birthdaysResponse.value.ok) {
                try {
                    const bdays = await birthdaysResponse.value.json();
                    setBirthdays(bdays.birthdays || bdays.data?.birthdays || []);
                } catch (e) {
                    console.warn('Error parsing birthdays:', e);
                }
            }

            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`⚡ Leave Platform: Remaining data loaded (${loadTime}s)`);
        } catch (error) {
            console.error('Error loading remaining data:', error);
        }
    };

    // Full data reload (for refresh/update actions)
    const loadData = async () => {
        setLoading(true);
        try {
            const headers = getAuthHeaders();
            const startTime = performance.now();
            
            // Load all data in parallel
            const [appsResponse, balancesResponse, employeesResponse, deptsResponse, approversResponse, birthdaysResponse] = await Promise.allSettled([
                fetch('/api/leave-platform/applications', { headers }),
                fetch('/api/leave-platform/balances', { headers }),
                fetch('/api/users', { headers }),
                fetch('/api/leave-platform/departments', { headers }),
                fetch('/api/leave-platform/approvers', { headers }),
                fetch('/api/leave-platform/birthdays', { headers })
            ]);

            // Process responses
            if (appsResponse.status === 'fulfilled' && appsResponse.value.ok) {
                const apps = await appsResponse.value.json();
                setLeaveApplications(apps.applications || apps.data?.applications || []);
            }

            if (balancesResponse.status === 'fulfilled' && balancesResponse.value.ok) {
                const balances = await balancesResponse.value.json();
                setLeaveBalances(balances.balances || balances.data?.balances || []);
            }

            if (employeesResponse.status === 'fulfilled' && employeesResponse.value.ok) {
                const users = await employeesResponse.value.json();
                setEmployees(users.users || users.data?.users || []);
            }

            if (deptsResponse.status === 'fulfilled' && deptsResponse.value.ok) {
                const depts = await deptsResponse.value.json();
                setDepartments(depts.departments || depts.data?.departments || []);
            }

            if (approversResponse.status === 'fulfilled' && approversResponse.value.ok) {
                const approvers = await approversResponse.value.json();
                setLeaveApprovers(approvers.approvers || approvers.data?.approvers || []);
            }

            if (birthdaysResponse.status === 'fulfilled' && birthdaysResponse.value.ok) {
                const bdays = await birthdaysResponse.value.json();
                setBirthdays(bdays.birthdays || bdays.data?.birthdays || []);
            }

            const endTime = performance.now();
            const loadTime = ((endTime - startTime) / 1000).toFixed(2);
            console.log(`⚡ Leave Platform: Data reloaded (${loadTime}s)`);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { id: 'my-leave', label: 'My Leave', icon: 'fa-calendar-check' },
        { id: 'apply', label: 'Apply for Leave', icon: 'fa-plus-circle' },
        { id: 'balances', label: 'Leave Balances', icon: 'fa-chart-pie' },
        { id: 'calendar', label: 'Leave Calendar', icon: 'fa-calendar' },
        { id: 'approvals', label: 'Approvals', icon: 'fa-check-circle' },
        { id: 'approvers', label: 'Leave Approvers', icon: 'fa-user-shield' },
        { id: 'birthdays', label: 'Birthdays', icon: 'fa-birthday-cake' },
        { id: 'import', label: 'Import Balances', icon: 'fa-upload' }
    ];

    const renderContent = () => {
        switch (currentTab) {
            case 'my-leave':
                return <MyLeaveView applications={leaveApplications} user={user} />;
            case 'apply':
                return <ApplyForLeaveView 
                    leaveTypes={leaveTypes}
                    employees={employees}
                    onSuccess={loadData}
                />;
            case 'balances':
                return <LeaveBalancesView 
                    balances={leaveBalances}
                    employees={employees}
                    onImport={loadData}
                />;
            case 'calendar':
                return <LeaveCalendarView 
                    applications={leaveApplications}
                    employees={employees}
                    view={calendarView}
                    onViewChange={setCalendarView}
                />;
            case 'approvals':
                return <ApprovalsView 
                    applications={leaveApplications}
                    user={user}
                    onUpdate={loadData}
                />;
            case 'approvers':
                return <ApproversView 
                    approvers={leaveApprovers}
                    departments={departments}
                    employees={employees}
                    onUpdate={loadData}
                />;
            case 'birthdays':
                return <BirthdaysView 
                    birthdays={birthdays}
                    employees={employees}
                    onUpdate={loadData}
                />;
            case 'import':
                return <ImportBalancesView 
                    employees={employees}
                    onImport={loadData}
                />;
            default:
                return <MyLeaveView applications={leaveApplications} user={user} />;
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Leave Platform</h2>
                    <p className="text-sm text-gray-600">Manage your leave applications and balances - BCEA Compliant</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200">
                    <nav className="flex -mb-px">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setCurrentTab(tab.id)}
                                className={`
                                    px-4 py-3 text-sm font-medium border-b-2 transition-colors
                                    ${currentTab === tab.id
                                        ? 'border-primary-500 text-primary-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }
                                `}
                            >
                                <i className={`fas ${tab.icon} mr-2`}></i>
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                    {loading && leaveApplications.length === 0 && leaveBalances.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                            <p className="mt-4 text-gray-600">Loading leave data...</p>
                        </div>
                    ) : (
                        renderContent()
                    )}
                </div>
            </div>
        </div>
    );
    } catch (error) {
        console.error('❌ LeavePlatform: Error rendering component:', error);
        return (
            <div className="p-8 text-center">
                <div className="text-red-600 mb-4">
                    <i className="fas fa-exclamation-triangle text-4xl mb-4"></i>
                    <h2 className="text-xl font-semibold mb-2">Error Loading Leave Platform</h2>
                    <p className="text-sm text-gray-600">{error.message || 'Unknown error'}</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }
};

// My Leave View
const MyLeaveView = ({ applications, user }) => {
    const myApplications = applications.filter(app => app.userId === user?.id || app.userEmail === user?.email);

    const statusColors = {
        pending: 'bg-yellow-100 text-yellow-800',
        approved: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800'
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">My Leave Applications</h3>
                <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                    <i className="fas fa-plus mr-2"></i>New Application
                </button>
            </div>

            {myApplications.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {myApplications.map(app => (
                                <tr key={app.id}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {app.leaveType}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(app.startDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(app.endDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {app.days}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[app.status] || statusColors.pending}`}>
                                            {app.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        {app.status === 'pending' && (
                                            <button className="text-red-600 hover:text-red-700">
                                                <i className="fas fa-times"></i> Cancel
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-12 text-gray-500">
                    <i className="fas fa-calendar-times text-4xl mb-4"></i>
                    <p>No leave applications found</p>
                </div>
            )}
        </div>
    );
};

// Apply for Leave View
const ApplyForLeaveView = ({ leaveTypes, employees, onSuccess }) => {
    const { user } = window.useAuth ? window.useAuth() : { user: null };
    const [formData, setFormData] = useState({
        leaveType: 'annual',
        startDate: '',
        endDate: '',
        reason: '',
        emergency: false
    });
    const [submitting, setSubmitting] = useState(false);

    const calculateWorkingDays = (startDate, endDate) => {
        if (!startDate || !endDate) return 0;
        let count = 0;
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                count++;
            }
        }
        return count;
    };

    const workingDays = calculateWorkingDays(formData.startDate, formData.endDate);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const headers = getAuthHeaders();
            const response = await fetch('/api/leave-platform/applications', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    ...formData,
                    days: workingDays,
                    userId: user?.id,
                    userEmail: user?.email,
                    userName: user?.name
                })
            });

            if (response.ok) {
                alert('Leave application submitted successfully!');
                setFormData({
                    leaveType: 'annual',
                    startDate: '',
                    endDate: '',
                    reason: '',
                    emergency: false
                });
                onSuccess();
            } else {
                alert('Failed to submit leave application');
            }
        } catch (error) {
            console.error('Error submitting application:', error);
            alert('Error submitting leave application');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl">
            <h3 className="text-lg font-semibold mb-4">Apply for Leave</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Leave Type *
                        </label>
                        <select
                            value={formData.leaveType}
                            onChange={(e) => setFormData({...formData, leaveType: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                            required
                        >
                            {leaveTypes.map(type => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Working Days
                        </label>
                        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                            <span className="text-2xl font-bold text-blue-600">{workingDays}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Start Date *
                        </label>
                        <input
                            type="date"
                            value={formData.startDate}
                            onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            End Date *
                        </label>
                        <input
                            type="date"
                            value={formData.endDate}
                            onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reason *
                    </label>
                    <textarea
                        value={formData.reason}
                        onChange={(e) => setFormData({...formData, reason: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        rows="4"
                        required
                    />
                </div>

                <div>
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            checked={formData.emergency}
                            onChange={(e) => setFormData({...formData, emergency: e.target.checked})}
                            className="mr-2"
                        />
                        <span className="text-sm text-gray-700">Emergency Leave</span>
                    </label>
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                        {submitting ? 'Submitting...' : 'Submit Application'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// Leave Balances View
const LeaveBalancesView = ({ balances, employees, onImport }) => {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Leave Balances</h3>
                <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                    <i className="fas fa-upload mr-2"></i>Import Balances
                </button>
            </div>

            {balances.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Used</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {balances.map(balance => (
                                <tr key={balance.id}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {balance.employeeName}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {balance.leaveType}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {balance.available}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {balance.used}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {balance.balance}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-12 text-gray-500">
                    <i className="fas fa-chart-pie text-4xl mb-4"></i>
                    <p>No leave balances found</p>
                </div>
            )}
        </div>
    );
};

// Leave Calendar View
const LeaveCalendarView = ({ applications, employees, view, onViewChange }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const approvedApplications = applications.filter(app => app.status === 'approved');

    // Simple calendar implementation
    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days = [];
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return (
            <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-2 text-center text-xs font-medium text-gray-500">
                        {day}
                    </div>
                ))}
                {days.map((day, idx) => {
                    if (day === null) return <div key={idx} className="p-2"></div>;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayApplications = approvedApplications.filter(app => {
                        const start = new Date(app.startDate);
                        const end = new Date(app.endDate);
                        const check = new Date(dateStr);
                        return check >= start && check <= end;
                    });
                    
                    return (
                        <div key={day} className="p-2 border border-gray-200 min-h-[60px]">
                            <div className="text-sm font-medium text-gray-900 mb-1">{day}</div>
                            {dayApplications.map(app => (
                                <div key={app.id} className="text-xs bg-blue-100 text-blue-800 rounded px-1 mb-1 truncate">
                                    {app.userName}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Leave Calendar</h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            const prev = new Date(currentDate);
                            prev.setMonth(prev.getMonth() - 1);
                            setCurrentDate(prev);
                        }}
                        className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        <i className="fas fa-chevron-left"></i>
                    </button>
                    <span className="px-4 py-1 text-sm font-medium">
                        {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                        onClick={() => {
                            const next = new Date(currentDate);
                            next.setMonth(next.getMonth() + 1);
                            setCurrentDate(next);
                        }}
                        className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        <i className="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
            {renderCalendar()}
        </div>
    );
};

// Helper function to get auth headers (accessible to all components)
const getAuthHeaders = () => {
    const token = window.storage?.getToken?.();
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
};

// Approvals View
const ApprovalsView = ({ applications, user, onUpdate }) => {
    const pendingApplications = applications.filter(app => app.status === 'pending');

    const handleApprove = async (id) => {
        try {
            const headers = getAuthHeaders();
            const response = await fetch(`/api/leave-platform/applications/${id}/approve`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ approvedBy: user?.id })
            });

            if (response.ok) {
                onUpdate();
            }
        } catch (error) {
            console.error('Error approving:', error);
        }
    };

    const handleReject = async (id, reason) => {
        try {
            const headers = getAuthHeaders();
            const response = await fetch(`/api/leave-platform/applications/${id}/reject`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ rejectedBy: user?.id, reason })
            });

            if (response.ok) {
                onUpdate();
            }
        } catch (error) {
            console.error('Error rejecting:', error);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">Pending Approvals</h3>
            {pendingApplications.length > 0 ? (
                <div className="space-y-3">
                    {pendingApplications.map(app => (
                        <div key={app.id} className="p-4 border border-gray-200 rounded-lg">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-medium">{app.userName}</h4>
                                    <p className="text-sm text-gray-600">{app.leaveType}</p>
                                    <p className="text-sm text-gray-500">
                                        {new Date(app.startDate).toLocaleDateString()} - {new Date(app.endDate).toLocaleDateString()}
                                    </p>
                                    <p className="text-sm text-gray-500 mt-2">{app.reason}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(app.id)}
                                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => {
                                            const reason = prompt('Reason for rejection:');
                                            if (reason) handleReject(app.id, reason);
                                        }}
                                        className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 text-gray-500">
                    <i className="fas fa-check-circle text-4xl mb-4"></i>
                    <p>No pending approvals</p>
                </div>
            )}
        </div>
    );
};

// Approvers View
const ApproversView = ({ approvers, departments, employees, onUpdate }) => {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Leave Approvers</h3>
                <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                    <i className="fas fa-plus mr-2"></i>Add Approver
                </button>
            </div>

            {approvers.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department/Team</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approver</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {approvers.map(approver => (
                                <tr key={approver.id}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {approver.department}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {approver.approverName}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <button className="text-red-600 hover:text-red-700">
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-12 text-gray-500">
                    <i className="fas fa-user-shield text-4xl mb-4"></i>
                    <p>No approvers configured</p>
                </div>
            )}
        </div>
    );
};

// Birthdays View
const BirthdaysView = ({ birthdays, employees, onUpdate }) => {
    const today = new Date();
    const currentMonth = today.getMonth();

    const upcomingBirthdays = birthdays.filter(bday => {
        const bdayDate = new Date(bday.date);
        return bdayDate.getMonth() >= currentMonth;
    }).slice(0, 10);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Birthdays</h3>
                <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                    <i className="fas fa-plus mr-2"></i>Add Birthday
                </button>
            </div>

            {upcomingBirthdays.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {upcomingBirthdays.map(bday => (
                        <div key={bday.id} className="p-4 border border-gray-200 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-medium">{bday.employeeName}</h4>
                                    <p className="text-sm text-gray-600">
                                        {new Date(bday.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                    </p>
                                </div>
                                <i className="fas fa-birthday-cake text-2xl text-pink-500"></i>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 text-gray-500">
                    <i className="fas fa-birthday-cake text-4xl mb-4"></i>
                    <p>No birthdays recorded</p>
                </div>
            )}
        </div>
    );
};

// Import Balances View
const ImportBalancesView = ({ employees, onImport }) => {
    const [file, setFile] = useState(null);
    const [importing, setImporting] = useState(false);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleImport = async () => {
        if (!file) return;
        setImporting(true);
        try {
            const token = window.storage?.getToken?.();
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/leave-platform/import-balances', {
                method: 'POST',
                headers,
                body: formData
            });

            if (response.ok) {
                alert('Leave balances imported successfully!');
                setFile(null);
                onImport();
            } else {
                alert('Failed to import leave balances');
            }
        } catch (error) {
            console.error('Error importing:', error);
            alert('Error importing leave balances');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="max-w-2xl space-y-4">
            <h3 className="text-lg font-semibold">Import Leave Balances</h3>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                    <i className="fas fa-cloud-upload-alt text-4xl text-gray-400 mb-4"></i>
                    <p className="text-sm text-gray-600 mb-2">
                        Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">
                        CSV or Excel files only
                    </p>
                </label>
            </div>
            {file && (
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">{file.name}</span>
                    <button
                        onClick={handleImport}
                        disabled={importing}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                        {importing ? 'Importing...' : 'Import'}
                    </button>
                </div>
            )}
        </div>
    );
};

// Make available globally
try {
    if (typeof window !== 'undefined') {
        window.LeavePlatform = LeavePlatform;
        console.log('✅ LeavePlatform component loaded and registered on window.LeavePlatform');
        console.log('✅ LeavePlatform component type:', typeof LeavePlatform);
        console.log('✅ LeavePlatform is function:', typeof LeavePlatform === 'function');
        
        // Dispatch event to notify that component is ready
        if (typeof window.dispatchEvent !== 'undefined') {
            try {
                window.dispatchEvent(new CustomEvent('leavePlatformComponentReady'));
                console.log('✅ LeavePlatform: Dispatched leavePlatformComponentReady event');
            } catch (e) {
                console.warn('⚠️ LeavePlatform: Failed to dispatch event:', e);
            }
        }
    } else {
        console.warn('⚠️ LeavePlatform: window object not available');
    }
} catch (error) {
    console.error('❌ LeavePlatform: Error registering component:', error);
    // Still try to register even if event dispatch fails
    if (typeof window !== 'undefined') {
        window.LeavePlatform = LeavePlatform;
    }
}

