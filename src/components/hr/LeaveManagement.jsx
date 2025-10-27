// Get React hooks from window
const { useState, useEffect } = React;

const LeaveManagement = () => {
    const [leaveApplications, setLeaveApplications] = useState([]);
    const [showApplicationModal, setShowApplicationModal] = useState(false);
    const [selectedApplication, setSelectedApplication] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterEmployee, setFilterEmployee] = useState('all');
    const [viewMode, setViewMode] = useState('list'); // list or calendar
    const [isStorageReady, setIsStorageReady] = useState(false);

    // South African leave types as per BCEA
    const leaveTypes = [
        { value: 'annual', label: 'Annual Leave', days: 21, color: 'blue' },
        { value: 'sick', label: 'Sick Leave', days: 30, color: 'red' },
        { value: 'family', label: 'Family Responsibility', days: 3, color: 'purple' },
        { value: 'maternity', label: 'Maternity Leave', days: 120, color: 'pink' },
        { value: 'paternity', label: 'Paternity Leave', days: 10, color: 'teal' },
        { value: 'study', label: 'Study Leave', days: 0, color: 'orange' },
        { value: 'unpaid', label: 'Unpaid Leave', days: 0, color: 'gray' }
    ];

    // South African public holidays 2025
    const publicHolidays = [
        { date: '2025-01-01', name: "New Year's Day" },
        { date: '2025-03-21', name: 'Human Rights Day' },
        { date: '2025-04-18', name: 'Good Friday' },
        { date: '2025-04-21', name: 'Family Day' },
        { date: '2025-04-27', name: 'Freedom Day' },
        { date: '2025-05-01', name: 'Workers Day' },
        { date: '2025-06-16', name: 'Youth Day' },
        { date: '2025-08-09', name: 'National Women\'s Day' },
        { date: '2025-09-24', name: 'Heritage Day' },
        { date: '2025-12-16', name: 'Day of Reconciliation' },
        { date: '2025-12-25', name: 'Christmas Day' },
        { date: '2025-12-26', name: 'Day of Goodwill' }
    ];

    // Wait for storage to be ready
    useEffect(() => {
        const checkStorage = () => {
            if (window.storage && typeof window.storage.getLeaveApplications === 'function') {
                console.log('✅ LeaveManagement: Storage is ready');
                setIsStorageReady(true);
                return true;
            }
            console.warn('⏳ LeaveManagement: Waiting for storage...');
            return false;
        };

        // Check immediately
        if (checkStorage()) return;

        // Check periodically
        const interval = setInterval(() => {
            if (checkStorage()) {
                clearInterval(interval);
            }
        }, 100);

        // Listen for storage ready event
        const handleStorageReady = () => {
            console.log('📡 LeaveManagement: Received storage ready event');
            checkStorage();
        };

        window.addEventListener('storageReady', handleStorageReady);

        return () => {
            clearInterval(interval);
            window.removeEventListener('storageReady', handleStorageReady);
        };
    }, []);

    // Load leave applications once storage is ready
    useEffect(() => {
        if (isStorageReady) {
            loadLeaveApplications();
        }
    }, [isStorageReady]);

    const loadLeaveApplications = () => {
        try {
            if (!window.storage || typeof window.storage.getLeaveApplications !== 'function') {
                console.error('❌ Storage not ready in loadLeaveApplications');
                return;
            }
            const saved = window.storage.getLeaveApplications() || [];
            console.log('✅ Loaded leave applications:', saved.length);
            setLeaveApplications(saved);
        } catch (error) {
            console.error('❌ Error loading leave applications:', error);
            setLeaveApplications([]);
        }
    };

    useEffect(() => {
        if (isStorageReady && window.storage && typeof window.storage.setLeaveApplications === 'function') {
            window.storage.setLeaveApplications(leaveApplications);
        }
    }, [leaveApplications, isStorageReady]);

    const handleSaveApplication = (applicationData) => {
        if (selectedApplication) {
            setLeaveApplications(leaveApplications.map(app =>
                app.id === selectedApplication.id ? { ...selectedApplication, ...applicationData } : app
            ));
        } else {
            const newApplication = {
                id: Date.now(),
                ...applicationData,
                status: 'pending',
                appliedDate: new Date().toISOString().split('T')[0],
                appliedBy: 'Current User' // In real app, get from auth
            };
            setLeaveApplications([...leaveApplications, newApplication]);
        }
        setShowApplicationModal(false);
        setSelectedApplication(null);
    };

    const handleApprove = (id) => {
        setLeaveApplications(leaveApplications.map(app =>
            app.id === id ? { ...app, status: 'approved', approvedDate: new Date().toISOString().split('T')[0] } : app
        ));
    };

    const handleReject = (id, reason) => {
        const rejectionReason = reason || prompt('Reason for rejection:');
        if (rejectionReason) {
            setLeaveApplications(leaveApplications.map(app =>
                app.id === id ? { 
                    ...app, 
                    status: 'rejected', 
                    rejectedDate: new Date().toISOString().split('T')[0],
                    rejectionReason 
                } : app
            ));
        }
    };

    const handleCancel = (id) => {
        if (confirm('Cancel this leave application?')) {
            setLeaveApplications(leaveApplications.map(app =>
                app.id === id ? { ...app, status: 'cancelled' } : app
            ));
        }
    };

    const calculateWorkingDays = (startDate, endDate) => {
        let count = 0;
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            // Skip weekends
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                // Check if it's a public holiday
                const dateStr = d.toISOString().split('T')[0];
                if (!publicHolidays.find(h => h.date === dateStr)) {
                    count++;
                }
            }
        }
        return count;
    };

    const filteredApplications = leaveApplications.filter(app => {
        const matchesStatus = filterStatus === 'all' || app.status === filterStatus;
        const matchesEmployee = filterEmployee === 'all' || app.employee === filterEmployee;
        return matchesStatus && matchesEmployee;
    });

    const statusColors = {
        pending: 'bg-yellow-100 text-yellow-800',
        approved: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800'
    };

    const getLeaveTypeInfo = (type) => {
        return leaveTypes.find(t => t.value === type) || leaveTypes[0];
    };

    // Show loading state while waiting for storage
    if (!isStorageReady) {
        return (
            <div className="space-y-4">
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-500 mb-3"></i>
                    <p className="text-sm text-gray-600">Loading leave management...</p>
                </div>
            </div>
        );
    }

    // Application Modal Component
    const ApplicationModal = () => {
        const [formData, setFormData] = useState(selectedApplication || {
            employee: '',
            leaveType: 'annual',
            startDate: '',
            endDate: '',
            reason: '',
            emergency: false
        });

        const workingDays = formData.startDate && formData.endDate 
            ? calculateWorkingDays(formData.startDate, formData.endDate)
            : 0;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-2xl">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {selectedApplication ? 'Edit Leave Application' : 'Apply for Leave'}
                        </h2>
                        <button 
                            onClick={() => {
                                setShowApplicationModal(false);
                                setSelectedApplication(null);
                            }}
                            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Employee *
                                </label>
                                <select
                                    value={formData.employee}
                                    onChange={(e) => setFormData({...formData, employee: e.target.value})}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    required
                                >
                                    <option value="">Select Employee</option>
                                    <option>Gareth Mauck</option>
                                    <option>David Buttemer</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Leave Type *
                                </label>
                                <select
                                    value={formData.leaveType}
                                    onChange={(e) => setFormData({...formData, leaveType: e.target.value})}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    {leaveTypes.map(type => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Start Date *
                                </label>
                                <input
                                    type="date"
                                    value={formData.startDate}
                                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    End Date *
                                </label>
                                <input
                                    type="date"
                                    value={formData.endDate}
                                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    required
                                />
                            </div>
                        </div>

                        {workingDays > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium text-blue-900">Working Days</p>
                                        <p className="text-[10px] text-blue-700">Excludes weekends and public holidays</p>
                                    </div>
                                    <div className="text-2xl font-bold text-blue-600">{workingDays}</div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Reason *
                            </label>
                            <textarea
                                value={formData.reason}
                                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows="3"
                                placeholder="Please provide a reason for your leave..."
                                required
                            ></textarea>
                        </div>

                        <div>
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.emergency}
                                    onChange={(e) => setFormData({...formData, emergency: e.target.checked})}
                                    className="mr-2"
                                />
                                <span className="text-xs text-gray-700">
                                    <i className="fas fa-exclamation-triangle text-red-500 mr-1"></i>
                                    This is an emergency leave request
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                        <button
                            onClick={() => {
                                setShowApplicationModal(false);
                                setSelectedApplication(null);
                            }}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleSaveApplication(formData)}
                            disabled={!formData.employee || !formData.startDate || !formData.endDate || !formData.reason}
                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i className="fas fa-paper-plane mr-1.5"></i>
                            Submit Application
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-base font-semibold text-gray-900">Leave Management</h2>
                    <p className="text-xs text-gray-600">Manage leave applications and approvals</p>
                </div>
                <button
                    onClick={() => setShowApplicationModal(true)}
                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                >
                    <i className="fas fa-plus mr-1.5"></i>
                    Apply for Leave
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Pending</p>
                    <p className="text-xl font-bold text-yellow-600">
                        {leaveApplications.filter(a => a.status === 'pending').length}
                    </p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Approved</p>
                    <p className="text-xl font-bold text-green-600">
                        {leaveApplications.filter(a => a.status === 'approved').length}
                    </p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Rejected</p>
                    <p className="text-xl font-bold text-red-600">
                        {leaveApplications.filter(a => a.status === 'rejected').length}
                    </p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Total Applications</p>
                    <p className="text-xl font-bold text-gray-900">
                        {leaveApplications.length}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex gap-2.5">
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="cancelled">Cancelled</option>
                    </select>

                    <select
                        value={filterEmployee}
                        onChange={(e) => setFilterEmployee(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Employees</option>
                        <option>Gareth Mauck</option>
                        <option>David Buttemer</option>
                    </select>
                </div>
            </div>

            {/* Applications Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Employee</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Leave Type</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Dates</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Days</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Status</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredApplications.length > 0 ? filteredApplications.map(app => {
                            const leaveTypeInfo = getLeaveTypeInfo(app.leaveType);
                            const workingDays = calculateWorkingDays(app.startDate, app.endDate);
                            
                            return (
                                <tr key={app.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2.5">
                                        <div className="text-sm font-medium text-gray-900">{app.employee}</div>
                                        <div className="text-[10px] text-gray-500">Applied: {app.appliedDate}</div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`px-2 py-0.5 text-[10px] rounded font-medium bg-${leaveTypeInfo.color}-100 text-${leaveTypeInfo.color}-800`}>
                                            {leaveTypeInfo.label}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-gray-900">
                                        {app.startDate} to {app.endDate}
                                    </td>
                                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900">
                                        {workingDays}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${statusColors[app.status]}`}>
                                            {app.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs">
                                        {app.status === 'pending' && (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleApprove(app.id)}
                                                    className="text-green-600 hover:text-green-700 p-1"
                                                    title="Approve"
                                                >
                                                    <i className="fas fa-check"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleReject(app.id)}
                                                    className="text-red-600 hover:text-red-700 p-1"
                                                    title="Reject"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>
                                        )}
                                        {(app.status === 'approved' || app.status === 'pending') && (
                                            <button
                                                onClick={() => handleCancel(app.id)}
                                                className="text-gray-600 hover:text-gray-700 p-1"
                                                title="Cancel"
                                            >
                                                <i className="fas fa-ban"></i>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                                    <i className="fas fa-calendar-times text-3xl mb-2"></i>
                                    <p className="text-sm">No leave applications found</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showApplicationModal && <ApplicationModal />}
        </div>
    );
};

// Make available globally
window.LeaveManagement = LeaveManagement;
console.log('✅ LeaveManagement component loaded');
