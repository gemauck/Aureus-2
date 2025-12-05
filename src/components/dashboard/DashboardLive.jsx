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

// MyProjectTasksWidget - Separate component to properly use hooks
const MyProjectTasksWidget = ({ cardBase, headerText, subText, isDark }) => {
    const [tasks, setTasks] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        const loadTasks = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const token = window.storage?.getToken?.();
                if (!token || !window.DatabaseAPI) {
                    setTasks([]);
                    setIsLoading(false);
                    return;
                }

                const response = await window.DatabaseAPI.getTasks();
                const tasksData = response?.data?.tasks || [];
                setTasks(tasksData);
            } catch (err) {
                console.error('Error loading tasks:', err);
                setError('Failed to load tasks');
                setTasks([]);
            } finally {
                setIsLoading(false);
            }
        };

        loadTasks();
    }, []);

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
        <div className={`${cardBase} border rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-semibold ${headerText}`}>My Project Tasks</h3>
                <i className="fas fa-tasks text-teal-500"></i>
            </div>
            
            {isLoading ? (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto mb-2"></div>
                    <p className={`text-xs ${subText}`}>Loading tasks...</p>
                </div>
            ) : error ? (
                <div className={`text-sm ${subText} text-center py-2`}>{error}</div>
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
        const cardBase = isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
        const subText = isDark ? 'text-gray-400' : 'text-gray-500';
        const headerText = isDark ? 'text-gray-200' : 'text-gray-800';
        
        const formatCurrency = (val) => {
            try {
                return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0);
            } catch (_) {
                return `$${Math.round(val || 0).toLocaleString()}`;
            }
        };
        
        return [
            {
                id: 'sales-overview',
                group: 'Sales',
                title: 'Sales Overview',
                render: (data) => (
                    <div className={`${cardBase} border rounded-lg p-4`}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`text-sm font-semibold ${headerText}`}>Sales Overview</h3>
                            <i className="fas fa-chart-line text-blue-500"></i>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <div className={`text-xs ${subText}`}>Leads</div>
                                <div className="text-xl font-bold">{data.stats.totalLeads}</div>
                            </div>
                            <div>
                                <div className={`text-xs ${subText}`}>Clients</div>
                                <div className="text-xl font-bold">{data.stats.totalClients}</div>
                            </div>
                            <div>
                                <div className={`text-xs ${subText}`}>Weighted Pipeline</div>
                                <div className="text-xl font-bold">{formatCurrency(data.stats.weightedPipeline)}</div>
                            </div>
                        </div>
                    </div>
                )
            },
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
                        <div className={`${cardBase} border rounded-lg p-4`}>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className={`text-sm font-semibold ${headerText}`}>Leads by Stage</h3>
                                <i className="fas fa-filter text-purple-500"></i>
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
                id: 'projects-overview',
                group: 'Projects',
                title: 'Projects Overview',
                render: (data) => (
                    <div className={`${cardBase} border rounded-lg p-4`}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`text-sm font-semibold ${headerText}`}>Projects Overview</h3>
                            <i className="fas fa-project-diagram text-green-500"></i>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <div className={`text-xs ${subText}`}>Projects</div>
                                <div className="text-xl font-bold">{data.stats.totalProjects}</div>
                            </div>
                            <div>
                                <div className={`text-xs ${subText}`}>Active</div>
                                <div className="text-xl font-bold">{data.stats.activeProjects}</div>
                            </div>
                            <div>
                                <div className={`text-xs ${subText}`}>Due This Week</div>
                                <div className="text-xl font-bold">
                                    {(data.projects || []).filter(p => {
                                        const due = p.dueDate ? new Date(p.dueDate) : null;
                                        if (!due) return false;
                                        const now = new Date();
                                        const in7 = new Date();
                                        in7.setDate(now.getDate() + 7);
                                        return due >= now && due <= in7;
                                    }).length}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: 'time-overview',
                group: 'Time',
                title: 'Time This Month',
                render: (data) => (
                    <div className={`${cardBase} border rounded-lg p-4`}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`text-sm font-semibold ${headerText}`}>Time This Month</h3>
                            <i className="fas fa-stopwatch text-orange-500"></i>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className={`text-xs ${subText}`}>Hours</div>
                                <div className="text-2xl font-bold">{Math.round(data.stats.hoursThisMonth)}</div>
                            </div>
                            <div>
                                <div className={`text-xs ${subText}`}>Last Month</div>
                                <div className="text-2xl font-bold">{Math.round(data.stats.hoursLastMonth)}</div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: 'my-project-tasks',
                group: 'Projects',
                title: 'My Project Tasks',
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
                        <div className={`${cardBase} border rounded-lg p-4`}>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className={`text-sm font-semibold ${headerText}`}>Recent Activity</h3>
                                <i className="fas fa-stream text-indigo-500"></i>
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
            },
            {
                id: 'calendar',
                group: 'Calendar',
                title: 'Calendar',
                render: () => {
                    const CalendarComponent = window.Calendar;
                    return (
                        <div className={`${cardBase} border rounded-lg p-4`}>
                            {CalendarComponent && typeof CalendarComponent === 'function' ? (
                                <CalendarComponent />
                            ) : (
                                <div className="text-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                    <p className={`text-sm ${subText}`}>Loading calendar...</p>
                                </div>
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
        // Most widgets start as 1x1, calendar and tasks can be larger
        const defaultSizes = {
            'calendar': { w: 2, h: 2 },
            'my-project-tasks': { w: 2, h: 1 },
            'sales-overview': { w: 1, h: 1 },
            'projects-overview': { w: 1, h: 1 },
            'time-overview': { w: 1, h: 1 },
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
                const defaults = ['sales-overview', 'projects-overview', 'my-project-tasks', 'time-overview', 'calendar'];
                const validDefaults = defaults.filter(id => widgetRegistry.some(w => w.id === id));
                setSelectedWidgets(validDefaults);
            }
            
            // Load widget layouts
            const layouts = loadWidgetLayouts();
            setWidgetLayouts(layouts);
        } catch (_) {
            setAvailableWidgets(widgetRegistry);
            setSelectedWidgets(['sales-overview', 'projects-overview', 'my-project-tasks', 'time-overview', 'calendar']);
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
        const defaults = ['sales-overview', 'projects-overview', 'my-project-tasks', 'time-overview', 'calendar'];
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
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Welcome, {userName}</h2>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setManageOpen(true)}
                        className="px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
                    >
                        Manage Widgets
                    </button>
                    <button
                        onClick={handleRefresh}
                        className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
                <i className={`fas ${getConnectionStatusIcon()} ${getConnectionStatusColor()}`}></i>
                <span className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Connection: {connectionStatus}</span>
            </div>

            <div 
                className="grid gap-4"
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
                                        
                                        {/* Resize handles */}
                                        <div
                                            className="absolute right-0 bottom-0 w-6 h-6 bg-blue-600 hover:bg-blue-700 cursor-se-resize z-20 rounded-tl-lg flex items-center justify-center"
                                            onMouseDown={(e) => handleResizeStart(e, id, 'se')}
                                            title="Resize widget"
                                        >
                                            <div className="w-3 h-3 border-r-2 border-b-2 border-white"></div>
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
                                    {def.render(dashboardData)}
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* Edit Layout Button at Bottom */}
            <div className="flex justify-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => {
                        setEditMode(!editMode);
                        console.log('🎨 Edit Mode:', !editMode ? 'ENABLED' : 'DISABLED');
                    }}
                    className={`px-6 py-3 text-sm font-semibold rounded-md ${editMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'} shadow-lg transition-all`}
                    title={editMode ? 'Exit edit mode to hide controls' : 'Click to enable drag, drop, and resize'}
                >
                    <i className={`fas ${editMode ? 'fa-times' : 'fa-edit'} mr-2`}></i>
                    {editMode ? 'Exit Edit Mode' : 'Edit Layout'}
                </button>
            </div>

            {manageOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black bg-opacity-40" onClick={() => setManageOpen(false)}></div>
                    <div className={`${isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'} relative rounded-lg shadow-lg w-full max-w-2xl border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold">Manage Widgets</h3>
                                <button className="p-2" onClick={() => setManageOpen(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {availableWidgets.map(w => {
                                    const checked = selectedWidgets.includes(w.id);
                                    return (
                                        <label key={w.id} className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'} border rounded-md p-3 flex items-start gap-3`}>
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
                        <div className={`p-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                            <div className="flex items-center gap-2">
                                <button
                                    className="text-sm px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
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
                                    className="text-sm px-3 py-2 rounded-md"
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
