// Get React hooks from window - React should be available since this is loaded in core-entry.js
// Wrap in try-catch to handle cases where React isn't loaded yet
let ReactHooks = {};
try {
    if (typeof window !== 'undefined' && window.React) {
        const React = window.React;
        ReactHooks = {
            useState: React.useState,
            useEffect: React.useEffect,
            useMemo: React.useMemo,
            useCallback: React.useCallback
        };
    } else {
        throw new Error('React not available');
    }
} catch (e) {
    console.error('❌ LeavePlatform: React not available:', e);
    // Fallback: create no-op functions that will be replaced when React loads
    ReactHooks = {
        useState: () => [null, () => {}],
        useEffect: () => {},
        useMemo: (fn) => fn(),
        useCallback: (fn) => fn()
    };
}

const { useState, useEffect, useMemo, useCallback } = ReactHooks;

const matchUserRecord = (record, user) => {
    if (!record || !user) return false;
    const userId = user.id != null ? String(user.id) : null;
    const userEmail = user.email ? String(user.email).toLowerCase() : null;

    const candidateIds = [
        record.userId,
        record.user_id,
        record.employeeId,
        record.employee_id,
        record.appliedById,
        record.applied_by_id
    ]
        .filter(Boolean)
        .map(String);

    if (userId && candidateIds.includes(userId)) {
        return true;
    }

    const candidateEmails = [
        record.userEmail,
        record.user_email,
        record.employeeEmail,
        record.employee_email,
        record.appliedByEmail,
        record.applied_by_email
    ]
        .filter(Boolean)
        .map(email => String(email).toLowerCase());

    if (userEmail && candidateEmails.includes(userEmail)) {
        return true;
    }

    if (record.employee && user.name) {
        return String(record.employee).toLowerCase() === String(user.name).toLowerCase();
    }

    return false;
};

const formatDisplayDate = (value, options = {}) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', ...options });
};

const computeUpcomingBirthdays = (birthdays = [], limit = 6) => {
    const today = new Date();
    return birthdays
        .map(birthday => {
            if (!birthday?.date) return null;
            const rawDate = new Date(birthday.date);
            if (Number.isNaN(rawDate.getTime())) return null;
            const nextOccurrence = new Date(today.getFullYear(), rawDate.getMonth(), rawDate.getDate());
            if (nextOccurrence < today) {
                nextOccurrence.setFullYear(nextOccurrence.getFullYear() + 1);
            }
            return { ...birthday, nextOccurrence };
        })
        .filter(Boolean)
        .sort((a, b) => a.nextOccurrence - b.nextOccurrence)
        .slice(0, limit);
};

const getApplicationDays = (application, calculateWorkingDays) => {
    if (!application) return 0;
    if (typeof application.days === 'number' && !Number.isNaN(application.days)) {
        return application.days;
    }
    return calculateWorkingDays(application.startDate, application.endDate);
};

const LeavePlatform = ({ initialTab = 'overview' } = {}) => {
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
        
        const [currentTab, setCurrentTab] = useState(initialTab);
        const [loading, setLoading] = useState(false);
        const [leaveApplications, setLeaveApplications] = useState([]);
        const [leaveBalances, setLeaveBalances] = useState([]);
        const [employees, setEmployees] = useState([]);
        const [departments, setDepartments] = useState([]);
        const [leaveApprovers, setLeaveApprovers] = useState([]);
        const [birthdays, setBirthdays] = useState([]);
        const [calendarView, setCalendarView] = useState('month');
        
        // Employee management state
        const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
        const [employeeSortConfig, setEmployeeSortConfig] = useState({ key: null, direction: 'asc' });
        const [selectedEmployee, setSelectedEmployee] = useState(null);
        const [showEmployeeModal, setShowEmployeeModal] = useState(false);
        
        console.log('✅ LeavePlatform component rendering, user:', user?.email || 'none');
        useEffect(() => {
            setCurrentTab(initialTab);
        }, [initialTab]);

        useEffect(() => {
            const handleTabEvent = (event) => {
                if (event.detail?.tab) {
                    setCurrentTab(event.detail.tab);
                }
            };
            window.addEventListener('leavePlatform:setTab', handleTabEvent);
            return () => window.removeEventListener('leavePlatform:setTab', handleTabEvent);
        }, []);

        const leaveUtils = window.leaveUtils || {};
        const EmployeeManagementComponent = useMemo(() => window.EmployeeManagement, []);
        const isAdmin = user?.role?.toLowerCase() === 'admin';

        // South African BCEA leave types (centralised in leaveUtils)
        const leaveTypes = leaveUtils.BCEA_LEAVE_TYPES || [
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

        const leaveTypeBadgeClasses = {
            blue: 'bg-blue-100 text-blue-800',
            red: 'bg-red-100 text-red-800',
            purple: 'bg-purple-100 text-purple-800',
            pink: 'bg-pink-100 text-pink-800',
            teal: 'bg-teal-100 text-teal-800',
            orange: 'bg-orange-100 text-orange-800',
            gray: 'bg-gray-100 text-gray-800',
            indigo: 'bg-indigo-100 text-indigo-800',
            amber: 'bg-amber-100 text-amber-800',
            default: 'bg-gray-100 text-gray-800'
        };

        const statusColors = leaveUtils.STATUS_COLORS || {
            pending: 'bg-yellow-100 text-yellow-800',
            approved: 'bg-green-100 text-green-800',
            rejected: 'bg-red-100 text-red-800',
            cancelled: 'bg-gray-100 text-gray-800'
        };

        const getStatusLabel = leaveUtils.getStatusLabel || ((status = '') => status.charAt(0).toUpperCase() + status.slice(1));
        const getLeaveTypeInfo = leaveUtils.getLeaveTypeInfo || ((type) => leaveTypes.find(t => t.value === type) || leaveTypes[0]);
        const getLeaveTypeBadgeClass = (typeInfo) => leaveTypeBadgeClasses[typeInfo?.color] || leaveTypeBadgeClasses.default;

        const calculateWorkingDays = useCallback((startDate, endDate) => {
            if (leaveUtils.calculateWorkingDays) {
                return leaveUtils.calculateWorkingDays(startDate, endDate, { excludePublicHolidays: true });
            }
            if (!startDate || !endDate) return 0;
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
                return 0;
            }
            let count = 0;
            const cursor = new Date(start);
            while (cursor <= end) {
                const day = cursor.getDay();
                if (day !== 0 && day !== 6) {
                    count += 1;
                }
                cursor.setDate(cursor.getDate() + 1);
            }
            return count;
        }, [leaveUtils]);

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
            console.log('🔍 Leave Platform: loadRemainingData called');
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
                    const employeesData = users.users || users.data?.users || [];
                    setEmployees(employeesData);
                    console.log(`✅ Loaded ${employeesData.length} employees`);
                    if (employeesData.length === 0) {
                        console.warn('⚠️ Leave Platform: No employees found in API response. Response structure:', users);
                    }
                } catch (e) {
                    console.error('❌ Error parsing employees response:', e);
                    console.error('Response status:', employeesResponse.value?.status);
                    setEmployees([]);
                }
            } else {
                // Log error details when API call fails
                if (employeesResponse.status === 'fulfilled') {
                    console.error('❌ Failed to load employees. Response status:', employeesResponse.value?.status);
                    try {
                        const errorData = await employeesResponse.value?.json?.();
                        console.error('Error details:', errorData);
                    } catch (e) {
                        // Response might not be JSON
                    }
                } else {
                    console.error('❌ Employees API call rejected:', employeesResponse.reason);
                }
                setEmployees([]);
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
        const loadData = useCallback(async ({ silent = false } = {}) => {
            if (!silent) {
        setLoading(true);
            }
        try {
            const headers = getAuthHeaders();
            const startTime = performance.now();
            
            const [appsResponse, balancesResponse, employeesResponse, deptsResponse, approversResponse, birthdaysResponse] = await Promise.allSettled([
                fetch('/api/leave-platform/applications', { headers }),
                fetch('/api/leave-platform/balances', { headers }),
                fetch('/api/users', { headers }),
                fetch('/api/leave-platform/departments', { headers }),
                fetch('/api/leave-platform/approvers', { headers }),
                fetch('/api/leave-platform/birthdays', { headers })
            ]);

                const parseArray = async (result, keys = []) => {
                    if (result.status === 'fulfilled' && result.value?.ok) {
                        try {
                            const json = await result.value.json();
                            for (const keyPath of keys) {
                                const value = keyPath.split('.').reduce((acc, key) => acc?.[key], json);
                                if (Array.isArray(value)) {
                                    return value;
                                }
                            }
                            if (Array.isArray(json)) {
                                return json;
                            }
                        } catch (err) {
                            console.warn('LeavePlatform: Failed to parse response payload', err);
                        }
                    } else if (result.status === 'fulfilled') {
                        console.warn('LeavePlatform: Request failed', result.value?.status);
                    } else {
                        console.warn('LeavePlatform: Request rejected', result.reason);
                    }
                    return [];
                };

                const applications = await parseArray(appsResponse, ['applications', 'data.applications']);
                if (applications.length) {
                    setLeaveApplications(applications);
                }

                const balances = await parseArray(balancesResponse, ['balances', 'data.balances']);
                if (balances.length || balancesResponse.status === 'fulfilled') {
                    setLeaveBalances(balances);
                }

                const users = await parseArray(employeesResponse, ['users', 'data.users']);
                if (users.length || employeesResponse.status === 'fulfilled') {
                    setEmployees(users);
                    console.log(`✅ Reloaded ${users.length} employees`);
                    if (users.length === 0 && employeesResponse.status === 'fulfilled' && employeesResponse.value?.ok) {
                        console.warn('⚠️ Leave Platform: No employees found after reload');
                    }
                }

                const depts = await parseArray(deptsResponse, ['departments', 'data.departments']);
                if (depts.length || deptsResponse.status === 'fulfilled') {
                    setDepartments(depts);
                }

                const approvers = await parseArray(approversResponse, ['approvers', 'data.approvers']);
                if (approvers.length || approversResponse.status === 'fulfilled') {
                    setLeaveApprovers(approvers);
                }

                const bdays = await parseArray(birthdaysResponse, ['birthdays', 'data.birthdays']);
                if (bdays.length || birthdaysResponse.status === 'fulfilled') {
                    setBirthdays(bdays);
            }

            const endTime = performance.now();
            const loadTime = ((endTime - startTime) / 1000).toFixed(2);
                console.log(`⚡ Leave Platform: Data loaded (${loadTime}s)`);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
                if (!silent) {
            setLoading(false);
        }
            }
        }, []);

        const updateLocalApplication = useCallback((id, updates = {}) => {
            setLeaveApplications(prev => prev.map(app => app.id === id ? { ...app, ...updates } : app));
        }, []);

        const mutateApplication = useCallback(async (id, action, payload = {}, { successMessage, failureMessage, fallbackStatus } = {}) => {
            try {
                const headers = getAuthHeaders();
                if (!headers.Authorization) {
                    alert('You must be logged in to manage leave requests.');
                    return false;
                }

                const endpoint = `/api/leave-platform/applications/${id}/${action}`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    if (successMessage) {
                        console.log(successMessage);
                    }
                    await loadData({ silent: true });
                    return true;
                }

                const errorPayload = await response.json().catch(() => ({}));
                console.warn(`LeavePlatform: ${action} request failed`, response.status, errorPayload);
                if (failureMessage) {
                    alert(failureMessage);
                }
            } catch (mutationError) {
                console.error(`LeavePlatform: Error during ${action}`, mutationError);
                if (failureMessage) {
                    alert(failureMessage);
                }
            }

            if (fallbackStatus) {
                updateLocalApplication(id, fallbackStatus);
            }
            return false;
        }, [loadData, updateLocalApplication]);

        const handleApprove = useCallback((id) => mutateApplication(
            id,
            'approve',
            { approvedBy: user?.id },
            {
                successMessage: 'Leave application approved',
                failureMessage: 'Failed to approve leave request',
                fallbackStatus: { status: 'approved' }
            }
        ), [mutateApplication, user?.id]);

        const handleReject = useCallback((id, reason) => {
            if (!reason) return false;
            return mutateApplication(
                id,
                'reject',
                { rejectedBy: user?.id, reason },
                {
                    successMessage: 'Leave application rejected',
                    failureMessage: 'Failed to reject leave request',
                    fallbackStatus: { status: 'rejected', rejectionReason: reason }
                }
            );
        }, [mutateApplication, user?.id]);

        const handleCancel = useCallback((id, opts = {}) => mutateApplication(
            id,
            'cancel',
            { cancelledBy: user?.id, ...opts },
            {
                successMessage: 'Leave application cancelled',
                failureMessage: 'Failed to cancel leave application',
                fallbackStatus: { status: 'cancelled' }
            }
        ), [mutateApplication, user?.id]);

        const handleEdit = useCallback(async (application) => {
            return application; // Return application for editing
        }, []);

        const handleUpdate = useCallback(async (id, updates = {}) => {
            try {
                const headers = getAuthHeaders();
                if (!headers.Authorization) {
                    alert('You must be logged in to update leave requests.');
                    return false;
                }

                const endpoint = `/api/leave-platform/applications/${id}`;
                const response = await fetch(endpoint, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify(updates)
                });

                if (response.ok) {
                    const result = await response.json();
                    await loadData({ silent: true });
                    return true;
                }

                const errorPayload = await response.json().catch(() => ({}));
                console.warn('LeavePlatform: Update request failed', response.status, errorPayload);
                alert(errorPayload.message || 'Failed to update leave application');
                return false;
            } catch (error) {
                console.error('LeavePlatform: Error updating application', error);
                alert('Error updating leave application');
                return false;
            }
        }, [loadData]);

        const handleDelete = useCallback(async (id) => {
            if (!confirm('Are you sure you want to delete this leave application? This action cannot be undone.')) {
                return false;
            }

            try {
                const headers = getAuthHeaders();
                if (!headers.Authorization) {
                    alert('You must be logged in to delete leave requests.');
                    return false;
                }

                const endpoint = `/api/leave-platform/applications/${id}`;
                const response = await fetch(endpoint, {
                    method: 'DELETE',
                    headers
                });

                if (response.ok) {
                    await loadData({ silent: true });
                    return true;
                }

                const errorPayload = await response.json().catch(() => ({}));
                console.warn('LeavePlatform: Delete request failed', response.status, errorPayload);
                alert(errorPayload.message || 'Failed to delete leave application');
                return false;
            } catch (error) {
                console.error('LeavePlatform: Error deleting application', error);
                alert('Error deleting leave application');
                return false;
            }
        }, [loadData]);

        const tabs = useMemo(() => {
            const sharedTabs = [
                { id: 'overview', label: 'Overview', icon: 'fa-clipboard-list' },
        { id: 'my-leave', label: 'My Leave', icon: 'fa-calendar-check' },
        { id: 'apply', label: 'Apply for Leave', icon: 'fa-plus-circle' },
        { id: 'balances', label: 'Leave Balances', icon: 'fa-chart-pie' },
        { id: 'calendar', label: 'Leave Calendar', icon: 'fa-calendar' },
                { id: 'birthdays', label: 'Birthdays', icon: 'fa-birthday-cake' }
            ];

            if (isAdmin) {
                sharedTabs.splice(1, 0, { id: 'employees', label: 'Employees', icon: 'fa-users' });
                sharedTabs.splice(3, 0, { id: 'team', label: 'Team Leave', icon: 'fa-people-arrows' });
                sharedTabs.push(
        { id: 'approvals', label: 'Approvals', icon: 'fa-check-circle' },
                    { id: 'approvers', label: 'Approvers', icon: 'fa-user-shield' },
        { id: 'import', label: 'Import Balances', icon: 'fa-upload' }
                );
            }

            return sharedTabs;
        }, [isAdmin]);

        // Employee filtering and sorting - moved to top level (hooks must be at component level)
        const filteredAndSortedEmployees = useMemo(() => {
            let filtered = employees.filter(emp => {
                const searchLower = employeeSearchTerm.toLowerCase();
                return (
                    (emp.name || '').toLowerCase().includes(searchLower) ||
                    (emp.email || '').toLowerCase().includes(searchLower) ||
                    (emp.role || '').toLowerCase().includes(searchLower) ||
                    (emp.employeeNumber || '').toLowerCase().includes(searchLower) ||
                    (emp.department || '').toLowerCase().includes(searchLower)
                );
            });
            
            if (employeeSortConfig.key) {
                filtered = [...filtered].sort((a, b) => {
                    const aVal = a[employeeSortConfig.key] || '';
                    const bVal = b[employeeSortConfig.key] || '';
                    const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
                    return employeeSortConfig.direction === 'asc' ? comparison : -comparison;
                });
            }
            
            return filtered;
        }, [employees, employeeSearchTerm, employeeSortConfig]);

        const handleSortEmployees = useCallback((key) => {
            setEmployeeSortConfig(prev => ({
                key,
                direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
            }));
        }, []);

        const handleEmployeeClick = useCallback((employee) => {
            setSelectedEmployee(employee);
            setShowEmployeeModal(true);
        }, []);

        const handleSaveEmployee = useCallback(async (employeeData) => {
            if (!selectedEmployee) return;
            
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    throw new Error('No authentication token available');
                }
                
                const response = await fetch('/api/users', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        userId: selectedEmployee.id,
                        ...employeeData
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    const updatedEmployees = employees.map(emp =>
                        emp.id === selectedEmployee.id ? (result.data?.user || { ...emp, ...employeeData }) : emp
                    );
                    setEmployees(updatedEmployees);
                    setShowEmployeeModal(false);
                    setSelectedEmployee(null);
                    
                    // Reload data to ensure consistency
                    loadData({ silent: true });
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to update employee');
                }
            } catch (error) {
                console.error('❌ Error saving employee:', error);
                alert(`Failed to save employee: ${error.message}`);
            }
        }, [selectedEmployee, employees, loadData]);

    const renderContent = () => {
        switch (currentTab) {
                case 'overview':
                    return (
                        <OverviewView
                            user={user}
                            applications={leaveApplications}
                            balances={leaveBalances}
                            birthdays={birthdays}
                            leaveTypes={leaveTypes}
                            calculateWorkingDays={calculateWorkingDays}
                            isAdmin={isAdmin}
                            getLeaveTypeInfo={getLeaveTypeInfo}
                            getStatusLabel={getStatusLabel}
                            onRefresh={() => loadData()}
                        />
                    );
                case 'employees':
                    if (!isAdmin) {
                        return <AccessNotice />;
                    }
                    // Use EmployeeManagement component if available
                    if (EmployeeManagementComponent && typeof EmployeeManagementComponent === 'function') {
                        try {
                            const Component = EmployeeManagementComponent;
                            return <Component />;
                        } catch (err) {
                            console.error('LeavePlatform: error rendering EmployeeManagement component', err);
                        }
                    }
                    // Fallback: Show employees list directly if EmployeeManagement component is not available
                    const SortableHeader = ({ columnKey, label }) => (
                        <th 
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortEmployees(columnKey)}
                        >
                            <div className="flex items-center gap-1">
                                {label}
                                {employeeSortConfig.key === columnKey && (
                                    <i className={`fas fa-sort-${employeeSortConfig.direction === 'asc' ? 'up' : 'down'} text-primary-600`}></i>
                                )}
                                {employeeSortConfig.key !== columnKey && (
                                    <i className="fas fa-sort text-gray-400 opacity-50"></i>
                                )}
                            </div>
                        </th>
                    );
                    return (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Employees</h3>
                                    <p className="text-sm text-gray-500">View and manage employee information</p>
                                </div>
                                <button
                                    onClick={() => loadData()}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                                >
                                    <i className="fas fa-sync-alt mr-1.5"></i>
                                    Refresh
                                </button>
                            </div>
                            
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 relative">
                                    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                                    <input
                                        type="text"
                                        value={employeeSearchTerm}
                                        onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                                        placeholder="Search employees by name, email, role, employee number, or department..."
                                        className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    />
                                </div>
                            </div>
                            
                            {filteredAndSortedEmployees.length > 0 ? (
                                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <SortableHeader columnKey="name" label="Name" />
                                                    <SortableHeader columnKey="email" label="Email" />
                                                    <SortableHeader columnKey="role" label="Role" />
                                                    <SortableHeader columnKey="status" label="Status" />
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {filteredAndSortedEmployees.map(emp => (
                                                    <tr 
                                                        key={emp.id} 
                                                        className="hover:bg-gray-50 transition-colors"
                                                    >
                                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{emp.name || 'N/A'}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-500">{emp.email || 'N/A'}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-500">{emp.role || 'N/A'}</td>
                                                        <td className="px-4 py-3 text-sm">
                                                            <span className={`px-2 py-1 text-xs rounded ${(emp.status === 'active' || emp.employmentStatus === 'Active') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                                                {emp.employmentStatus || emp.status || 'active'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
                                        Showing {filteredAndSortedEmployees.length} of {employees.length} employees
                                        {employeeSearchTerm && ` (filtered)`}
                                    </div>
                                </div>
                            ) : employees.length > 0 ? (
                                <div className="text-center py-12 text-gray-500 bg-white border border-gray-200 rounded-lg">
                                    <i className="fas fa-search mb-2 text-3xl"></i>
                                    <p className="mb-2">No employees match your search</p>
                                    <p className="text-xs text-gray-400">Try adjusting your search terms</p>
                                    <button
                                        onClick={() => setEmployeeSearchTerm('')}
                                        className="mt-4 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                                    >
                                        Clear Search
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-500 bg-white border border-gray-200 rounded-lg">
                                    <i className="fas fa-users mb-2 text-3xl"></i>
                                    <p className="mb-2">No employees found</p>
                                    <p className="text-xs text-gray-400">Employees will appear here once they are loaded from the system.</p>
                                    <button
                                        onClick={() => loadData()}
                                        className="mt-4 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                                    >
                                        <i className="fas fa-sync-alt mr-1.5"></i>
                                        Retry Loading
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                case 'team':
                    return isAdmin ? (
                        <TeamLeaveView
                            applications={leaveApplications}
                            employees={employees}
                            calculateWorkingDays={calculateWorkingDays}
                            getLeaveTypeInfo={getLeaveTypeInfo}
                            getLeaveTypeBadgeClass={getLeaveTypeBadgeClass}
                            getStatusLabel={getStatusLabel}
                            getStatusColor={(status) => statusColors[status] || statusColors.pending}
                            leaveTypes={leaveTypes}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onCancel={handleCancel}
                            onEdit={handleEdit}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                            loading={loading}
                        />
                    ) : (
                        <AccessNotice />
                    );
            case 'my-leave':
                    return (
                        <MyLeaveView
                            applications={leaveApplications}
                            user={user}
                            calculateWorkingDays={calculateWorkingDays}
                            statusColors={statusColors}
                            getStatusLabel={getStatusLabel}
                            getLeaveTypeInfo={getLeaveTypeInfo}
                            leaveTypes={leaveTypes}
                            onCancel={handleCancel}
                            onEdit={handleEdit}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                            onRequestApply={() => setCurrentTab('apply')}
                            onRefresh={() => loadData()}
                        />
                    );
            case 'apply':
                    return (
                        <ApplyForLeaveView
                    leaveTypes={leaveTypes}
                    employees={employees}
                            onSuccess={() => loadData({ silent: true })}
                            calculateWorkingDays={calculateWorkingDays}
                            currentUser={user}
                            isAdmin={isAdmin}
                        />
                    );
            case 'balances':
                    return (
                        <LeaveBalancesView
                    balances={leaveBalances}
                    employees={employees}
                            leaveTypes={leaveTypes}
                            user={user}
                            isAdmin={isAdmin}
                            onRefresh={() => loadData()}
                        />
                    );
            case 'calendar':
                    return (
                        <LeaveCalendarView
                    applications={leaveApplications}
                    view={calendarView}
                    onViewChange={setCalendarView}
                            getLeaveTypeInfo={getLeaveTypeInfo}
                        />
                    );
            case 'approvals':
                    return isAdmin ? (
                        <ApprovalsView
                    applications={leaveApplications}
                    user={user}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            loading={loading}
                        />
                    ) : (
                        <AccessNotice />
                    );
            case 'approvers':
                    return isAdmin ? (
                        <ApproversView
                    approvers={leaveApprovers}
                    departments={departments}
                    employees={employees}
                            onUpdate={() => loadData()}
                        />
                    ) : (
                        <AccessNotice />
                    );
            case 'birthdays':
                    return (
                        <BirthdaysView
                    birthdays={birthdays}
                            onRefresh={() => loadData({ silent: true })}
                        />
                    );
            case 'import':
                    return isAdmin ? (
                        <ImportBalancesView
                            onImport={() => loadData()}
                        />
                    ) : (
                        <AccessNotice />
                    );
            default:
                    return (
                        <OverviewView
                            user={user}
                            applications={leaveApplications}
                            balances={leaveBalances}
                            birthdays={birthdays}
                            leaveTypes={leaveTypes}
                            calculateWorkingDays={calculateWorkingDays}
                            isAdmin={isAdmin}
                            getLeaveTypeInfo={getLeaveTypeInfo}
                            getStatusLabel={getStatusLabel}
                            onRefresh={() => loadData()}
                        />
                    );
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
const OverviewView = ({
    user,
    applications,
    balances,
    birthdays,
    leaveTypes,
    calculateWorkingDays,
    isAdmin,
    getLeaveTypeInfo,
    getStatusLabel,
    onRefresh
}) => {
    const myApplications = useMemo(() => applications.filter(app => matchUserRecord(app, user)), [applications, user]);
    const myPending = useMemo(() => myApplications.filter(app => app.status === 'pending').length, [myApplications]);
    const approvedDays = useMemo(() => myApplications
        .filter(app => app.status === 'approved')
        .reduce((sum, app) => sum + getApplicationDays(app, calculateWorkingDays), 0), [myApplications, calculateWorkingDays]);
    const teamPending = useMemo(() => applications.filter(app => app.status === 'pending').length, [applications]);
    const teamApproved = useMemo(() => applications.filter(app => app.status === 'approved').length, [applications]);

    const myAnnualBalance = useMemo(() => {
        const entry = balances.find(balance =>
            matchUserRecord(balance, user) &&
            (balance.leaveType === 'annual' || balance.leaveType === 'Annual Leave')
        );
        return entry?.available ?? entry?.balance ?? 0;
    }, [balances, user]);

    const upcomingLeave = useMemo(() => {
        const now = new Date();
        return myApplications
            .filter(app => app.status === 'approved' && new Date(app.startDate) >= now)
            .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
            .slice(0, 3);
    }, [myApplications]);

    const recentApplications = useMemo(() => {
        return [...myApplications].sort((a, b) => {
            const aDate = new Date(a.appliedDate || a.createdAt || a.startDate || 0);
            const bDate = new Date(b.appliedDate || b.createdAt || b.startDate || 0);
            return bDate - aDate;
        }).slice(0, 5);
    }, [myApplications]);

    const upcomingBirthdays = useMemo(() => computeUpcomingBirthdays(birthdays, isAdmin ? 8 : 5), [birthdays, isAdmin]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Leave Overview</h3>
                    <p className="text-sm text-gray-500">
                        BCEA-compliant overview of leave, balances, and employee wellbeing.
                    </p>
                </div>
                <button
                    onClick={onRefresh}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                    <i className="fas fa-sync-alt mr-1.5"></i>
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase mb-1">My Pending Requests</p>
                    <p className="text-2xl font-semibold text-gray-900">{myPending}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase mb-1">Approved Days (this cycle)</p>
                    <p className="text-2xl font-semibold text-gray-900">{approvedDays}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase mb-1">Annual Leave Remaining</p>
                    <p className="text-2xl font-semibold text-gray-900">{myAnnualBalance}</p>
                </div>
                {isAdmin && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <p className="text-xs text-gray-500 uppercase mb-1">Team Pending / Approved</p>
                        <p className="text-2xl font-semibold text-gray-900">{teamPending}</p>
                        <p className="text-xs text-gray-500">Approved: {teamApproved}</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-900">Recent Applications</h4>
                    </div>
                    {recentApplications.length > 0 ? (
                        <ul className="space-y-2">
                            {recentApplications.map(app => (
                                <li key={app.id} className="flex items-center justify-between text-sm">
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            {getLeaveTypeInfo(app.leaveType)?.label || app.leaveType}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {formatDisplayDate(app.startDate)} – {formatDisplayDate(app.endDate)}
                                        </p>
                                    </div>
                                    <span className="text-xs text-gray-500">{getStatusLabel(app.status)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center text-gray-500 text-sm py-6">
                            No recent activity
                        </div>
                    )}
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-900">Upcoming Birthdays</h4>
                    </div>
                    {upcomingBirthdays.length > 0 ? (
                        <ul className="space-y-2 text-sm text-gray-700">
                            {upcomingBirthdays.map(birthday => (
                                <li key={birthday.id} className="flex items-center justify-between">
                                    <span>{birthday.employeeName}</span>
                                    <span className="text-xs text-gray-500">
                                        {formatDisplayDate(birthday.nextOccurrence, { month: 'long', day: 'numeric' })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center text-gray-500 text-sm py-6">
                            No birthdays recorded
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Upcoming Approved Leave</h4>
                {upcomingLeave.length > 0 ? (
                    <ul className="space-y-2 text-sm text-gray-700">
                        {upcomingLeave.map(app => (
                            <li key={app.id} className="flex items-center justify-between">
                                <span>{getLeaveTypeInfo(app.leaveType)?.label || app.leaveType}</span>
                                <span className="text-xs text-gray-500">
                                    {formatDisplayDate(app.startDate)} – {formatDisplayDate(app.endDate)}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center text-gray-500 text-sm py-6">
                        No upcoming leave booked
                    </div>
                )}
            </div>
        </div>
    );
};

const TeamLeaveView = ({
    applications,
    employees,
    calculateWorkingDays,
    getLeaveTypeInfo,
    getLeaveTypeBadgeClass,
    getStatusLabel,
    getStatusColor,
    leaveTypes,
    onApprove,
    onReject,
    onCancel,
    onEdit,
    onUpdate,
    onDelete,
    loading
}) => {
    const [editingApplication, setEditingApplication] = useState(null);
    const [editFormData, setEditFormData] = useState({
        leaveType: '',
        startDate: '',
        endDate: '',
        reason: '',
        emergency: false
    });
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterEmployee, setFilterEmployee] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const employeeOptions = useMemo(() => {
        const map = new Map();
        (employees || []).forEach(emp => {
            const id = emp.id || emp.userId || emp.user_id;
            const name = emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
            if (id && name) {
                map.set(String(id), name);
            }
        });
        (applications || []).forEach(app => {
            const id = app.userId || app.user_id || app.employeeId;
            const name = app.userName || app.employee || app.employeeName;
            if (id && name && !map.has(String(id))) {
                map.set(String(id), name);
            }
        });
        return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    }, [employees, applications]);

    const filteredApplications = useMemo(() => {
        const lowerSearch = searchTerm.trim().toLowerCase();
        return (applications || []).filter(app => {
            const statusMatch = filterStatus === 'all' || app.status === filterStatus;
            const employeeId = app.userId || app.user_id || app.employeeId;
            const employeeMatch = filterEmployee === 'all' || String(employeeId) === filterEmployee;
            const searchMatch = !lowerSearch || [
                app.userName,
                app.employee,
                app.leaveType,
                app.reason
            ].some(field => field && String(field).toLowerCase().includes(lowerSearch));
            return statusMatch && employeeMatch && searchMatch;
        }).sort((a, b) => new Date(b.appliedDate || b.createdAt || b.startDate || 0) - new Date(a.appliedDate || a.createdAt || a.startDate || 0));
    }, [applications, filterStatus, filterEmployee, searchTerm]);

    const stats = useMemo(() => ({
        pending: filteredApplications.filter(app => app.status === 'pending').length,
        approved: filteredApplications.filter(app => app.status === 'approved').length,
        rejected: filteredApplications.filter(app => app.status === 'rejected').length
    }), [filteredApplications]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Team Leave Management</h3>
                    <p className="text-sm text-gray-500">Approve or manage employee leave requests</p>
                </div>
                <div className="flex gap-2">
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search employees or reasons..."
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="all">All Employees</option>
                        {employeeOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase mb-1">Pending</p>
                    <p className="text-xl font-semibold text-gray-900">{stats.pending}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase mb-1">Approved</p>
                    <p className="text-xl font-semibold text-gray-900">{stats.approved}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase mb-1">Rejected</p>
                    <p className="text-xl font-semibold text-gray-900">{stats.rejected}</p>
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dates</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredApplications.map(app => {
                                const leaveTypeInfo = getLeaveTypeInfo(app.leaveType);
                                const badgeClass = getLeaveTypeBadgeClass(leaveTypeInfo);
                                return (
                                    <tr key={app.id}>
                                        <td className="px-4 py-4 text-sm text-gray-900">
                                            <div className="font-medium">{app.userName || app.employee || 'Unknown'}</div>
                                            <div className="text-xs text-gray-500">
                                                Applied {formatDisplayDate(app.appliedDate || app.createdAt)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-sm">
                                            <span className={`px-2 py-1 text-xs font-medium rounded ${badgeClass}`}>
                                                {leaveTypeInfo?.label || app.leaveType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600">
                                            {formatDisplayDate(app.startDate)} – {formatDisplayDate(app.endDate)}
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600">
                                            {getApplicationDays(app, calculateWorkingDays)}
                                        </td>
                                        <td className="px-4 py-4 text-sm">
                                            <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(app.status)}`}>
                                                {getStatusLabel(app.status)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-sm">
                                            <div className="flex gap-2 flex-wrap">
                                                {app.status === 'pending' && (
                                                    <>
                                                        <button
                                                            disabled={loading}
                                                            onClick={() => {
                                                                if (onEdit) {
                                                                    const appToEdit = onEdit(app);
                                                                    setEditingApplication(appToEdit);
                                                                    setEditFormData({
                                                                        leaveType: app.leaveType,
                                                                        startDate: app.startDate,
                                                                        endDate: app.endDate,
                                                                        reason: app.reason || '',
                                                                        emergency: app.emergency || false
                                                                    });
                                                                }
                                                            }}
                                                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                        <button
                                                            disabled={loading}
                                                            onClick={() => onDelete && onDelete(app.id)}
                                                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                        <button
                                                            disabled={loading}
                                                            onClick={() => onApprove && onApprove(app.id)}
                                                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                                        >
                                                            Approve
                </button>
                                                        <button
                                                            disabled={loading}
                                                            onClick={() => {
                                                                if (!onReject) return;
                                                                const reason = prompt('Reason for rejection:');
                                                                if (reason) {
                                                                    onReject(app.id, reason);
                                                                }
                                                            }}
                                                            className="px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                                {(app.status === 'approved' || app.status === 'pending') && (
                                                    <button
                                                        disabled={loading}
                                                        onClick={() => onCancel && onCancel(app.id)}
                                                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
            </div>

                {filteredApplications.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        <i className="fas fa-clipboard-list text-4xl mb-3"></i>
                        <p>No leave requests match your filters</p>
                    </div>
                )}
            </div>

            {/* Edit Modal for Team View */}
            {editingApplication && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Edit Leave Application</h3>
                            <button
                                onClick={() => setEditingApplication(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const workingDays = calculateWorkingDays(editFormData.startDate, editFormData.endDate);
                            const success = await onUpdate(editingApplication.id, {
                                ...editFormData,
                                days: workingDays
                            });
                            if (success) {
                                setEditingApplication(null);
                            }
                        }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Leave Type *
                                </label>
                                <select
                                    value={editFormData.leaveType}
                                    onChange={(e) => setEditFormData({...editFormData, leaveType: e.target.value})}
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Start Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={editFormData.startDate}
                                        onChange={(e) => setEditFormData({...editFormData, startDate: e.target.value})}
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
                                        value={editFormData.endDate}
                                        onChange={(e) => setEditFormData({...editFormData, endDate: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Working Days
                                </label>
                                <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                                    <span className="text-2xl font-bold text-blue-600">
                                        {calculateWorkingDays(editFormData.startDate, editFormData.endDate)}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={editFormData.emergency}
                                        onChange={(e) => setEditFormData({...editFormData, emergency: e.target.checked})}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-gray-700">Emergency Leave</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Reason *
                                </label>
                                <textarea
                                    value={editFormData.reason}
                                    onChange={(e) => setEditFormData({...editFormData, reason: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                    rows="4"
                                    required
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingApplication(null)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const AccessNotice = () => (
    <div className="text-center py-16 text-gray-500">
        <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
        <p className="text-sm">Administrator access required for this section.</p>
    </div>
);

const MyLeaveView = ({
    applications,
    user,
    calculateWorkingDays,
    statusColors,
    getStatusLabel,
    getLeaveTypeInfo,
    leaveTypes,
    onCancel,
    onEdit,
    onUpdate,
    onDelete,
    onRequestApply,
    onRefresh
}) => {
    const [editingApplication, setEditingApplication] = useState(null);
    const [editFormData, setEditFormData] = useState({
        leaveType: '',
        startDate: '',
        endDate: '',
        reason: '',
        emergency: false
    });
    const myApplications = useMemo(
        () => applications.filter(app => matchUserRecord(app, user)),
        [applications, user]
    );

    const sortedApplications = useMemo(() => {
        return [...myApplications].sort((a, b) => {
            const aDate = new Date(a.appliedDate || a.createdAt || a.startDate || 0);
            const bDate = new Date(b.appliedDate || b.createdAt || b.startDate || 0);
            return bDate - aDate;
        });
    }, [myApplications]);

    const pendingCount = useMemo(
        () => sortedApplications.filter(app => app.status === 'pending').length,
        [sortedApplications]
    );

    const approvedDays = useMemo(
        () => sortedApplications
            .filter(app => app.status === 'approved')
            .reduce((sum, app) => sum + getApplicationDays(app, calculateWorkingDays), 0),
        [sortedApplications, calculateWorkingDays]
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">My Leave Applications</h3>
                    <p className="text-sm text-gray-500">
                        Pending: {pendingCount} • Approved days this cycle: {approvedDays}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onRefresh}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        <i className="fas fa-sync-alt mr-1.5"></i>
                        Refresh
                    </button>
                    <button
                        onClick={() => onRequestApply && onRequestApply()}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        <i className="fas fa-plus mr-1.5"></i>
                        New Application
                    </button>
                </div>
            </div>

            {sortedApplications.length > 0 ? (
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
                            {sortedApplications.map(app => {
                                const leaveTypeInfo = getLeaveTypeInfo(app.leaveType);
                                return (
                                <tr key={app.id}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {leaveTypeInfo?.label || app.leaveType}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatDisplayDate(app.startDate)}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatDisplayDate(app.endDate)}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {getApplicationDays(app, calculateWorkingDays)}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[app.status] || statusColors.pending}`}>
                                                {getStatusLabel(app.status)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <div className="flex gap-2">
                                        {app.status === 'pending' && (
                                                <>
                                                <button
                                                        onClick={() => {
                                                            if (onEdit) {
                                                                const appToEdit = onEdit(app);
                                                                setEditingApplication(appToEdit);
                                                                setEditFormData({
                                                                    leaveType: app.leaveType,
                                                                    startDate: app.startDate,
                                                                    endDate: app.endDate,
                                                                    reason: app.reason || '',
                                                                    emergency: app.emergency || false
                                                                });
                                                            }
                                                        }}
                                                        className="text-blue-600 hover:text-blue-700 font-medium"
                                                        title="Edit"
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => onDelete && onDelete(app.id)}
                                                    className="text-red-600 hover:text-red-700 font-medium"
                                                        title="Delete"
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => onCancel && onCancel(app.id)}
                                                        className="text-gray-600 hover:text-gray-700 font-medium"
                                                        title="Cancel"
                                                >
                                                    <i className="fas fa-times mr-1"></i>
                                                    Cancel
                                            </button>
                                                </>
                                        )}
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-12 text-gray-500">
                    <i className="fas fa-calendar-times text-4xl mb-4"></i>
                    <p>No leave applications found</p>
                </div>
            )}

            {/* Edit Modal */}
            {editingApplication && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Edit Leave Application</h3>
                            <button
                                onClick={() => setEditingApplication(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const workingDays = calculateWorkingDays(editFormData.startDate, editFormData.endDate);
                            const success = await onUpdate(editingApplication.id, {
                                ...editFormData,
                                days: workingDays
                            });
                            if (success) {
                                setEditingApplication(null);
                            }
                        }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Leave Type *
                                </label>
                                <select
                                    value={editFormData.leaveType}
                                    onChange={(e) => setEditFormData({...editFormData, leaveType: e.target.value})}
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Start Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={editFormData.startDate}
                                        onChange={(e) => setEditFormData({...editFormData, startDate: e.target.value})}
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
                                        value={editFormData.endDate}
                                        onChange={(e) => setEditFormData({...editFormData, endDate: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Working Days
                                </label>
                                <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                                    <span className="text-2xl font-bold text-blue-600">
                                        {calculateWorkingDays(editFormData.startDate, editFormData.endDate)}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={editFormData.emergency}
                                        onChange={(e) => setEditFormData({...editFormData, emergency: e.target.checked})}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-gray-700">Emergency Leave</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Reason *
                                </label>
                                <textarea
                                    value={editFormData.reason}
                                    onChange={(e) => setEditFormData({...editFormData, reason: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                    rows="4"
                                    required
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingApplication(null)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// Apply for Leave View
const ApplyForLeaveView = ({
    leaveTypes,
    employees,
    onSuccess,
    calculateWorkingDays,
    currentUser,
    isAdmin
}) => {
    const defaultApplicant = useMemo(() => {
        if (!currentUser) return null;
        return {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email
        };
    }, [currentUser]);

    const [formData, setFormData] = useState({
        leaveType: 'annual',
        startDate: '',
        endDate: '',
        reason: '',
        emergency: false,
        applicantId: defaultApplicant?.id || '',
        applicantName: defaultApplicant?.name || '',
        applicantEmail: defaultApplicant?.email || ''
    });
    const [submitting, setSubmitting] = useState(false);

    const availableEmployees = useMemo(() => {
        if (!Array.isArray(employees)) return [];
        return employees
            .map(emp => ({
                id: emp.id || emp.userId || emp.user_id,
                name: emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
                email: emp.email
            }))
            .filter(emp => emp.id && emp.name);
    }, [employees]);

    useEffect(() => {
        if (!isAdmin && defaultApplicant) {
            setFormData(prev => ({
                ...prev,
                applicantId: defaultApplicant.id,
                applicantName: defaultApplicant.name,
                applicantEmail: defaultApplicant.email
            }));
        }
    }, [isAdmin, defaultApplicant]);

    const workingDays = calculateWorkingDays(formData.startDate, formData.endDate);

    const handleApplicantChange = (employeeId) => {
        const selected = availableEmployees.find(emp => String(emp.id) === String(employeeId)) || null;
        setFormData(prev => ({
            ...prev,
            applicantId: selected?.id || '',
            applicantName: selected?.name || '',
            applicantEmail: selected?.email || ''
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const headers = getAuthHeaders();
            const response = await fetch('/api/leave-platform/applications', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    leaveType: formData.leaveType,
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                    reason: formData.reason,
                    emergency: formData.emergency,
                    days: workingDays,
                    userId: formData.applicantId || defaultApplicant?.id,
                    userEmail: formData.applicantEmail || defaultApplicant?.email,
                    userName: formData.applicantName || defaultApplicant?.name
                })
            });

            if (response.ok) {
                alert('Leave application submitted successfully!');
                setFormData({
                    leaveType: 'annual',
                    startDate: '',
                    endDate: '',
                    reason: '',
                    emergency: false,
                    applicantId: isAdmin ? '' : defaultApplicant?.id || '',
                    applicantName: isAdmin ? '' : defaultApplicant?.name || '',
                    applicantEmail: isAdmin ? '' : defaultApplicant?.email || ''
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
                <div className={`grid ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                    {isAdmin && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Employee *
                            </label>
                            <select
                                value={formData.applicantId}
                                onChange={(e) => handleApplicantChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                required
                            >
                                <option value="">Select employee</option>
                                {availableEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.name}{emp.email ? ` (${emp.email})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

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
                    </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Working Days
                        </label>
                        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                            <span className="text-2xl font-bold text-blue-600">{workingDays}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Emergency
                        </label>
                        <label className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                            <input
                                type="checkbox"
                                checked={formData.emergency}
                                onChange={(e) => setFormData({...formData, emergency: e.target.checked})}
                                className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Emergency Leave</span>
                        </label>
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
const LeaveBalancesView = ({ balances, leaveTypes, user, isAdmin, onRefresh }) => {
    const normalizedBalances = useMemo(() => {
        if (!Array.isArray(balances) || balances.length === 0) return [];
        return balances.map(balance => ({
            ...balance,
            employeeId: balance.employeeId || balance.userId || balance.user_id,
            employeeName: balance.employeeName || balance.userName || balance.employee,
            leaveType: balance.leaveType || balance.type,
            available: balance.available ?? balance.balance ?? 0,
            used: balance.used ?? 0,
            entitlement: balance.entitlement ?? balance.total ?? 0
        }));
    }, [balances]);

    const filteredBalances = useMemo(() => {
        if (isAdmin) return normalizedBalances;
        return normalizedBalances.filter(balance => matchUserRecord(balance, user));
    }, [normalizedBalances, isAdmin, user]);

    const totals = useMemo(() => {
        return filteredBalances.reduce((acc, balance) => {
            const key = balance.leaveType || 'unknown';
            if (!acc[key]) {
                acc[key] = { available: 0, used: 0 };
            }
            acc[key].available += Number(balance.available || 0);
            acc[key].used += Number(balance.used || 0);
            return acc;
        }, {});
    }, [filteredBalances]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Leave Balances</h3>
                    <p className="text-sm text-gray-500">
                        {isAdmin ? 'Company-wide view of remaining leave entitlements.' : 'Personal leave balance summary.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <button
                            onClick={onRefresh}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                        >
                            <i className="fas fa-sync-alt mr-1.5"></i>
                            Refresh
                </button>
                    )}
                </div>
            </div>

            {filteredBalances.length > 0 ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {Object.entries(totals).map(([type, summary]) => {
                            const leaveTypeInfo = leaveTypes.find(t => t.value === type) || { label: type };
                            return (
                                <div key={type} className="bg-white border border-gray-200 rounded-lg p-4">
                                    <p className="text-xs text-gray-500 uppercase mb-1">{leaveTypeInfo.label}</p>
                                    <p className="text-2xl font-semibold text-gray-900">{summary.available}</p>
                                    <p className="text-xs text-gray-500">Available • Used {summary.used}</p>
                                </div>
                            );
                        })}
                    </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entitled</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Used</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                                {filteredBalances.map(balance => {
                                    const leaveTypeInfo = leaveTypes.find(t => t.value === balance.leaveType) || { label: balance.leaveType };
                                    return (
                                        <tr key={`${balance.employeeId || balance.employeeName}-${balance.leaveType}`}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {balance.employeeName || 'Unknown employee'}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {leaveTypeInfo.label}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {balance.entitlement}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {balance.used}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {balance.available}
                                    </td>
                                </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>
                </>
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
const LeaveCalendarView = ({ applications, view, onViewChange, getLeaveTypeInfo }) => {
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
                            {dayApplications.map(app => {
                                const info = getLeaveTypeInfo ? getLeaveTypeInfo(app.leaveType) : null;
                                return (
                                    <div
                                        key={app.id}
                                        className="text-xs bg-blue-100 text-blue-800 rounded px-1 mb-1 truncate"
                                        title={info?.label || app.leaveType}
                                    >
                                    {app.userName}
                                </div>
                                );
                            })}
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
const ApprovalsView = ({ applications, onApprove, onReject, loading }) => {
    const pendingApplications = useMemo(
        () => applications.filter(app => app.status === 'pending'),
        [applications]
    );

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
                                            disabled={loading}
                                            onClick={() => onApprove && onApprove(app.id)}
                                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button
                                            disabled={loading}
                                        onClick={() => {
                                                if (!onReject) return;
                                            const reason = prompt('Reason for rejection:');
                                                if (reason) onReject(app.id, reason);
                                        }}
                                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
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
const BirthdaysView = ({ birthdays, onRefresh }) => {
    const upcomingBirthdays = useMemo(() => computeUpcomingBirthdays(birthdays, 12), [birthdays]);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Birthdays</h3>
                <button
                    onClick={onRefresh}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                    <i className="fas fa-sync-alt mr-1.5"></i>
                    Refresh
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
                                        {formatDisplayDate(bday.nextOccurrence, { month: 'long', day: 'numeric' })}
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
const ImportBalancesView = ({ onImport }) => {
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

