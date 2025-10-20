// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;
const TimeModal = window.TimeModal;

// No initial data - all data comes from database

const TimeTracking = () => {
    const [timeEntries, setTimeEntries] = useState([]);
    const [projects, setProjects] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [filterProject, setFilterProject] = useState('All Projects');
    const [filterDate, setFilterDate] = useState('This Week');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Load time entries and projects from data service
    useEffect(() => {
        const loadData = async () => {
            try {
                console.log('🔄 TimeTracking: Loading data from data service');
                
                const [savedEntries, savedProjects] = await Promise.all([
                    window.dataService.getTimeEntries(),
                    window.dataService.getProjects()
                ]);
                
                console.log('✅ TimeTracking: Data loaded successfully', {
                    entries: savedEntries ? savedEntries.length : 0,
                    projects: savedProjects ? savedProjects.length : 0
                });
                
                if (savedEntries) {
                    setTimeEntries(savedEntries);
                }
                if (savedProjects) {
                    setProjects(savedProjects);
                }
            } catch (error) {
                console.error('❌ TimeTracking: Error loading data:', error);
            }
        };

        loadData();
    }, []);
    
    // Save time entries whenever they change
    useEffect(() => {
        const saveTimeEntries = async () => {
            try {
                await window.dataService.setTimeEntries(timeEntries);
                console.log('✅ TimeTracking: Saved to data service');
            } catch (error) {
                console.error('❌ TimeTracking: Error saving time entries:', error);
            }
        };

        if (timeEntries.length > 0) {
            saveTimeEntries();
        }
    }, [timeEntries]);

    const handleAddTimeEntry = () => {
        setSelectedEntry(null);
        setShowModal(true);
    };

    const handleEditEntry = (entry) => {
        setSelectedEntry(entry);
        setShowModal(true);
    };

    const handleSaveEntry = (entryData) => {
        if (selectedEntry) {
            // Editing existing entry
            setTimeEntries(timeEntries.map(e => 
                e.id === selectedEntry.id 
                    ? { ...e, ...entryData, hours: parseFloat(entryData.hours) }
                    : e
            ));
        } else {
            // Adding new entry
            const newEntry = {
                id: Math.max(0, ...timeEntries.map(e => e.id)) + 1,
                ...entryData,
                hours: parseFloat(entryData.hours),
                employee: 'Current User',
                client: projects.find(p => p.name === entryData.project)?.client || 'N/A'
            };
            setTimeEntries([newEntry, ...timeEntries]);
        }
        setShowModal(false);
        setSelectedEntry(null);
    };

    const handleDeleteEntry = (entryId) => {
        if (confirm('Delete this time entry?')) {
            setTimeEntries(timeEntries.filter(e => e.id !== entryId));
        }
    };

    // Filter entries
    const filteredEntries = timeEntries.filter(entry => {
        const matchesProject = filterProject === 'All Projects' || entry.project === filterProject;
        const matchesSearch = entry.task.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            entry.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            entry.project.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Date filtering
        let matchesDate = true;
        if (filterDate !== 'All Time') {
            const entryDate = new Date(entry.date);
            const today = new Date();
            
            if (filterDate === 'Today') {
                matchesDate = entryDate.toDateString() === today.toDateString();
            } else if (filterDate === 'This Week') {
                const weekAgo = new Date(today);
                weekAgo.setDate(today.getDate() - 7);
                matchesDate = entryDate >= weekAgo;
            } else if (filterDate === 'This Month') {
                matchesDate = entryDate.getMonth() === today.getMonth() && 
                            entryDate.getFullYear() === today.getFullYear();
            }
        }
        
        return matchesProject && matchesSearch && matchesDate;
    });

    // Calculate stats
    const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const billableHours = filteredEntries.filter(e => e.billable).reduce((sum, entry) => sum + entry.hours, 0);
    const nonBillableHours = totalHours - billableHours;
    const utilization = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    // Group by project for stats
    const projectHours = {};
    filteredEntries.forEach(entry => {
        if (!projectHours[entry.project]) {
            projectHours[entry.project] = { total: 0, billable: 0 };
        }
        projectHours[entry.project].total += entry.hours;
        if (entry.billable) {
            projectHours[entry.project].billable += entry.hours;
        }
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">Time Tracking</h1>
                    <p className="text-xs text-gray-600">Track time spent on projects and tasks</p>
                </div>
                <button 
                    onClick={handleAddTimeEntry}
                    className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 transition flex items-center font-medium"
                >
                    <i className="fas fa-plus mr-1.5"></i>
                    Log Time
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5">Total Hours</p>
                            <p className="text-lg font-bold text-gray-900">{totalHours.toFixed(1)}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{filterDate}</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-clock text-blue-600"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5">Billable Hours</p>
                            <p className="text-lg font-bold text-green-600">{billableHours.toFixed(1)}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{filteredEntries.filter(e => e.billable).length} entries</p>
                        </div>
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-coins text-green-600"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5">Non-Billable</p>
                            <p className="text-lg font-bold text-orange-600">{nonBillableHours.toFixed(1)}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{filteredEntries.filter(e => !e.billable).length} entries</p>
                        </div>
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-clock text-orange-600"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5">Utilization</p>
                            <p className="text-lg font-bold text-purple-600">{utilization.toFixed(0)}%</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Billable ratio</p>
                        </div>
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-chart-line text-purple-600"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hours by Project */}
            {Object.keys(projectHours).length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <h2 className="text-sm font-semibold text-gray-900 mb-2.5">Hours by Project</h2>
                    <div className="space-y-2">
                        {Object.entries(projectHours)
                            .sort((a, b) => b[1].total - a[1].total)
                            .map(([projectName, hours]) => (
                                <div key={projectName}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-medium text-gray-700">{projectName}</span>
                                        <div className="text-xs text-gray-600">
                                            <span className="font-semibold">{hours.total.toFixed(1)}h</span>
                                            <span className="text-gray-500 ml-1.5">
                                                ({hours.billable.toFixed(1)}h billable)
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                                        <div 
                                            className="bg-primary-600 h-1.5 rounded-full transition-all" 
                                            style={{width: `${(hours.total / totalHours) * 100}%`}}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex gap-2.5">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search entries..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>
                    <select 
                        value={filterProject}
                        onChange={(e) => setFilterProject(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option>All Projects</option>
                        {projects.sort((a, b) => a.name.localeCompare(b.name)).map(project => (
                            <option key={project.id} value={project.name}>{project.name}</option>
                        ))}
                    </select>
                    <select 
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option>All Time</option>
                        <option>Today</option>
                        <option>This Week</option>
                        <option>This Month</option>
                    </select>
                </div>
            </div>

            {/* Time Entries Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Date</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Project</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Task</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Employee</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Hours</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Billable</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredEntries.length > 0 ? (
                            filteredEntries.map((entry) => (
                                <tr key={entry.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-900">
                                        {new Date(entry.date).toLocaleDateString('en-ZA', { 
                                            year: 'numeric', 
                                            month: 'short', 
                                            day: 'numeric' 
                                        })}
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        <div className="text-xs text-gray-900">{entry.project}</div>
                                        <div className="text-[10px] text-gray-500">{entry.client}</div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="text-xs text-gray-900">{entry.task}</div>
                                        {entry.description && (
                                            <div className="text-[10px] text-gray-500 truncate max-w-xs">
                                                {entry.description}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600">{entry.employee}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-xs font-medium text-gray-900">{entry.hours}h</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                                            entry.billable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {entry.billable ? 'Billable' : 'Non-billable'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                                        <button 
                                            onClick={() => handleEditEntry(entry)}
                                            className="text-primary-600 hover:text-primary-900 p-1"
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="7" className="px-6 py-8 text-center">
                                    <div className="text-gray-500">
                                        <i className="fas fa-clock text-3xl mb-2"></i>
                                        <p className="text-sm">No time entries found</p>
                                        <p className="text-xs mt-0.5">Try adjusting your filters or log some time!</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Log Time Modal */}
            {showModal && (
                <TimeModal
                    entry={selectedEntry}
                    projects={projects}
                    onSave={handleSaveEntry}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedEntry(null);
                    }}
                />
            )}
        </div>
    );
};

// Make available globally
window.TimeTracking = TimeTracking;
