// Get React hooks from window
const { useState, useEffect } = React;
const storage = window.storage;

const Attendance = () => {
    const [attendanceRecords, setAttendanceRecords] = useState([]);
    const [showClockModal, setShowClockModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterEmployee, setFilterEmployee] = useState('all');
    const [viewMode, setViewMode] = useState('daily'); // daily or monthly

    const employees = storage.getEmployees() || [];

    useEffect(() => {
        loadAttendanceRecords();
    }, []);

    const loadAttendanceRecords = () => {
        const saved = storage.getAttendanceRecords() || [];
        setAttendanceRecords(saved);
    };

    useEffect(() => {
        if (attendanceRecords.length > 0) {
            storage.setAttendanceRecords(attendanceRecords);
        }
    }, [attendanceRecords]);

    const handleClockIn = (employeeName) => {
        const now = new Date();
        const record = {
            id: Date.now(),
            employee: employeeName,
            date: now.toISOString().split('T')[0],
            clockIn: now.toTimeString().slice(0, 5),
            clockOut: null,
            status: 'Present',
            notes: ''
        };
        setAttendanceRecords([...attendanceRecords, record]);
        setShowClockModal(false);
    };

    const handleClockOut = (recordId) => {
        const now = new Date();
        setAttendanceRecords(attendanceRecords.map(record => {
            if (record.id === recordId && !record.clockOut) {
                const clockInTime = new Date(`2000-01-01T${record.clockIn}`);
                const clockOutTime = new Date(`2000-01-01T${now.toTimeString().slice(0, 5)}`);
                const hours = (clockOutTime - clockInTime) / (1000 * 60 * 60);
                
                return {
                    ...record,
                    clockOut: now.toTimeString().slice(0, 5),
                    hoursWorked: Math.max(0, hours.toFixed(2))
                };
            }
            return record;
        }));
    };

    const handleManualEntry = (entryData) => {
        const record = {
            id: Date.now(),
            ...entryData,
            manualEntry: true
        };
        setAttendanceRecords([...attendanceRecords, record]);
    };

    const handleDeleteRecord = (id) => {
        if (confirm('Delete this attendance record?')) {
            setAttendanceRecords(attendanceRecords.filter(r => r.id !== id));
        }
    };

    const getTodayRecords = () => {
        const today = new Date().toISOString().split('T')[0];
        return attendanceRecords.filter(r => r.date === today);
    };

    const getFilteredRecords = () => {
        let filtered = attendanceRecords;
        
        if (viewMode === 'daily') {
            filtered = filtered.filter(r => r.date === selectedDate);
        } else {
            const month = selectedDate.slice(0, 7);
            filtered = filtered.filter(r => r.date.startsWith(month));
        }
        
        if (filterEmployee !== 'all') {
            filtered = filtered.filter(r => r.employee === filterEmployee);
        }
        
        return filtered.sort((a, b) => new Date(b.date + ' ' + b.clockIn) - new Date(a.date + ' ' + a.clockIn));
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'Present': return 'bg-green-100 text-green-800';
            case 'Late': return 'bg-yellow-100 text-yellow-800';
            case 'Absent': return 'bg-red-100 text-red-800';
            case 'Half Day': return 'bg-blue-100 text-blue-800';
            case 'Leave': return 'bg-purple-100 text-purple-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const calculateMonthlyStats = () => {
        const month = selectedDate.slice(0, 7);
        const monthRecords = attendanceRecords.filter(r => r.date.startsWith(month));
        
        const stats = {};
        employees.forEach(emp => {
            const empRecords = monthRecords.filter(r => r.employee === emp.name);
            const totalHours = empRecords.reduce((sum, r) => sum + (parseFloat(r.hoursWorked) || 0), 0);
            const presentDays = empRecords.filter(r => r.status === 'Present').length;
            const lateDays = empRecords.filter(r => r.status === 'Late').length;
            
            stats[emp.name] = {
                totalHours: totalHours.toFixed(1),
                presentDays,
                lateDays,
                avgHoursPerDay: presentDays > 0 ? (totalHours / presentDays).toFixed(1) : 0
            };
        });
        
        return stats;
    };

    // Clock Modal Component
    const ClockModal = () => {
        const [selectedEmployee, setSelectedEmployee] = useState('');
        const todayRecords = getTodayRecords();
        const availableEmployees = employees.filter(emp => 
            !todayRecords.find(r => r.employee === emp.name && !r.clockOut)
        );

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">Clock In</h2>
                        <button 
                            onClick={() => setShowClockModal(false)}
                            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <div className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Select Employee *
                            </label>
                            <select
                                value={selectedEmployee}
                                onChange={(e) => setSelectedEmployee(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="">Choose employee...</option>
                                {availableEmployees.map(emp => (
                                    <option key={emp.id} value={emp.name}>{emp.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="text-center">
                                <i className="fas fa-clock text-blue-600 text-2xl mb-2"></i>
                                <p className="text-lg font-bold text-blue-900">
                                    {new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="text-xs text-blue-700">Current Time</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                        <button
                            onClick={() => setShowClockModal(false)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleClockIn(selectedEmployee)}
                            disabled={!selectedEmployee}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i className="fas fa-sign-in-alt mr-1.5"></i>
                            Clock In
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Manual Entry Modal
    const [showManualModal, setShowManualModal] = useState(false);
    const ManualEntryModal = () => {
        const [formData, setFormData] = useState({
            employee: '',
            date: new Date().toISOString().split('T')[0],
            clockIn: '09:00',
            clockOut: '17:00',
            status: 'Present',
            notes: ''
        });

        const calculateHours = () => {
            if (formData.clockIn && formData.clockOut) {
                const clockInTime = new Date(`2000-01-01T${formData.clockIn}`);
                const clockOutTime = new Date(`2000-01-01T${formData.clockOut}`);
                return Math.max(0, (clockOutTime - clockInTime) / (1000 * 60 * 60)).toFixed(2);
            }
            return 0;
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">Manual Entry</h2>
                        <button 
                            onClick={() => setShowManualModal(false)}
                            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <div className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Employee *
                            </label>
                            <select
                                value={formData.employee}
                                onChange={(e) => setFormData({...formData, employee: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="">Select Employee</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.name}>{emp.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Date *
                                </label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Status *
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    <option value="Present">Present</option>
                                    <option value="Late">Late</option>
                                    <option value="Absent">Absent</option>
                                    <option value="Half Day">Half Day</option>
                                    <option value="Leave">Leave</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Clock In
                                </label>
                                <input
                                    type="time"
                                    value={formData.clockIn}
                                    onChange={(e) => setFormData({...formData, clockIn: e.target.value})}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Clock Out
                                </label>
                                <input
                                    type="time"
                                    value={formData.clockOut}
                                    onChange={(e) => setFormData({...formData, clockOut: e.target.value})}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
                            <p className="text-xs text-gray-600">Total Hours</p>
                            <p className="text-lg font-bold text-gray-900">{calculateHours()}h</p>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Notes
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows="2"
                            ></textarea>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                        <button
                            onClick={() => setShowManualModal(false)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                handleManualEntry({...formData, hoursWorked: calculateHours()});
                                setShowManualModal(false);
                            }}
                            disabled={!formData.employee || !formData.date}
                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i className="fas fa-save mr-1.5"></i>
                            Save Entry
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const filteredRecords = getFilteredRecords();
    const monthlyStats = viewMode === 'monthly' ? calculateMonthlyStats() : null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-base font-semibold text-gray-900">Attendance Tracking</h2>
                    <p className="text-xs text-gray-600">Monitor employee attendance and working hours</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowClockModal(true)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                        <i className="fas fa-sign-in-alt mr-1.5"></i>
                        Clock In
                    </button>
                    <button
                        onClick={() => setShowManualModal(true)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                    >
                        <i className="fas fa-edit mr-1.5"></i>
                        Manual Entry
                    </button>
                </div>
            </div>

            {/* Today's Active Clocks */}
            {getTodayRecords().filter(r => !r.clockOut).length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h3 className="text-xs font-semibold text-green-900 mb-2">Currently Clocked In</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {getTodayRecords().filter(r => !r.clockOut).map(record => (
                            <div key={record.id} className="bg-white rounded border border-green-200 p-2 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">{record.employee}</p>
                                    <p className="text-[10px] text-gray-500">In: {record.clockIn}</p>
                                </div>
                                <button
                                    onClick={() => handleClockOut(record.id)}
                                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                    <i className="fas fa-sign-out-alt mr-1"></i>
                                    Clock Out
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex gap-2.5">
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

                    <input
                        type={viewMode === 'daily' ? 'date' : 'month'}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />

                    <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`px-3 py-1.5 text-xs ${viewMode === 'daily' ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            Daily
                        </button>
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`px-3 py-1.5 text-xs border-l ${viewMode === 'monthly' ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            Monthly
                        </button>
                    </div>
                </div>
            </div>

            {/* Monthly Stats */}
            {viewMode === 'monthly' && monthlyStats && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {employees.map(emp => {
                        const stats = monthlyStats[emp.name];
                        return (
                            <div key={emp.id} className="bg-white rounded-lg border border-gray-200 p-3">
                                <h3 className="text-sm font-semibold text-gray-900 mb-2">{emp.name}</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="text-center bg-gray-50 rounded p-2">
                                        <p className="text-[10px] text-gray-600">Total Hours</p>
                                        <p className="text-lg font-bold text-gray-900">{stats.totalHours}h</p>
                                    </div>
                                    <div className="text-center bg-gray-50 rounded p-2">
                                        <p className="text-[10px] text-gray-600">Present Days</p>
                                        <p className="text-lg font-bold text-green-600">{stats.presentDays}</p>
                                    </div>
                                    <div className="text-center bg-gray-50 rounded p-2">
                                        <p className="text-[10px] text-gray-600">Avg Hours/Day</p>
                                        <p className="text-lg font-bold text-blue-600">{stats.avgHoursPerDay}h</p>
                                    </div>
                                    <div className="text-center bg-gray-50 rounded p-2">
                                        <p className="text-[10px] text-gray-600">Late Days</p>
                                        <p className="text-lg font-bold text-yellow-600">{stats.lateDays}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Attendance Records */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Employee</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Date</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Clock In</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Clock Out</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Hours</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Status</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredRecords.length > 0 ? filteredRecords.map(record => (
                            <tr key={record.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{record.employee}</td>
                                <td className="px-3 py-2.5 text-xs text-gray-900">{record.date}</td>
                                <td className="px-3 py-2.5 text-xs text-gray-900">{record.clockIn}</td>
                                <td className="px-3 py-2.5 text-xs text-gray-900">
                                    {record.clockOut || <span className="text-green-600 font-medium">Active</span>}
                                </td>
                                <td className="px-3 py-2.5 text-xs font-medium text-gray-900">
                                    {record.hoursWorked ? `${record.hoursWorked}h` : '-'}
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${getStatusColor(record.status)}`}>
                                        {record.status}
                                    </span>
                                    {record.manualEntry && (
                                        <span className="ml-1 text-[10px] text-gray-500">
                                            <i className="fas fa-edit"></i>
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2.5 text-xs">
                                    <button
                                        onClick={() => handleDeleteRecord(record.id)}
                                        className="text-red-600 hover:text-red-700 p-1"
                                        title="Delete"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                                    <i className="fas fa-clock text-3xl mb-2"></i>
                                    <p className="text-sm">No attendance records found</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modals */}
            {showClockModal && <ClockModal />}
            {showManualModal && <ManualEntryModal />}
        </div>
    );
};

// Make available globally
window.Attendance = Attendance;
