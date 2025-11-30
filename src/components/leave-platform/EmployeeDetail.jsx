// Employee Detail Component - Full page view for employee HR and leave data
// Get React hooks from window - React should be available since this is loaded in component-loader
let ReactHooks = {};
try {
    if (typeof window !== 'undefined' && window.React) {
        const React = window.React;
        ReactHooks = {
            useState: React.useState,
            useEffect: React.useEffect,
            useCallback: React.useCallback
        };
    } else {
        throw new Error('React not available');
    }
} catch (e) {
    console.error('❌ EmployeeDetail: React not available:', e);
    // Fallback: create no-op functions that will be replaced when React loads
    ReactHooks = {
        useState: () => [null, () => {}],
        useEffect: () => {},
        useCallback: (fn) => fn
    };
}

const { useState, useEffect, useCallback } = ReactHooks;

const EmployeeDetail = (props) => {
    // Safely destructure props with defaults
    const { employeeId, onBack, user, isAdmin } = props || {};
    
    // Early return if required props are missing
    if (!employeeId) {
        console.warn('⚠️ EmployeeDetail: employeeId is required but not provided', props);
        return (
            <div className="text-center py-12">
                <p className="text-red-600">Error: Employee ID is required</p>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                        Go Back
                    </button>
                )}
            </div>
        );
    }
    
    const [employee, setEmployee] = useState(null);
    const [leaveBalances, setLeaveBalances] = useState([]);
    const [leaveApplications, setLeaveApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('overview');
    const [editing, setEditing] = useState(false);
    const [formData, setFormData] = useState({});

    const getAuthHeaders = useCallback(() => {
        const token = window.storage?.getToken?.();
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    }, []);

    const loadEmployeeData = useCallback(async () => {
        setLoading(true);
        try {
            const headers = getAuthHeaders();
            
            // Load employee/user data
            const userResponse = await fetch(`/api/users/${employeeId}`, { headers });
            if (userResponse.ok) {
                const userData = await userResponse.json();
                setEmployee(userData.data?.user || userData.user || null);
                setFormData(userData.data?.user || userData.user || {});
            }

            // Load leave balances
            const balancesResponse = await fetch('/api/leave-platform/balances', { headers });
            if (balancesResponse.ok) {
                const balancesData = await balancesResponse.json();
                const allBalances = balancesData.data?.balances || balancesData.balances || [];
                // Filter to this employee's balances
                const employeeBalances = allBalances.filter(b => b.userId === employeeId);
                setLeaveBalances(employeeBalances);
            }

            // Load leave applications
            const appsResponse = await fetch('/api/leave-platform/applications', { headers });
            if (appsResponse.ok) {
                const appsData = await appsResponse.json();
                const allApps = appsData.data?.applications || appsData.applications || [];
                // Filter to this employee's applications
                const employeeApps = allApps.filter(app => 
                    app.userId === employeeId || 
                    app.appliedById === employeeId ||
                    app.employeeId === employeeId
                );
                setLeaveApplications(employeeApps);
            }
        } catch (error) {
            console.error('❌ Error loading employee data:', error);
        } finally {
            setLoading(false);
        }
    }, [employeeId, getAuthHeaders]);

    useEffect(() => {
        if (employeeId) {
            loadEmployeeData();
        }
    }, [employeeId, loadEmployeeData]);

    const handleSave = async () => {
        if (!employee || !isAdmin) return;
        
        try {
            const headers = getAuthHeaders();
            
            // Prepare update data - only include valid fields that exist in the formData
            // and match the database schema
            const updateData = {};
            
            // Basic info
            if (formData.name !== undefined) updateData.name = formData.name;
            if (formData.phone !== undefined) updateData.phone = formData.phone;
            
            // Employment info
            if (formData.employeeNumber !== undefined) updateData.employeeNumber = formData.employeeNumber;
            if (formData.position !== undefined) updateData.position = formData.position;
            if (formData.jobTitle !== undefined) updateData.jobTitle = formData.jobTitle;
            if (formData.department !== undefined) updateData.department = formData.department;
            if (formData.employmentStatus !== undefined) updateData.employmentStatus = formData.employmentStatus;
            
            // Employment date - convert to proper format if provided
            if (formData.employmentDate !== undefined) {
                if (formData.employmentDate) {
                    // Ensure it's a valid date string
                    const date = new Date(formData.employmentDate);
                    if (!isNaN(date.getTime())) {
                        updateData.employmentDate = date.toISOString();
                    }
                } else {
                    updateData.employmentDate = null;
                }
            }
            
            // Financial info
            if (formData.salary !== undefined) {
                updateData.salary = formData.salary ? parseFloat(formData.salary) : null;
            }
            if (formData.taxNumber !== undefined) updateData.taxNumber = formData.taxNumber || null;
            if (formData.bankName !== undefined) updateData.bankName = formData.bankName || null;
            if (formData.accountNumber !== undefined) updateData.accountNumber = formData.accountNumber || null;
            if (formData.branchCode !== undefined) updateData.branchCode = formData.branchCode || null;
            
            // Personal info
            if (formData.idNumber !== undefined) updateData.idNumber = formData.idNumber || null;
            if (formData.address !== undefined) updateData.address = formData.address || null;
            if (formData.emergencyContact !== undefined) updateData.emergencyContact = formData.emergencyContact || null;
            
            
            const response = await fetch(`/api/users/${employeeId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(updateData)
            });

            if (response.ok) {
                const result = await response.json();
                setEmployee(result.data?.user || result.user || employee);
                setEditing(false);
                // Reload to ensure consistency
                loadEmployeeData();
                alert('Employee information saved successfully!');
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                console.error('❌ Save failed:', errorData);
                alert(`Failed to save: ${errorData.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('❌ Error saving employee:', error);
            alert(`Failed to save: ${error.message}`);
        }
    };

    const calculateTenure = (employmentDate) => {
        if (!employmentDate) return 'N/A';
        const start = new Date(employmentDate);
        const now = new Date();
        const years = now.getFullYear() - start.getFullYear();
        const months = now.getMonth() - start.getMonth();
        const totalMonths = years * 12 + months;
        
        if (totalMonths < 12) {
            return `${totalMonths} ${totalMonths === 1 ? 'month' : 'months'}`;
        }
        const y = Math.floor(totalMonths / 12);
        const m = totalMonths % 12;
        return m > 0 ? `${y}y ${m}m` : `${y} ${y === 1 ? 'year' : 'years'}`;
    };

    const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-ZA', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    };

    const formatCurrency = (amount) => {
        if (!amount) return 'N/A';
        return new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: 'ZAR'
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-4"></i>
                    <p className="text-gray-600">Loading employee data...</p>
                </div>
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="text-center py-12">
                <i className="fas fa-user-slash text-4xl text-gray-400 mb-4"></i>
                <p className="text-gray-600 mb-4">Employee not found</p>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        <i className="fas fa-arrow-left mr-2"></i>
                        Back to Employees
                    </button>
                )}
            </div>
        );
    }

    const sections = [
        { id: 'overview', label: 'Overview', icon: 'fa-user' },
        { id: 'employment', label: 'Employment', icon: 'fa-briefcase' },
        { id: 'leave', label: 'Leave & Balances', icon: 'fa-calendar' },
        { id: 'financial', label: 'Financial', icon: 'fa-money-bill' },
        { id: 'personal', label: 'Personal', icon: 'fa-id-card' }
    ];

    const renderOverview = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center">
                            <span className="text-primary-600 font-bold text-2xl">
                                {(employee.name || 'U').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">{employee.name || 'Unnamed Employee'}</h2>
                            <p className="text-gray-600">{employee.email}</p>
                            <p className="text-sm text-gray-500 mt-1">
                                {employee.employeeNumber && `Employee #${employee.employeeNumber}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <button
                                onClick={() => setEditing(!editing)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                <i className={`fas ${editing ? 'fa-times' : 'fa-edit'} mr-2`}></i>
                                {editing ? 'Cancel' : 'Edit'}
                            </button>
                        )}
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                <i className="fas fa-arrow-left mr-2"></i>
                                Back
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 uppercase mb-1">Status</p>
                        <p className={`text-sm font-semibold ${
                            (employee.status === 'active' || employee.employmentStatus === 'Active') 
                                ? 'text-green-600' 
                                : 'text-gray-600'
                        }`}>
                            {employee.employmentStatus || employee.status || 'Active'}
                        </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 uppercase mb-1">Role</p>
                        <p className="text-sm font-semibold text-gray-900 capitalize">
                            {employee.role || 'N/A'}
                        </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 uppercase mb-1">Department</p>
                        <p className="text-sm font-semibold text-gray-900">
                            {employee.department || 'N/A'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        <i className="fas fa-calendar-check mr-2 text-primary-600"></i>
                        Leave Summary
                    </h3>
                    {leaveBalances.length > 0 ? (
                        <div className="space-y-3">
                            {leaveBalances.map(balance => (
                                <div key={balance.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                                    <span className="text-sm font-medium text-gray-700">{balance.leaveType}</span>
                                    <div className="text-right">
                                        <span className="text-sm text-gray-600">
                                            {balance.used || 0} / {balance.available || 0} days
                                        </span>
                                        <span className="ml-2 text-sm font-semibold text-primary-600">
                                            {balance.balance || 0} remaining
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">No leave balances recorded</p>
                    )}
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        <i className="fas fa-clock mr-2 text-primary-600"></i>
                        Employment Details
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Start Date</span>
                            <span className="text-sm font-medium text-gray-900">
                                {formatDate(employee.employmentDate)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Tenure</span>
                            <span className="text-sm font-medium text-gray-900">
                                {calculateTenure(employee.employmentDate)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Position</span>
                            <span className="text-sm font-medium text-gray-900">
                                {employee.position || employee.jobTitle || 'N/A'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderEmployment = () => (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Employment Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Employee Number
                    </label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.employeeNumber || ''}
                            onChange={(e) => setFormData({...formData, employeeNumber: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.employeeNumber || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Position
                    </label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.position || formData.jobTitle || ''}
                            onChange={(e) => setFormData({...formData, position: e.target.value, jobTitle: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.position || employee.jobTitle || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Department
                    </label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.department || ''}
                            onChange={(e) => setFormData({...formData, department: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.department || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Employment Date
                    </label>
                    {editing ? (
                        <input
                            type="date"
                            value={formData.employmentDate ? new Date(formData.employmentDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => setFormData({...formData, employmentDate: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{formatDate(employee.employmentDate)}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Employment Status
                    </label>
                    {editing ? (
                        <select
                            value={formData.employmentStatus || 'Active'}
                            onChange={(e) => setFormData({...formData, employmentStatus: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="Active">Active</option>
                            <option value="On Leave">On Leave</option>
                            <option value="Suspended">Suspended</option>
                            <option value="Resigned">Resigned</option>
                        </select>
                    ) : (
                        <p className="text-sm text-gray-900">{employee.employmentStatus || 'Active'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tenure
                    </label>
                    <p className="text-sm text-gray-900">{calculateTenure(employee.employmentDate)}</p>
                </div>
            </div>
            {editing && (
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        <i className="fas fa-save mr-2"></i>
                        Save Changes
                    </button>
                </div>
            )}
        </div>
    );

    const renderLeave = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Leave Balances</h3>
                {leaveBalances.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Used</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {leaveBalances.map(balance => (
                                    <tr key={balance.id}>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{balance.leaveType}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{balance.available || 0}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{balance.used || 0}</td>
                                        <td className="px-4 py-3 text-sm font-semibold text-primary-600">{balance.balance || 0}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{balance.year || new Date().getFullYear()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No leave balances recorded</p>
                )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Leave Applications</h3>
                {leaveApplications.length > 0 ? (
                    <div className="space-y-4">
                        {leaveApplications.slice(0, 10).map(app => (
                            <div key={app.id} className="border border-gray-200 rounded-lg p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <span className="text-sm font-medium text-gray-900">{app.leaveType || 'Leave'}</span>
                                        <span className={`ml-2 px-2 py-1 text-xs rounded ${
                                            app.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                            app.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                            app.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {app.status || 'Pending'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {formatDate(app.startDate)} - {formatDate(app.endDate)}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-600">
                                    {app.days || 0} day(s) • {formatDate(app.appliedDate || app.createdAt)}
                                </p>
                                {app.reason && (
                                    <p className="text-xs text-gray-500 mt-1">{app.reason}</p>
                                )}
                            </div>
                        ))}
                        {leaveApplications.length > 10 && (
                            <p className="text-sm text-gray-500 text-center">
                                Showing 10 of {leaveApplications.length} applications
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No leave applications found</p>
                )}
            </div>
        </div>
    );

    const renderFinancial = () => (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Financial Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Salary</label>
                    {editing ? (
                        <input
                            type="number"
                            value={formData.salary || 0}
                            onChange={(e) => setFormData({...formData, salary: parseFloat(e.target.value) || 0})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{formatCurrency(employee.salary)}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tax Number</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.taxNumber || ''}
                            onChange={(e) => setFormData({...formData, taxNumber: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.taxNumber || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.bankName || ''}
                            onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.bankName || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.accountNumber || ''}
                            onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.accountNumber || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Branch Code</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.branchCode || ''}
                            onChange={(e) => setFormData({...formData, branchCode: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.branchCode || 'N/A'}</p>
                    )}
                </div>
            </div>
            {editing && (
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        <i className="fas fa-save mr-2"></i>
                        Save Changes
                    </button>
                </div>
            )}
        </div>
    );

    const renderPersonal = () => (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.name || ''}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.name || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <p className="text-sm text-gray-900">{employee.email || 'N/A'}</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.phone || ''}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.phone || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">ID Number</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.idNumber || ''}
                            onChange={(e) => setFormData({...formData, idNumber: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.idNumber || 'N/A'}</p>
                    )}
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                    {editing ? (
                        <textarea
                            value={formData.address || ''}
                            onChange={(e) => setFormData({...formData, address: e.target.value})}
                            rows="3"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.address || 'N/A'}</p>
                    )}
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Contact</label>
                    {editing ? (
                        <textarea
                            value={formData.emergencyContact || ''}
                            onChange={(e) => setFormData({...formData, emergencyContact: e.target.value})}
                            rows="2"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    ) : (
                        <p className="text-sm text-gray-900">{employee.emergencyContact || 'N/A'}</p>
                    )}
                </div>
            </div>
            {editing && (
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        <i className="fas fa-save mr-2"></i>
                        Save Changes
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Section Navigation */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap gap-2">
                    {sections.map(section => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                activeSection === section.id
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <i className={`fas ${section.icon} mr-2`}></i>
                            {section.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            {activeSection === 'overview' && renderOverview()}
            {activeSection === 'employment' && renderEmployment()}
            {activeSection === 'leave' && renderLeave()}
            {activeSection === 'financial' && renderFinancial()}
            {activeSection === 'personal' && renderPersonal()}
        </div>
    );
};

// Export for use in LeavePlatform
// Wrap in IIFE to ensure proper loading
(function() {
    if (typeof window !== 'undefined') {
        window.EmployeeDetail = EmployeeDetail;
        
        // Dispatch event to notify that component is loaded
        if (typeof window.dispatchEvent !== 'undefined') {
            window.dispatchEvent(new CustomEvent('componentLoaded', { 
                detail: { component: 'EmployeeDetail' } 
            }));
        }
    }
})();

