// MyProjectTasks component - Shows tasks assigned to the current user from project management
const { useState, useEffect } = React;
const storage = window.storage;

const MyProjectTasks = () => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const { isDark } = window.useTheme();

    useEffect(() => {
        const loadTasks = async () => {
            try {
                setLoading(true);
                setError(null);

                const token = storage?.getToken?.();
                if (!token) {
                    setError('Not authenticated');
                    setLoading(false);
                    return;
                }

                const response = await fetch('/api/tasks', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch tasks: ${response.statusText}`);
                }

                const data = await response.json();
                const fetchedTasks = data.tasks || data.data?.tasks || [];
                setTasks(fetchedTasks);
            } catch (err) {
                console.error('Error loading tasks:', err);
                setError(err.message || 'Failed to load tasks');
            } finally {
                setLoading(false);
            }
        };

        loadTasks();
    }, []);

    // Filter tasks by status
    const filteredTasks = filterStatus === 'all' 
        ? tasks 
        : tasks.filter(task => task.status === filterStatus);

    // Group tasks by status for stats
    const taskStats = {
        total: tasks.length,
        todo: tasks.filter(t => t.status === 'todo').length,
        inProgress: tasks.filter(t => t.status === 'in-progress' || t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed' || t.status === 'done').length
    };

    // Get status color
    const getStatusColor = (status) => {
        const statusLower = status?.toLowerCase() || '';
        if (statusLower === 'completed' || statusLower === 'done') {
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
        }
        if (statusLower === 'in-progress' || statusLower === 'in_progress') {
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
        }
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    };

    // Format date
    const formatDate = (dateString) => {
        if (!dateString) return 'No due date';
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = date - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`;
        } else if (diffDays === 0) {
            return 'Due today';
        } else if (diffDays === 1) {
            return 'Due tomorrow';
        } else if (diffDays <= 7) {
            return `Due in ${diffDays} days`;
        } else {
            return date.toLocaleDateString();
        }
    };

    // Get due date color
    const getDueDateColor = (dateString) => {
        if (!dateString) return 'text-gray-500';
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = date - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            return 'text-red-600 dark:text-red-400 font-semibold';
        } else if (diffDays === 0) {
            return 'text-orange-600 dark:text-orange-400 font-semibold';
        } else if (diffDays <= 3) {
            return 'text-yellow-600 dark:text-yellow-400';
        }
        return 'text-gray-600 dark:text-gray-400';
    };

    if (loading) {
        return (
            <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 ${isDark ? 'dark' : ''}`}>
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span className="ml-3 text-gray-600 dark:text-gray-400">Loading tasks...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 ${isDark ? 'dark' : ''}`}>
                <div className="text-red-600 dark:text-red-400">
                    <i className="fas fa-exclamation-circle mr-2"></i>
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow ${isDark ? 'dark' : ''}`}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                        <i className="fas fa-tasks mr-2 text-blue-500"></i>
                        My Project Tasks
                    </h2>
                    <div className="flex items-center space-x-2">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="all">All Tasks</option>
                            <option value="todo">To Do</option>
                            <option value="in-progress">In Progress</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>
                </div>
                
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mt-4">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{taskStats.total}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{taskStats.todo}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">To Do</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{taskStats.inProgress}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">In Progress</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{taskStats.completed}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Completed</div>
                    </div>
                </div>
            </div>

            <div className="p-6">
                {filteredTasks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <i className="fas fa-inbox text-4xl mb-3 opacity-50"></i>
                        <p>No tasks {filterStatus !== 'all' ? `with status "${filterStatus}"` : ''} assigned to you</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredTasks.map((task) => (
                            <div
                                key={task.id}
                                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-2 mb-2">
                                            <h3 className="font-medium text-gray-900 dark:text-white">
                                                {task.title}
                                            </h3>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                                                {task.status}
                                            </span>
                                        </div>
                                        
                                        {task.project && (
                                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                                <i className="fas fa-project-diagram mr-1"></i>
                                                <span className="font-medium">{task.project.name}</span>
                                                {task.project.clientName && (
                                                    <span className="ml-2 text-gray-500">
                                                        • {task.project.clientName}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        
                                        <div className={`text-sm ${getDueDateColor(task.dueDate)}`}>
                                            <i className="far fa-calendar mr-1"></i>
                                            {formatDate(task.dueDate)}
                                        </div>
                                    </div>
                                    
                                    {task.project && (
                                        <button
                                            onClick={() => {
                                                // Navigate to project detail using the standard pattern
                                                sessionStorage.setItem('openProjectId', task.project.id);
                                                window.dispatchEvent(new CustomEvent('navigateToPage', { 
                                                    detail: { page: 'projects' } 
                                                }));
                                            }}
                                            className="ml-4 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                                            title="View project"
                                        >
                                            <i className="fas fa-external-link-alt"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// Make available globally
window.MyProjectTasks = MyProjectTasks;

