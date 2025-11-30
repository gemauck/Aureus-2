// Simple Dashboard Component - No API calls, loads immediately
const { useState, useEffect } = React;

const DashboardSimple = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [calendarReady, setCalendarReady] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [tasksError, setTasksError] = useState(null);
    const { isDark } = window.useTheme();

    useEffect(() => {
        // Check authentication status
        const token = window.storage?.getToken?.();
        setIsAuthenticated(!!token);
        
        // Wait for Calendar to be available
        const checkCalendar = () => {
            if (window.Calendar && typeof window.Calendar === 'function') {
                setCalendarReady(true);
            } else {
                // Retry after a short delay
                setTimeout(checkCalendar, 100);
            }
        };
        
        // Start checking immediately and also after a delay
        checkCalendar();
        const timer = setTimeout(() => {
            if (!calendarReady) {
                checkCalendar();
            }
        }, 500);
        
        return () => clearTimeout(timer);
    }, []);

    // Load tasks assigned to current user
    useEffect(() => {
        const loadTasks = async () => {
            setTasksLoading(true);
            setTasksError(null);
            try {
                const token = window.storage?.getToken?.();
                if (!token || !window.DatabaseAPI) {
                    setTasks([]);
                    setTasksLoading(false);
                    return;
                }

                const response = await window.DatabaseAPI.getTasks();
                const tasksData = response?.data?.tasks || [];
                setTasks(tasksData);
            } catch (err) {
                console.error('Error loading tasks:', err);
                setTasksError('Failed to load tasks');
                setTasks([]);
            } finally {
                setTasksLoading(false);
            }
        };

        loadTasks();
    }, []);
    
    // Get Calendar component (may be lazy loaded) - use useMemo to re-evaluate when window.Calendar becomes available
    const Calendar = React.useMemo(() => {
        // Check window.Calendar directly to ensure we get the latest value
        if (window.Calendar && typeof window.Calendar === 'function') {
            return window.Calendar;
        }
        // Fallback loading component
        return () => (
            <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'} p-4`}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading calendar...</p>
                </div>
            </div>
        );
    }, [calendarReady, isDark]); // Re-evaluate when calendarReady changes or theme changes

    const cardBase = isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
    const subText = isDark ? 'text-gray-400' : 'text-gray-500';
    const headerText = isDark ? 'text-gray-200' : 'text-gray-800';

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'done':
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'in-progress':
            case 'inprogress':
                return 'bg-blue-100 text-blue-800';
            case 'todo':
            case 'pending':
                return 'bg-gray-100 text-gray-800';
            case 'blocked':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getDueDateStatus = (dueDate) => {
        if (!dueDate) return null;
        const due = new Date(dueDate);
        const now = new Date();
        const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) return { text: 'Overdue', color: 'text-red-600 font-semibold' };
        if (diffDays === 0) return { text: 'Due today', color: 'text-orange-600 font-semibold' };
        if (diffDays <= 3) return { text: `Due in ${diffDays} days`, color: 'text-yellow-600' };
        return { text: new Date(dueDate).toLocaleDateString(), color: subText };
    };

    const handleTaskClick = (task) => {
        if (task.projectId && window.RouteState) {
            window.RouteState.setPageSubpath('projects', [task.projectId]);
        }
    };

    return (
        <div className="space-y-4">
            {/* My Project Tasks Widget */}
            <div className={`${cardBase} border rounded-lg p-4`}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-semibold ${headerText}`}>My Project Tasks</h3>
                    <i className="fas fa-tasks text-teal-500"></i>
                </div>
                
                {tasksLoading ? (
                    <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto mb-2"></div>
                        <p className={`text-xs ${subText}`}>Loading tasks...</p>
                    </div>
                ) : tasksError ? (
                    <div className={`text-sm ${subText} text-center py-2`}>{tasksError}</div>
                ) : tasks.length === 0 ? (
                    <div className={`text-sm ${subText} text-center py-2`}>No tasks assigned to you.</div>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {tasks.slice(0, 10).map(task => {
                            const dueDateInfo = getDueDateStatus(task.dueDate);
                            return (
                                <div
                                    key={task.id}
                                    onClick={() => handleTaskClick(task)}
                                    className={`p-2 rounded border ${isDark ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'} cursor-pointer transition-colors`}
                                    title={`Click to view project: ${task.project?.name || 'Unknown'}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(task.status)}`}>
                                                    {task.status || 'todo'}
                                                </span>
                                                {task.project && (
                                                    <span className={`text-xs ${subText} truncate`} title={task.project.name}>
                                                        <i className="fas fa-project-diagram mr-1"></i>
                                                        {task.project.name}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-sm ${headerText} font-medium truncate`} title={task.title}>
                                                {task.title}
                                            </p>
                                            {task.project?.clientName && (
                                                <p className={`text-xs ${subText} truncate`} title={task.project.clientName}>
                                                    {task.project.clientName}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {dueDateInfo && (
                                        <div className={`text-xs mt-1 ${dueDateInfo.color}`}>
                                            <i className="fas fa-calendar-alt mr-1"></i>
                                            {dueDateInfo.text}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {tasks.length > 10 && (
                            <div className={`text-xs ${subText} text-center pt-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                Showing 10 of {tasks.length} tasks
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Calendar Component */}
            <div>
                <Calendar />
            </div>
        </div>
    );
};

// Make available globally
window.DashboardSimple = DashboardSimple;
