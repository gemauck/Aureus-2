// Get React hooks from window
const { useState, useEffect } = React;
const storage = window.storage;

const LeaveBalance = () => {
    const [employees, setEmployees] = useState([]);
    const [leaveBalances, setLeaveBalances] = useState({});
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    // Leave cycle: March to February (South African standard)
    const leaveYear = new Date().getMonth() < 2 
        ? `${new Date().getFullYear() - 1}/${new Date().getFullYear()}`
        : `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;

    const leaveTypes = [
        { value: 'annual', label: 'Annual Leave', entitlement: 21, icon: 'fa-umbrella-beach', color: 'blue' },
        { value: 'sick', label: 'Sick Leave', entitlement: 30, icon: 'fa-heartbeat', color: 'red' },
        { value: 'family', label: 'Family Responsibility', entitlement: 3, icon: 'fa-home', color: 'purple' },
        { value: 'maternity', label: 'Maternity Leave', entitlement: 120, icon: 'fa-baby', color: 'pink' },
        { value: 'paternity', label: 'Paternity Leave', entitlement: 10, icon: 'fa-baby-carriage', color: 'teal' }
    ];

    useEffect(() => {
        loadEmployees();
        loadLeaveBalances();
    }, []);

    const loadEmployees = () => {
        // Using the team members we have in the system
        const teamMembers = [
            {
                id: 1,
                name: 'Gareth Mauck',
                position: 'Director',
                department: 'Management',
                employmentDate: '2020-01-15'
            },
            {
                id: 2,
                name: 'David Buttemer',
                position: 'Technical Lead',
                department: 'Operations',
                employmentDate: '2021-03-01'
            }
        ];
        setEmployees(teamMembers);
        
        // Initialize balances if not exists
        const savedBalances = storage.getLeaveBalances() || {};
        const applications = storage.getLeaveApplications() || [];
        
        const balances = {};
        teamMembers.forEach(emp => {
            if (!savedBalances[emp.id]) {
                balances[emp.id] = initializeEmployeeBalance(emp, applications);
            } else {
                balances[emp.id] = calculateCurrentBalance(emp, savedBalances[emp.id], applications);
            }
        });
        
        setLeaveBalances(balances);
        storage.setLeaveBalances(balances);
    };

    const loadLeaveBalances = () => {
        const saved = storage.getLeaveBalances() || {};
        setLeaveBalances(saved);
    };

    const initializeEmployeeBalance = (employee, applications) => {
        const balance = {};
        leaveTypes.forEach(type => {
            const approved = applications.filter(app => 
                app.employee === employee.name && 
                app.leaveType === type.value && 
                app.status === 'approved'
            );
            
            const taken = approved.reduce((sum, app) => {
                return sum + calculateWorkingDays(app.startDate, app.endDate);
            }, 0);

            balance[type.value] = {
                entitlement: type.entitlement,
                taken: taken,
                available: type.entitlement - taken,
                pending: applications.filter(app => 
                    app.employee === employee.name && 
                    app.leaveType === type.value && 
                    app.status === 'pending'
                ).length
            };
        });
        return balance;
    };

    const calculateCurrentBalance = (employee, savedBalance, applications) => {
        // Recalculate based on approved applications
        return initializeEmployeeBalance(employee, applications);
    };

    const calculateWorkingDays = (startDate, endDate) => {
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

    const getUsagePercentage = (taken, entitlement) => {
        if (entitlement === 0) return 0;
        return Math.min((taken / entitlement) * 100, 100);
    };

    const getUsageColor = (percentage) => {
        if (percentage >= 90) return 'bg-red-500';
        if (percentage >= 70) return 'bg-orange-500';
        if (percentage >= 50) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h2 className="text-base font-semibold text-gray-900">Leave Balances</h2>
                <p className="text-xs text-gray-600">
                    Leave year: {leaveYear} (March - February)
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {employees.map(employee => {
                    const balance = leaveBalances[employee.id] || {};
                    
                    return (
                        <div key={employee.id} className="bg-white rounded-lg border border-gray-200 p-4">
                            {/* Employee Header */}
                            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                                        <span className="text-primary-600 font-semibold text-sm">
                                            {employee.name.charAt(0)}
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900">{employee.name}</h3>
                                        <p className="text-xs text-gray-500">{employee.position}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedEmployee(employee)}
                                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                                >
                                    View Details
                                    <i className="fas fa-chevron-right ml-1"></i>
                                </button>
                            </div>

                            {/* Leave Types Balance */}
                            <div className="space-y-3">
                                {leaveTypes.map(type => {
                                    const typeBalance = balance[type.value] || { entitlement: type.entitlement, taken: 0, available: type.entitlement, pending: 0 };
                                    const percentage = getUsagePercentage(typeBalance.taken, typeBalance.entitlement);
                                    
                                    return (
                                        <div key={type.value}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <i className={`fas ${type.icon} text-${type.color}-600 text-xs`}></i>
                                                    <span className="text-xs font-medium text-gray-700">{type.label}</span>
                                                </div>
                                                <div className="text-xs">
                                                    <span className="font-semibold text-gray-900">{typeBalance.available}</span>
                                                    <span className="text-gray-500"> / {typeBalance.entitlement} days</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                                                <div 
                                                    className={`h-1.5 rounded-full transition-all ${getUsageColor(percentage)}`}
                                                    style={{width: `${percentage}%`}}
                                                ></div>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                                                <span>Taken: {typeBalance.taken} days</span>
                                                {typeBalance.pending > 0 && (
                                                    <span className="text-yellow-600">
                                                        <i className="fas fa-clock mr-0.5"></i>
                                                        {typeBalance.pending} pending
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Detailed View Modal */}
            {selectedEmployee && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                            <div>
                                <h2 className="text-base font-semibold text-gray-900">
                                    {selectedEmployee.name} - Leave Details
                                </h2>
                                <p className="text-xs text-gray-600">Leave year: {leaveYear}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedEmployee(null)}
                                className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                            >
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="grid grid-cols-2 gap-4">
                                {leaveTypes.map(type => {
                                    const balance = leaveBalances[selectedEmployee.id] || {};
                                    const typeBalance = balance[type.value] || { entitlement: type.entitlement, taken: 0, available: type.entitlement };
                                    const percentage = getUsagePercentage(typeBalance.taken, typeBalance.entitlement);
                                    
                                    return (
                                        <div key={type.value} className={`bg-${type.color}-50 border border-${type.color}-200 rounded-lg p-4`}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className={`w-8 h-8 rounded-lg bg-${type.color}-100 flex items-center justify-center`}>
                                                    <i className={`fas ${type.icon} text-${type.color}-600`}></i>
                                                </div>
                                                <h3 className={`text-sm font-semibold text-${type.color}-900`}>{type.label}</h3>
                                            </div>
                                            
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className={`text-${type.color}-700`}>Entitlement:</span>
                                                    <span className={`font-semibold text-${type.color}-900`}>{typeBalance.entitlement} days</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className={`text-${type.color}-700`}>Taken:</span>
                                                    <span className={`font-semibold text-${type.color}-900`}>{typeBalance.taken} days</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className={`text-${type.color}-700`}>Available:</span>
                                                    <span className={`font-bold text-${type.color}-900 text-lg`}>{typeBalance.available} days</span>
                                                </div>
                                                
                                                <div className={`w-full bg-${type.color}-200 rounded-full h-2 mt-2`}>
                                                    <div 
                                                        className={`bg-${type.color}-600 h-2 rounded-full transition-all`}
                                                        style={{width: `${percentage}%`}}
                                                    ></div>
                                                </div>
                                                <p className={`text-[10px] text-${type.color}-700 text-right`}>
                                                    {percentage.toFixed(0)}% used
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                            <button
                                onClick={() => setSelectedEmployee(null)}
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.LeaveBalance = LeaveBalance;
