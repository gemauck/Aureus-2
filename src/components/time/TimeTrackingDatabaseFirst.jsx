// Database-First Time Tracking Component - No localStorage dependency
const { useState, useEffect } = React;

const TimeTrackingDatabaseFirst = () => {
    const [timeEntries, setTimeEntries] = useState([]);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterProject, setFilterProject] = useState('All Projects');
    const [filterEmployee, setFilterEmployee] = useState('All Employees');
    const [filterBillable, setFilterBillable] = useState('All');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const { isDark } = window.useTheme();

    // Load time entries from database
    const loadTimeEntries = async () => {
        console.log('🔄 Loading time entries from database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token - redirecting to login');
                window.location.hash = '#/login';
                return;
            }

            const response = await window.api.getTimeEntries();
            const apiEntries = response?.data || [];
            console.log('📡 Database returned time entries:', apiEntries.length);
            
            // Process time entries data
            const processedEntries = apiEntries.map(entry => ({
                id: entry.id,
                date: entry.date || new Date().toISOString().split('T')[0],
                project: entry.project || '',
                client: entry.client || '',
                task: entry.task || '',
                hours: entry.hours || 0,
                billable: entry.billable !== undefined ? entry.billable : true,
                employee: entry.employee || '',
                description: entry.description || '',
                rate: entry.rate || 0,
                totalAmount: entry.totalAmount || 0,
                status: entry.status || 'Active',
                approvedBy: entry.approvedBy || '',
                approvedDate: entry.approvedDate || '',
                invoiceId: entry.invoiceId || '',
                tags: Array.isArray(entry.tags) ? entry.tags : [],
                attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
                activityLog: Array.isArray(entry.activityLog) ? entry.activityLog : []
            }));
            
            setTimeEntries(processedEntries);
            console.log('✅ Time entries loaded from database');
            
        } catch (error) {
            console.error('❌ Failed to load time entries from database:', error);
            if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                console.log('🔑 Authentication expired - redirecting to login');
                window.storage.removeToken();
                window.storage.removeUser();
                window.location.hash = '#/login';
            } else {
                alert('Failed to load time entries from database. Please try again.');
            }
        }
    };

    // Save time entry to database
    const handleSaveTimeEntry = async (timeEntryData) => {
        console.log('💾 Saving time entry to database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to save time entry data');
                return;
            }

            const comprehensiveEntry = {
                id: selectedEntry ? selectedEntry.id : Date.now().toString(),
                date: timeEntryData.date || new Date().toISOString().split('T')[0],
                project: timeEntryData.project || '',
                client: timeEntryData.client || '',
                task: timeEntryData.task || '',
                hours: timeEntryData.hours || 0,
                billable: timeEntryData.billable !== undefined ? timeEntryData.billable : true,
                employee: timeEntryData.employee || '',
                description: timeEntryData.description || '',
                rate: timeEntryData.rate || 0,
                totalAmount: timeEntryData.totalAmount || (timeEntryData.hours * timeEntryData.rate),
                status: timeEntryData.status || 'Active',
                approvedBy: timeEntryData.approvedBy || '',
                approvedDate: timeEntryData.approvedDate || '',
                invoiceId: timeEntryData.invoiceId || '',
                tags: timeEntryData.tags || [],
                attachments: timeEntryData.attachments || [],
                activityLog: timeEntryData.activityLog || []
            };

            if (selectedEntry) {
                // Update existing time entry
                await window.api.updateTimeEntry(comprehensiveEntry.id, comprehensiveEntry);
                console.log('✅ Time entry updated in database');
                
                // Update local state
                const updated = timeEntries.map(entry => entry.id === selectedEntry.id ? comprehensiveEntry : entry);
                setTimeEntries(updated);
                setSelectedEntry(comprehensiveEntry);
            } else {
                // Create new time entry
                const newEntry = await window.api.createTimeEntry(comprehensiveEntry);
                console.log('✅ Time entry created in database');
                
                // Add to local state
                setTimeEntries(prev => [...prev, newEntry]);
                
                // Close modal and refresh
                setShowModal(false);
                setSelectedEntry(null);
            }
            
            setRefreshKey(k => k + 1);
            
        } catch (error) {
            console.error('❌ Failed to save time entry to database:', error);
            alert('Failed to save time entry to database. Please try again.');
        }
    };

    // Delete time entry from database
    const handleDeleteTimeEntry = async (entryId) => {
        if (!confirm('Are you sure you want to delete this time entry? This action cannot be undone.')) {
            return;
        }

        console.log(`💾 Deleting time entry ${entryId} from database...`);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to delete time entry');
                return;
            }

            await window.api.deleteTimeEntry(entryId);
            console.log('✅ Time entry deleted from database');
            
            // Update local state
            setTimeEntries(prev => prev.filter(entry => entry.id !== entryId));
            setSelectedEntry(null);
            setRefreshKey(k => k + 1);
            
        } catch (error) {
            console.error('❌ Failed to delete time entry from database:', error);
            alert('Failed to delete time entry from database. Please try again.');
        }
    };

    // Filter and search
    const filteredEntries = timeEntries.filter(entry => {
        const matchesSearch = entry.task.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            entry.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            entry.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            entry.employee.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            entry.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesProject = filterProject === 'All Projects' || entry.project === filterProject;
        const matchesEmployee = filterEmployee === 'All Employees' || entry.employee === filterEmployee;
        const matchesBillable = filterBillable === 'All' || 
                              (filterBillable === 'Billable' && entry.billable) ||
                              (filterBillable === 'Non-billable' && !entry.billable);
        return matchesSearch && matchesProject && matchesEmployee && matchesBillable;
    });

    // Get unique projects and employees for filters
    const uniqueProjects = [...new Set(timeEntries.map(entry => entry.project))].filter(Boolean);
    const uniqueEmployees = [...new Set(timeEntries.map(entry => entry.employee))].filter(Boolean);

    // Calculate totals
    const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const billableHours = filteredEntries.filter(entry => entry.billable).reduce((sum, entry) => sum + entry.hours, 0);
    const totalAmount = filteredEntries.reduce((sum, entry) => sum + entry.totalAmount, 0);

    // Load data on mount
    useEffect(() => {
        loadTimeEntries();
    }, []);

    // Auto-refresh data every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadTimeEntries();
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-4"></i>
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading time entries from database...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-xl ${isDark ? 'bg-primary-600' : 'bg-primary-500'} flex items-center justify-center`}>
                            <i className="fas fa-clock text-white text-lg"></i>
                        </div>
                        <div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Time Tracking</h1>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Database-synchronized time management</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => {
                            setSelectedEntry(null);
                            setShowModal(true);
                        }}
                        className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all duration-200"
                    >
                        <i className="fas fa-plus text-xs"></i>
                        <span>Add Time Entry</span>
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Hours</p>
                            <p className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {totalHours.toFixed(1)}h
                            </p>
                        </div>
                        <i className="fas fa-clock text-2xl text-blue-600"></i>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Billable Hours</p>
                            <p className={`text-2xl font-bold text-green-600`}>
                                {billableHours.toFixed(1)}h
                            </p>
                        </div>
                        <i className="fas fa-dollar-sign text-2xl text-green-600"></i>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Value</p>
                            <p className={`text-2xl font-bold text-purple-600`}>
                                R{totalAmount.toLocaleString()}
                            </p>
                        </div>
                        <i className="fas fa-chart-line text-2xl text-purple-600"></i>
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="space-y-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search time entries..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full px-4 py-3 pl-10 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        />
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                        <select
                            value={filterProject}
                            onChange={(e) => setFilterProject(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All Projects</option>
                            {uniqueProjects.map(project => (
                                <option key={project} value={project}>{project}</option>
                            ))}
                        </select>
                        
                        <select
                            value={filterEmployee}
                            onChange={(e) => setFilterEmployee(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All Employees</option>
                            {uniqueEmployees.map(employee => (
                                <option key={employee} value={employee}>{employee}</option>
                            ))}
                        </select>

                        <select
                            value={filterBillable}
                            onChange={(e) => setFilterBillable(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All</option>
                            <option>Billable</option>
                            <option>Non-billable</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Time Entries Table */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <tr>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Date
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Project
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Task
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Employee
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Hours
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Amount
                                </th>
                                <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className={`${isDark ? 'divide-gray-700' : 'divide-gray-200'} divide-y`}>
                            {filteredEntries.map(entry => (
                                <tr key={entry.id} className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer`}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {new Date(entry.date).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {entry.project}
                                        </div>
                                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {entry.client}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {entry.task}
                                        </div>
                                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {entry.description.substring(0, 50)}...
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {entry.employee}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {entry.hours}h
                                        </div>
                                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {entry.billable ? 'Billable' : 'Non-billable'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            R{entry.totalAmount.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => setSelectedEntry(entry)}
                                                className={`${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-900'}`}
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedEntry(entry);
                                                    setShowModal(true);
                                                }}
                                                className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTimeEntry(entry.id)}
                                                className={`${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-900'}`}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Time Entry Modal */}
            {showModal && (
                <TimeModal
                    timeEntry={selectedEntry}
                    onSave={handleSaveTimeEntry}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedEntry(null);
                    }}
                    allProjects={[]} // Will be loaded from database
                    allClients={[]} // Will be loaded from database
                />
            )}

            {/* Time Entry Detail Modal */}
            {selectedEntry && !showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto`}>
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    Time Entry Details
                                </h3>
                                <button
                                    onClick={() => setSelectedEntry(null)}
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>Project Information</h4>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedEntry.project}</p>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedEntry.client}</p>
                                    </div>
                                    <div>
                                        <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>Time Details</h4>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Date: {new Date(selectedEntry.date).toLocaleDateString()}</p>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Hours: {selectedEntry.hours}h</p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>Task Description</h4>
                                    <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedEntry.task}</p>
                                    <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'} mt-2`}>{selectedEntry.description}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>Employee</h4>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedEntry.employee}</p>
                                    </div>
                                    <div>
                                        <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>Amount</h4>
                                        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>R{selectedEntry.totalAmount.toLocaleString()}</p>
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {selectedEntry.billable ? 'Billable' : 'Non-billable'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.TimeTrackingDatabaseFirst = TimeTrackingDatabaseFirst;
