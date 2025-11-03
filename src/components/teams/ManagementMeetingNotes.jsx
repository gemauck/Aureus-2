// Management Meeting Notes Component
// Tracks weekly management meetings with tasks, goals, and notes

const { useState, useEffect, useMemo } = React;
const { useAuth } = window;

const ManagementMeetingNotes = () => {
    const { user } = useAuth();
    const [meetings, setMeetings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingMeeting, setEditingMeeting] = useState(null);
    const [filterWeek, setFilterWeek] = useState('all'); // 'all', 'current', 'past', 'upcoming'
    const [searchTerm, setSearchTerm] = useState('');

    // Load meetings from data service
    useEffect(() => {
        const loadMeetings = async () => {
            try {
                setIsLoading(true);
                const savedMeetings = await (window.dataService?.getManagementMeetings?.() || Promise.resolve([]));
                const meetingsArray = Array.isArray(savedMeetings) ? savedMeetings : [];
                setMeetings(meetingsArray.sort((a, b) => new Date(b.meetingDate) - new Date(a.meetingDate)));
                setIsLoading(false);
            } catch (error) {
                console.error('Error loading management meetings:', error);
                setMeetings([]);
                setIsLoading(false);
            }
        };
        loadMeetings();
    }, []);

    // Filter meetings
    const filteredMeetings = useMemo(() => {
        let filtered = meetings;

        // Filter by week
        const now = new Date();
        const currentWeekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        currentWeekStart.setHours(0, 0, 0, 0);

        if (filterWeek === 'current') {
            const currentWeekEnd = new Date(currentWeekStart);
            currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
            filtered = filtered.filter(m => {
                const meetingDate = new Date(m.meetingDate);
                return meetingDate >= currentWeekStart && meetingDate <= currentWeekEnd;
            });
        } else if (filterWeek === 'past') {
            filtered = filtered.filter(m => new Date(m.meetingDate) < currentWeekStart);
        } else if (filterWeek === 'upcoming') {
            const currentWeekEnd = new Date(currentWeekStart);
            currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
            filtered = filtered.filter(m => new Date(m.meetingDate) > currentWeekEnd);
        }

        // Filter by search term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(m =>
                m.title?.toLowerCase().includes(term) ||
                m.notes?.toLowerCase().includes(term) ||
                m.tasks?.some(t => t.title?.toLowerCase().includes(term)) ||
                m.goals?.some(g => g.title?.toLowerCase().includes(term))
            );
        }

        return filtered;
    }, [meetings, filterWeek, searchTerm]);

    // Calculate stats
    const stats = useMemo(() => {
        const allTasks = meetings.flatMap(m => m.tasks || []);
        const allGoals = meetings.flatMap(m => m.goals || []);
        
        return {
            totalMeetings: meetings.length,
            totalTasks: allTasks.length,
            completedTasks: allTasks.filter(t => t.status === 'completed').length,
            totalGoals: allGoals.length,
            completedGoals: allGoals.filter(g => g.status === 'completed').length,
            inProgressTasks: allTasks.filter(t => t.status === 'in_progress').length,
            pendingTasks: allTasks.filter(t => t.status === 'pending').length
        };
    }, [meetings]);

    const handleSaveMeeting = async (meetingData) => {
        try {
            const existingIndex = meetings.findIndex(m => m.id === meetingData.id);
            let updatedMeetings;

            if (existingIndex >= 0) {
                updatedMeetings = [...meetings];
                updatedMeetings[existingIndex] = {
                    ...meetingData,
                    updatedAt: new Date().toISOString()
                };
            } else {
                updatedMeetings = [...meetings, {
                    ...meetingData,
                    id: meetingData.id || `meeting_${Date.now()}`,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }];
            }

            // Sort by date descending
            updatedMeetings.sort((a, b) => new Date(b.meetingDate) - new Date(a.meetingDate));
            
            setMeetings(updatedMeetings);
            await (window.dataService?.setManagementMeetings?.(updatedMeetings) || Promise.resolve());
            setShowModal(false);
            setEditingMeeting(null);
        } catch (error) {
            console.error('Error saving meeting:', error);
            alert('Failed to save meeting. Please try again.');
        }
    };

    const handleDeleteMeeting = async (id) => {
        if (confirm('Are you sure you want to delete this meeting? This action cannot be undone.')) {
            try {
                const updatedMeetings = meetings.filter(m => m.id !== id);
                setMeetings(updatedMeetings);
                await (window.dataService?.setManagementMeetings?.(updatedMeetings) || Promise.resolve());
            } catch (error) {
                console.error('Error deleting meeting:', error);
                alert('Failed to delete meeting. Please try again.');
            }
        }
    };

    const handleEditMeeting = (meeting) => {
        setEditingMeeting(meeting);
        setShowModal(true);
    };

    const formatWeekRange = (dateString) => {
        const date = new Date(dateString);
        const dayOfWeek = date.getDay();
        const diff = date.getDate() - dayOfWeek;
        const weekStart = new Date(date.setDate(diff));
        const weekEnd = new Date(date.setDate(diff + 6));
        
        return `${weekStart.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
            case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
            case 'pending': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
            case 'blocked': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
            default: return 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200';
        }
    };

    if (isLoading) {
        return (
            <div className="text-center py-12">
                <i className="fas fa-spinner fa-spin text-3xl text-gray-300 mb-3 dark:text-slate-600"></i>
                <p className="text-sm text-gray-500 dark:text-slate-400">Loading meeting notes...</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Management Meeting Notes</h2>
                    <p className="text-xs text-gray-600 dark:text-slate-400">Track weekly meetings, tasks, and goals</p>
                </div>
                <button
                    onClick={() => {
                        setEditingMeeting(null);
                        setShowModal(true);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs font-medium"
                >
                    <i className="fas fa-plus mr-1.5"></i>
                    New Meeting
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5 dark:text-slate-400">Total Meetings</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{stats.totalMeetings}</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center dark:bg-blue-900">
                            <i className="fas fa-calendar-alt text-blue-600 dark:text-blue-300"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5 dark:text-slate-400">Total Tasks</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{stats.totalTasks}</p>
                            <p className="text-xs text-green-600 dark:text-green-400">{stats.completedTasks} completed</p>
                        </div>
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center dark:bg-green-900">
                            <i className="fas fa-tasks text-green-600 dark:text-green-300"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5 dark:text-slate-400">In Progress</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{stats.inProgressTasks}</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center dark:bg-blue-900">
                            <i className="fas fa-spinner text-blue-600 dark:text-blue-300"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5 dark:text-slate-400">Total Goals</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{stats.totalGoals}</p>
                            <p className="text-xs text-green-600 dark:text-green-400">{stats.completedGoals} completed</p>
                        </div>
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center dark:bg-purple-900">
                            <i className="fas fa-bullseye text-purple-600 dark:text-purple-300"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters and Search */}
            <div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Search meetings, tasks, goals..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400"
                        />
                        <i className="fas fa-search absolute left-2.5 top-2 text-gray-400 text-xs dark:text-slate-400"></i>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setFilterWeek('all')}
                            className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                filterWeek === 'all'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilterWeek('current')}
                            className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                filterWeek === 'current'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            Current Week
                        </button>
                        <button
                            onClick={() => setFilterWeek('past')}
                            className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                filterWeek === 'past'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            Past
                        </button>
                        <button
                            onClick={() => setFilterWeek('upcoming')}
                            className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                filterWeek === 'upcoming'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            Upcoming
                        </button>
                    </div>
                </div>
            </div>

            {/* Meetings List */}
            {filteredMeetings.length > 0 ? (
                <div className="space-y-3">
                    {filteredMeetings.map(meeting => {
                        const tasks = meeting.tasks || [];
                        const goals = meeting.goals || [];
                        const completedTasks = tasks.filter(t => t.status === 'completed').length;
                        const completedGoals = goals.filter(g => g.status === 'completed').length;

                        return (
                            <div key={meeting.id} className="bg-white rounded-lg border border-gray-200 p-4 dark:bg-slate-800 dark:border-slate-700">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                                                {meeting.title || 'Management Meeting'}
                                            </h3>
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded dark:bg-blue-900 dark:text-blue-300">
                                                {formatWeekRange(meeting.meetingDate)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-slate-400">
                                            {new Date(meeting.meetingDate).toLocaleDateString('en-ZA', {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => handleEditMeeting(meeting)}
                                            className="p-1.5 text-gray-400 hover:text-primary-600 transition dark:text-slate-400 dark:hover:text-primary-400"
                                            title="Edit"
                                        >
                                            <i className="fas fa-edit text-sm"></i>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteMeeting(meeting.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 transition dark:text-slate-400 dark:hover:text-red-400"
                                            title="Delete"
                                        >
                                            <i className="fas fa-trash text-sm"></i>
                                        </button>
                                    </div>
                                </div>

                                {/* Meeting Notes */}
                                {meeting.notes && (
                                    <div className="mb-4 p-3 bg-gray-50 rounded-lg dark:bg-slate-700">
                                        <h4 className="text-xs font-semibold text-gray-700 mb-2 dark:text-slate-300">Meeting Notes</h4>
                                        <p className="text-sm text-gray-600 whitespace-pre-wrap dark:text-slate-400">{meeting.notes}</p>
                                    </div>
                                )}

                                {/* Tasks */}
                                {tasks.length > 0 && (
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                                <i className="fas fa-tasks mr-1.5 text-green-600 dark:text-green-400"></i>
                                                Tasks ({completedTasks}/{tasks.length})
                                            </h4>
                                            <div className="w-32 bg-gray-200 rounded-full h-2 dark:bg-slate-700">
                                                <div
                                                    className="bg-green-600 h-2 rounded-full transition-all dark:bg-green-500"
                                                    style={{ width: `${(completedTasks / tasks.length) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {tasks.map((task, idx) => (
                                                <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded dark:bg-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={task.status === 'completed'}
                                                        readOnly
                                                        className="mt-1"
                                                    />
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900 dark:text-slate-100'}`}>
                                                                {task.title}
                                                            </span>
                                                            <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(task.status)}`}>
                                                                {task.status.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                        {task.assignee && (
                                                            <p className="text-xs text-gray-500 mt-0.5 dark:text-slate-400">
                                                                <i className="fas fa-user mr-1"></i>
                                                                {task.assignee}
                                                            </p>
                                                        )}
                                                        {task.dueDate && (
                                                            <p className="text-xs text-gray-500 dark:text-slate-400">
                                                                <i className="fas fa-calendar mr-1"></i>
                                                                Due: {new Date(task.dueDate).toLocaleDateString('en-ZA')}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Goals */}
                                {goals.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                                <i className="fas fa-bullseye mr-1.5 text-purple-600 dark:text-purple-400"></i>
                                                Goals ({completedGoals}/{goals.length})
                                            </h4>
                                            <div className="w-32 bg-gray-200 rounded-full h-2 dark:bg-slate-700">
                                                <div
                                                    className="bg-purple-600 h-2 rounded-full transition-all dark:bg-purple-500"
                                                    style={{ width: `${(completedGoals / goals.length) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {goals.map((goal, idx) => (
                                                <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded dark:bg-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={goal.status === 'completed'}
                                                        readOnly
                                                        className="mt-1"
                                                    />
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs font-medium ${goal.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900 dark:text-slate-100'}`}>
                                                                {goal.title}
                                                            </span>
                                                            <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(goal.status)}`}>
                                                                {goal.status.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                        {goal.progress !== undefined && (
                                                            <div className="mt-1">
                                                                <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-slate-600">
                                                                    <div
                                                                        className="bg-purple-600 h-1.5 rounded-full transition-all dark:bg-purple-500"
                                                                        style={{ width: `${goal.progress}%` }}
                                                                    ></div>
                                                                </div>
                                                                <p className="text-xs text-gray-500 mt-0.5 dark:text-slate-400">{goal.progress}% complete</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Empty State */}
                                {tasks.length === 0 && goals.length === 0 && !meeting.notes && (
                                    <div className="text-center py-4 text-xs text-gray-500 dark:text-slate-400">
                                        No tasks, goals, or notes added yet
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center dark:bg-slate-800 dark:border-slate-700">
                    <i className="fas fa-calendar-alt text-4xl text-gray-300 mb-3 dark:text-slate-600"></i>
                    <p className="text-sm text-gray-500 mb-4 dark:text-slate-400">
                        {searchTerm || filterWeek !== 'all' ? 'No meetings match your filters' : 'No meetings recorded yet'}
                    </p>
                    <button
                        onClick={() => {
                            setEditingMeeting(null);
                            setShowModal(true);
                        }}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs font-medium"
                    >
                        <i className="fas fa-plus mr-1.5"></i>
                        Create First Meeting
                    </button>
                </div>
            )}

            {/* Meeting Modal */}
            {showModal && window.ManagementMeetingModal && (
                <window.ManagementMeetingModal
                    isOpen={showModal}
                    onClose={() => {
                        setShowModal(false);
                        setEditingMeeting(null);
                    }}
                    meeting={editingMeeting}
                    onSave={handleSaveMeeting}
                />
            )}
        </div>
    );
};

// Make available globally
window.ManagementMeetingNotes = ManagementMeetingNotes;
