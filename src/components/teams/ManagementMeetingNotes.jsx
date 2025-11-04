// Get dependencies from window
const { useState, useEffect, useMemo } = React;

// Department definitions
const DEPARTMENTS = [
    { id: 'compliance', name: 'Compliance', icon: 'fa-shield-alt', color: 'red' },
    { id: 'finance', name: 'Finance', icon: 'fa-coins', color: 'yellow' },
    { id: 'technical', name: 'Technical', icon: 'fa-tools', color: 'purple' },
    { id: 'support', name: 'Support', icon: 'fa-headset', color: 'green' },
    { id: 'data-analysis', name: 'Data Analysis', icon: 'fa-chart-line', color: 'indigo' },
    { id: 'commercial', name: 'Commercial', icon: 'fa-handshake', color: 'orange' },
    { id: 'business-development', name: 'Business Development', icon: 'fa-rocket', color: 'pink' },
    { id: 'ceo-comments', name: 'CEO Comments', icon: 'fa-user-tie', color: 'blue' }
];

const ManagementMeetingNotes = () => {
    const [meetingNotes, setMeetingNotes] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedWeek, setSelectedWeek] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingNote, setEditingNote] = useState(null);
    
    // Initialize selected month to current month
    useEffect(() => {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        setSelectedMonth(monthKey);
        console.log('📅 ManagementMeetingNotes: Initialized with month', monthKey);
    }, []);

    // Load meeting notes
    useEffect(() => {
        const loadMeetingNotes = async () => {
            try {
                console.log('📥 ManagementMeetingNotes: Loading meeting notes...');
                
                // Wait for dataService to be available
                let dataService = window.dataService;
                let attempts = 0;
                while (!dataService && attempts < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    dataService = window.dataService;
                    attempts++;
                }
                
                if (!dataService || typeof dataService.getManagementMeetingNotes !== 'function') {
                    console.error('❌ ManagementMeetingNotes: dataService not available after waiting');
                    setMeetingNotes([]);
                    setIsReady(true);
                    return;
                }
                
                const savedNotes = await dataService.getManagementMeetingNotes();
                const notes = Array.isArray(savedNotes) ? savedNotes : (savedNotes ? [savedNotes] : []);
                console.log('✅ ManagementMeetingNotes: Loaded', notes.length, 'month(s)', notes);
                setMeetingNotes(notes);
                setIsReady(true);
            } catch (error) {
                console.error('❌ ManagementMeetingNotes: Error loading meeting notes:', error);
                setMeetingNotes([]);
                setIsReady(true);
            }
        };
        loadMeetingNotes();
    }, []);

    // Get current month's notes
    const currentMonthNotes = useMemo(() => {
        if (!selectedMonth) return null;
        return meetingNotes.find(note => note.monthKey === selectedMonth) || null;
    }, [meetingNotes, selectedMonth]);

    // Get available months (sorted, most recent first)
    const availableMonths = useMemo(() => {
        const months = [...new Set(meetingNotes.map(note => note.monthKey))];
        return months.sort().reverse();
    }, [meetingNotes]);

    // Get weeks for selected month
    const weeks = useMemo(() => {
        if (!currentMonthNotes || !currentMonthNotes.weeklyNotes) return [];
        return currentMonthNotes.weeklyNotes.sort((a, b) => {
            const weekA = a.weekKey || '';
            const weekB = b.weekKey || '';
            return weekB.localeCompare(weekA);
        });
    }, [currentMonthNotes]);

    // Create or update month
    const handleCreateMonth = async () => {
        let monthKey = selectedMonth;
        if (!monthKey) {
            const now = new Date();
            monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            setSelectedMonth(monthKey);
        }
        
        const monthNote = {
            id: `month-${monthKey}`,
            monthKey: monthKey,
            monthlyGoals: '',
            weeklyNotes: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await handleSaveMonth(monthNote);
    };

    // Save month
    const handleSaveMonth = async (monthData) => {
        const existingIndex = meetingNotes.findIndex(note => note.monthKey === monthData.monthKey);
        let updatedNotes;
        
        if (existingIndex >= 0) {
            updatedNotes = [...meetingNotes];
            updatedNotes[existingIndex] = {
                ...updatedNotes[existingIndex],
                ...monthData,
                updatedAt: new Date().toISOString()
            };
        } else {
            updatedNotes = [...meetingNotes, monthData];
        }
        
        setMeetingNotes(updatedNotes);
        await window.dataService.setManagementMeetingNotes(updatedNotes);
    };

    // Create or update week
    const handleCreateWeek = async () => {
        if (!currentMonthNotes) {
            await handleCreateMonth();
            // Wait a bit for state to update, then reload
            setTimeout(() => {
                const savedNotes = window.storage?.getManagementMeetingNotes?.() || [];
                const updatedNotes = Array.isArray(savedNotes) ? savedNotes : [];
                setMeetingNotes(updatedNotes);
            }, 100);
            return;
        }
        
        const now = new Date();
        // Get start of week (Sunday)
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        // Create a simple week key based on date
        const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
        
        const weekNote = {
            id: `week-${selectedMonth}-${weekKey}`,
            weekKey: weekKey,
            weekStart: weekStart.toISOString(),
            departmentNotes: DEPARTMENTS.map(dept => ({
                departmentId: dept.id,
                successes: '',
                weekToFollow: '',
                frustrations: ''
            })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        handleSaveWeek(weekNote);
    };

    // Save week
    const handleSaveWeek = async (weekData) => {
        if (!currentMonthNotes) return;
        
        const existingWeekIndex = currentMonthNotes.weeklyNotes.findIndex(
            week => week.weekKey === weekData.weekKey
        );
        
        const updatedWeeklyNotes = existingWeekIndex >= 0
            ? currentMonthNotes.weeklyNotes.map((week, idx) => 
                idx === existingWeekIndex 
                    ? { ...week, ...weekData, updatedAt: new Date().toISOString() }
                    : week
            )
            : [...currentMonthNotes.weeklyNotes, weekData];
        
        const updatedMonth = {
            ...currentMonthNotes,
            weeklyNotes: updatedWeeklyNotes,
            updatedAt: new Date().toISOString()
        };
        
        await handleSaveMonth(updatedMonth);
    };

    // Save department notes for a week
    const handleSaveDepartmentNotes = async (weekKey, departmentId, field, value) => {
        if (!currentMonthNotes) return;
        
        const week = currentMonthNotes.weeklyNotes.find(w => w.weekKey === weekKey);
        if (!week) return;
        
        const departmentNote = week.departmentNotes.find(dn => dn.departmentId === departmentId);
        if (!departmentNote) return;
        
        departmentNote[field] = value;
        
        await handleSaveWeek({
            ...week,
            updatedAt: new Date().toISOString()
        });
    };

    // Format month display
    const formatMonth = (monthKey) => {
        if (!monthKey) return '';
        const [year, month] = monthKey.split('-');
        const date = new Date(year, parseInt(month) - 1, 1);
        return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    };

    // Format week display
    const formatWeek = (weekKey, weekStart) => {
        if (weekStart) {
            const start = new Date(weekStart);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            return `${start.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
        return weekKey || 'Week';
    };

    if (!isReady) {
        return (
            <div className="p-4">
                <div className="text-center py-12">
                    <i className="fas fa-clipboard-list text-4xl text-gray-300 mb-3 dark:text-slate-600"></i>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Loading meeting notes...</p>
                </div>
            </div>
        );
    }

    console.log('🔍 ManagementMeetingNotes: Rendering with', {
        selectedMonth,
        meetingNotesCount: meetingNotes.length,
        currentMonthNotes: currentMonthNotes ? 'exists' : 'null',
        isReady
    });

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Management Meeting Notes</h2>
                    <p className="text-xs text-gray-600 dark:text-slate-400">Monthly goals and weekly department updates</p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={selectedMonth || ''}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                    >
                        <option value="">Select Month...</option>
                        {availableMonths.map(month => (
                            <option key={month} value={month}>{formatMonth(month)}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleCreateMonth}
                        className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                    >
                        <i className="fas fa-plus mr-1"></i>
                        New Month
                    </button>
                </div>
            </div>

            {/* Month Selection Info */}
            {selectedMonth && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 dark:bg-blue-900/30 dark:border-blue-700">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                            {formatMonth(selectedMonth)}
                        </h3>
                        <button
                            onClick={handleCreateWeek}
                            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                            <i className="fas fa-plus mr-1"></i>
                            Add Week
                        </button>
                    </div>
                </div>
            )}

            {/* Monthly Goals Section */}
            {selectedMonth && currentMonthNotes && (
                <div className="bg-white rounded-lg border border-gray-200 p-4 dark:bg-slate-800 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">
                        <i className="fas fa-bullseye mr-2 text-primary-600 dark:text-primary-400"></i>
                        Monthly Goals
                    </h3>
                    <textarea
                        value={currentMonthNotes.monthlyGoals || ''}
                        onChange={(e) => handleSaveMonth({
                            ...currentMonthNotes,
                            monthlyGoals: e.target.value
                        })}
                        placeholder="Enter monthly goals for this month..."
                        className="w-full min-h-[120px] p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                    />
                </div>
            )}

            {/* Weekly Notes Section */}
            {selectedMonth && currentMonthNotes && weeks.length > 0 && (
                <div className="space-y-4">
                    {weeks.map((week) => (
                        <div key={week.id || week.weekKey} className="bg-white rounded-lg border border-gray-200 p-4 dark:bg-slate-800 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                    <i className="fas fa-calendar-week mr-2 text-primary-600 dark:text-primary-400"></i>
                                    Week: {formatWeek(week.weekKey, week.weekStart)}
                                </h3>
                                <button
                                    onClick={() => {
                                        setSelectedWeek(week.weekKey === selectedWeek ? null : week.weekKey);
                                    }}
                                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                                >
                                    {selectedWeek === week.weekKey ? (
                                        <><i className="fas fa-chevron-up mr-1"></i> Collapse</>
                                    ) : (
                                        <><i className="fas fa-chevron-down mr-1"></i> Expand</>
                                    )}
                                </button>
                            </div>

                            {selectedWeek === week.weekKey && (
                                <div className="space-y-4">
                                    {DEPARTMENTS.map((dept) => {
                                        const deptNote = week.departmentNotes?.find(
                                            dn => dn.departmentId === dept.id
                                        ) || {
                                            departmentId: dept.id,
                                            successes: '',
                                            weekToFollow: '',
                                            frustrations: ''
                                        };

                                        return (
                                            <div key={dept.id} className="border border-gray-200 rounded-lg p-3 dark:border-slate-700">
                                                <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 text-${dept.color}-700 dark:text-${dept.color}-300`}>
                                                    <i className={`fas ${dept.icon} text-${dept.color}-600 dark:text-${dept.color}-400`}></i>
                                                    {dept.name}
                                                </h4>
                                                
                                                <div className="space-y-3">
                                                    {/* Successes */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                                            Successes
                                                        </label>
                                                        <textarea
                                                            value={deptNote.successes || ''}
                                                            onChange={(e) => handleSaveDepartmentNotes(
                                                                week.weekKey,
                                                                dept.id,
                                                                'successes',
                                                                e.target.value
                                                            )}
                                                            placeholder="What went well this week?"
                                                            className="w-full min-h-[80px] p-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                                        />
                                                    </div>

                                                    {/* Week to Follow */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                                            Week to Follow
                                                        </label>
                                                        <textarea
                                                            value={deptNote.weekToFollow || ''}
                                                            onChange={(e) => handleSaveDepartmentNotes(
                                                                week.weekKey,
                                                                dept.id,
                                                                'weekToFollow',
                                                                e.target.value
                                                            )}
                                                            placeholder="What's planned for next week?"
                                                            className="w-full min-h-[80px] p-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                                        />
                                                    </div>

                                                    {/* Frustrations */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                                            Frustrations
                                                        </label>
                                                        <textarea
                                                            value={deptNote.frustrations || ''}
                                                            onChange={(e) => handleSaveDepartmentNotes(
                                                                week.weekKey,
                                                                dept.id,
                                                                'frustrations',
                                                                e.target.value
                                                            )}
                                                            placeholder="What challenges or blockers are we facing?"
                                                            className="w-full min-h-[80px] p-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {selectedMonth && !currentMonthNotes && (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center dark:bg-slate-800 dark:border-slate-700">
                    <i className="fas fa-clipboard-list text-4xl text-gray-300 mb-3 dark:text-slate-600"></i>
                    <p className="text-sm text-gray-500 mb-4 dark:text-slate-400">
                        No meeting notes for {formatMonth(selectedMonth)} yet.
                    </p>
                    <button
                        onClick={handleCreateMonth}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                    >
                        Create Month Notes
                    </button>
                </div>
            )}

            {!selectedMonth && (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center dark:bg-slate-800 dark:border-slate-700">
                    <i className="fas fa-calendar text-4xl text-gray-300 mb-3 dark:text-slate-600"></i>
                    <p className="text-sm text-gray-500 mb-4 dark:text-slate-400">
                        Select a month to view or create meeting notes.
                    </p>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.ManagementMeetingNotes = ManagementMeetingNotes;

