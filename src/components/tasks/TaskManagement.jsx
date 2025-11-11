// Get dependencies from window
const { useState, useEffect, useMemo } = React;
const storage = window.storage;

const TaskManagement = () => {
    const { isDark } = window.useTheme();
    const [tasks, setTasks] = useState([]);
    const [tags, setTags] = useState([]);
    const [clients, setClients] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('list'); // list, kanban, calendar
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterTag, setFilterTag] = useState('all');
    const [filterPriority, setFilterPriority] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [categories, setCategories] = useState([]);
    const [stats, setStats] = useState({ total: 0, todo: 0, inProgress: 0, completed: 0 });
    const [showInlineQuickAdd, setShowInlineQuickAdd] = useState(false);
    const [inlineQuickTitle, setInlineQuickTitle] = useState('');
    const [inlineQuickDescription, setInlineQuickDescription] = useState('');
    const [isInlineAdding, setIsInlineAdding] = useState(false);
    const [inlineQuickError, setInlineQuickError] = useState('');

    // Load data
    useEffect(() => {
        loadTasks();
        loadTags();
        loadClients();
        loadProjects();
    }, []);

    const loadTasks = async () => {
        try {
            setLoading(true);
            const token = storage?.getToken?.();
            if (!token) return;

            const params = new URLSearchParams();
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (filterCategory !== 'all') params.append('category', filterCategory);
            if (filterTag !== 'all') params.append('tagId', filterTag);
            if (filterPriority !== 'all') params.append('priority', filterPriority);

            const response = await fetch(`/api/user-tasks?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setTasks(data.data?.tasks || []);
                setCategories(data.data?.categories || []);
                setStats(data.data?.stats || { total: 0, todo: 0, inProgress: 0, completed: 0 });
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadTags = async () => {
        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const response = await fetch('/api/user-task-tags', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setTags(data.data?.tags || []);
            }
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    };

    const loadClients = async () => {
        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setClients(data.data?.clients || []);
            }
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    };

    const loadProjects = async () => {
        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const response = await fetch('/api/projects', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setProjects(data.data?.projects || []);
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    };

    useEffect(() => {
        loadTasks();
    }, [filterStatus, filterCategory, filterTag, filterPriority]);

    // Filter tasks by search query
    const filteredTasks = useMemo(() => {
        let filtered = [...tasks];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(task =>
                task.title.toLowerCase().includes(query) ||
                task.description.toLowerCase().includes(query) ||
                task.category.toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [tasks, searchQuery]);

    // Group tasks by status for kanban view
    const kanbanTasks = useMemo(() => {
        const grouped = {
            todo: [],
            'in-progress': [],
            completed: [],
            cancelled: []
        };

        filteredTasks.forEach(task => {
            if (grouped[task.status]) {
                grouped[task.status].push(task);
            }
        });

        return grouped;
    }, [filteredTasks]);

    // Group tasks by date for calendar view
    const calendarTasks = useMemo(() => {
        const grouped = {};
        filteredTasks.forEach(task => {
            if (task.dueDate) {
                const date = new Date(task.dueDate).toISOString().split('T')[0];
                if (!grouped[date]) grouped[date] = [];
                grouped[date].push(task);
            }
        });
        return grouped;
    }, [filteredTasks]);

    const handleCreateTask = () => {
        setSelectedTask(null);
        setShowTaskModal(true);
    };

    const handleEditTask = (task) => {
        setSelectedTask(task);
        setShowTaskModal(true);
    };

    const handleDeleteTask = async (taskId) => {
        if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) return;

        try {
            const token = storage?.getToken?.();
            if (!token) {
                alert('You must be logged in to delete tasks');
                return;
            }

            const response = await fetch(`/api/user-tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                loadTasks();
                // Show success feedback (could be enhanced with a toast notification)
                console.log('Task deleted successfully');
            } else {
                const error = await response.json();
                alert(error.error?.message || 'Failed to delete task');
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            alert('Error deleting task: ' + (error.message || 'Unknown error'));
        }
    };

    const handleTaskSaved = () => {
        setShowTaskModal(false);
        setSelectedTask(null);
        loadTasks();
        loadTags(); // Reload tags in case new ones were created
    };

    const resetInlineQuickAdd = () => {
        setInlineQuickTitle('');
        setInlineQuickDescription('');
        setInlineQuickError('');
        setIsInlineAdding(false);
        setShowInlineQuickAdd(false);
    };

    const handleInlineQuickAddSubmit = async (e) => {
        e.preventDefault();
        if (isInlineAdding) return;

        const rawTitle = inlineQuickTitle.trim();
        const description = inlineQuickDescription.trim();
        const normalizedTitle = rawTitle || (description ? (description.length > 80 ? `${description.slice(0, 77)}...` : description) : '');

        if (!normalizedTitle) {
            setInlineQuickError('Please enter at least a title or description.');
            return;
        }

        try {
            const token = storage?.getToken?.();
            if (!token) {
                setInlineQuickError('You must be logged in to add tasks.');
                return;
            }

            setIsInlineAdding(true);
            setInlineQuickError('');

            const response = await fetch('/api/user-tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: normalizedTitle,
                    description,
                    status: 'todo',
                    priority: 'medium'
                })
            });

            if (response.ok) {
                resetInlineQuickAdd();
                loadTasks();
            } else {
                const error = await response.json();
                setInlineQuickError(error.error?.message || 'Failed to add task.');
            }
        } catch (error) {
            console.error('Error adding inline quick task:', error);
            setInlineQuickError('Error adding task: ' + error.message);
        } finally {
            setIsInlineAdding(false);
        }
    };

    const handleQuickStatusToggle = async (task, newStatus) => {
        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const response = await fetch(`/api/user-tasks/${task.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    status: newStatus
                })
            });

            if (response.ok) {
                loadTasks();
            } else {
                const error = await response.json();
                alert(error.error?.message || 'Failed to update task status');
            }
        } catch (error) {
            console.error('Error updating task status:', error);
            alert('Error updating task: ' + error.message);
        }
    };

    const getPriorityColor = (priority) => {
        const colors = {
            low: isDark ? 'bg-gray-600' : 'bg-gray-200',
            medium: isDark ? 'bg-blue-600' : 'bg-blue-200',
            high: isDark ? 'bg-orange-600' : 'bg-orange-200',
            urgent: isDark ? 'bg-red-600' : 'bg-red-200'
        };
        return colors[priority] || colors.medium;
    };

    const getPriorityTextColor = (priority) => {
        const colors = {
            low: isDark ? 'text-gray-300' : 'text-gray-700',
            medium: isDark ? 'text-blue-300' : 'text-blue-700',
            high: isDark ? 'text-orange-300' : 'text-orange-700',
            urgent: isDark ? 'text-red-300' : 'text-red-700'
        };
        return colors[priority] || colors.medium;
    };

    const getStatusColor = (status) => {
        const colors = {
            todo: isDark ? 'bg-gray-600' : 'bg-gray-200',
            'in-progress': isDark ? 'bg-blue-600' : 'bg-blue-200',
            completed: isDark ? 'bg-green-600' : 'bg-green-200',
            cancelled: isDark ? 'bg-red-600' : 'bg-red-200'
        };
        return colors[status] || colors.todo;
    };

    if (loading) {
        return (
            <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'} p-8 text-center`}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>Loading tasks...</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            My Tasks
                        </h2>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {stats.total} total • {stats.todo} to do • {stats.inProgress} in progress • {stats.completed} completed
                        </p>
                    </div>
                    <button
                        onClick={handleCreateTask}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                        <i className="fas fa-plus"></i>
                        New Task
                    </button>
                </div>
            </div>

            {/* Filters and View Toggle */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                <div className="flex flex-col gap-4">
                    {/* Search */}
                    <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                        <input
                            type="text"
                            placeholder="Search tasks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                        />
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                        >
                            <option value="all">All Status</option>
                            <option value="todo">To Do</option>
                            <option value="in-progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>

                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                        >
                            <option value="all">All Categories</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>

                        <select
                            value={filterTag}
                            onChange={(e) => setFilterTag(e.target.value)}
                            className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                        >
                            <option value="all">All Tags</option>
                            {tags.map(tag => (
                                <option key={tag.id} value={tag.id}>{tag.name}</option>
                            ))}
                        </select>

                        <select
                            value={filterPriority}
                            onChange={(e) => setFilterPriority(e.target.value)}
                            className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                        >
                            <option value="all">All Priorities</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>

                    {/* View Toggle */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setView('list')}
                            className={`px-4 py-2 rounded-lg transition-colors ${view === 'list' ? 'bg-blue-600 text-white' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                        >
                            <i className="fas fa-list mr-2"></i>List
                        </button>
                        <button
                            onClick={() => setView('kanban')}
                            className={`px-4 py-2 rounded-lg transition-colors ${view === 'kanban' ? 'bg-blue-600 text-white' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                        >
                            <i className="fas fa-columns mr-2"></i>Kanban
                        </button>
                        <button
                            onClick={() => setView('calendar')}
                            className={`px-4 py-2 rounded-lg transition-colors ${view === 'calendar' ? 'bg-blue-600 text-white' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                        >
                            <i className="fas fa-calendar mr-2"></i>Calendar
                        </button>
                    </div>
                </div>
            </div>

            {/* Task Views */}
            {view === 'list' && (
                <div className="space-y-2">
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                        <button
                            type="button"
                            onClick={() => {
                                setShowInlineQuickAdd(prev => {
                                    const next = !prev;
                                    if (!next) {
                                        setInlineQuickTitle('');
                                        setInlineQuickDescription('');
                                        setInlineQuickError('');
                                    }
                                    return next;
                                });
                            }}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}
                        >
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white">
                                <i className="fas fa-plus text-xs"></i>
                            </span>
                            Quick To-Do
                        </button>

                        {showInlineQuickAdd && (
                            <form onSubmit={handleInlineQuickAddSubmit} className="mt-3 flex flex-col lg:flex-row lg:items-center gap-2">
                                <input
                                    type="text"
                                    value={inlineQuickTitle}
                                    onChange={(e) => {
                                        setInlineQuickTitle(e.target.value);
                                        if (inlineQuickError) setInlineQuickError('');
                                    }}
                                    placeholder="Title (optional if description provided)"
                                    className={`w-full lg:w-1/3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                                />
                                <input
                                    type="text"
                                    value={inlineQuickDescription}
                                    onChange={(e) => {
                                        setInlineQuickDescription(e.target.value);
                                        if (inlineQuickError) setInlineQuickError('');
                                    }}
                                    placeholder="Description"
                                    className={`w-full flex-1 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                                />
                                <div className="flex items-center gap-2">
                                    <button
                                        type="submit"
                                        disabled={isInlineAdding}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
                                    >
                                        {isInlineAdding ? 'Saving...' : 'Add'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetInlineQuickAdd}
                                        className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} px-4 py-2 rounded-lg transition-colors`}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        )}

                        {inlineQuickError && (
                            <p className="mt-2 text-sm text-red-500">{inlineQuickError}</p>
                        )}
                    </div>
                    {filteredTasks.length === 0 ? (
                        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-8 text-center`}>
                            <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>No tasks found</p>
                        </div>
                    ) : (
                        filteredTasks.map(task => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                isDark={isDark}
                                onEdit={handleEditTask}
                                onDelete={handleDeleteTask}
                                onQuickStatusToggle={handleQuickStatusToggle}
                                clients={clients}
                                projects={projects}
                                tags={tags}
                                getPriorityColor={getPriorityColor}
                                getPriorityTextColor={getPriorityTextColor}
                                getStatusColor={getStatusColor}
                            />
                        ))
                    )}
                </div>
            )}

            {view === 'kanban' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {['todo', 'in-progress', 'completed', 'cancelled'].map(status => (
                        <div key={status} className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                            <h3 className={`font-semibold mb-4 capitalize ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {status.replace('-', ' ')} ({kanbanTasks[status]?.length || 0})
                            </h3>
                            <div className="space-y-2">
                                {kanbanTasks[status]?.map(task => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        isDark={isDark}
                                        onEdit={handleEditTask}
                                        onDelete={handleDeleteTask}
                                        onQuickStatusToggle={handleQuickStatusToggle}
                                        clients={clients}
                                        projects={projects}
                                        tags={tags}
                                        getPriorityColor={getPriorityColor}
                                        getPriorityTextColor={getPriorityTextColor}
                                        getStatusColor={getStatusColor}
                                        compact
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {view === 'calendar' && (
                <CalendarView
                    tasks={calendarTasks}
                    isDark={isDark}
                    onEdit={handleEditTask}
                    onDelete={handleDeleteTask}
                    clients={clients}
                    projects={projects}
                    tags={tags}
                    getPriorityColor={getPriorityColor}
                    getPriorityTextColor={getPriorityTextColor}
                    getStatusColor={getStatusColor}
                />
            )}

            {/* Task Modal */}
            {showTaskModal && (
                <TaskModal
                    task={selectedTask}
                    isDark={isDark}
                    onClose={() => {
                        setShowTaskModal(false);
                        setSelectedTask(null);
                    }}
                    onSave={handleTaskSaved}
                    onTagCreated={loadTags}
                    clients={clients}
                    projects={projects}
                    tags={tags}
                    categories={categories}
                />
            )}
        </div>
    );
};

// Task Card Component
const TaskCard = ({ task, isDark, onEdit, onDelete, onQuickStatusToggle, clients, projects, tags, getPriorityColor, getPriorityTextColor, getStatusColor, compact = false }) => {
    const client = clients.find(c => c.id === task.clientId);
    const project = projects.find(p => p.id === task.projectId);
    const taskTags = task.tags || [];

    const handleStatusClick = (e) => {
        e.stopPropagation();
        if (onQuickStatusToggle) {
            // Toggle between todo -> in-progress -> completed
            const statusMap = {
                'todo': 'in-progress',
                'in-progress': 'completed',
                'completed': 'todo',
                'cancelled': 'todo'
            };
            const newStatus = statusMap[task.status] || 'todo';
            onQuickStatusToggle(task, newStatus);
        }
    };

    return (
        <div
            className={`${isDark ? 'bg-gray-700 border-gray-600 hover:bg-gray-600' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'} rounded-lg border p-3 cursor-pointer transition-colors ${compact ? '' : 'mb-2'}`}
            onClick={() => onEdit(task)}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'} truncate`}>
                            {task.title}
                        </h4>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)} ${getPriorityTextColor(task.priority)}`}>
                            {task.priority}
                        </span>
                    </div>
                    {!compact && task.description && (
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} line-clamp-2 mb-2`}>
                            {task.description}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        {task.category && (
                            <span className={`px-2 py-0.5 rounded ${isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                                {task.category}
                            </span>
                        )}
                        {taskTags.map(tag => (
                            <span
                                key={tag.id}
                                className="px-2 py-0.5 rounded text-white"
                                style={{ backgroundColor: tag.color || '#3B82F6' }}
                            >
                                {tag.name}
                            </span>
                        ))}
                        {client && (
                            <span className={`px-2 py-0.5 rounded ${isDark ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                <i className="fas fa-user mr-1"></i>{client.name}
                            </span>
                        )}
                        {project && (
                            <span className={`px-2 py-0.5 rounded ${isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'}`}>
                                <i className="fas fa-project-diagram mr-1"></i>{project.name}
                            </span>
                        )}
                        {task.dueDate && (
                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                <i className="fas fa-calendar mr-1"></i>
                                {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                        )}
                        {task.checklist && task.checklist.length > 0 && (
                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                <i className="fas fa-check-square mr-1"></i>
                                {task.checklist.filter(item => item.completed).length}/{task.checklist.length}
                            </span>
                        )}
                    </div>
                </div>
                    <div className="flex items-center gap-1">
                    {onQuickStatusToggle && (
                        <button
                            onClick={handleStatusClick}
                            className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)} ${isDark ? 'text-white' : 'text-gray-700'} hover:opacity-80 transition-opacity`}
                            title={`Click to change status (current: ${task.status})`}
                        >
                            <i className={`fas ${task.status === 'completed' ? 'fa-check-circle' : task.status === 'in-progress' ? 'fa-spinner' : 'fa-circle'} mr-1`}></i>
                            {task.status}
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit(task);
                        }}
                        className={`p-1 rounded ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-200'} transition-colors`}
                        title="Edit"
                    >
                        <i className={`fas fa-edit ${isDark ? 'text-gray-400' : 'text-gray-600'}`}></i>
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(task.id);
                        }}
                        className={`p-1 rounded ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-200'} transition-colors`}
                        title="Delete"
                    >
                        <i className={`fas fa-trash ${isDark ? 'text-red-400' : 'text-red-600'}`}></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Calendar View Component
const CalendarView = ({ tasks, isDark, onEdit, onDelete, clients, projects, tags, getPriorityColor, getPriorityTextColor, getStatusColor }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const daysInMonth = monthEnd.getDate();
    const firstDayOfWeek = monthStart.getDay();

    const goToPreviousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const getTasksForDate = (day) => {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const dateStr = date.toISOString().split('T')[0];
        return tasks[dateStr] || [];
    };

    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
        days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        days.push(day);
    }

    return (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={goToPreviousMonth}
                    className={`p-2 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                >
                    <i className={`fas fa-chevron-left ${isDark ? 'text-gray-400' : 'text-gray-600'}`}></i>
                </button>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                    onClick={goToNextMonth}
                    className={`p-2 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                >
                    <i className={`fas fa-chevron-right ${isDark ? 'text-gray-400' : 'text-gray-600'}`}></i>
                </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className={`text-center font-semibold py-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {day}
                    </div>
                ))}
                {days.map((day, index) => (
                    <div
                        key={index}
                        className={`min-h-[80px] p-1 border ${isDark ? 'border-gray-700' : 'border-gray-200'} ${day ? '' : 'bg-gray-50'}`}
                    >
                        {day && (
                            <>
                                <div className={`text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {day}
                                </div>
                                <div className="space-y-1">
                                    {getTasksForDate(day).slice(0, 3).map(task => (
                                        <div
                                            key={task.id}
                                            onClick={() => onEdit(task)}
                                            className={`text-xs p-1 rounded cursor-pointer truncate ${getPriorityColor(task.priority)} ${getPriorityTextColor(task.priority)}`}
                                            title={task.title}
                                        >
                                            {task.title}
                                        </div>
                                    ))}
                                    {getTasksForDate(day).length > 3 && (
                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                            +{getTasksForDate(day).length - 3} more
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Task Modal Component
const TaskModal = ({ task, isDark, onClose, onSave, onTagCreated, clients, projects, tags: tagsProp, categories }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        category: '',
        dueDate: '',
        clientId: '',
        projectId: '',
        checklist: [],
        photos: [],
        files: [],
        tagIds: []
    });
    const [loading, setLoading] = useState(false);
    const [newChecklistItem, setNewChecklistItem] = useState('');
    const [selectedPhotos, setSelectedPhotos] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showTagManager, setShowTagManager] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3B82F6');
    
    // Use tags prop, which will update when parent reloads tags
    const tags = tagsProp || [];

    useEffect(() => {
        if (task) {
            setFormData({
                title: task.title || '',
                description: task.description || '',
                status: task.status || 'todo',
                priority: task.priority || 'medium',
                category: task.category || '',
                dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
                clientId: task.clientId || '',
                projectId: task.projectId || '',
                checklist: task.checklist || [],
                photos: task.photos || [],
                files: task.files || [],
                tagIds: (task.tags || []).map(t => t.id)
            });
            setSelectedPhotos(task.photos || []);
            setSelectedFiles(task.files || []);
        }
    }, [task]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const url = task ? `/api/user-tasks/${task.id}` : '/api/user-tasks';
            const method = task ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                onSave();
            } else {
                const error = await response.json();
                alert(error.error?.message || 'Failed to save task');
            }
        } catch (error) {
            console.error('Error saving task:', error);
            alert('Error saving task: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddChecklistItem = () => {
        if (!newChecklistItem.trim()) return;
        setFormData(prev => ({
            ...prev,
            checklist: [...prev.checklist, { id: Date.now().toString(), text: newChecklistItem, completed: false }]
        }));
        setNewChecklistItem('');
    };

    const handleToggleChecklistItem = (itemId) => {
        setFormData(prev => ({
            ...prev,
            checklist: prev.checklist.map(item =>
                item.id === itemId ? { ...item, completed: !item.completed } : item
            )
        }));
    };

    const handleRemoveChecklistItem = (itemId) => {
        setFormData(prev => ({
            ...prev,
            checklist: prev.checklist.filter(item => item.id !== itemId)
        }));
    };

    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        try {
            const token = storage?.getToken?.();
            if (!token) return;

            for (const file of files) {
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const dataUrl = reader.result;
                    try {
                        const response = await fetch('/api/files', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                folder: 'tasks',
                                name: file.name,
                                dataUrl: dataUrl
                            })
                        });

                        if (response.ok) {
                            const data = await response.json();
                            setSelectedPhotos(prev => [...prev, data.data.url]);
                            setFormData(prev => ({
                                ...prev,
                                photos: [...prev.photos, data.data.url]
                            }));
                        }
                    } catch (error) {
                        console.error('Error uploading photo:', error);
                    }
                };
                reader.readAsDataURL(file);
            }
        } catch (error) {
            console.error('Error handling photo upload:', error);
        }
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        try {
            const token = storage?.getToken?.();
            if (!token) return;

            for (const file of files) {
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const dataUrl = reader.result;
                    try {
                        const response = await fetch('/api/files', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                folder: 'tasks',
                                name: file.name,
                                dataUrl: dataUrl
                            })
                        });

                        if (response.ok) {
                            const data = await response.json();
                            const fileObj = {
                                name: file.name,
                                url: data.data.url,
                                size: file.size,
                                type: file.type
                            };
                            setSelectedFiles(prev => [...prev, fileObj]);
                            setFormData(prev => ({
                                ...prev,
                                files: [...prev.files, fileObj]
                            }));
                        }
                    } catch (error) {
                        console.error('Error uploading file:', error);
                    }
                };
                reader.readAsDataURL(file);
            }
        } catch (error) {
            console.error('Error handling file upload:', error);
        }
    };

    const handleRemovePhoto = (index) => {
        setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
        setFormData(prev => ({
            ...prev,
            photos: prev.photos.filter((_, i) => i !== index)
        }));
    };

    const handleRemoveFile = (index) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
        setFormData(prev => ({
            ...prev,
            files: prev.files.filter((_, i) => i !== index)
        }));
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;

        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const response = await fetch('/api/user-task-tags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newTagName,
                    color: newTagColor
                })
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({
                    ...prev,
                    tagIds: [...prev.tagIds, data.data.tag.id]
                }));
                setNewTagName('');
                setNewTagColor('#3B82F6');
                setShowTagManager(false);
                // Reload tags via callback
                if (onTagCreated) {
                    onTagCreated();
                }
            } else {
                const error = await response.json();
                alert(error.error?.message || 'Failed to create tag');
            }
        } catch (error) {
            console.error('Error creating tag:', error);
            alert('Error creating tag: ' + error.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto`}>
                <div className="sticky top-0 bg-inherit border-b p-4 flex items-center justify-between">
                    <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {task ? 'Edit Task' : 'New Task'}
                    </h3>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                    >
                        <i className={`fas fa-times ${isDark ? 'text-gray-400' : 'text-gray-600'}`}></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Title *
                        </label>
                        <input
                            type="text"
                            required
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Description
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            rows={4}
                            className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Status
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            >
                                <option value="todo">To Do</option>
                                <option value="in-progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>

                        <div>
                            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Priority
                            </label>
                            <select
                                value={formData.priority}
                                onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Category
                            </label>
                            <input
                                type="text"
                                value={formData.category}
                                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                list="categories"
                                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            />
                            <datalist id="categories">
                                {categories.map(cat => (
                                    <option key={cat} value={cat} />
                                ))}
                            </datalist>
                        </div>

                        <div>
                            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Due Date
                            </label>
                            <input
                                type="date"
                                value={formData.dueDate}
                                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Client
                            </label>
                            <select
                                value={formData.clientId}
                                onChange={(e) => setFormData(prev => ({ ...prev, clientId: e.target.value }))}
                                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            >
                                <option value="">None</option>
                                {clients.map(client => (
                                    <option key={client.id} value={client.id}>{client.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Project
                            </label>
                            <select
                                value={formData.projectId}
                                onChange={(e) => setFormData(prev => ({ ...prev, projectId: e.target.value }))}
                                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            >
                                <option value="">None</option>
                                {projects.map(project => (
                                    <option key={project.id} value={project.id}>{project.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Tags
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {tags.map(tag => (
                                <label key={tag.id} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.tagIds.includes(tag.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setFormData(prev => ({ ...prev, tagIds: [...prev.tagIds, tag.id] }));
                                            } else {
                                                setFormData(prev => ({ ...prev, tagIds: prev.tagIds.filter(id => id !== tag.id) }));
                                            }
                                        }}
                                        className="rounded"
                                    />
                                    <span
                                        className="px-2 py-1 rounded text-sm text-white"
                                        style={{ backgroundColor: tag.color }}
                                    >
                                        {tag.name}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowTagManager(!showTagManager)}
                            className={`text-sm px-3 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                        >
                            <i className="fas fa-plus mr-1"></i>Create New Tag
                        </button>
                        {showTagManager && (
                            <div className={`mt-2 p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        placeholder="Tag name"
                                        value={newTagName}
                                        onChange={(e) => setNewTagName(e.target.value)}
                                        className={`flex-1 px-2 py-1 rounded border ${isDark ? 'bg-gray-600 border-gray-500 text-white' : 'bg-white border-gray-300'}`}
                                    />
                                    <input
                                        type="color"
                                        value={newTagColor}
                                        onChange={(e) => setNewTagColor(e.target.value)}
                                        className="w-10 h-8 rounded border"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCreateTag}
                                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Checklist
                        </label>
                        <div className="space-y-2 mb-2">
                            {formData.checklist.map(item => (
                                <div key={item.id} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={item.completed}
                                        onChange={() => handleToggleChecklistItem(item.id)}
                                        className="rounded"
                                    />
                                    <input
                                        type="text"
                                        value={item.text}
                                        onChange={(e) => {
                                            setFormData(prev => ({
                                                ...prev,
                                                checklist: prev.checklist.map(i =>
                                                    i.id === item.id ? { ...i, text: e.target.value } : i
                                                )
                                            }));
                                        }}
                                        className={`flex-1 px-2 py-1 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveChecklistItem(item.id)}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Add checklist item"
                                value={newChecklistItem}
                                onChange={(e) => setNewChecklistItem(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddChecklistItem();
                                    }
                                }}
                                className={`flex-1 px-2 py-1 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            />
                            <button
                                type="button"
                                onClick={handleAddChecklistItem}
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Photos
                        </label>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                            {selectedPhotos.map((photo, index) => (
                                <div key={index} className="relative">
                                    <img
                                        src={photo}
                                        alt={`Photo ${index + 1}`}
                                        className="w-full h-24 object-cover rounded border"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleRemovePhoto(index)}
                                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handlePhotoUpload}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Files
                        </label>
                        <div className="space-y-1 mb-2">
                            {selectedFiles.map((file, index) => (
                                <div key={index} className="flex items-center justify-between p-2 rounded border">
                                    <span className="text-sm truncate">{file.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveFile(index)}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <input
                            type="file"
                            multiple
                            onChange={handleFileUpload}
                            className="w-full"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className={`px-4 py-2 rounded-lg ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Task'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.TaskManagement = TaskManagement;

