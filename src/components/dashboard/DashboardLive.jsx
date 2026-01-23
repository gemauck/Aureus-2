// Live Dashboard Component - Connected to Real Mechanisms
// Version: 2025-11-04-fix-tdz-calculateStats-order
const { useState, useEffect, useCallback } = React;
const SectionCommentWidget = window.SectionCommentWidget;

// Helper function to calculate dashboard stats - defined before component to avoid TDZ issues
const calculateStats = (clients, leads, projects, timeEntries) => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const thisMonthEntries = (timeEntries || []).filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= thisMonthStart;
    });
    const lastMonthEntries = (timeEntries || []).filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= lastMonthStart && entryDate < thisMonthStart;
    });
    
    const hoursThisMonth = thisMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
    const hoursLastMonth = lastMonthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
    
    const clientsArray = Array.isArray(clients) ? clients : [];
    const leadsArray = Array.isArray(leads) ? leads : [];
    const projectsArray = Array.isArray(projects) ? projects : [];
    
    const pipelineValue = leadsArray.reduce((sum, lead) => sum + (lead.value || 0), 0);
    const weightedPipeline = leadsArray.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0);
    
    return {
        totalClients: clientsArray.length,
        totalLeads: leadsArray.length,
        totalProjects: projectsArray.length,
        activeProjects: projectsArray.filter(p => p.status === 'Active' || p.status === 'In Progress').length,
        hoursThisMonth: hoursThisMonth,
        hoursLastMonth: hoursLastMonth,
        pipelineValue: pipelineValue,
        weightedPipeline: weightedPipeline
    };
};

// WidgetWrapper - Wrapper component to ensure hooks are called at component level
const WidgetWrapper = ({ widgetDef, dashboardData }) => {
    // This wrapper ensures that widget rendering happens at the component level
    // rather than inside a map function, which allows hooks to work correctly
    if (!widgetDef || !widgetDef.render) {
        return null;
    }
    return widgetDef.render(dashboardData);
};

// MyProjectTasksWidget - Separate component to properly use hooks
const MyProjectTasksWidget = ({ cardBase, headerText, subText, isDark }) => {
    const [projectTasks, setProjectTasks] = React.useState([]);
    const [userTasks, setUserTasks] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        const loadTasks = async () => {
            setIsLoading(true);
            setError(null);
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ No token available for task loading');
                setProjectTasks([]);
                setUserTasks([]);
                setIsLoading(false);
                return;
            }
            
            console.log('🔑 Token available, loading tasks...');

            // Get current user ID
            const user = window.storage?.getUser?.();
            const userId = user?.id || user?.email || 'anonymous';
            const offlineUserTasksKey = `offline_user_tasks_${userId}`;
            const offlineProjectTasksKey = `offline_project_tasks_${userId}`;
            
            // STEP 1: Load cached data immediately for instant display
            let cachedUserTasks = [];
            let cachedProjectTasks = [];
            try {
                const offlineUserTasks = localStorage.getItem(offlineUserTasksKey);
                if (offlineUserTasks) {
                    const parsed = JSON.parse(offlineUserTasks);
                    if (Array.isArray(parsed)) {
                        cachedUserTasks = parsed;
                        setUserTasks(cachedUserTasks); // Show cached data immediately
                    }
                }
                
                const offlineProjectTasks = localStorage.getItem(offlineProjectTasksKey);
                if (offlineProjectTasks) {
                    const parsed = JSON.parse(offlineProjectTasks);
                    if (Array.isArray(parsed)) {
                        cachedProjectTasks = parsed;
                        setProjectTasks(cachedProjectTasks); // Show cached project tasks immediately
                        console.log('📋 Loaded cached project tasks:', cachedProjectTasks.length);
                    }
                }
            } catch (e) {
                console.warn('Error reading offline tasks:', e);
            }
            
            // IMMEDIATE: Hide loading spinner if we have any cached data
            // This makes the widget appear instantly on page refresh
            if (cachedUserTasks.length > 0 || cachedProjectTasks.length > 0) {
                setIsLoading(false);
            }

            // Helper function to add timeout to promises
            const withTimeout = (promise, timeoutMs = 5000) => {
                return Promise.race([
                    promise,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
                    )
                ]);
            };

            // STEP 2: Load fresh data in parallel with timeouts
            const loadPromises = [];

            // Load project tasks (lightweight mode for dashboard)
            loadPromises.push(
                withTimeout(
                    fetch('/api/tasks?lightweight=true', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                        .then(async response => {
                            if (!response.ok) {
                                const errorText = await response.text();
                                console.warn('Project tasks API error:', response.status, errorText);
                                throw new Error(`HTTP ${response.status}: ${errorText}`);
                            }
                            const data = await response.json();
                            console.log('📋 Project tasks API response:', { 
                                hasData: !!data, 
                                hasDataData: !!data?.data, 
                                hasDataDataTasks: !!data?.data?.tasks,
                                hasDataTasks: !!data?.tasks,
                                dataKeys: Object.keys(data || {}),
                                dataDataKeys: data?.data ? Object.keys(data.data) : []
                            });
                            const tasks = Array.isArray(data?.data?.tasks)
                                ? data.data.tasks
                                : Array.isArray(data?.tasks)
                                    ? data.tasks
                                    : [];
                            console.log('📋 Parsed project tasks:', tasks.length, tasks);
                            // Save to localStorage for offline use
                            if (tasks.length > 0) {
                                try {
                                    const user = window.storage?.getUser?.();
                                    const userId = user?.id || user?.email || 'anonymous';
                                    const projectTasksKey = `offline_project_tasks_${userId}`;
                                    localStorage.setItem(projectTasksKey, JSON.stringify(tasks));
                                    console.log('💾 Saved project tasks to localStorage:', tasks.length);
                                } catch (e) {
                                    console.warn('Error saving project tasks to localStorage:', e);
                                }
                            } else {
                                console.warn('⚠️ No project tasks found in API response');
                            }
                            
                            return {
                                type: 'project',
                                data: tasks
                            };
                        })
                        .catch(err => {
                            console.error('❌ Error loading project tasks:', {
                                message: err.message,
                                error: err,
                                stack: err.stack
                            });
                            // Use cached project tasks if API fails (for local development)
                            if (cachedProjectTasks.length > 0) {
                                console.log('📦 Using cached project tasks:', cachedProjectTasks.length);
                                return { type: 'project', data: cachedProjectTasks };
                            }
                            console.warn('⚠️ No cached project tasks available, returning empty array');
                            return { type: 'project', data: [] };
                        }),
                    10000 // 10 second timeout (increased for database issues)
                )
            );

            // Load user tasks from API (lightweight mode for dashboard)
            loadPromises.push(
                withTimeout(
                    fetch('/api/user-tasks?lightweight=true', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                        .then(async response => {
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                            }
                            const data = await response.json();
                            const apiTasks = Array.isArray(data?.data?.tasks)
                                ? data.data.tasks
                                : Array.isArray(data?.tasks)
                                    ? data.tasks
                                    : Array.isArray(data?.items)
                                        ? data.items
                                        : [];
                            
                            // Save to localStorage for next time
                            if (apiTasks.length > 0) {
                                try {
                                    localStorage.setItem(offlineUserTasksKey, JSON.stringify(apiTasks));
                                } catch (e) {
                                    console.warn('Error saving tasks to localStorage:', e);
                                }
                            }
                            
                            return {
                                type: 'user',
                                data: apiTasks
                            };
                        })
                        .catch(err => {
                            console.warn('Error loading user tasks from API:', err);
                            // Keep cached data if API fails
                            return { type: 'user', data: cachedUserTasks };
                        }),
                    5000 // 5 second timeout
                )
            );

            // STEP 3: Update with fresh data in background (non-blocking)
            // If we already have cached data, this runs in the background
            // If we don't have cached data, this will update when complete
            Promise.allSettled(loadPromises).then((results) => {
                console.log('📊 Task loading results:', results.map(r => ({
                    status: r.status,
                    type: r.status === 'fulfilled' ? r.value?.type : 'error',
                    taskCount: r.status === 'fulfilled' ? r.value?.data?.length : 0,
                    error: r.status === 'rejected' ? r.reason?.message : null
                })));
                results.forEach(result => {
                    if (result.status === 'fulfilled') {
                        const { type, data } = result.value;
                        if (type === 'project') {
                            console.log('✅ Setting project tasks:', data.length, '(cached:', cachedProjectTasks.length, ')');
                            // Only update if we got fresh data (not just cached/empty)
                            // This prevents overwriting cached tasks with empty arrays from API
                            if (data.length > 0 || cachedProjectTasks.length === 0) {
                                setProjectTasks(data);
                            } else {
                                console.log('⚠️ Keeping cached project tasks (API returned empty, but we have cached data)');
                            }
                        } else if (type === 'user') {
                            // Only update if we got fresh data (not just cached)
                            if (data.length > 0 || cachedUserTasks.length === 0) {
                                console.log('✅ Setting user tasks:', data.length);
                                setUserTasks(data);
                            } else {
                                console.log('⚠️ Keeping cached user tasks (API returned empty, but we have cached data)');
                            }
                        }
                    } else {
                        console.error('❌ Task loading failed:', result.reason);
                    }
                });
                // Only set loading to false here if we didn't have cached data
                // (if we had cached data, loading was already set to false above)
                if (cachedUserTasks.length === 0 && cachedProjectTasks.length === 0) {
                    setIsLoading(false);
                }
            }).catch(err => {
                console.error('Error loading tasks:', err);
                setError('Failed to load some tasks');
                // Make sure loading is false even on error
                setIsLoading(false);
            });
        };

        loadTasks();
    }, []);

    // Combine and sort tasks
    const allTasks = React.useMemo(() => {
        console.log('🔄 Combining tasks - projectTasks:', projectTasks.length, 'userTasks:', userTasks.length);
        const combined = [
            ...projectTasks.map(t => ({ ...t, type: 'project' })),
            ...userTasks.map(t => ({ ...t, type: 'user', id: t.id || `user-task-${Date.now()}-${Math.random()}` }))
        ];
        
        console.log('🔄 Combined tasks:', combined.length, combined);
        
        // Sort by due date (overdue first, then by date)
        return combined.sort((a, b) => {
            const aDate = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
            const bDate = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
            const now = new Date();
            
            // Overdue tasks first
            const aOverdue = aDate < now && aDate.getFullYear() !== 9999;
            const bOverdue = bDate < now && bDate.getFullYear() !== 9999;
            
            if (aOverdue && !bOverdue) return -1;
            if (!aOverdue && bOverdue) return 1;
            if (aOverdue && bOverdue) return aDate - bDate; // Earlier overdue first
            
            // Then by due date
            return aDate - bDate;
        });
    }, [projectTasks, userTasks]);

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
        if (task.type === 'project' && task.projectId && window.RouteState) {
            // Navigate to the project with the task ID as a query parameter
            // MainLayout will detect the route change and dispatch openEntityDetail event
            // which will open the project and then the task
            const taskId = task.id || task.taskId;
            if (taskId) {
                // IMMEDIATE: Dispatch openTask event right away (before navigation)
                // This ensures the event is queued and will be handled as soon as ProjectDetail loads
                const openTaskEvent = new CustomEvent('openTask', {
                    detail: { 
                        taskId: taskId,
                        tab: 'details'
                    }
                });
                
                // Dispatch immediately and multiple times to ensure it's caught
                window.dispatchEvent(openTaskEvent);
                
                // Navigate to the project page with task parameter
                window.RouteState.navigate({
                    page: 'projects',
                    segments: [task.projectId],
                    search: `?task=${encodeURIComponent(taskId)}`,
                    preserveSearch: false,
                    preserveHash: false
                });
                
                // AGGRESSIVE POLLING: Check very frequently for ProjectDetail to be ready
                // This opens the task as soon as possible - much faster than waiting
                let checkCount = 0;
                const maxChecks = 60; // 3 seconds max (60 * 50ms)
                const checkInterval = setInterval(() => {
                    checkCount++;
                    
                    // Check if ProjectDetail is loaded and we're on the right page
                    const currentUrl = window.location.href || '';
                    const isOnProjectPage = currentUrl.includes(`/projects/${task.projectId}`);
                    
                    if (isOnProjectPage && window.ProjectDetail) {
                        // ProjectDetail is loaded, dispatch openTask immediately
                        clearInterval(checkInterval);
                        window.dispatchEvent(new CustomEvent('openTask', {
                            detail: { 
                                taskId: taskId,
                                tab: 'details'
                            }
                        }));
                    } else if (checkCount >= maxChecks) {
                        // Final fallback: dispatch one more time
                        clearInterval(checkInterval);
                        window.dispatchEvent(new CustomEvent('openTask', {
                            detail: { 
                                taskId: taskId,
                                tab: 'details'
                            }
                        }));
                    }
                }, 50); // Check every 50ms for ultra-fast response (was 100ms)
            } else {
                // Fallback: just navigate to project if no task ID
                window.RouteState.setPageSubpath('projects', [task.projectId]);
            }
        } else if (task.type === 'user') {
            // Navigate to My Tasks page
            window.dispatchEvent(new CustomEvent('navigateToPage', { 
                detail: { page: 'my-tasks' } 
            }));
        }
    };

    return (
        <div className={`${cardBase} border rounded-xl p-5 flex flex-col h-full shadow-sm`}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h3 className={`text-sm font-semibold ${headerText}`}>My Tasks</h3>
                <i className="fas fa-tasks text-teal-500 opacity-70"></i>
            </div>
            
            {isLoading ? (
                <div className="text-center py-4 flex-shrink-0">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto mb-2"></div>
                    <p className={`text-xs ${subText}`}>Loading tasks...</p>
                </div>
            ) : error ? (
                <div className={`text-sm ${subText} text-center py-2 flex-shrink-0`}>{error}</div>
            ) : allTasks.length === 0 ? (
                <div className={`text-sm ${subText} text-center py-2 flex-shrink-0`}>
                    No tasks assigned to you.
                    <br />
                    <span className="text-xs opacity-75">
                        (Project: {projectTasks.length}, User: {userTasks.length})
                    </span>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="space-y-2 overflow-y-auto pr-1 flex-1" style={{ maxHeight: '400px', scrollbarWidth: 'thin' }}>
                        {allTasks.map(task => {
                            const dueDateInfo = getDueDateStatus(task.dueDate);
                            const isProjectTask = task.type === 'project';
                            const isUserTask = task.type === 'user';
                            
                            return (
                                <div
                                    key={task.id || `task-${Math.random()}`}
                                    onClick={() => handleTaskClick(task)}
                                    className={`p-3 rounded-lg ${isDark ? 'bg-gray-800 border border-gray-800 hover:bg-gray-750 hover:border-gray-700' : 'bg-gray-50 border border-gray-100 hover:bg-gray-100 hover:border-gray-200'} cursor-pointer transition-all duration-200`}
                                    title={isProjectTask ? `Click to view project: ${task.project?.name || 'Unknown'}` : 'Click to view in My Tasks'}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(task.status)}`}>
                                                    {task.status || 'todo'}
                                                </span>
                                                {isProjectTask && task.project && (
                                                    <span className={`text-xs ${subText} truncate`} title={task.project.name}>
                                                        <i className="fas fa-project-diagram mr-1"></i>
                                                        {task.project.name}
                                                    </span>
                                                )}
                                                {isUserTask && (
                                                    <span className={`text-xs ${subText} truncate`}>
                                                        <i className="fas fa-check-square mr-1"></i>
                                                        My Task
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-sm ${headerText} font-medium truncate`} title={task.title || task.name}>
                                                {task.title || task.name}
                                            </p>
                                            {isProjectTask && task.project?.clientName && (
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
                    </div>
                    {allTasks.length > 0 && (
                        <div className={`text-xs ${subText} text-center pt-3 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'} flex-shrink-0 mt-3`}>
                            {projectTasks.length > 0 && userTasks.length > 0 && (
                                <span>{projectTasks.length} project task{projectTasks.length !== 1 ? 's' : ''} • {userTasks.length} personal task{userTasks.length !== 1 ? 's' : ''}</span>
                            )}
                            {projectTasks.length > 0 && userTasks.length === 0 && (
                                <span>{projectTasks.length} project task{projectTasks.length !== 1 ? 's' : ''}</span>
                            )}
                            {projectTasks.length === 0 && userTasks.length > 0 && (
                                <span>{userTasks.length} personal task{userTasks.length !== 1 ? 's' : ''}</span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const DashboardLive = () => {
    // Version indicator - logged to console for verification
    React.useEffect(() => {
        console.log('%c✨✨✨ DashboardLive v2.0 LOADED ✨✨✨', 'color: #10b981; font-size: 20px; font-weight: bold; padding: 10px; background: #10b981; color: white;');
        console.log('%c📍 Look for the "Edit Layout" button at the bottom of the dashboard', 'color: #3b82f6; font-size: 14px; font-weight: bold;');
        console.log('%c🎨 Click "Edit Layout" to enable drag, drop, and resize features!', 'color: #8b5cf6; font-size: 14px; font-weight: bold;');
        // Set a flag so we can verify it loaded
        window.__DASHBOARD_LIVE_V2_LOADED__ = true;
    }, []);
    const [dashboardData, setDashboardData] = useState({
        clients: [],
        leads: [],
        projects: [],
        timeEntries: [],
        users: [],
        stats: {
            totalClients: 0,
            totalLeads: 0,
            totalProjects: 0,
            activeProjects: 0,
            hoursThisMonth: 0,
            hoursLastMonth: 0,
            pipelineValue: 0,
            weightedPipeline: 0
        }
    });
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
    const [liveSyncStatus, setLiveSyncStatus] = useState('disconnected');
    const { isDark } = window.useTheme();
    const [userName, setUserName] = useState('User');
    const [calendarReady, setCalendarReady] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [availableWidgets, setAvailableWidgets] = useState([]);
    const [selectedWidgets, setSelectedWidgets] = useState([]);
    const [savingWidgets, setSavingWidgets] = useState(false);
    const [widgetLayouts, setWidgetLayouts] = useState({}); // { widgetId: { x, y, w, h } }
    const [draggedWidget, setDraggedWidget] = useState(null);
    const [dragOverWidget, setDragOverWidget] = useState(null);
    const [isResizing, setIsResizing] = useState(null); // widgetId being resized
    const [resizeStart, setResizeStart] = useState(null); // { x, y, w, h }
    const [editMode, setEditMode] = useState(false);

    // Optimized real-time data loading with immediate localStorage display
    const loadDashboardData = useCallback(async (showLoading = true) => {
        
        if (showLoading) {
            setIsLoading(true);
        } else {
            setIsRefreshing(true);
        }
        setError(null);
        setConnectionStatus('connecting');

        try {
            // IMMEDIATE: Load from localStorage first for instant display
            const allClients = window.storage?.getClients?.() || [];
            
            // Get clients and leads from separate localStorage keys
            const cachedClients = allClients.filter(c => c.type === 'client' || !c.type); // Default to client if no type
            const storedLeads = window.storage?.getLeads?.();
            const cachedLeads = Array.isArray(storedLeads) && storedLeads.length > 0 
                ? storedLeads 
                : (allClients.filter(c => c.type === 'lead') || []);
            
            const cachedProjects = window.storage?.getProjects?.() || [];
            const cachedTimeEntries = window.storage?.getTimeEntries?.() || [];
            const cachedUsers = window.storage?.getUsers?.() || [];

            // Calculate stats from cached data immediately
            const cachedStats = calculateStats(cachedClients, cachedLeads, cachedProjects, cachedTimeEntries);

            // Set cached data immediately for instant display
            setDashboardData({
                clients: cachedClients,
                leads: cachedLeads,
                projects: cachedProjects,
                timeEntries: cachedTimeEntries,
                users: cachedUsers,
                stats: cachedStats
            });

            setIsLoading(false);
            setIsRefreshing(false);
            setConnectionStatus('connected');

            // Check authentication for API sync
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }

            // Check if DatabaseAPI is available
            if (!window.DatabaseAPI) {
                console.warn('⚠️ DashboardLive: DatabaseAPI not available, using cached data');
                return;
            }

            // BACKGROUND: Sync with API in parallel (non-blocking)
            const syncPromises = [
                window.DatabaseAPI.getClients().catch(err => {
                    console.warn('Client sync failed:', err);
                    return { data: { clients: [] } };
                }),
                window.DatabaseAPI.getLeads().catch(err => {
                    console.warn('Lead sync failed:', err);
                    return { data: { leads: [] } };
                }),
                window.DatabaseAPI.getProjects().catch(err => {
                    console.warn('Project sync failed:', err);
                    return { data: [] };
                }),
                window.DatabaseAPI.getTimeEntries().catch(err => {
                    console.warn('Time entry sync failed:', err);
                    return { data: [] };
                })
            ];

            // Only fetch users for admins to avoid unnecessary 401s and load
            try {
                const role = window.storage?.getUser?.()?.role?.toLowerCase?.();
                if (role === 'admin') {
                    syncPromises.push(
                        window.DatabaseAPI.getUsers().catch(err => {
                            console.warn('User sync failed:', err);
                            return { data: [] };
                        })
                    );
                }
            } catch (_) {}

            // Update with fresh API data when available
            Promise.allSettled(syncPromises).then((results) => {
                // Map results to handle both fulfilled and rejected promises
                const mappedResults = results.map(r => r.status === 'fulfilled' ? r.value : { data: [] });
                
                // Get the role to determine if users promise was added
                const role = window.storage?.getUser?.()?.role?.toLowerCase?.();
                const isAdmin = role === 'admin';
                
                // Extract responses - usersRes might not exist if user is not admin
                const clientsRes = mappedResults[0] || { data: [] };
                const leadsRes = mappedResults[1] || { data: [] };
                const projectsRes = mappedResults[2] || { data: [] };
                const timeEntriesRes = mappedResults[3] || { data: [] };
                const usersRes = isAdmin && mappedResults[4] ? mappedResults[4] : { data: [] };

                // Get clients from clients API
                const clients = Array.isArray(clientsRes.data?.clients) ? clientsRes.data.clients.filter(c => c.type === 'client' || !c.type) : cachedClients;
                
                // Get leads from leads API endpoint
                const leadsFromAPI = Array.isArray(leadsRes.data?.leads) ? leadsRes.data.leads : [];
                const leads = leadsFromAPI.length > 0 ? leadsFromAPI : cachedLeads;
                
                // Store leads in localStorage for next load (even if empty to prevent stale cache)
                if (window.storage?.setLeads) {
                    window.storage.setLeads(leadsFromAPI);
                }
                
                // Store clients in localStorage for next load (even if empty to prevent stale cache)
                if (window.storage?.setClients) {
                    window.storage.setClients(clients);
                }
                
                // Handle different API response formats
                const projects = Array.isArray(projectsRes.data?.projects) ? projectsRes.data.projects : 
                                Array.isArray(projectsRes.data) ? projectsRes.data : cachedProjects;
                const timeEntries = Array.isArray(timeEntriesRes.data) ? timeEntriesRes.data : cachedTimeEntries;
                const users = Array.isArray(usersRes?.data?.users) ? usersRes.data.users : 
                             Array.isArray(usersRes?.data) ? usersRes.data : cachedUsers;

                // Recalculate stats with fresh data
                const freshStats = calculateStats(clients, leads, projects, timeEntries);

                // Update with fresh data
                setDashboardData({
                    clients,
                    leads,
                    projects,
                    timeEntries,
                    users,
                    stats: freshStats
                });

                setLastUpdated(new Date());
            });

        } catch (error) {
            console.error('❌ Failed to load dashboard data:', error);
            setError(error.message);
            setConnectionStatus('error');
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Widget definitions (excluding finance)
    const widgetRegistry = React.useMemo(() => {
        const cardBase = isDark ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white border-gray-100 text-gray-900';
        const subText = isDark ? 'text-gray-400' : 'text-gray-500';
        const headerText = isDark ? 'text-gray-100' : 'text-gray-900';
        
        const formatCurrency = (val) => {
            try {
                return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0);
            } catch (_) {
                return `$${Math.round(val || 0).toLocaleString()}`;
            }
        };
        
        return [
            {
                id: 'leads-by-stage',
                group: 'Sales',
                title: 'Leads by Stage',
                render: (data) => {
                    const stageCounts = (data.leads || []).reduce((acc, lead) => {
                        const stage = lead.stage || 'Unknown';
                        acc[stage] = (acc[stage] || 0) + 1;
                        return acc;
                    }, {});
                    const entries = Object.entries(stageCounts);
                    return (
                        <div className={`${cardBase} border rounded-xl p-5 shadow-sm`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`text-sm font-semibold ${headerText}`}>Leads by Stage</h3>
                                <i className="fas fa-filter text-purple-500 opacity-70"></i>
                            </div>
                            {entries.length === 0 ? (
                                <div className={`text-sm ${subText}`}>No leads data.</div>
                            ) : (
                                <div className="space-y-2">
                                    {entries.map(([stage, count]) => (
                                        <div key={stage} className="flex items-center justify-between">
                                            <span className={`text-sm ${headerText}`}>{stage}</span>
                                            <span className="text-sm font-medium">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }
            },
            {
                id: 'my-project-tasks',
                group: 'Projects',
                title: 'My Tasks',
                render: () => <MyProjectTasksWidget cardBase={cardBase} headerText={headerText} subText={subText} isDark={isDark} />
            },
            {
                id: 'recent-activity',
                group: 'Activity',
                title: 'Recent Activity',
                render: (data) => {
                    const items = [];
                    const pushIf = (arr, type) => {
                        (arr || []).slice(0, 50).forEach(i => {
                            items.push({
                                type,
                                name: i.name || i.title || i.clientName || i.id,
                                updatedAt: i.updatedAt || i.createdAt || null
                            });
                        });
                    };
                    pushIf(data.clients, 'Client');
                    pushIf(data.projects, 'Project');
                    pushIf(data.timeEntries, 'Time');
                    const sorted = items
                        .filter(i => i.updatedAt)
                        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                        .slice(0, 8);
                    return (
                        <div className={`${cardBase} border rounded-xl p-5 shadow-sm`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`text-sm font-semibold ${headerText}`}>Recent Activity</h3>
                                <i className="fas fa-stream text-indigo-500 opacity-70"></i>
                            </div>
                            {sorted.length === 0 ? (
                                <div className={`text-sm ${subText}`}>No recent activity.</div>
                            ) : (
                                <ul className="space-y-2">
                                    {sorted.map((i, idx) => (
                                        <li key={idx} className="flex items-center justify-between">
                                            <span className="text-sm truncate">{i.type}: {i.name}</span>
                                            <span className={`text-xs ${subText}`}>{new Date(i.updatedAt).toLocaleDateString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                }
            }
        ];
    }, [isDark]);

    // Helper function to persist widget preferences
    const persistWidgets = (ids) => {
        const userId = window.storage?.getUser?.()?.id || 'anon';
        const key = `dashboard.widgets.${userId}`;
        try {
            window.localStorage.setItem(key, JSON.stringify(ids));
        } catch (_) {}
    };

    // Helper function to persist widget layouts
    const persistWidgetLayouts = (layouts) => {
        const userId = window.storage?.getUser?.()?.id || 'anon';
        const key = `dashboard.widgetLayouts.${userId}`;
        try {
            window.localStorage.setItem(key, JSON.stringify(layouts));
        } catch (_) {}
    };

    // Load widget layouts from localStorage
    const loadWidgetLayouts = () => {
        const userId = window.storage?.getUser?.()?.id || 'anon';
        const key = `dashboard.widgetLayouts.${userId}`;
        try {
            const stored = window.localStorage.getItem(key);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (_) {}
        return {};
    };

    // Get default layout for a widget
    const getDefaultLayout = (widgetId, index) => {
        const existing = widgetLayouts[widgetId];
        if (existing) return existing;
        
        // Default sizes: 1x1 (small), 2x1 (medium), 2x2 (large)
        // Most widgets start as 1x1, tasks can be larger
        const defaultSizes = {
            'my-project-tasks': { w: 2, h: 1 },
            'leads-by-stage': { w: 1, h: 1 },
            'recent-activity': { w: 1, h: 1 }
        };
        
        const size = defaultSizes[widgetId] || { w: 1, h: 1 };
        return {
            ...size,
            order: index
        };
    };


    // Load and persist selected widgets
    useEffect(() => {
        const userId = window.storage?.getUser?.()?.id || 'anon';
        const key = `dashboard.widgets.${userId}`;
        try {
            const stored = window.localStorage.getItem(key);
            const parsed = stored ? JSON.parse(stored) : null;
            setAvailableWidgets(widgetRegistry);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const valid = parsed.filter(id => widgetRegistry.some(w => w.id === id));
                // Auto-add new 'my-project-tasks' widget if it exists in registry but not in saved preferences
                if (widgetRegistry.some(w => w.id === 'my-project-tasks') && !valid.includes('my-project-tasks')) {
                    valid.push('my-project-tasks');
                    persistWidgets(valid);
                }
                setSelectedWidgets(valid);
            } else {
                const defaults = ['my-project-tasks'];
                const validDefaults = defaults.filter(id => widgetRegistry.some(w => w.id === id));
                setSelectedWidgets(validDefaults);
            }
            
            // Load widget layouts
            const layouts = loadWidgetLayouts();
            setWidgetLayouts(layouts);
        } catch (_) {
            setAvailableWidgets(widgetRegistry);
            setSelectedWidgets(['my-project-tasks']);
            setWidgetLayouts({});
        }
    }, [widgetRegistry]);

    const handleToggleWidget = (id) => {
        setSelectedWidgets(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            persistWidgets(next);
            
            // Remove layout if widget is removed
            if (!next.includes(id)) {
                setWidgetLayouts(prevLayouts => {
                    const newLayouts = { ...prevLayouts };
                    delete newLayouts[id];
                    persistWidgetLayouts(newLayouts);
                    return newLayouts;
                });
            }
            
            return next;
        });
    };

    const handleResetWidgets = () => {
        const defaults = ['my-project-tasks'];
        setSelectedWidgets(defaults);
        persistWidgets(defaults);
        setWidgetLayouts({});
        persistWidgetLayouts({});
    };

    // Drag and drop handlers
    const handleDragStart = (e, widgetId) => {
        if (!editMode) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', widgetId);
        setDraggedWidget(widgetId);
        e.currentTarget.style.opacity = '0.5';
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedWidget(null);
        setDragOverWidget(null);
    };

    const handleDragOver = (e, targetWidgetId) => {
        if (!editMode || !draggedWidget || draggedWidget === targetWidgetId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverWidget(targetWidgetId);
    };

    const handleDrop = (e, targetWidgetId) => {
        if (!editMode || !draggedWidget || draggedWidget === targetWidgetId) return;
        e.preventDefault();
        
        // Swap order instead of exact positions
        const draggedIndex = selectedWidgets.indexOf(draggedWidget);
        const targetIndex = selectedWidgets.indexOf(targetWidgetId);
        
        setWidgetLayouts(prev => {
            const draggedLayout = prev[draggedWidget] || getDefaultLayout(draggedWidget, draggedIndex);
            const targetLayout = prev[targetWidgetId] || getDefaultLayout(targetWidgetId, targetIndex);
            
            const newLayouts = {
                ...prev,
                [draggedWidget]: { ...draggedLayout, order: targetIndex },
                [targetWidgetId]: { ...targetLayout, order: draggedIndex }
            };
            persistWidgetLayouts(newLayouts);
            return newLayouts;
        });
        
        // Also swap in selectedWidgets array
        setSelectedWidgets(prev => {
            const newWidgets = [...prev];
            [newWidgets[draggedIndex], newWidgets[targetIndex]] = [newWidgets[targetIndex], newWidgets[draggedIndex]];
            return newWidgets;
        });
        
        setDraggedWidget(null);
        setDragOverWidget(null);
    };

    const handleDragLeave = () => {
        setDragOverWidget(null);
    };

    // Resize handlers
    const handleResizeStart = (e, widgetId, direction) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        
        const layout = widgetLayouts[widgetId] || getDefaultLayout(widgetId, selectedWidgets.indexOf(widgetId));
        setIsResizing({ widgetId, direction });
        setResizeStart({
            x: e.clientX,
            y: e.clientY,
            w: layout.w || 1,
            h: layout.h || 1
        });
    };

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e) => {
            if (!isResizing || !resizeStart) return;
            
            const deltaX = e.clientX - resizeStart.x;
            const deltaY = e.clientY - resizeStart.y;
            
            // Calculate grid units - use actual grid container dimensions
            const gridContainer = document.querySelector('.grid.gap-4[style*="gridTemplateColumns"]');
            let cellWidth = 300; // Default fallback
            let cellHeight = 200; // Default fallback
            
            if (gridContainer) {
                const containerWidth = gridContainer.offsetWidth;
                const gap = 16; // 1rem = 16px (gap-4)
                cellWidth = (containerWidth - (gap * 2)) / 3;
                
                // Get first widget to estimate cell height
                const firstWidget = gridContainer.querySelector('[style*="gridColumn"]');
                if (firstWidget) {
                    cellHeight = firstWidget.offsetHeight || 200;
                }
            }
            
            // Calculate size changes based on actual cell dimensions
            const deltaW = Math.round(deltaX / cellWidth);
            const deltaH = Math.round(deltaY / cellHeight);
            
            setWidgetLayouts(prev => {
                const layout = prev[isResizing.widgetId] || getDefaultLayout(isResizing.widgetId, selectedWidgets.indexOf(isResizing.widgetId));
                let newW = resizeStart.w;
                let newH = resizeStart.h;
                
                if (isResizing.direction.includes('e')) {
                    // Width: positive deltaX = larger, negative = smaller
                    newW = Math.max(1, Math.min(3, resizeStart.w + deltaW));
                }
                if (isResizing.direction.includes('s')) {
                    // Height: positive deltaY = larger, negative = smaller
                    newH = Math.max(1, Math.min(3, resizeStart.h + deltaH));
                }
                
                const newLayouts = {
                    ...prev,
                    [isResizing.widgetId]: { 
                        ...layout, 
                        w: newW, 
                        h: newH,
                        order: layout.order !== undefined ? layout.order : selectedWidgets.indexOf(isResizing.widgetId)
                    }
                };
                persistWidgetLayouts(newLayouts);
                return newLayouts;
            });
        };

        const handleMouseUp = () => {
            setIsResizing(null);
            setResizeStart(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Prevent text selection while resizing
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'se-resize';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isResizing, resizeStart, selectedWidgets, widgetLayouts]);

    // Live data sync integration
    useEffect(() => {
        if (!window.LiveDataSync) {
            console.warn('LiveDataSync not available, falling back to manual refresh');
            return;
        }

        const subscriptionId = 'dashboard-live';
        
        // Subscribe to live updates
        window.LiveDataSync.subscribe(subscriptionId, (message) => {
            
            switch (message.type) {
                case 'connection':
                    setLiveSyncStatus(message.status);
                    break;
                    
                case 'data':
                    // Update specific data type
                    // Handle both direct arrays and API response format
                    let normalizedData = message.data;
                    if (message.data && typeof message.data === 'object' && message.data.data) {
                        // API response format: {data: {projects: [...]}}
                        normalizedData = message.data.data[message.dataType] || message.data[message.dataType] || message.data.data;
                    }
                    
                    setDashboardData(prev => {
                        const newData = {
                            ...prev,
                            [message.dataType]: normalizedData
                        };
                        
                        // Calculate stats using helper function
                        const stats = calculateStats(
                            newData.clients,
                            newData.leads,
                            newData.projects,
                            newData.timeEntries
                        );
                        
                        return {
                            ...newData,
                            stats
                        };
                    });
                    setLastUpdated(message.timestamp);
                    break;
                    
                case 'sync':
                    if (message.status === 'success') {
                        setLastUpdated(message.timestamp);
                        setError(null);
                    } else if (message.status === 'error') {
                        setError(message.error);
                    }
                    break;
            }
        });

        // Start live sync if not running
        if (!window.LiveDataSync.getStatus().isRunning) {
            window.LiveDataSync.start();
        }

        // Cleanup
        return () => {
            window.LiveDataSync.unsubscribe(subscriptionId);
        };
    }, []); // calculateStats is defined at module level, no dependency needed

    // Wait for Calendar to be available and force re-render when found
    React.useEffect(() => {
        let mounted = true;
        
        const checkCalendar = () => {
            if (window.Calendar && typeof window.Calendar === 'function') {
                if (mounted) {
                    setCalendarReady(true);
                }
                return true;
            }
            return false;
        };
        
        // Listen for calendar ready event
        const handleCalendarReady = () => {
            if (mounted) {
                checkCalendar();
            }
        };
        
        window.addEventListener('calendarComponentReady', handleCalendarReady);
        
        // Check immediately
        checkCalendar();
        
        // Retry periodically until Calendar is available
        const interval = setInterval(() => {
            if (mounted) {
                checkCalendar();
            }
        }, 100);
        
        // Stop checking after 10 seconds
        const timeout = setTimeout(() => {
            clearInterval(interval);
        }, 10000);
        
        return () => {
            mounted = false;
            clearInterval(interval);
            clearTimeout(timeout);
            window.removeEventListener('calendarComponentReady', handleCalendarReady);
        };
    }, []); // Only run once on mount

    // Load user name
    useEffect(() => {
        const user = window.storage?.getUser?.();
        if (user?.name) {
            setUserName(user.name);
        } else if (window.storage?.getUserInfo) {
            const userInfo = window.storage.getUserInfo();
            if (userInfo?.name) {
                setUserName(userInfo.name);
            }
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    // Manual refresh
    const handleRefresh = () => {
        if (window.LiveDataSync) {
            window.LiveDataSync.forceSync();
        } else {
            loadDashboardData(false);
        }
    };

    // Toggle live sync
    const toggleLiveSync = () => {
        if (window.LiveDataSync) {
            if (window.LiveDataSync.getStatus().isRunning) {
                window.LiveDataSync.stop();
            } else {
                window.LiveDataSync.start();
            }
        }
    };

    // Connection status indicator
    const getConnectionStatusColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'text-green-600';
            case 'connecting': return 'text-yellow-600';
            case 'error': return 'text-red-600';
            default: return 'text-gray-600';
        }
    };

    const getConnectionStatusIcon = () => {
        switch (connectionStatus) {
            case 'connected': return 'fa-check-circle';
            case 'connecting': return 'fa-spinner fa-spin';
            case 'error': return 'fa-exclamation-triangle';
            default: return 'fa-question-circle';
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading live dashboard data...</p>
                    <p className="text-xs text-gray-500 mt-2">Connecting to live data sources...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                        <i className="fas fa-exclamation-triangle text-red-400"></i>
                    </div>
                    <div className="ml-3">
                        <h3 className={`text-sm font-medium ${isDark ? 'text-red-200' : 'text-red-800'}`}>
                            Error loading dashboard data
                        </h3>
                        <div className={`mt-2 text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                            <p>{error}</p>
                        </div>
                        <div className="mt-4">
                            <button
                                onClick={handleRefresh}
                                className="bg-red-100 text-red-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-red-200"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Customizable widgets UI
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Welcome, {userName}</h2>
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Here's what's happening today</p>
                </div>
            </div>

            <div 
                className="grid gap-5"
                style={{
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gridAutoRows: 'minmax(200px, auto)'
                }}
            >
                {selectedWidgets
                    .map((id, index) => {
                        const layout = widgetLayouts[id] || getDefaultLayout(id, index);
                        return { id, index, order: layout.order !== undefined ? layout.order : index };
                    })
                    .sort((a, b) => a.order - b.order)
                    .map(({ id, index }) => {
                        const def = availableWidgets.find(w => w.id === id);
                        if (!def) return null;
                        
                        const layout = widgetLayouts[id] || getDefaultLayout(id, index);
                        const isDragging = draggedWidget === id;
                        const isDragOver = dragOverWidget === id;
                        const w = Math.max(1, Math.min(3, layout.w || 1));
                        const h = Math.max(1, Math.min(3, layout.h || 1));
                        
                        return (
                            <div
                                key={id}
                                draggable={editMode}
                                onDragStart={(e) => handleDragStart(e, id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, id)}
                                onDrop={(e) => handleDrop(e, id)}
                                onDragLeave={handleDragLeave}
                                className={`relative transition-all ${editMode ? 'cursor-move' : ''} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                                style={{
                                    gridColumn: `span ${w}`,
                                    gridRow: `span ${h}`
                                }}
                            >
                                {editMode && (
                                    <>
                                        {/* Remove button */}
                                        <div className="absolute right-2 top-2 z-20">
                                            <button
                                                onClick={() => handleToggleWidget(id)}
                                                title="Remove widget"
                                                className="h-8 w-8 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg"
                                            >
                                                <i className="fas fa-times text-xs"></i>
                                            </button>
                                        </div>
                                        
                                        {/* Resize handles - larger and more visible */}
                                        <div
                                            className="absolute right-0 bottom-0 w-8 h-8 bg-blue-600 hover:bg-blue-700 cursor-se-resize z-20 rounded-tl-lg flex items-center justify-center shadow-lg"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleResizeStart(e, id, 'se');
                                            }}
                                            title="Drag to resize widget (bottom-right corner)"
                                        >
                                            <div className="w-4 h-4 border-r-2 border-b-2 border-white"></div>
                                        </div>
                                        
                                        {/* Size indicator */}
                                        <div className="absolute left-2 top-2 z-20">
                                            <div className="px-2 py-1 rounded bg-blue-600 text-white text-xs font-semibold shadow-lg">
                                                {w}×{h}
                                            </div>
                                        </div>
                                        
                                        {/* Drag handle indicator */}
                                        <div className="absolute left-2 bottom-2 z-20">
                                            <div className="px-2 py-1 rounded bg-gray-700 text-white text-xs">
                                                <i className="fas fa-grip-vertical mr-1"></i>
                                                Drag
                                            </div>
                                        </div>
                                    </>
                                )}
                                
                                <div className="h-full w-full">
                                    <WidgetWrapper widgetDef={def} dashboardData={dashboardData} />
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* Edit Layout and Manage Widgets Buttons at Bottom */}
            <div className={`flex justify-center gap-3 pt-6 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <button
                    onClick={() => setManageOpen(true)}
                    className={`px-5 py-2.5 text-sm font-medium rounded-lg ${isDark ? 'bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-750' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'} transition-all duration-200`}
                >
                    <i className="fas fa-cog mr-2"></i>
                    Manage Widgets
                </button>
                <button
                    onClick={() => {
                        setEditMode(!editMode);
                        console.log('🎨 Edit Mode:', !editMode ? 'ENABLED' : 'DISABLED');
                    }}
                    className={`px-5 py-2.5 text-sm font-medium rounded-lg ${editMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'} transition-all duration-200`}
                    title={editMode ? 'Exit edit mode to hide controls' : 'Click to enable drag, drop, and resize'}
                >
                    <i className={`fas ${editMode ? 'fa-times' : 'fa-edit'} mr-2`}></i>
                    {editMode ? 'Exit Edit Mode' : 'Edit Layout'}
                </button>
            </div>

            {manageOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black bg-opacity-40" onClick={() => setManageOpen(false)}></div>
                    <div className={`${isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'} relative rounded-xl shadow-xl w-full max-w-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                        <div className={`p-5 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">Manage Widgets</h3>
                                <button className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} transition-colors`} onClick={() => setManageOpen(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div className="p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {availableWidgets.map(w => {
                                    const checked = selectedWidgets.includes(w.id);
                                    return (
                                        <label key={w.id} className={`${isDark ? 'bg-gray-800 border-gray-800 hover:bg-gray-750' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'} border rounded-lg p-4 flex items-start gap-3 cursor-pointer transition-all duration-200`}>
                                            <input
                                                type="checkbox"
                                                className="mt-1"
                                                checked={checked}
                                                onChange={() => handleToggleWidget(w.id)}
                                            />
                                            <div>
                                                <div className="text-sm font-medium">{w.title}</div>
                                                <div className="text-xs text-gray-500">{w.group}</div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                        <div className={`p-5 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'} flex items-center justify-between`}>
                            <div className="flex items-center gap-3">
                                <button
                                    className={`text-sm px-4 py-2 rounded-lg ${isDark ? 'bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-750' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'} transition-all duration-200`}
                                    onClick={handleResetWidgets}
                                >
                                    Reset to defaults
                                </button>
                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <i className="fas fa-info-circle mr-1"></i>
                                    Use "Edit Layout" to drag, resize, and rearrange widgets
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    className={`text-sm px-4 py-2 rounded-lg font-medium ${isDark ? 'bg-gray-800 text-gray-200 hover:bg-gray-750' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} transition-all duration-200`}
                                    onClick={() => setManageOpen(false)}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

// Make available globally
window.DashboardLive = DashboardLive;
