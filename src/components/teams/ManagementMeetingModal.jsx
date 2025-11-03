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
            } else {
                // New meeting - default to today
                const today = new Date();
                setTitle('');
                setMeetingDate(today.toISOString().split('T')[0]);
                setNotes('');
                setTasks([]);
                setGoals([]);
            }
            setNewTask({ title: '', assignee: '', dueDate: '', status: 'pending' });
            setNewGoal({ title: '', progress: 0, status: 'pending' });
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
            createdBy: user?.name || user?.email || 'Unknown',
            updatedBy: user?.name || user?.email || 'Unknown'
        };

        onSave(meetingData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
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
                                Meeting Notes
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Add meeting agenda, discussion points, decisions, etc."
                                rows={5}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
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
