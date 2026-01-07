// Get dependencies from window
const { useState, useEffect, useMemo } = React;
const storage = window.storage;

const TaskManagement = () => {
    const { isDark } = window.useTheme();
    const authHook = window.useAuth || (() => ({ user: null }));
    const { user: authUser } = authHook();
    const [tasks, setTasks] = useState([]);
    const [tags, setTags] = useState([]);
    const [clients, setClients] = useState([]);
    const [projects, setProjects] = useState([]);
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [offlineMode, setOfflineMode] = useState(false);
    const [view, setView] = useState('list'); // Default to 'list', will be updated from localStorage
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

    // Function to update view and save to localStorage
    const updateView = (newView) => {
        setView(newView);
        try {
            localStorage.setItem('taskManagementView', newView);
        } catch (e) {
            console.warn('Failed to save view preference to localStorage:', e);
        }
    };

    // Helpers: Offline storage
    const getCurrentUserId = () => {
        const fromAuth = authUser?.id || authUser?.email || authUser?.username;
        if (fromAuth) return String(fromAuth);
        try {
            const stored = storage?.getUser?.();
            if (stored?.id || stored?.email) return String(stored.id || stored.email);
        } catch {}
        return 'anonymous';
    };
    const getOfflineKey = () => `offline_user_tasks_${getCurrentUserId()}`;
    const readOfflineTasks = () => {
        try {
            const raw = localStorage.getItem(getOfflineKey());
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };
    const writeOfflineTasks = (list) => {
        try {
            localStorage.setItem(getOfflineKey(), JSON.stringify(Array.isArray(list) ? list : []));
        } catch {}
    };

    // Load view preference from localStorage on mount
    useEffect(() => {
        try {
            const savedView = localStorage.getItem('taskManagementView');
            if (savedView && ['list', 'kanban', 'calendar'].includes(savedView)) {
                setView(savedView);
            } else {
            }
        } catch (e) {
            console.warn('Failed to load view preference from localStorage:', e);
        }
    }, []);

    // Load data
    useEffect(() => {
        loadTasks();
        loadTags();
        loadClients();
        loadProjects();
        loadLeads();
    }, []);

    const loadTasks = async () => {
        try {
            setLoading(true);
            setErrorMessage(null);
            setOfflineMode(false);
            const token = storage?.getToken?.();
            if (!token) return;

            const params = new URLSearchParams();
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (filterCategory !== 'all') params.append('category', filterCategory);
            if (filterTag !== 'all') params.append('tagId', filterTag);
            if (filterPriority !== 'all') params.append('priority', filterPriority);

            const queryString = params.toString();
            const url = queryString ? `/api/user-tasks?${queryString}` : '/api/user-tasks';
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                // Accept multiple possible API shapes to avoid empty UI when backend differs
                // Prefer data.data.tasks, then data.tasks, then data.items
                const tasksFromApi = Array.isArray(data?.data?.tasks)
                    ? data.data.tasks
                    : Array.isArray(data?.tasks)
                        ? data.tasks
                        : Array.isArray(data?.items)
                            ? data.items
                            : [];
                const categoriesFromApi = Array.isArray(data?.data?.categories)
                    ? data.data.categories
                    : Array.isArray(data?.categories)
                        ? data.categories
                        : [];
                const statsFromApi = data?.data?.stats || data?.stats || { total: 0, todo: 0, inProgress: 0, completed: 0 };

                setTasks(tasksFromApi);
                setCategories(categoriesFromApi);
                setStats(statsFromApi);
            } else {
                // Log non-OK responses to aid debugging
                console.warn('TaskManagement: Failed to load tasks', response.status, response.statusText);
                // Fallback to offline/local storage
                const offline = readOfflineTasks();
                const categoriesFromLocal = Array.from(new Set(offline.map(t => t.category).filter(Boolean)));
                const statsFromLocal = {
                    total: offline.length,
                    todo: offline.filter(t => t.status === 'todo').length,
                    inProgress: offline.filter(t => t.status === 'in-progress').length,
                    completed: offline.filter(t => t.status === 'completed').length,
                };
                setTasks(offline);
                setCategories(categoriesFromLocal);
                setStats(statsFromLocal);
                setOfflineMode(true);
                setErrorMessage(`Server error (HTTP ${response.status}). Showing local tasks on this device.`);
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            // Fallback to offline/local storage
            const offline = readOfflineTasks();
            const categoriesFromLocal = Array.from(new Set(offline.map(t => t.category).filter(Boolean)));
            const statsFromLocal = {
                total: offline.length,
                todo: offline.filter(t => t.status === 'todo').length,
                inProgress: offline.filter(t => t.status === 'in-progress').length,
                completed: offline.filter(t => t.status === 'completed').length,
            };
            setTasks(offline);
            setCategories(categoriesFromLocal);
            setStats(statsFromLocal);
            setOfflineMode(true);
            setErrorMessage(error?.message || 'Unexpected error while loading tasks. Showing local tasks.');
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
                const tagsFromApi = Array.isArray(data?.data?.tags)
                    ? data.data.tags
                    : Array.isArray(data?.tags)
                        ? data.tags
                        : Array.isArray(data?.items)
                            ? data.items
                            : [];
                setTags(tagsFromApi);
            } else {
                console.warn('TaskManagement: Failed to load tags', response.status, response.statusText);
                setTags([]);
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
                const clientsFromApi = Array.isArray(data?.data?.clients)
                    ? data.data.clients
                    : Array.isArray(data?.clients)
                        ? data.clients
                        : Array.isArray(data?.items)
                            ? data.items
                            : [];
                setClients(clientsFromApi);
            } else {
                console.warn('TaskManagement: Failed to load clients', response.status, response.statusText);
                setClients([]);
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
                const projectsFromApi = Array.isArray(data?.data?.projects)
                    ? data.data.projects
                    : Array.isArray(data?.projects)
                        ? data.projects
                        : Array.isArray(data?.items)
                            ? data.items
                            : [];
                setProjects(projectsFromApi);
            } else {
                console.warn('TaskManagement: Failed to load projects', response.status, response.statusText);
                setProjects([]);
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    };

    const loadLeads = async () => {
        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const response = await fetch('/api/leads', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const leadsFromApi = Array.isArray(data?.data?.leads)
                    ? data.data.leads
                    : Array.isArray(data?.leads)
                        ? data.leads
                        : Array.isArray(data?.items)
                            ? data.items
                            : [];
                setLeads(leadsFromApi);
            } else {
                console.warn('TaskManagement: Failed to load leads', response.status, response.statusText);
                setLeads([]);
            }
        } catch (error) {
            console.error('Error loading leads:', error);
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
            if (!token) throw new Error('Not authenticated');

            const response = await fetch(`/api/user-tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                loadTasks();
                // Show success feedback (could be enhanced with a toast notification)
            } else {
                // Fallback to offline: remove locally
                const offline = readOfflineTasks().filter(t => String(t.id) !== String(taskId));
                writeOfflineTasks(offline);
                setTasks(offline);
                setOfflineMode(true);
                console.warn('Delete failed on server, removed locally instead');
            }
        } catch (error) {
            // Fallback to offline: remove locally
            const offline = readOfflineTasks().filter(t => String(t.id) !== String(taskId));
            writeOfflineTasks(offline);
            setTasks(offline);
            setOfflineMode(true);
            console.warn('Delete failed due to error, removed locally instead:', error?.message);
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

    const handleQuickStatusToggle = async (task, newStatus, optimistic = false) => {
        // Optimistic update: immediately update UI
        if (optimistic) {
            setTasks(prevTasks => 
                prevTasks.map(t => 
                    t.id === task.id ? { ...t, status: newStatus } : t
                )
            );
        }

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
                // Only reload if not using optimistic update
                if (!optimistic) {
                    loadTasks();
                } else {
                    // Update stats optimistically
                    setStats(prevStats => {
                        const newStats = { ...prevStats };
                        // Decrement old status count
                        if (task.status === 'todo') newStats.todo = Math.max(0, newStats.todo - 1);
                        if (task.status === 'in-progress') newStats.inProgress = Math.max(0, newStats.inProgress - 1);
                        if (task.status === 'completed') newStats.completed = Math.max(0, newStats.completed - 1);
                        if (task.status === 'cancelled') newStats.total = Math.max(0, newStats.total - 1);
                        
                        // Increment new status count
                        if (newStatus === 'todo') newStats.todo = (newStats.todo || 0) + 1;
                        if (newStatus === 'in-progress') newStats.inProgress = (newStats.inProgress || 0) + 1;
                        if (newStatus === 'completed') newStats.completed = (newStats.completed || 0) + 1;
                        
                        return newStats;
                    });
                }
            } else {
                // Revert optimistic update on error
                if (optimistic) {
                    setTasks(prevTasks => 
                        prevTasks.map(t => 
                            t.id === task.id ? { ...t, status: task.status } : t
                        )
                    );
                }
                const error = await response.json();
                alert(error.error?.message || 'Failed to update task status');
            }
        } catch (error) {
            // Revert optimistic update on error
            if (optimistic) {
                setTasks(prevTasks => 
                    prevTasks.map(t => 
                        t.id === task.id ? { ...t, status: task.status } : t
                    )
                );
            }
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
            {/* Error Banner */}
            {errorMessage && (
                <div className={`${isDark ? 'bg-red-900/40 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-700'} rounded-lg border p-3 flex items-start justify-between gap-3`}>
                    <div className="flex items-start gap-2">
                        <i className="fas fa-exclamation-triangle mt-0.5"></i>
                        <div className="text-sm">
                            <p className="font-medium">Unable to load your tasks</p>
                            <p className="opacity-90">{errorMessage}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadTasks}
                            className={`px-3 py-1.5 rounded text-sm ${isDark ? 'bg-red-800 hover:bg-red-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

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
                            onClick={() => updateView('list')}
                            className={`px-4 py-2 rounded-lg transition-colors ${view === 'list' ? 'bg-blue-600 text-white' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                        >
                            <i className="fas fa-list mr-2"></i>List
                        </button>
                        <button
                            onClick={() => updateView('kanban')}
                            className={`px-4 py-2 rounded-lg transition-colors ${view === 'kanban' ? 'bg-blue-600 text-white' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                        >
                            <i className="fas fa-columns mr-2"></i>Kanban
                        </button>
                        <button
                            onClick={() => updateView('calendar')}
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
                    {/* Offline banner */}
                    {offlineMode && (
                        <div className={`${isDark ? 'bg-yellow-900/40 border-yellow-700 text-yellow-200' : 'bg-yellow-50 border-yellow-200 text-yellow-800'} rounded-lg border p-2 text-sm`}>
                            You’re viewing local tasks stored on this device because the server is unavailable.
                        </div>
                    )}
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
                        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border overflow-hidden`}>
                            {/* Header */}
                            <div className={`${isDark ? 'bg-gray-900/40 text-gray-300 border-gray-700' : 'bg-gray-50 text-gray-600 border-gray-200'} border-b px-4 py-2 text-xs font-semibold`}>
                                <div className="grid grid-cols-12 gap-3 items-center">
                                    <div className="col-span-4">Task</div>
                                    <div className="col-span-2">Status</div>
                                    <div className="col-span-3">Client / Lead</div>
                                    <div className="col-span-2">Due Date</div>
                                    <div className="col-span-1 text-right">Priority</div>
                                </div>
                            </div>

                            {/* Rows */}
                            <div className="divide-y divide-gray-200/10">
                                {filteredTasks.map(task => (
                                    <TaskListRow
                                        key={task.id}
                                        task={task}
                                        isDark={isDark}
                                        onEdit={handleEditTask}
                                        onDelete={handleDeleteTask}
                                        onQuickStatusToggle={handleQuickStatusToggle}
                                        clients={clients}
                                        leads={leads}
                                        getPriorityColor={getPriorityColor}
                                        getPriorityTextColor={getPriorityTextColor}
                                        getStatusColor={getStatusColor}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {view === 'kanban' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {['todo', 'in-progress', 'completed', 'cancelled'].map(status => {
                        const handleDragOver = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.classList.add('ring-2', 'ring-blue-500', 'ring-opacity-50');
                            if (isDark) {
                                e.currentTarget.classList.add('bg-blue-900', 'bg-opacity-20');
                            } else {
                                e.currentTarget.classList.add('bg-blue-50');
                            }
                        };

                        const handleDragLeave = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Only remove highlight if we're actually leaving the column (not just moving to a child)
                            const relatedTarget = e.relatedTarget;
                            if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                                e.currentTarget.classList.remove('ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'bg-blue-900', 'bg-opacity-20');
                            }
                        };

                        const handleDrop = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.classList.remove('ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'bg-blue-900', 'bg-opacity-20');
                            
                            const taskId = e.dataTransfer.getData('taskId');
                            if (taskId && taskId !== '') {
                                const task = tasks.find(t => String(t.id) === String(taskId));
                                if (task && task.status !== status) {
                                    // Use optimistic update for smooth UI
                                    handleQuickStatusToggle(task, status, true);
                                }
                            }
                        };

                        return (
                            <div 
                                key={status}
                                data-column={status}
                                className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 transition-all`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <h3 className={`font-semibold mb-4 capitalize ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    <span>{status.replace('-', ' ')}</span>
                                    <span className="ml-2 transition-all duration-200 inline-block">({kanbanTasks[status]?.length || 0})</span>
                                </h3>
                                <div className="space-y-2 min-h-[200px] transition-all duration-200">
                                    {kanbanTasks[status]?.map(task => (
                                        <div key={task.id} className="transition-all duration-200 ease-in-out">
                                            <TaskCard
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
                                                draggable
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
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
                    leads={leads}
                    tags={tags}
                    categories={categories}
                />
            )}
        </div>
    );
};

// Task Card Component
const TaskCard = ({ task, isDark, onEdit, onDelete, onQuickStatusToggle, clients, projects, tags, getPriorityColor, getPriorityTextColor, getStatusColor, compact = false, draggable = false }) => {
    const client = clients.find(c => c.id === task.clientId);
    const project = projects.find(p => p.id === task.projectId);
    const taskTags = task.tags || [];
    const wasDraggedRef = React.useRef(false);

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

    const [isDragging, setIsDragging] = React.useState(false);
    const [isHovered, setIsHovered] = React.useState(false);

    const handleDragStart = (e) => {
        if (draggable) {
            wasDraggedRef.current = false;
            setIsDragging(true);
            e.dataTransfer.setData('taskId', String(task.id));
            e.dataTransfer.effectAllowed = 'move';
        }
    };

    const handleDragEnd = (e) => {
        if (draggable) {
            setIsDragging(false);
            // Mark that we dragged, and clear after a short delay to prevent click
            wasDraggedRef.current = true;
            setTimeout(() => {
                wasDraggedRef.current = false;
            }, 100);
        }
    };

    const handleClick = (e) => {
        // Prevent click event if we just finished dragging
        if (wasDraggedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        onEdit(task);
    };

    // Check if due date is urgent (within 3 days or overdue)
    const isDueDateUrgent = () => {
        if (!task.dueDate) return false;
        const due = new Date(task.dueDate);
        const now = new Date();
        const diff = due - now;
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days <= 3;
    };

    // Get priority indicator color
    const getPriorityIndicatorColor = () => {
        const priority = (task.priority || 'medium').toLowerCase();
        if (priority === 'urgent' || priority === 'high') return 'bg-red-500';
        if (priority === 'medium') return 'bg-yellow-500';
        return 'bg-gray-400';
    };

    // Compute due date info
    const isUrgent = task.dueDate ? isDueDateUrgent() : false;
    const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() : false;

    return (
        <div
            draggable={draggable}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`group ${isDark ? 'bg-gray-800 border-gray-700 hover:border-blue-500' : 'bg-white border-gray-200 hover:border-blue-400'} rounded-lg border shadow-sm hover:shadow-md p-4 cursor-pointer transition-all duration-200 ease-in-out ${compact ? '' : 'mb-2'} ${draggable ? 'cursor-move' : ''} ${isDragging ? 'opacity-50 scale-95' : 'opacity-100 scale-100'}`}
            onClick={handleClick}
        >
            <div className="flex items-start gap-3">
                {/* Priority Indicator */}
                <div className={`w-1 h-full min-h-[40px] rounded-full flex-shrink-0 ${getPriorityIndicatorColor()}`}></div>
                
                <div className="flex-1 min-w-0">
                    {/* Title Row */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className={`font-semibold text-base ${isDark ? 'text-white' : 'text-gray-900'} leading-tight`}>
                            {task.title}
                        </h4>
                        {/* Action Buttons - Show on hover */}
                        <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                            {onQuickStatusToggle && (
                                <button
                                    onClick={handleStatusClick}
                                    className={`p-1.5 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                                    title={`Change status (current: ${task.status})`}
                                >
                                    <i className={`fas ${task.status === 'completed' ? 'fa-check-circle text-green-600' : task.status === 'in-progress' ? 'fa-spinner text-blue-600' : 'fa-circle text-gray-400'} text-sm`}></i>
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(task);
                                }}
                                className={`p-1.5 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                                title="Edit"
                            >
                                <i className={`fas fa-edit ${isDark ? 'text-gray-300' : 'text-gray-600'} text-sm`}></i>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(task.id);
                                }}
                                className={`p-1.5 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                                title="Delete"
                            >
                                <i className={`fas fa-trash ${isDark ? 'text-red-500' : 'text-red-500'} text-sm`}></i>
                            </button>
                        </div>
                    </div>

                    {/* Essential Info Only */}
                    <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {/* Due Date - Only show if urgent */}
                        {isUrgent && (
                            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-orange-600'}`}>
                                <i className="fas fa-calendar text-[10px]"></i>
                                {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        )}
                        
                        {/* Checklist Progress - Only if exists */}
                        {task.checklist && task.checklist.length > 0 && (
                            <span className={`flex items-center gap-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-check-square text-[10px]"></i>
                                <span>{task.checklist.filter(item => item.completed).length}/{task.checklist.length}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// List Row Component (for List view column layout)
const TaskListRow = ({ task, isDark, onEdit, onDelete, onQuickStatusToggle, clients, leads, getPriorityColor, getPriorityTextColor, getStatusColor }) => {
    const client = clients?.find(c => c.id === task.clientId);
    const lead = leads?.find(l => l.id === task.leadId);

    const statusLabel = (() => {
        const map = {
            'todo': 'To Do',
            'in-progress': 'In Progress',
            'completed': 'Completed',
            'cancelled': 'Cancelled'
        };
        return map[task.status] || task.status || '—';
    })();

    const due = task.dueDate ? new Date(task.dueDate) : null;
    const isOverdue = due ? (due < new Date() && task.status !== 'completed') : false;
    const dueLabel = due ? due.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

    const priority = (task.priority || 'medium').toLowerCase();

    const handleRowClick = () => onEdit(task);

    const handleStatusClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!onQuickStatusToggle) return;
        const statusMap = {
            'todo': 'in-progress',
            'in-progress': 'completed',
            'completed': 'todo',
            'cancelled': 'todo'
        };
        const next = statusMap[task.status] || 'todo';
        onQuickStatusToggle(task, next);
    };

    return (
        <div
            onClick={handleRowClick}
            className={`px-4 py-3 cursor-pointer transition-colors ${isDark ? 'hover:bg-gray-700/40' : 'hover:bg-gray-50'}`}
        >
            <div className="grid grid-cols-12 gap-3 items-center">
                {/* Task */}
                <div className="col-span-4 min-w-0">
                    <div className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {task.title}
                    </div>
                    {task.description ? (
                        <div className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {task.description}
                        </div>
                    ) : null}
                </div>

                {/* Status */}
                <div className="col-span-2">
                    <button
                        type="button"
                        onClick={handleStatusClick}
                        className={`inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-semibold ${getStatusColor(task.status)} ${isDark ? 'text-gray-100' : 'text-gray-800'}`}
                        title="Click to advance status"
                    >
                        <span className="capitalize">{statusLabel}</span>
                    </button>
                </div>

                {/* Client / Lead */}
                <div className="col-span-3 min-w-0">
                    <div className={`text-sm truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        {client?.name || '—'}
                    </div>
                    <div className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {lead?.name || (task.leadId ? `Lead: ${task.leadId}` : '—')}
                    </div>
                </div>

                {/* Due Date */}
                <div className={`col-span-2 text-sm ${isOverdue ? 'text-red-600 font-semibold' : isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {dueLabel}
                </div>

                {/* Priority + Actions */}
                <div className="col-span-1 flex items-center justify-end gap-2">
                    <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(priority)} ${getPriorityTextColor(priority)}`}
                        title={`Priority: ${priority}`}
                    >
                        {priority}
                    </span>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                        className={`p-1.5 rounded ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                        title="Edit"
                    >
                        <i className="fas fa-edit"></i>
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                        className={`p-1.5 rounded ${isDark ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-100 text-red-500'}`}
                        title="Delete"
                    >
                        <i className="fas fa-trash"></i>
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
const TaskModal = ({ task, isDark, onClose, onSave, onTagCreated, clients, projects, leads, tags: tagsProp, categories }) => {
    const authHook = window.useAuth || (() => ({ user: null }));
    const { user: authUser } = authHook();
    const getCurrentUserId = () => {
        const fromAuth = authUser?.id || authUser?.email || authUser?.username;
        if (fromAuth) return String(fromAuth);
        try {
            const stored = window.storage?.getUser?.();
            if (stored?.id || stored?.email) return String(stored.id || stored.email);
        } catch {}
        return 'anonymous';
    };
    const getOfflineKey = () => `offline_user_tasks_${getCurrentUserId()}`;
    const readOfflineTasks = () => {
        try {
            const raw = localStorage.getItem(getOfflineKey());
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };
    const writeOfflineTasks = (list) => {
        try {
            localStorage.setItem(getOfflineKey(), JSON.stringify(Array.isArray(list) ? list : []));
        } catch {}
    };

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        category: '',
        dueDate: '',
        clientId: '',
        projectId: '',
        leadId: '',
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
    const [isGoogleCalendarAuthenticated, setIsGoogleCalendarAuthenticated] = useState(false);
    const [isSyncingToGoogle, setIsSyncingToGoogle] = useState(false);
    const [googleEventId, setGoogleEventId] = useState(null);
    const [googleEventUrl, setGoogleEventUrl] = useState(null);
    
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
                leadId: task.leadId || '',
                checklist: task.checklist || [],
                photos: task.photos || [],
                files: task.files || [],
                tagIds: (task.tags || []).map(t => t.id)
            });
            setSelectedPhotos(task.photos || []);
            setSelectedFiles(task.files || []);
            setGoogleEventId(task.googleEventId || null);
            setGoogleEventUrl(task.googleEventUrl || null);
        } else {
            setGoogleEventId(null);
            setGoogleEventUrl(null);
        }
    }, [task]);

    // Check Google Calendar authentication on mount
    useEffect(() => {
        const checkGoogleAuth = async () => {
            try {
                if (window.GoogleCalendarService) {
                    const authenticated = await window.GoogleCalendarService.checkAuthentication();
                    setIsGoogleCalendarAuthenticated(authenticated);
                }
            } catch (error) {
                console.error('Error checking Google Calendar auth:', error);
            }
        };
        checkGoogleAuth();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const token = storage?.getToken?.();
            if (!token) throw new Error('Not authenticated');

            const url = task ? `/api/user-tasks/${task.id}` : '/api/user-tasks';
            const method = task ? 'PUT' : 'POST';

            // Include Google Calendar fields in the payload
            const payload = {
                ...formData,
                googleEventId: googleEventId || undefined,
                googleEventUrl: googleEventUrl || undefined
            };

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                onSave();
            } else {
                // Fallback to offline: upsert in local storage
                const offline = readOfflineTasks();
                if (task) {
                    const idx = offline.findIndex(t => String(t.id) === String(task.id));
                    const updated = {
                        ...(idx >= 0 ? offline[idx] : {}),
                        ...formData,
                        id: task.id,
                        updatedAt: new Date().toISOString(),
                    };
                    if (idx >= 0) {
                        offline[idx] = updated;
                    } else {
                        offline.push(updated);
                    }
                    writeOfflineTasks(offline);
                } else {
                    const newTask = {
                        ...formData,
                        id: Date.now().toString(),
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };
                    writeOfflineTasks([...offline, newTask]);
                }
                onSave();
            }
        } catch (error) {
            // Fallback to offline: upsert in local storage
            const offline = readOfflineTasks();
            if (task) {
                const idx = offline.findIndex(t => String(t.id) === String(task.id));
                const updated = {
                    ...(idx >= 0 ? offline[idx] : {}),
                    ...formData,
                    id: task.id,
                    updatedAt: new Date().toISOString(),
                };
                if (idx >= 0) {
                    offline[idx] = updated;
                } else {
                    offline.push(updated);
                }
                writeOfflineTasks(offline);
            } else {
                const newTask = {
                    ...formData,
                    id: Date.now().toString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                writeOfflineTasks([...offline, newTask]);
            }
            onSave();
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleCalendarAuth = async () => {
        setIsSyncingToGoogle(true);
        try {
            if (window.GoogleCalendarService) {
                await window.GoogleCalendarService.openAuthPopup();
                setIsGoogleCalendarAuthenticated(true);
            } else {
                alert('Google Calendar service not available. Please refresh the page.');
            }
        } catch (error) {
            console.error('Google Calendar authentication error:', error);
            alert('Failed to authenticate with Google Calendar: ' + error.message);
        } finally {
            setIsSyncingToGoogle(false);
        }
    };

    const handleSyncToGoogleCalendar = async () => {
        if (!formData.dueDate) {
            alert('Please set a due date for the task to sync with Google Calendar.');
            return;
        }

        if (!isGoogleCalendarAuthenticated) {
            await handleGoogleCalendarAuth();
            return;
        }

        setIsSyncingToGoogle(true);
        try {
            if (!window.GoogleCalendarService) {
                alert('Google Calendar service not available. Please refresh the page.');
                return;
            }

            const client = clients.find(c => c.id === formData.clientId);
            const project = projects.find(p => p.id === formData.projectId);
            
            const eventData = {
                id: task?.id || 'new',
                title: formData.title,
                description: formData.description || `Task: ${formData.title}${formData.category ? `\nCategory: ${formData.category}` : ''}${client ? `\nClient: ${client.name}` : ''}${project ? `\nProject: ${project.name}` : ''}`,
                date: formData.dueDate,
                time: '09:00', // Default time, can be enhanced later
                clientName: client?.name || '',
                clientId: formData.clientId || '',
                type: 'Task'
            };

            let googleEvent;
            if (googleEventId) {
                // Update existing event
                googleEvent = await window.GoogleCalendarService.updateEvent(googleEventId, {
                    summary: eventData.title,
                    description: eventData.description,
                    start: {
                        dateTime: window.GoogleCalendarService.formatDateTime(eventData.date, eventData.time),
                        timeZone: 'Africa/Johannesburg'
                    },
                    end: {
                        dateTime: window.GoogleCalendarService.formatDateTime(
                            eventData.date,
                            window.GoogleCalendarService.getEndTime(eventData.time)
                        ),
                        timeZone: 'Africa/Johannesburg'
                    }
                });
            } else {
                // Create new event
                googleEvent = await window.GoogleCalendarService.createEvent(eventData);
            }

            setGoogleEventId(googleEvent.id);
            setGoogleEventUrl(googleEvent.htmlLink || googleEvent.url);
            
            // Update the task with Google Calendar info
            if (task?.id) {
                const token = storage?.getToken?.();
                if (token) {
                    await fetch(`/api/user-tasks/${task.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            googleEventId: googleEvent.id,
                            googleEventUrl: googleEvent.htmlLink || googleEvent.url
                        })
                    });
                }
            }
        } catch (error) {
            console.error('Failed to sync to Google Calendar:', error);
            alert('Failed to sync to Google Calendar: ' + (error.message || 'Unknown error'));
        } finally {
            setIsSyncingToGoogle(false);
        }
    };

    const handleRemoveFromGoogleCalendar = async () => {
        if (!googleEventId || !isGoogleCalendarAuthenticated) return;

        if (!confirm('Are you sure you want to remove this task from Google Calendar?')) {
            return;
        }

        setIsSyncingToGoogle(true);
        try {
            if (window.GoogleCalendarService) {
                await window.GoogleCalendarService.deleteEvent(googleEventId);
                setGoogleEventId(null);
                setGoogleEventUrl(null);
                
                // Update the task to remove Google Calendar info
                if (task?.id) {
                    const token = storage?.getToken?.();
                    if (token) {
                        await fetch(`/api/user-tasks/${task.id}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                googleEventId: null,
                                googleEventUrl: null
                            })
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Failed to remove from Google Calendar:', error);
            alert('Failed to remove from Google Calendar: ' + (error.message || 'Unknown error'));
        } finally {
            setIsSyncingToGoogle(false);
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
                            Lead
                        </label>
                        <select
                            value={formData.leadId}
                            onChange={(e) => setFormData(prev => ({ ...prev, leadId: e.target.value }))}
                            className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                        >
                            <option value="">None</option>
                            {leads.map(lead => (
                                <option key={lead.id} value={lead.id}>{lead.name}</option>
                            ))}
                        </select>
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

                    {/* Google Calendar Sync Section */}
                    <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
                        <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            <i className="fab fa-google mr-2"></i>Google Calendar Sync
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                            {googleEventId ? (
                                <>
                                    <span className={`text-sm ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                        <i className="fas fa-check-circle mr-1"></i>Synced
                                    </span>
                                    {googleEventUrl && (
                                        <a
                                            href={googleEventUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`text-sm px-3 py-1 rounded ${isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-100 hover:bg-blue-200 text-blue-700'}`}
                                        >
                                            <i className="fas fa-external-link-alt mr-1"></i>Open in Calendar
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSyncToGoogleCalendar}
                                        disabled={isSyncingToGoogle || !formData.dueDate}
                                        className={`text-sm px-3 py-1 rounded ${isDark ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        <i className={`fas ${isSyncingToGoogle ? 'fa-spinner fa-spin' : 'fa-sync-alt'} mr-1`}></i>
                                        {isSyncingToGoogle ? 'Syncing...' : 'Update'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRemoveFromGoogleCalendar}
                                        disabled={isSyncingToGoogle}
                                        className={`text-sm px-3 py-1 rounded ${isDark ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-100 hover:bg-red-200 text-red-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        <i className="fas fa-trash mr-1"></i>Remove
                                    </button>
                                </>
                            ) : (
                                <>
                                    {!isGoogleCalendarAuthenticated ? (
                                        <button
                                            type="button"
                                            onClick={handleGoogleCalendarAuth}
                                            disabled={isSyncingToGoogle}
                                            className={`text-sm px-3 py-1 rounded ${isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-100 hover:bg-green-200 text-green-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            <i className={`fab fa-google mr-1 ${isSyncingToGoogle ? 'fa-spinner fa-spin' : ''}`}></i>
                                            {isSyncingToGoogle ? 'Connecting...' : 'Connect Google Calendar'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleSyncToGoogleCalendar}
                                            disabled={isSyncingToGoogle || !formData.dueDate}
                                            className={`text-sm px-3 py-1 rounded ${isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-100 hover:bg-blue-200 text-blue-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            <i className={`fas ${isSyncingToGoogle ? 'fa-spinner fa-spin' : 'fa-calendar-plus'} mr-1`}></i>
                                            {isSyncingToGoogle ? 'Syncing...' : 'Sync to Google Calendar'}
                                        </button>
                                    )}
                                    {!formData.dueDate && (
                                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            (Set a due date to enable sync)
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
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

