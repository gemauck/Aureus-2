// Management Meeting Modal Component
// Form for creating/editing management meeting notes

const { useState, useEffect } = React;
const { useAuth } = window;

const ManagementMeetingModal = ({ isOpen, onClose, meeting, onSave }) => {
    const { user } = useAuth();
    const [title, setTitle] = useState('');
    const [meetingDate, setMeetingDate] = useState('');
    const [notes, setNotes] = useState('');
    const [tasks, setTasks] = useState([]);
    const [goals, setGoals] = useState([]);
    const [newTask, setNewTask] = useState({ title: '', assignee: '', dueDate: '', status: 'pending' });
    const [newGoal, setNewGoal] = useState({ title: '', progress: 0, status: 'pending' });
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [users, setUsers] = useState([]);
    
    // Structured meeting fields (spreadsheet-like)
    const [attendees, setAttendees] = useState([]);
    const [agendaItems, setAgendaItems] = useState([]);
    const [discussionPoints, setDiscussionPoints] = useState([]);
    const [decisions, setDecisions] = useState([]);
    const [actionItems, setActionItems] = useState([]);
    const [kpis, setKpis] = useState([]);
    const [followUps, setFollowUps] = useState([]);
    const [newAttendee, setNewAttendee] = useState('');
    const [newAgendaItem, setNewAgendaItem] = useState({ topic: '', presenter: '', timeAllocated: '' });
    const [newDiscussionPoint, setNewDiscussionPoint] = useState('');
    const [newDecision, setNewDecision] = useState('');
    const [newActionItem, setNewActionItem] = useState({ item: '', owner: '', dueDate: '', priority: 'medium' });
    const [newKpi, setNewKpi] = useState({ metric: '', value: '', target: '', status: 'on_track' });
    const [newFollowUp, setNewFollowUp] = useState({ item: '', owner: '', dueDate: '' });

    // Load users for assignee dropdown
    useEffect(() => {
        const loadUsers = async () => {
            try {
                const usersData = await (window.dataService?.getUsers?.() || Promise.resolve([]));
                setUsers(Array.isArray(usersData) ? usersData : []);
            } catch (error) {
                console.error('Error loading users:', error);
            }
        };
        loadUsers();
    }, []);

    // Initialize form when meeting changes or modal opens
    useEffect(() => {
        if (isOpen) {
            if (meeting) {
                // Editing existing meeting
                setTitle(meeting.title || '');
                setMeetingDate(meeting.meetingDate ? new Date(meeting.meetingDate).toISOString().split('T')[0] : '');
                setNotes(meeting.notes || '');
                setTasks(Array.isArray(meeting.tasks) ? meeting.tasks : []);
                setGoals(Array.isArray(meeting.goals) ? meeting.goals : []);
                setAttendees(Array.isArray(meeting.attendees) ? meeting.attendees : []);
                setAgendaItems(Array.isArray(meeting.agendaItems) ? meeting.agendaItems : []);
                setDiscussionPoints(Array.isArray(meeting.discussionPoints) ? meeting.discussionPoints : []);
                setDecisions(Array.isArray(meeting.decisions) ? meeting.decisions : []);
                setActionItems(Array.isArray(meeting.actionItems) ? meeting.actionItems : []);
                setKpis(Array.isArray(meeting.kpis) ? meeting.kpis : []);
                setFollowUps(Array.isArray(meeting.followUps) ? meeting.followUps : []);
            } else {
                // New meeting - default to today
                const today = new Date();
                setTitle('');
                setMeetingDate(today.toISOString().split('T')[0]);
                setNotes('');
                setTasks([]);
                setGoals([]);
                setAttendees([]);
                setAgendaItems([]);
                setDiscussionPoints([]);
                setDecisions([]);
                setActionItems([]);
                setKpis([]);
                setFollowUps([]);
            }
            setNewTask({ title: '', assignee: '', dueDate: '', status: 'pending' });
            setNewGoal({ title: '', progress: 0, status: 'pending' });
            setNewAttendee('');
            setNewAgendaItem({ topic: '', presenter: '', timeAllocated: '' });
            setNewDiscussionPoint('');
            setNewDecision('');
            setNewActionItem({ item: '', owner: '', dueDate: '', priority: 'medium' });
            setNewKpi({ metric: '', value: '', target: '', status: 'on_track' });
            setNewFollowUp({ item: '', owner: '', dueDate: '' });
            setShowTaskForm(false);
            setShowGoalForm(false);
        }
    }, [isOpen, meeting]);

    const handleAddTask = () => {
        if (newTask.title.trim()) {
            const task = {
                id: `task_${Date.now()}`,
                ...newTask,
                createdAt: new Date().toISOString()
            };
            setTasks([...tasks, task]);
            setNewTask({ title: '', assignee: '', dueDate: '', status: 'pending' });
            setShowTaskForm(false);
        }
    };

    const handleRemoveTask = (taskId) => {
        setTasks(tasks.filter(t => t.id !== taskId));
    };

    const handleUpdateTask = (taskId, updates) => {
        setTasks(tasks.map(t => t.id === taskId ? { ...t, ...updates } : t));
    };

    const handleAddGoal = () => {
        if (newGoal.title.trim()) {
            const goal = {
                id: `goal_${Date.now()}`,
                ...newGoal,
                createdAt: new Date().toISOString()
            };
            setGoals([...goals, goal]);
            setNewGoal({ title: '', progress: 0, status: 'pending' });
            setShowGoalForm(false);
        }
    };

    const handleRemoveGoal = (goalId) => {
        setGoals(goals.filter(g => g.id !== goalId));
    };

    const handleUpdateGoal = (goalId, updates) => {
        setGoals(goals.map(g => g.id === goalId ? { ...g, ...updates } : g));
    };

    // Handlers for structured fields
    const handleAddAttendee = () => {
        if (newAttendee.trim() && !attendees.includes(newAttendee.trim())) {
            setAttendees([...attendees, newAttendee.trim()]);
            setNewAttendee('');
        }
    };

    const handleRemoveAttendee = (attendee) => {
        setAttendees(attendees.filter(a => a !== attendee));
    };

    const handleAddAgendaItem = () => {
        if (newAgendaItem.topic.trim()) {
            setAgendaItems([...agendaItems, { id: `agenda_${Date.now()}`, ...newAgendaItem }]);
            setNewAgendaItem({ topic: '', presenter: '', timeAllocated: '' });
        }
    };

    const handleRemoveAgendaItem = (id) => {
        setAgendaItems(agendaItems.filter(a => a.id !== id));
    };

    const handleAddDiscussionPoint = () => {
        if (newDiscussionPoint.trim()) {
            setDiscussionPoints([...discussionPoints, { id: `disc_${Date.now()}`, point: newDiscussionPoint.trim() }]);
            setNewDiscussionPoint('');
        }
    };

    const handleRemoveDiscussionPoint = (id) => {
        setDiscussionPoints(discussionPoints.filter(d => d.id !== id));
    };

    const handleAddDecision = () => {
        if (newDecision.trim()) {
            setDecisions([...decisions, { id: `decision_${Date.now()}`, decision: newDecision.trim() }]);
            setNewDecision('');
        }
    };

    const handleRemoveDecision = (id) => {
        setDecisions(decisions.filter(d => d.id !== id));
    };

    const handleAddActionItem = () => {
        if (newActionItem.item.trim()) {
            setActionItems([...actionItems, { id: `action_${Date.now()}`, ...newActionItem }]);
            setNewActionItem({ item: '', owner: '', dueDate: '', priority: 'medium' });
        }
    };

    const handleRemoveActionItem = (id) => {
        setActionItems(actionItems.filter(a => a.id !== id));
    };

    const handleAddKpi = () => {
        if (newKpi.metric.trim()) {
            setKpis([...kpis, { id: `kpi_${Date.now()}`, ...newKpi }]);
            setNewKpi({ metric: '', value: '', target: '', status: 'on_track' });
        }
    };

    const handleRemoveKpi = (id) => {
        setKpis(kpis.filter(k => k.id !== id));
    };

    const handleAddFollowUp = () => {
        if (newFollowUp.item.trim()) {
            setFollowUps([...followUps, { id: `followup_${Date.now()}`, ...newFollowUp }]);
            setNewFollowUp({ item: '', owner: '', dueDate: '' });
        }
    };

    const handleRemoveFollowUp = (id) => {
        setFollowUps(followUps.filter(f => f.id !== id));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!meetingDate) {
            alert('Please select a meeting date');
            return;
        }

        const meetingData = {
            id: meeting?.id || `meeting_${Date.now()}`,
            title: title || `Management Meeting - ${new Date(meetingDate).toLocaleDateString('en-ZA')}`,
            meetingDate,
            notes,
            tasks,
            goals,
            attendees,
            agendaItems,
            discussionPoints,
            decisions,
            actionItems,
            kpis,
            followUps,
            createdBy: user?.name || user?.email || 'Unknown',
            updatedBy: user?.name || user?.email || 'Unknown'
        };

        onSave(meetingData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 dark:bg-slate-800 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                        {meeting ? 'Edit Meeting' : 'New Management Meeting'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition dark:text-slate-400 dark:hover:text-slate-200"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Basic Information */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5 dark:text-slate-300">
                                Meeting Title
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g., Weekly Management Meeting"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5 dark:text-slate-300">
                                Meeting Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={meetingDate}
                                onChange={(e) => setMeetingDate(e.target.value)}
                                required
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5 dark:text-slate-300">
                                General Notes
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Additional notes, observations, or comments..."
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    {/* Attendees Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">
                            <i className="fas fa-users mr-1.5 text-blue-600 dark:text-blue-400"></i>
                            Attendees ({attendees.length})
                        </h4>
                        <div className="flex gap-2 mb-3">
                            <input
                                type="text"
                                value={newAttendee}
                                onChange={(e) => setNewAttendee(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAttendee())}
                                placeholder="Add attendee name"
                                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <button
                                type="button"
                                onClick={handleAddAttendee}
                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>Add
                            </button>
                        </div>
                        {attendees.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {attendees.map((attendee, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs dark:bg-blue-900 dark:text-blue-300">
                                        {attendee}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveAttendee(attendee)}
                                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                                        >
                                            <i className="fas fa-times text-xs"></i>
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Agenda Items Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">
                            <i className="fas fa-list-ul mr-1.5 text-green-600 dark:text-green-400"></i>
                            Agenda Items ({agendaItems.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                            <input
                                type="text"
                                value={newAgendaItem.topic}
                                onChange={(e) => setNewAgendaItem({ ...newAgendaItem, topic: e.target.value })}
                                placeholder="Topic"
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <input
                                type="text"
                                value={newAgendaItem.presenter}
                                onChange={(e) => setNewAgendaItem({ ...newAgendaItem, presenter: e.target.value })}
                                placeholder="Presenter"
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <input
                                type="text"
                                value={newAgendaItem.timeAllocated}
                                onChange={(e) => setNewAgendaItem({ ...newAgendaItem, timeAllocated: e.target.value })}
                                placeholder="Time (e.g., 15 min)"
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <button
                                type="button"
                                onClick={handleAddAgendaItem}
                                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>Add
                            </button>
                        </div>
                        {agendaItems.length > 0 && (
                            <div className="space-y-2">
                                {agendaItems.map((item) => (
                                    <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded dark:bg-slate-700">
                                        <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                                            <span className="font-medium dark:text-slate-100">{item.topic}</span>
                                            <span className="text-gray-600 dark:text-slate-400">{item.presenter}</span>
                                            <span className="text-gray-500 dark:text-slate-500">{item.timeAllocated}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveAgendaItem(item.id)}
                                            className="p-1 text-red-600 hover:text-red-700 transition"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Discussion Points Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">
                            <i className="fas fa-comments mr-1.5 text-purple-600 dark:text-purple-400"></i>
                            Discussion Points ({discussionPoints.length})
                        </h4>
                        <div className="flex gap-2 mb-3">
                            <input
                                type="text"
                                value={newDiscussionPoint}
                                onChange={(e) => setNewDiscussionPoint(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDiscussionPoint())}
                                placeholder="Add discussion point"
                                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <button
                                type="button"
                                onClick={handleAddDiscussionPoint}
                                className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>Add
                            </button>
                        </div>
                        {discussionPoints.length > 0 && (
                            <div className="space-y-2">
                                {discussionPoints.map((point) => (
                                    <div key={point.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded dark:bg-slate-700">
                                        <span className="flex-1 text-xs dark:text-slate-100">{point.point}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveDiscussionPoint(point.id)}
                                            className="p-1 text-red-600 hover:text-red-700 transition"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Decisions Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">
                            <i className="fas fa-gavel mr-1.5 text-orange-600 dark:text-orange-400"></i>
                            Decisions ({decisions.length})
                        </h4>
                        <div className="flex gap-2 mb-3">
                            <input
                                type="text"
                                value={newDecision}
                                onChange={(e) => setNewDecision(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDecision())}
                                placeholder="Add decision made"
                                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <button
                                type="button"
                                onClick={handleAddDecision}
                                className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>Add
                            </button>
                        </div>
                        {decisions.length > 0 && (
                            <div className="space-y-2">
                                {decisions.map((decision) => (
                                    <div key={decision.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded dark:bg-slate-700">
                                        <span className="flex-1 text-xs dark:text-slate-100">{decision.decision}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveDecision(decision.id)}
                                            className="p-1 text-red-600 hover:text-red-700 transition"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Action Items Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">
                            <i className="fas fa-tasks mr-1.5 text-indigo-600 dark:text-indigo-400"></i>
                            Action Items ({actionItems.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                            <input
                                type="text"
                                value={newActionItem.item}
                                onChange={(e) => setNewActionItem({ ...newActionItem, item: e.target.value })}
                                placeholder="Action item"
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <select
                                value={newActionItem.owner}
                                onChange={(e) => setNewActionItem({ ...newActionItem, owner: e.target.value })}
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="">Owner</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.name || u.email}>{u.name || u.email}</option>
                                ))}
                            </select>
                            <input
                                type="date"
                                value={newActionItem.dueDate}
                                onChange={(e) => setNewActionItem({ ...newActionItem, dueDate: e.target.value })}
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <select
                                value={newActionItem.priority}
                                onChange={(e) => setNewActionItem({ ...newActionItem, priority: e.target.value })}
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleAddActionItem}
                                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>Add
                            </button>
                        </div>
                        {actionItems.length > 0 && (
                            <div className="space-y-2">
                                {actionItems.map((item) => (
                                    <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded dark:bg-slate-700">
                                        <div className="flex-1 grid grid-cols-4 gap-2 text-xs">
                                            <span className="font-medium dark:text-slate-100">{item.item}</span>
                                            <span className="text-gray-600 dark:text-slate-400">{item.owner}</span>
                                            <span className="text-gray-500 dark:text-slate-500">{item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-ZA') : 'No date'}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs ${
                                                item.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                                                item.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                                                item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                                'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200'
                                            }`}>
                                                {item.priority}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveActionItem(item.id)}
                                            className="p-1 text-red-600 hover:text-red-700 transition"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* KPIs Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">
                            <i className="fas fa-chart-line mr-1.5 text-teal-600 dark:text-teal-400"></i>
                            KPIs & Metrics ({kpis.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                            <input
                                type="text"
                                value={newKpi.metric}
                                onChange={(e) => setNewKpi({ ...newKpi, metric: e.target.value })}
                                placeholder="Metric name"
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <input
                                type="text"
                                value={newKpi.value}
                                onChange={(e) => setNewKpi({ ...newKpi, value: e.target.value })}
                                placeholder="Current value"
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <input
                                type="text"
                                value={newKpi.target}
                                onChange={(e) => setNewKpi({ ...newKpi, target: e.target.value })}
                                placeholder="Target"
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <select
                                value={newKpi.status}
                                onChange={(e) => setNewKpi({ ...newKpi, status: e.target.value })}
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="on_track">On Track</option>
                                <option value="at_risk">At Risk</option>
                                <option value="off_track">Off Track</option>
                                <option value="exceeded">Exceeded</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleAddKpi}
                                className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>Add
                            </button>
                        </div>
                        {kpis.length > 0 && (
                            <div className="space-y-2">
                                {kpis.map((kpi) => (
                                    <div key={kpi.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded dark:bg-slate-700">
                                        <div className="flex-1 grid grid-cols-4 gap-2 text-xs">
                                            <span className="font-medium dark:text-slate-100">{kpi.metric}</span>
                                            <span className="text-gray-600 dark:text-slate-400">{kpi.value} / {kpi.target}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs ${
                                                kpi.status === 'exceeded' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                                                kpi.status === 'on_track' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                                kpi.status === 'at_risk' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                                'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                            }`}>
                                                {kpi.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveKpi(kpi.id)}
                                            className="p-1 text-red-600 hover:text-red-700 transition"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Follow-ups Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">
                            <i className="fas fa-redo mr-1.5 text-pink-600 dark:text-pink-400"></i>
                            Follow-ups ({followUps.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                            <input
                                type="text"
                                value={newFollowUp.item}
                                onChange={(e) => setNewFollowUp({ ...newFollowUp, item: e.target.value })}
                                placeholder="Follow-up item"
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <select
                                value={newFollowUp.owner}
                                onChange={(e) => setNewFollowUp({ ...newFollowUp, owner: e.target.value })}
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="">Owner</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.name || u.email}>{u.name || u.email}</option>
                                ))}
                            </select>
                            <input
                                type="date"
                                value={newFollowUp.dueDate}
                                onChange={(e) => setNewFollowUp({ ...newFollowUp, dueDate: e.target.value })}
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                            <button
                                type="button"
                                onClick={handleAddFollowUp}
                                className="px-3 py-1.5 text-xs bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>Add
                            </button>
                        </div>
                        {followUps.length > 0 && (
                            <div className="space-y-2">
                                {followUps.map((followUp) => (
                                    <div key={followUp.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded dark:bg-slate-700">
                                        <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                                            <span className="font-medium dark:text-slate-100">{followUp.item}</span>
                                            <span className="text-gray-600 dark:text-slate-400">{followUp.owner}</span>
                                            <span className="text-gray-500 dark:text-slate-500">{followUp.dueDate ? new Date(followUp.dueDate).toLocaleDateString('en-ZA') : 'No date'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveFollowUp(followUp.id)}
                                            className="p-1 text-red-600 hover:text-red-700 transition"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tasks Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                <i className="fas fa-tasks mr-1.5 text-green-600 dark:text-green-400"></i>
                                Tasks ({tasks.length})
                            </h4>
                            <button
                                type="button"
                                onClick={() => setShowTaskForm(!showTaskForm)}
                                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>
                                Add Task
                            </button>
                        </div>

                        {showTaskForm && (
                            <div className="mb-4 p-3 bg-gray-50 rounded-lg dark:bg-slate-700">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                            Task Title <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={newTask.title}
                                            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                            placeholder="Enter task description"
                                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                            Assignee
                                        </label>
                                        <select
                                            value={newTask.assignee}
                                            onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })}
                                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                        >
                                            <option value="">Unassigned</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.name || u.email}>
                                                    {u.name || u.email}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                            Due Date
                                        </label>
                                        <input
                                            type="date"
                                            value={newTask.dueDate}
                                            onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                            Status
                                        </label>
                                        <select
                                            value={newTask.status}
                                            onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                        >
                                            <option value="pending">Pending</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="completed">Completed</option>
                                            <option value="blocked">Blocked</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleAddTask}
                                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                                    >
                                        Add Task
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowTaskForm(false);
                                            setNewTask({ title: '', assignee: '', dueDate: '', status: 'pending' });
                                        }}
                                        className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition dark:bg-slate-600 dark:text-slate-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {tasks.length > 0 ? (
                            <div className="space-y-2">
                                {tasks.map((task, idx) => (
                                    <div key={task.id || idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg dark:bg-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={task.status === 'completed'}
                                            onChange={(e) => handleUpdateTask(task.id, {
                                                status: e.target.checked ? 'completed' : 'pending'
                                            })}
                                            className="mt-1"
                                        />
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                                            <div>
                                                <input
                                                    type="text"
                                                    value={task.title}
                                                    onChange={(e) => handleUpdateTask(task.id, { title: e.target.value })}
                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                                />
                                            </div>
                                            <div>
                                                <select
                                                    value={task.assignee || ''}
                                                    onChange={(e) => handleUpdateTask(task.id, { assignee: e.target.value })}
                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                                >
                                                    <option value="">Unassigned</option>
                                                    {users.map(u => (
                                                        <option key={u.id} value={u.name || u.email}>
                                                            {u.name || u.email}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="date"
                                                    value={task.dueDate || ''}
                                                    onChange={(e) => handleUpdateTask(task.id, { dueDate: e.target.value })}
                                                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                                />
                                                <select
                                                    value={task.status}
                                                    onChange={(e) => handleUpdateTask(task.id, { status: e.target.value })}
                                                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="in_progress">In Progress</option>
                                                    <option value="completed">Completed</option>
                                                    <option value="blocked">Blocked</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveTask(task.id)}
                                                    className="p-1 text-red-600 hover:text-red-700 transition"
                                                >
                                                    <i className="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500 text-center py-4 dark:text-slate-400">No tasks added yet</p>
                        )}
                    </div>

                    {/* Goals Section */}
                    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                <i className="fas fa-bullseye mr-1.5 text-purple-600 dark:text-purple-400"></i>
                                Goals ({goals.length})
                            </h4>
                            <button
                                type="button"
                                onClick={() => setShowGoalForm(!showGoalForm)}
                                className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>
                                Add Goal
                            </button>
                        </div>

                        {showGoalForm && (
                            <div className="mb-4 p-3 bg-gray-50 rounded-lg dark:bg-slate-700">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                            Goal Title <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={newGoal.title}
                                            onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                                            placeholder="Enter goal description"
                                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                            Progress (%)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={newGoal.progress}
                                            onChange={(e) => setNewGoal({ ...newGoal, progress: parseInt(e.target.value) || 0 })}
                                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                            Status
                                        </label>
                                        <select
                                            value={newGoal.status}
                                            onChange={(e) => setNewGoal({ ...newGoal, status: e.target.value })}
                                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                        >
                                            <option value="pending">Pending</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="completed">Completed</option>
                                            <option value="blocked">Blocked</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleAddGoal}
                                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                                    >
                                        Add Goal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowGoalForm(false);
                                            setNewGoal({ title: '', progress: 0, status: 'pending' });
                                        }}
                                        className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition dark:bg-slate-600 dark:text-slate-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {goals.length > 0 ? (
                            <div className="space-y-2">
                                {goals.map((goal, idx) => (
                                    <div key={goal.id || idx} className="p-2 bg-gray-50 rounded-lg dark:bg-slate-700">
                                        <div className="flex items-start gap-2 mb-2">
                                            <input
                                                type="checkbox"
                                                checked={goal.status === 'completed'}
                                                onChange={(e) => handleUpdateGoal(goal.id, {
                                                    status: e.target.checked ? 'completed' : 'pending',
                                                    progress: e.target.checked ? 100 : goal.progress
                                                })}
                                                className="mt-1"
                                            />
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={goal.title}
                                                    onChange={(e) => handleUpdateGoal(goal.id, { title: e.target.value })}
                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded mb-2 focus:ring-2 focus:ring-primary-500 dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={goal.progress || 0}
                                                        onChange={(e) => handleUpdateGoal(goal.id, { progress: parseInt(e.target.value) || 0 })}
                                                        className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                                    />
                                                    <span className="text-xs text-gray-600 dark:text-slate-400">%</span>
                                                    <div className="flex-1 bg-gray-200 rounded-full h-2 dark:bg-slate-600">
                                                        <div
                                                            className="bg-purple-600 h-2 rounded-full transition-all dark:bg-purple-500"
                                                            style={{ width: `${goal.progress || 0}%` }}
                                                        ></div>
                                                    </div>
                                                    <select
                                                        value={goal.status}
                                                        onChange={(e) => handleUpdateGoal(goal.id, { status: e.target.value })}
                                                        className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 dark:bg-slate-600 dark:border-slate-500 dark:text-slate-100"
                                                    >
                                                        <option value="pending">Pending</option>
                                                        <option value="in_progress">In Progress</option>
                                                        <option value="completed">Completed</option>
                                                        <option value="blocked">Blocked</option>
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveGoal(goal.id)}
                                                        className="p-1 text-red-600 hover:text-red-700 transition"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500 text-center py-4 dark:text-slate-400">No goals added yet</p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
                        >
                            <i className="fas fa-save mr-1.5"></i>
                            Save Meeting
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.ManagementMeetingModal = ManagementMeetingModal;
