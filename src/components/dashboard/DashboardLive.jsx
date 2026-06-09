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

/** Engagement lifecycle (Potential → Tender); matches CRM / Pipeline */
const leadEngagementKey = (lead) => {
    const raw = lead?.engagementStage ?? lead?.status ?? '';
    return String(raw).trim().toLowerCase();
};

const formatEngagementStageLabel = (lead) => {
    const raw = lead?.engagementStage ?? lead?.status ?? '';
    const s = String(raw).trim();
    if (!s) return '—';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const isProposalOrTenderEngagement = (lead) => {
    const k = leadEngagementKey(lead);
    return k === 'proposal' || k === 'tender';
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

const isDashboardTasksDebugEnabled = () => {
    try {
        return localStorage.getItem('DEBUG_DASHBOARD_TASKS') === 'true';
    } catch (_error) {
        return false;
    }
};

const logTaskDebug = (...args) => {
    if (isDashboardTasksDebugEnabled()) {
        console.log(...args);
    }
};

const warnTaskDebug = (...args) => {
    if (isDashboardTasksDebugEnabled()) {
        console.warn(...args);
    }
};

const isArchivedTask = (task) => {
    const normalizedStatus = String(task?.status || '').toLowerCase().replace(/\s+/g, '');
    return normalizedStatus === 'archived';
};

/** Keep in sync with MainLayout DESKTOP_SITE_LAYOUT_MIN_PX / html.erp-desktop-site min-width. */
const DESKTOP_SITE_LAYOUT_MIN_PX = 1330;

function isDesktopSiteLayout() {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('erp-desktop-site');
}

/** Layout viewport width for dashboard grid — wide meta viewport on phones in desktop-site mode. */
function getDashboardLayoutWidthPx() {
    if (typeof window === 'undefined') return DESKTOP_SITE_LAYOUT_MIN_PX;
    const inner = window.innerWidth;
    if (isDesktopSiteLayout()) return Math.max(inner, DESKTOP_SITE_LAYOUT_MIN_PX);
    return inner;
}

/** Matches Tailwind grid in this file: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` */
function getDashboardGridColumnCount(widthPx) {
    if (typeof widthPx !== 'number' || Number.isNaN(widthPx)) return 1;
    if (widthPx < 768) return 1;
    if (widthPx < 1280) return 2;
    return 3;
}

function syncDashboardGridColumnCount() {
    return getDashboardGridColumnCount(getDashboardLayoutWidthPx());
}

const DASHBOARD_WIDGET_DEFAULT_SIZES = {
    'my-project-tasks': { w: 2, h: 1 },
    'last-working-month-progress': { w: 2, h: 2 },
    'erp-usage-insights': { w: 2, h: 2 },
    'leads-proposal-tender': { w: 1, h: 2 },
    'recent-activity': { w: 1, h: 1 },
    'client-activity-metrics': { w: 1, h: 2 },
    'recent-jobcards': { w: 1, h: 2 },
    'recent-stock-movements': { w: 2, h: 2 }
};

/** Phone layout uses a single column; desktop/tablet can use wider tiles. */
function defaultLayoutForWidget(widgetId, index, bucket) {
    const size = DASHBOARD_WIDGET_DEFAULT_SIZES[widgetId] || { w: 1, h: 1 };
    const w = bucket === 'mobile' ? 1 : Math.max(1, Math.min(3, size.w));
    const h = Math.max(1, Math.min(3, size.h));
    return { w, h, order: index };
}

/**
 * v2 storage: { mobile: { [id]: layout }, desktop: { [id]: layout } }
 * Legacy: flat map of id -> layout (treated as desktop); mobile derived with w=1.
 */
function normalizeWidgetLayoutsStorage(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { mobile: {}, desktop: {} };
    if (Object.prototype.hasOwnProperty.call(raw, 'mobile') || Object.prototype.hasOwnProperty.call(raw, 'desktop')) {
        const mobile = raw.mobile && typeof raw.mobile === 'object' && !Array.isArray(raw.mobile) ? { ...raw.mobile } : {};
        const desktop = raw.desktop && typeof raw.desktop === 'object' && !Array.isArray(raw.desktop) ? { ...raw.desktop } : {};
        return { mobile, desktop };
    }
    const desktop = { ...raw };
    const mobile = {};
    for (const k of Object.keys(desktop)) {
        const L = desktop[k];
        if (L && typeof L === 'object' && !Array.isArray(L)) {
            const h = Math.max(1, Math.min(3, Number(L.h) || 1));
            const order = typeof L.order === 'number' ? L.order : undefined;
            mobile[k] = { ...L, w: 1, h, ...(order !== undefined ? { order } : {}) };
        }
    }
    return { mobile, desktop };
}

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
                warnTaskDebug('⚠️ No token available for task loading');
                setProjectTasks([]);
                setUserTasks([]);
                setIsLoading(false);
                return;
            }
            
            logTaskDebug('🔑 Token available, loading tasks...');

            // Get current user ID
            const user = window.storage?.getUser?.();
            const userId = user?.id || user?.email || 'anonymous';
            const offlineUserTasksKey = `offline_user_tasks_${userId}`;
            const offlineProjectTasksKey = `offline_project_tasks_${userId}`;

            // Show cached tasks immediately while the API refreshes in the background.
            let showedCachedTasks = false;
            try {
                const cachedProjectRaw = localStorage.getItem(offlineProjectTasksKey);
                const cachedUserRaw = localStorage.getItem(offlineUserTasksKey);
                if (cachedProjectRaw) {
                    const parsed = JSON.parse(cachedProjectRaw);
                    if (Array.isArray(parsed)) {
                        setProjectTasks(parsed);
                        showedCachedTasks = showedCachedTasks || parsed.length > 0;
                    }
                }
                if (cachedUserRaw) {
                    const parsed = JSON.parse(cachedUserRaw);
                    if (Array.isArray(parsed)) {
                        setUserTasks(parsed);
                        showedCachedTasks = showedCachedTasks || parsed.length > 0;
                    }
                }
                if (showedCachedTasks) {
                    setIsLoading(false);
                }
            } catch (cacheErr) {
                warnTaskDebug('Could not read cached dashboard tasks:', cacheErr);
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
                        headers: { 'Authorization': `Bearer ${token}` },
                        cache: 'no-store'
                    })
                        .then(async response => {
                            if (!response.ok) {
                                const errorText = await response.text();
                                console.warn('Project tasks API error:', response.status, errorText);
                                throw new Error(`HTTP ${response.status}: ${errorText}`);
                            }
                            const data = await response.json();
                            logTaskDebug('📋 Project tasks API response:', { 
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
                            logTaskDebug('📋 Parsed project tasks:', tasks.length, tasks);
                            // Save to localStorage for offline use
                            if (tasks.length > 0) {
                                try {
                                    const user = window.storage?.getUser?.();
                                    const userId = user?.id || user?.email || 'anonymous';
                                    const projectTasksKey = `offline_project_tasks_${userId}`;
                                    localStorage.setItem(projectTasksKey, JSON.stringify(tasks));
                                    logTaskDebug('💾 Saved project tasks to localStorage:', tasks.length);
                                } catch (e) {
                                    warnTaskDebug('Error saving project tasks to localStorage:', e);
                                }
                            } else {
                                warnTaskDebug('⚠️ No project tasks found in API response');
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
                            warnTaskDebug('⚠️ Project tasks API failed, returning empty array');
                            return { type: 'project', data: [] };
                        }),
                    20000 // 20 second timeout (slow connections / database)
                )
            );

            // Load user tasks from API (lightweight mode for dashboard)
            loadPromises.push(
                withTimeout(
                    fetch('/api/user-tasks?lightweight=true', {
                        headers: { 'Authorization': `Bearer ${token}` },
                        cache: 'no-store'
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
                                    warnTaskDebug('Error saving tasks to localStorage:', e);
                                }
                            }
                            
                            return {
                                type: 'user',
                                data: apiTasks
                            };
                        })
                        .catch(err => {
                            warnTaskDebug('Error loading user tasks from API:', err);
                            return { type: 'user', data: [] };
                        }),
                    12000 // 12 second timeout (increased for slow connections)
                )
            );

            Promise.allSettled(loadPromises).then((results) => {
                logTaskDebug('📊 Task loading results:', results.map(r => ({
                    status: r.status,
                    type: r.status === 'fulfilled' ? r.value?.type : 'error',
                    taskCount: r.status === 'fulfilled' ? r.value?.data?.length : 0,
                    error: r.status === 'rejected' ? r.reason?.message : null
                })));
                results.forEach(result => {
                    if (result.status === 'fulfilled') {
                        const { type, data } = result.value;
                        if (type === 'project') {
                            logTaskDebug('✅ Setting project tasks:', data.length);
                            setProjectTasks(data);
                        } else if (type === 'user') {
                            logTaskDebug('✅ Setting user tasks:', data.length);
                            setUserTasks(data);
                        }
                    } else {
                        console.error('❌ Task loading failed:', result.reason);
                    }
                });
                setIsLoading(false);
            }).catch(err => {
                console.error('Error loading tasks:', err);
                setError('Failed to load some tasks');
                setIsLoading(false);
            });
        };

        loadTasks();
    }, []);

    // Combine and sort tasks
    const allTasks = React.useMemo(() => {
        logTaskDebug('🔄 Combining tasks - projectTasks:', projectTasks.length, 'userTasks:', userTasks.length);
        const activeProjectTasks = projectTasks.filter(task => !isArchivedTask(task));
        const activeUserTasks = userTasks.filter(task => !isArchivedTask(task));
        const combined = [
            ...activeProjectTasks.map(t => ({ ...t, type: 'project' })),
            ...activeUserTasks.map(t => ({ ...t, type: 'user', id: t.id || `user-task-${Date.now()}-${Math.random()}` }))
        ];
        
        logTaskDebug('🔄 Combined tasks:', combined.length, combined);
        
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

    const activeProjectTaskCount = React.useMemo(
        () => projectTasks.filter(task => !isArchivedTask(task)).length,
        [projectTasks]
    );
    const activeUserTaskCount = React.useMemo(
        () => userTasks.filter(task => !isArchivedTask(task)).length,
        [userTasks]
    );

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
            const userTaskId = task.id || task.taskId;
            if (userTaskId && window.RouteState?.setPageSubpath) {
                window.RouteState.setPageSubpath('my-tasks', [String(userTaskId)]);
            } else {
                window.dispatchEvent(new CustomEvent('navigateToPage', {
                    detail: { page: 'my-tasks' }
                }));
            }
        }
    };

    return (
        <div className={`${cardBase} border rounded-xl p-3 sm:p-5 flex flex-col h-full shadow-sm`}>
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
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
                        (Project: {activeProjectTaskCount}, User: {activeUserTaskCount})
                    </span>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="space-y-1 overflow-y-auto pr-1 flex-1" style={{ maxHeight: '400px', scrollbarWidth: 'thin' }}>
                        {allTasks.map(task => {
                            const dueDateInfo = getDueDateStatus(task.dueDate);
                            const isProjectTask = task.type === 'project';
                            const isUserTask = task.type === 'user';
                            
                            return (
                                <div
                                    key={task.id || `task-${Math.random()}`}
                                    onClick={() => handleTaskClick(task)}
                                    className={`py-1.5 px-2 rounded-md ${isDark ? 'bg-gray-800 border border-gray-800 hover:bg-gray-750 hover:border-gray-700' : 'bg-gray-50 border border-gray-100 hover:bg-gray-100 hover:border-gray-200'} cursor-pointer transition-all duration-200`}
                                    title={isProjectTask ? `Click to view project: ${task.project?.name || 'Unknown'}` : 'Click to view in My Tasks'}
                                >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`text-[10px] leading-none px-1 py-0.5 rounded shrink-0 ${getStatusColor(task.status)}`}>
                                            {task.status || 'todo'}
                                        </span>
                                        <p className={`text-xs ${headerText} font-medium truncate flex-1 min-w-0 leading-tight`} title={task.title || task.name}>
                                            {task.title || task.name}
                                        </p>
                                        {(task.startDate || dueDateInfo) && (
                                            <span className="shrink-0 text-[10px] leading-none">
                                                {dueDateInfo ? (
                                                    <span className={dueDateInfo.color}>
                                                        <i className="fas fa-calendar-alt mr-0.5"></i>
                                                        {dueDateInfo.text}
                                                    </span>
                                                ) : task.startDate && (() => {
                                                    const d = new Date(task.startDate);
                                                    return !Number.isNaN(d.getTime()) ? (
                                                        <span className={subText}>
                                                            <i className="fas fa-play-circle mr-0.5"></i>
                                                            {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                        </span>
                                                    ) : null;
                                                })()}
                                            </span>
                                        )}
                                    </div>
                                    {(isProjectTask || isUserTask) && (
                                        <p className={`text-[10px] ${subText} truncate mt-0.5 leading-tight`} title={[task.project?.name, task.project?.clientName].filter(Boolean).join(' · ') || 'My Task'}>
                                            {isProjectTask && task.project?.name && (
                                                <><i className="fas fa-project-diagram mr-0.5 opacity-60"></i>{task.project.name}</>
                                            )}
                                            {isProjectTask && task.project?.clientName && (
                                                <>{task.project?.name ? ' · ' : ''}{task.project.clientName}</>
                                            )}
                                            {isUserTask && (
                                                <><i className="fas fa-check-square mr-0.5 opacity-60"></i>My Task</>
                                            )}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {allTasks.length > 0 && (
                        <div className={`text-xs ${subText} text-center pt-2 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'} flex-shrink-0 mt-2`}>
                            {activeProjectTaskCount > 0 && activeUserTaskCount > 0 && (
                                <span>{activeProjectTaskCount} project task{activeProjectTaskCount !== 1 ? 's' : ''} • {activeUserTaskCount} personal task{activeUserTaskCount !== 1 ? 's' : ''}</span>
                            )}
                            {activeProjectTaskCount > 0 && activeUserTaskCount === 0 && (
                                <span>{activeProjectTaskCount} project task{activeProjectTaskCount !== 1 ? 's' : ''}</span>
                            )}
                            {activeProjectTaskCount === 0 && activeUserTaskCount > 0 && (
                                <span>{activeUserTaskCount} personal task{activeUserTaskCount !== 1 ? 's' : ''}</span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/** Run async work in chunks to avoid flooding the browser connection limit with heavy project GETs. */
async function promiseAllSettledChunked(items, chunkSize, mapper) {
    const out = [];
    const size = Math.max(1, Math.min(chunkSize, 16));
    for (let i = 0; i < items.length; i += size) {
        const slice = items.slice(i, i + size);
        const part = await Promise.allSettled(slice.map((item, j) => mapper(item, i + j)));
        out.push(...part);
    }
    return out;
}

function parseClientRecordActivityLog(record) {
    if (!record) return [];
    const raw = record.activityLog;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw || '[]');
        } catch (_) {
            return [];
        }
    }
    return [];
}

function tsMs(v) {
    if (v == null || v === '') return NaN;
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) ? ms : NaN;
}

function normName(s) {
    return String(s || '').trim().toLowerCase();
}

/** Map a project row to a CRM client or lead using clientId or clientName fallback. */
function resolveProjectEntity(project, clients, leads) {
    if (!project) return null;
    const cid = project.clientId != null ? String(project.clientId).trim() : '';
    if (cid) {
        const c = (clients || []).find((x) => x.type !== 'lead' && String(x.id) === cid);
        if (c) return { kind: 'client', id: c.id, name: c.name || project.clientName || 'Client' };
        const l = (leads || []).find((x) => x.type !== 'client' && String(x.id) === cid);
        if (l) return { kind: 'lead', id: l.id, name: l.name || project.clientName || 'Lead' };
        return { kind: 'client', id: cid, name: project.clientName || 'Client' };
    }
    const cn = normName(project.clientName);
    if (!cn) return null;
    for (const c of clients || []) {
        if (c.type === 'lead') continue;
        if (normName(c.name) === cn) return { kind: 'client', id: c.id, name: c.name };
    }
    for (const l of leads || []) {
        if (l.type === 'client') continue;
        if (normName(l.name) === cn) return { kind: 'lead', id: l.id, name: l.name };
    }
    return null;
}

function parseJsonArrayField(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw || '[]');
        } catch (_) {
            return [];
        }
    }
    return [];
}

function parseTasksApi(json) {
    if (!json) return [];
    if (Array.isArray(json?.data?.tasks)) return json.data.tasks;
    if (Array.isArray(json?.tasks)) return json.tasks;
    return [];
}

function parseTicketsApi(json) {
    if (!json) return [];
    if (Array.isArray(json?.data?.tickets)) return json.data.tickets;
    if (Array.isArray(json?.tickets)) return json.tickets;
    return [];
}

function parseUserTasksApi(json) {
    if (!json) return [];
    if (Array.isArray(json?.data?.tasks)) return json.data.tasks;
    if (Array.isArray(json?.tasks)) return json.tasks;
    return [];
}

function parseSalesOrdersApi(so) {
    const d = so?.data ?? so;
    if (Array.isArray(d?.salesOrders)) return d.salesOrders;
    if (Array.isArray(so?.salesOrders)) return so.salesOrders;
    return [];
}

function parseInvoicesApi(inv) {
    const d = inv?.data ?? inv;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.invoices)) return d.invoices;
    return [];
}

/**
 * Cross-module client/lead activity: CRM logs, linked projects & time, project tasks,
 * personal tasks, helpdesk (ticket + ticket log), sales orders, invoices.
 */
const ClientActivityMetricsWidget = ({ cardBase, headerText, subText, isDark, clients, leads, projects, timeEntries }) => {
    const [supplement, setSupplement] = React.useState({
        tasks: [],
        tickets: [],
        userTasks: [],
        salesOrders: [],
        invoices: []
    });

    React.useEffect(() => {
        let cancelled = false;
        const token = window.storage?.getToken?.();
        if (!token) return undefined;

        const headers = { Authorization: `Bearer ${token}` };

        (async () => {
            try {
                const results = await Promise.allSettled([
                    fetch('/api/tasks?lightweight=true', { headers }).then((r) => (r.ok ? r.json() : null)),
                    fetch('/api/helpdesk?limit=120', { headers }).then((r) => (r.ok ? r.json() : null)),
                    fetch('/api/user-tasks?lightweight=true&limit=200', { headers }).then((r) => (r.ok ? r.json() : null)),
                    typeof window.DatabaseAPI?.getSalesOrders === 'function' ? window.DatabaseAPI.getSalesOrders() : Promise.resolve(null),
                    typeof window.DatabaseAPI?.getInvoices === 'function' ? window.DatabaseAPI.getInvoices() : Promise.resolve(null)
                ]);
                if (cancelled) return;
                setSupplement({
                    tasks: results[0].status === 'fulfilled' ? parseTasksApi(results[0].value) : [],
                    tickets: results[1].status === 'fulfilled' ? parseTicketsApi(results[1].value) : [],
                    userTasks: results[2].status === 'fulfilled' ? parseUserTasksApi(results[2].value) : [],
                    salesOrders: results[3].status === 'fulfilled' ? parseSalesOrdersApi(results[3].value) : [],
                    invoices: results[4].status === 'fulfilled' ? parseInvoicesApi(results[4].value) : []
                });
            } catch (_) {
                if (!cancelled) {
                    setSupplement({
                        tasks: [],
                        tickets: [],
                        userTasks: [],
                        salesOrders: [],
                        invoices: []
                    });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [clients, leads, projects, timeEntries]);

    const metrics = React.useMemo(() => {
        const now = Date.now();
        const startToday = new Date();
        startToday.setHours(0, 0, 0, 0);
        const tToday = startToday.getTime();
        const t7 = now - 7 * 24 * 60 * 60 * 1000;
        const t30 = now - 30 * 24 * 60 * 60 * 1000;

        let countToday = 0;
        let count7 = 0;
        let count30 = 0;
        const activeKeys7 = new Set();
        const byEntity7 = new Map();
        const srcToday = { crm: 0, projects: 0, time: 0, projTasks: 0, tickets: 0, orders: 0, invoices: 0, myTasks: 0 };
        const src7 = { crm: 0, projects: 0, time: 0, projTasks: 0, tickets: 0, orders: 0, invoices: 0, myTasks: 0 };
        const src30 = { crm: 0, projects: 0, time: 0, projTasks: 0, tickets: 0, orders: 0, invoices: 0, myTasks: 0 };

        const bump = (entity, ms, source) => {
            if (!entity?.id || !Number.isFinite(ms)) return;
            const mapKey = `${entity.kind}:${String(entity.id)}`;
            if (ms >= tToday) {
                countToday += 1;
                if (source && srcToday[source] !== undefined) srcToday[source] += 1;
            }
            if (ms >= t7) {
                count7 += 1;
                activeKeys7.add(mapKey);
                const cur = byEntity7.get(mapKey) || { id: entity.id, name: entity.name, kind: entity.kind, count: 0 };
                cur.count += 1;
                byEntity7.set(mapKey, cur);
                if (source && src7[source] !== undefined) src7[source] += 1;
            }
            if (ms >= t30) {
                count30 += 1;
                if (source && src30[source] !== undefined) src30[source] += 1;
            }
        };

        const bumpTouchPair = (entity, createdRaw, updatedRaw, source) => {
            const c = tsMs(createdRaw);
            const u = tsMs(updatedRaw);
            bump(entity, c, source);
            if (Number.isFinite(u) && u !== c) bump(entity, u, source);
        };

        const clientNameById = new Map();
        (clients || []).forEach((c) => {
            if (c.type === 'lead') return;
            if (c.id) clientNameById.set(String(c.id), c.name || 'Client');
        });

        (clients || []).forEach((c) => {
            if (c.type === 'lead') return;
            if (!c.id) return;
            const logs = parseClientRecordActivityLog(c);
            const entity = { kind: 'client', id: c.id, name: c.name || 'Unnamed' };
            logs.forEach((a) => {
                bump(entity, tsMs(a.timestamp || a.createdAt || a.date), 'crm');
            });
        });
        (leads || []).forEach((lead) => {
            if (lead.type === 'client') return;
            if (!lead.id) return;
            const logs = parseClientRecordActivityLog(lead);
            const entity = { kind: 'lead', id: lead.id, name: lead.name || 'Unnamed' };
            logs.forEach((a) => {
                bump(entity, tsMs(a.timestamp || a.createdAt || a.date), 'crm');
            });
        });

        const projectIdToEntity = new Map();
        (projects || []).forEach((p) => {
            if (!p?.id) return;
            const ent = resolveProjectEntity(p, clients, leads);
            if (ent) projectIdToEntity.set(String(p.id), ent);
            if (ent) bumpTouchPair(ent, p.createdAt, p.updatedAt, 'projects');
        });

        (timeEntries || []).forEach((te) => {
            const pid = te.projectId != null ? String(te.projectId).trim() : '';
            if (!pid) return;
            const ent = projectIdToEntity.get(pid);
            if (!ent) return;
            bump(ent, tsMs(te.date || te.createdAt || te.updatedAt), 'time');
        });

        (supplement.tasks || []).forEach((task) => {
            const pid = task.projectId != null ? String(task.projectId).trim() : '';
            if (!pid) return;
            const ent = projectIdToEntity.get(pid);
            if (!ent) return;
            bumpTouchPair(ent, task.createdAt, task.updatedAt, 'projTasks');
        });

        (supplement.tickets || []).forEach((t) => {
            const cid = t.clientId != null ? String(t.clientId).trim() : '';
            if (!cid) return;
            const name = clientNameById.get(cid) || t.client?.name || 'Client';
            const entity = { kind: 'client', id: cid, name };
            bumpTouchPair(entity, t.createdAt, t.updatedAt, 'tickets');
            parseJsonArrayField(t.activityLog).forEach((a) => {
                bump(entity, tsMs(a.timestamp || a.createdAt || a.date), 'tickets');
            });
        });

        (supplement.salesOrders || []).forEach((o) => {
            const cid = o.clientId != null ? String(o.clientId).trim() : '';
            if (!cid) return;
            const name = clientNameById.get(cid) || o.clientName || 'Client';
            bumpTouchPair({ kind: 'client', id: cid, name }, o.createdAt, o.updatedAt, 'orders');
        });

        (supplement.invoices || []).forEach((inv) => {
            const cid = inv.clientId != null ? String(inv.clientId).trim() : '';
            if (!cid) return;
            const name = clientNameById.get(cid) || inv.clientName || 'Client';
            bumpTouchPair({ kind: 'client', id: cid, name }, inv.createdAt, inv.updatedAt, 'invoices');
        });

        (supplement.userTasks || []).forEach((ut) => {
            const cId = ut.clientId != null ? String(ut.clientId).trim() : '';
            const lId = ut.leadId != null ? String(ut.leadId).trim() : '';
            if (cId) {
                const name = clientNameById.get(cId) || 'Client';
                bumpTouchPair({ kind: 'client', id: cId, name }, ut.createdAt, ut.updatedAt, 'myTasks');
            } else if (lId) {
                const lead = (leads || []).find((x) => x.type !== 'client' && String(x.id) === lId);
                const name = lead?.name || 'Lead';
                bumpTouchPair({ kind: 'lead', id: lId, name }, ut.createdAt, ut.updatedAt, 'myTasks');
            } else if (ut.projectId) {
                const ent = projectIdToEntity.get(String(ut.projectId).trim());
                if (ent) bumpTouchPair(ent, ut.createdAt, ut.updatedAt, 'myTasks');
            }
        });

        const topEntities = Array.from(byEntity7.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            countToday,
            count7,
            count30,
            activeAccounts7: activeKeys7.size,
            topEntities,
            srcToday,
            src7,
            src30
        };
    }, [clients, leads, projects, timeEntries, supplement]);

    const chipBase = isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-gray-50 border-gray-100';

    const srcLabels = [
        ['crm', 'CRM'],
        ['projects', 'Projects'],
        ['time', 'Time'],
        ['projTasks', 'Proj. tasks'],
        ['tickets', 'Helpdesk'],
        ['orders', 'SO'],
        ['invoices', 'Invoices'],
        ['myTasks', 'My tasks']
    ];

    return (
        <div className={`${cardBase} border rounded-xl p-4 sm:p-5 shadow-sm min-w-0 flex flex-col h-full`}>
            <div className="flex items-start justify-between gap-2 mb-3 sm:mb-4 min-w-0">
                <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-semibold ${headerText} leading-tight`}>Account activity</h3>
                    <p className={`text-xs mt-0.5 ${subText} leading-snug`}>
                        CRM, projects, time, tasks, helpdesk, sales orders, and invoices linked to clients or leads
                    </p>
                </div>
                <i className="fas fa-network-wired text-primary-500 opacity-80 flex-shrink-0 mt-0.5" aria-hidden="true"></i>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 flex-shrink-0">
                <div className={`rounded-lg border px-3 py-2.5 sm:py-3 min-h-[3.25rem] flex flex-col justify-center ${chipBase}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${subText}`}>Today</div>
                    <div className={`text-xl sm:text-2xl font-semibold tabular-nums ${headerText}`}>{metrics.countToday}</div>
                </div>
                <div className={`rounded-lg border px-3 py-2.5 sm:py-3 min-h-[3.25rem] flex flex-col justify-center ${chipBase}`}>
                    <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${subText}`}>Last 7 days</div>
                    <div className={`text-xl sm:text-2xl font-semibold tabular-nums ${headerText}`}>{metrics.count7}</div>
                </div>
            </div>

            <div className={`mt-2 sm:mt-3 rounded-lg border px-2.5 sm:px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-xs ${chipBase} ${subText}`}>
                <span className={`font-medium ${headerText} mr-0.5`}>7d mix:</span>
                {srcLabels.map(([key, label]) => {
                    const n = metrics.src7[key];
                    if (!n) return null;
                    return (
                        <span key={key} className="tabular-nums whitespace-nowrap">
                            {label} <span className={`font-semibold ${headerText}`}>{n}</span>
                        </span>
                    );
                })}
                {metrics.count7 === 0 && <span className="italic">No signals in range</span>}
            </div>

            <div className={`mt-2 rounded-lg border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm ${chipBase}`}>
                <span className={subText}>Active clients / leads (7d)</span>
                <span className={`font-semibold tabular-nums ${headerText}`}>{metrics.activeAccounts7}</span>
            </div>
            <div className={`mt-1 text-[10px] sm:text-xs ${subText}`}>
                <span className="tabular-nums">{metrics.count30}</span> signals in the last 30 days
            </div>

            <div className={`mt-3 sm:mt-4 flex-1 min-h-0 flex flex-col border-t pt-3 ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <div className={`text-xs font-medium mb-2 ${headerText}`}>Top accounts (7d)</div>
                {metrics.topEntities.length === 0 ? (
                    <div className={`text-xs ${subText} py-2`}>No linked activity in the last week.</div>
                ) : (
                    <ul className="space-y-0 divide-y divide-gray-100 dark:divide-gray-800 min-w-0 flex-1 overflow-y-auto max-h-[9rem] sm:max-h-[10rem]">
                        {metrics.topEntities.map((row) => (
                            <li key={`${row.kind}:${row.id}`} className="flex items-center justify-between gap-2 py-2.5 min-h-[44px] first:pt-0">
                                <div className="min-w-0 flex-1 flex items-center gap-2">
                                    <span
                                        className={`flex-shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded font-medium ${
                                            row.kind === 'lead'
                                                ? isDark
                                                    ? 'bg-amber-900/50 text-amber-200'
                                                    : 'bg-amber-100 text-amber-900'
                                                : isDark
                                                  ? 'bg-primary-900/40 text-primary-200'
                                                  : 'bg-primary-50 text-primary-800'
                                        }`}
                                    >
                                        {row.kind === 'lead' ? 'Lead' : 'Client'}
                                    </span>
                                    <span className={`text-sm truncate ${headerText}`} title={row.name}>
                                        {row.name}
                                    </span>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${headerText}`}>{row.count}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

const DASHBOARD_PROGRESS_HYDRATE_CHUNK = 16;
const DASHBOARD_PROGRESS_SECTIONS_CACHE_KEY = 'dashboard_progress_sections_v1';

function buildProgressSectionsCacheKey(project) {
    return `${project?.id}:${project?.updatedAt || ''}`;
}

function readProgressSectionsCache() {
    try {
        const raw = sessionStorage.getItem(DASHBOARD_PROGRESS_SECTIONS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeProgressSectionsCache(entriesByProjectId, projectsById) {
    if (!entriesByProjectId || !Object.keys(entriesByProjectId).length) return;
    try {
        const cache = readProgressSectionsCache();
        Object.entries(entriesByProjectId).forEach(([id, sections]) => {
            const project = projectsById?.[id];
            if (!project || !sections) return;
            cache[buildProgressSectionsCacheKey(project)] = sections;
        });
        const keys = Object.keys(cache);
        if (keys.length > 120) {
            keys.slice(0, keys.length - 120).forEach((k) => delete cache[k]);
        }
        sessionStorage.setItem(DASHBOARD_PROGRESS_SECTIONS_CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
}

function readDashboardOfflinePayload() {
    const roleForLeads = window.storage?.getUser?.()?.role;
    const canViewLeads =
        typeof window.isAdminRole === 'function' && window.isAdminRole(roleForLeads);
    const allClients = window.storage?.getClients?.() || [];
    const cachedClients = allClients.filter((c) => c.type === 'client' || !c.type);
    const storedLeads = window.storage?.getLeads?.();
    const cachedLeadsRaw =
        Array.isArray(storedLeads) && storedLeads.length > 0
            ? storedLeads
            : allClients.filter((c) => c.type === 'lead') || [];
    const cachedLeads = canViewLeads ? cachedLeadsRaw : [];
    return {
        clients: cachedClients,
        leads: cachedLeads,
        projects: window.storage?.getProjects?.() || [],
        timeEntries: window.storage?.getTimeEntries?.() || [],
        users: window.storage?.getUsers?.() || []
    };
}

function dashboardPayloadHasBootstrapData(payload) {
    if (!payload) return false;
    return (
        (Array.isArray(payload.clients) && payload.clients.length > 0) ||
        (Array.isArray(payload.projects) && payload.projects.length > 0) ||
        (Array.isArray(payload.leads) && payload.leads.length > 0)
    );
}

function projectNeedsSectionHydration(project, monthName, year) {
    const m = typeof window !== 'undefined' ? window.projectProgressMonthMetrics : null;
    if (!m || !project) return false;
    const normalized = m.normalizeProjectMonthlyProgress(project);
    const monthKey = `${String(monthName || '')}-${String(year)}`;
    const monthData = normalized.monthlyProgress?.[monthKey];
    if (monthData && typeof monthData === 'object' && !Array.isArray(monthData)) {
        const keys = [
            'docCollectionPercent',
            'documentCollectionPercent',
            'compliancePercent',
            'dataPercent',
            'monthlyDataReviewPercent'
        ];
        if (keys.some((k) => monthData[k] != null)) return false;
    }
    return !normalized.documentSections && !normalized.complianceReviewSections && !normalized.monthlyDataReviewSections;
}

/** Last calendar month’s working progress (doc / compliance / data / comments) for projects opted into the monthly tracker. */
const LastWorkingMonthProgressWidget = ({ cardBase, headerText, subText, isDark, projects, projectsNetworkSynced = true }) => {
    const m = typeof window !== 'undefined' ? window.projectProgressMonthMetrics : null;
    const monthPickerCandidates = React.useMemo(() => {
        if (!m) return [];
        const raw =
            typeof m.getWorkingMonthEntriesRange === 'function'
                ? m.getWorkingMonthEntriesRange(new Date(), 12)
                : m.getWorkingMonthEntries();
        return raw.map((entry) => {
            const monthName = m.TRACKER_MONTH_NAMES?.[entry.monthIndex] || '';
            const shortYear = String(entry.year).slice(-2);
            return {
                monthIndex: entry.monthIndex,
                year: entry.year,
                monthName,
                shortLabel: `${monthName.slice(0, 3).toUpperCase()} '${shortYear}`
            };
        });
    }, [m]);

    const [pickerOverrideIndex, setPickerOverrideIndex] = React.useState(null);

    // List API is slim: no document/compliance/data sections. Hydrate from /projects/:id (same as ProjectProgressTracker).
    const trackerIdsKey = React.useMemo(() => {
        if (!m || !projects || !projects.length) return '';
        return m
            .filterProjectsForProgressTracker(projects)
            .map((p) => String(p.id))
            .sort()
            .join(',');
    }, [m, projects]);

    const projectsDataVersionKey = React.useMemo(() => {
        if (!projects?.length) return '';
        return projects
            .map((p) => `${p?.id}:${p?.updatedAt || p?.monthlyProgress || ''}`)
            .sort()
            .join('|');
    }, [projects]);

    React.useEffect(() => {
        setPickerOverrideIndex(null);
    }, [trackerIdsKey]);

    const [sectionDetails, setSectionDetails] = React.useState({});
    const sectionDetailsRef = React.useRef(sectionDetails);
    sectionDetailsRef.current = sectionDetails;
    const [hydrationLoading, setHydrationLoading] = React.useState(false);

    // Default AUTO month = last calendar month (same as ProjectProgressTracker), not "month with most data".
    const defaultPickerIndex = 0;

    const clampedPickerIndex = React.useMemo(() => {
        const len = monthPickerCandidates.length;
        if (!len) return 0;
        const raw = pickerOverrideIndex != null ? pickerOverrideIndex : defaultPickerIndex;
        return Math.max(0, Math.min(len - 1, raw));
    }, [pickerOverrideIndex, monthPickerCandidates.length]);

    const activeWorkingMonth = monthPickerCandidates[clampedPickerIndex] || monthPickerCandidates[0] || null;

    React.useEffect(() => {
        if (!m || !trackerIdsKey || !projects?.length) {
            return;
        }
        const cache = readProgressSectionsCache();
        const trackerProjects = m.filterProjectsForProgressTracker(projects);
        const fromCache = {};
        trackerProjects.forEach((p) => {
            const hit = cache[buildProgressSectionsCacheKey(p)];
            if (hit) {
                fromCache[String(p.id)] = hit;
            }
        });
        if (Object.keys(fromCache).length) {
            setSectionDetails((prev) => ({ ...fromCache, ...prev }));
        }
    }, [m, trackerIdsKey, projectsDataVersionKey]);

    React.useEffect(() => {
        if (!m || !trackerIdsKey || !activeWorkingMonth) {
            setHydrationLoading(false);
            return;
        }
        const trackerProjects = m.filterProjectsForProgressTracker(projects || []);
        const { monthName, year } = activeWorkingMonth;
        const projectsById = Object.fromEntries(trackerProjects.map((p) => [String(p.id), p]));
        const ids = trackerProjects
            .filter((p) => {
                if (!projectNeedsSectionHydration(p, monthName, year)) return false;
                return !sectionDetailsRef.current[String(p.id)];
            })
            .map((p) => String(p.id))
            .filter(Boolean);
        if (ids.length === 0) {
            setHydrationLoading(false);
            return;
        }
        if (!window.DatabaseAPI || typeof window.DatabaseAPI.getProject !== 'function') {
            setHydrationLoading(false);
            return;
        }

        let cancelled = false;

        const runHydration = async () => {
            setHydrationLoading(true);
            try {
                const results = await promiseAllSettledChunked(
                    ids,
                    DASHBOARD_PROGRESS_HYDRATE_CHUNK,
                    (projectId) =>
                        window.DatabaseAPI.getProject(projectId, {
                            trackerSections: true,
                            forceRefresh: false
                        })
                );
                if (cancelled) return;
                const next = {};
                results.forEach((result) => {
                    if (result.status !== 'fulfilled') return;
                    const detail = result.value?.data?.project || result.value?.project;
                    if (!detail || detail.id == null) return;
                    next[String(detail.id)] = {
                        documentSections: detail.documentSections,
                        complianceReviewSections: detail.complianceReviewSections,
                        monthlyDataReviewSections: detail.monthlyDataReviewSections
                    };
                });
                writeProgressSectionsCache(next, projectsById);
                setSectionDetails((prev) => ({ ...prev, ...next }));
            } catch (e) {
                console.warn('LastWorkingMonthProgressWidget: failed to load project details', e);
            } finally {
                if (!cancelled) {
                    setHydrationLoading(false);
                }
            }
        };

        void runHydration();

        return () => {
            cancelled = true;
        };
    }, [m, trackerIdsKey, projectsDataVersionKey, projects, activeWorkingMonth]);

    const mergedProjects = React.useMemo(() => {
        if (!m || !projects) return [];
        const list = m.filterProjectsForProgressTracker(projects).map(m.normalizeProjectMonthlyProgress);
        return list.map((p) => {
            const d = sectionDetails[String(p.id)];
            if (!d) return p;
            return m.normalizeProjectMonthlyProgress({
                ...p,
                documentSections: d.documentSections != null ? d.documentSections : p.documentSections,
                complianceReviewSections: d.complianceReviewSections != null ? d.complianceReviewSections : p.complianceReviewSections,
                monthlyDataReviewSections: d.monthlyDataReviewSections != null ? d.monthlyDataReviewSections : p.monthlyDataReviewSections
            });
        });
    }, [m, projects, sectionDetails]);

    const pendingSectionHydrationCount = React.useMemo(() => {
        if (!m || !projects?.length || !activeWorkingMonth) return 0;
        const { monthName, year } = activeWorkingMonth;
        return m.filterProjectsForProgressTracker(projects).filter((p) => {
            if (!projectNeedsSectionHydration(p, monthName, year)) return false;
            return !sectionDetails[String(p.id)];
        }).length;
    }, [m, projects, activeWorkingMonth, sectionDetails]);

    const progressSectionsReady = pendingSectionHydrationCount === 0 && !hydrationLoading;

    const goOlderMonth = React.useCallback(() => {
        setPickerOverrideIndex((prev) => {
            const cur = prev == null ? defaultPickerIndex : prev;
            return Math.min(monthPickerCandidates.length - 1, cur + 1);
        });
    }, [defaultPickerIndex, monthPickerCandidates.length]);

    const goNewerMonth = React.useCallback(() => {
        setPickerOverrideIndex((prev) => {
            const cur = prev == null ? defaultPickerIndex : prev;
            const next = Math.max(0, cur - 1);
            if (prev != null && next === defaultPickerIndex) return null;
            return next;
        });
    }, [defaultPickerIndex]);

    const rows = React.useMemo(() => {
        if (!m || !activeWorkingMonth) return [];
        return m.buildSnapshotRows(mergedProjects, activeWorkingMonth);
    }, [m, activeWorkingMonth, mergedProjects]);

    const borderSep = isDark ? 'border-gray-800' : 'border-gray-100';
    const tableHead = isDark ? 'text-gray-500' : 'text-gray-500';
    const barBg = isDark ? 'bg-gray-800' : 'bg-gray-200';

    const fmtPct = (p) => (p == null || Number.isNaN(p) ? '—' : `${p}%`);
    const fmtRatio = (completed, total) => `${Number(completed) || 0}/${Number(total) || 0}`;

    if (!m || !monthPickerCandidates.length || !activeWorkingMonth) {
        return (
            <div className={`${cardBase} border rounded-xl p-3 sm:p-5 shadow-sm h-full min-h-0 flex flex-col`}>
                <h3 className={`text-sm font-semibold ${headerText} mb-2`}>Last working month</h3>
                <p className={`text-sm ${subText}`}>Progress metrics are loading…</p>
            </div>
        );
    }

    if (!projectsNetworkSynced || !progressSectionsReady) {
        return (
            <div className={`${cardBase} border rounded-xl p-3 sm:p-5 shadow-sm h-full min-h-0 flex flex-col`}>
                <h3 className={`text-sm font-semibold ${headerText} mb-2`}>Project progress</h3>
                <p className={`text-sm ${subText} flex items-center gap-2`}>
                    <i className="fas fa-circle-notch fa-spin text-primary-500 shrink-0" aria-hidden="true" />
                    <span>
                        {!projectsNetworkSynced
                            ? 'Loading latest progress from server…'
                            : 'Loading document / compliance / data metrics…'}
                    </span>
                </p>
            </div>
        );
    }

    const trackHref = m.buildProgressTrackerLink(
        rows[0]?.id,
        activeWorkingMonth.monthName,
        activeWorkingMonth.monthIndex,
        activeWorkingMonth.year,
        'comments'
    );

    const renderRowLinks = (row) => {
        const docL = m.buildProjectReviewTabLink(
            row.id,
            'documentCollection',
            row.monthName,
            row.monthIndex,
            row.year
        );
        const compL = m.buildProjectReviewTabLink(
            row.id,
            'complianceReview',
            row.monthName,
            row.monthIndex,
            row.year
        );
        const dataL = m.buildProjectReviewTabLink(
            row.id,
            'monthlyDataReview',
            row.monthName,
            row.monthIndex,
            row.year
        );
        const cmtL = m.buildProgressTrackerLink(
            row.id,
            row.monthName,
            row.monthIndex,
            row.year,
            'comments'
        );
        return { docL, compL, dataL, cmtL };
    };

    return (
        <div
            className={`${cardBase} border rounded-xl p-3 sm:p-5 shadow-sm flex flex-col h-full min-h-0 min-w-0 w-full max-w-full`}
        >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 mb-3 min-w-0 text-left flex-shrink-0">
                <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap text-left">
                        <h3 className={`text-sm font-semibold ${headerText}`}>Project progress</h3>
                        <div
                            className={`inline-flex items-stretch rounded-full border overflow-hidden shrink-0 ${borderSep} ${isDark ? 'bg-gray-800/60' : 'bg-white'}`}
                            role="group"
                            aria-label="Change month"
                        >
                            <button
                                type="button"
                                className={`px-2 py-1 text-[10px] leading-none ${headerText} hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none`}
                                onClick={goOlderMonth}
                                disabled={clampedPickerIndex >= monthPickerCandidates.length - 1}
                                aria-label="View an older month"
                            >
                                <i className="fas fa-chevron-left" aria-hidden="true" />
                            </button>
                            <span
                                className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 flex items-center border-x min-w-[4.75rem] justify-center"
                                style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8' }}
                                title={`${activeWorkingMonth.monthName} ${activeWorkingMonth.year}`}
                            >
                                {activeWorkingMonth.shortLabel}
                            </span>
                            <button
                                type="button"
                                className={`px-2 py-1 text-[10px] leading-none ${headerText} hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none`}
                                onClick={goNewerMonth}
                                disabled={clampedPickerIndex <= 0}
                                aria-label="View a more recent month"
                            >
                                <i className="fas fa-chevron-right" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="inline-flex items-center gap-2 flex-wrap shrink-0">
                            {pickerOverrideIndex == null ? (
                                <span
                                    className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                                >
                                    Auto
                                </span>
                            ) : (
                                <span
                                    className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                    Manual
                                </span>
                            )}
                            {pickerOverrideIndex != null ? (
                                <button
                                    type="button"
                                    className="text-[10px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 underline-offset-2 hover:underline px-1 py-0.5 min-h-0 min-w-0 w-auto"
                                    onClick={() => setPickerOverrideIndex(null)}
                                >
                                    Reset
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
                <a
                    href={trackHref}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 whitespace-nowrap shrink-0 self-start sm:self-auto inline-flex items-center"
                >
                    Open tracker
                </a>
            </div>

            {rows.length === 0 ? (
                <p className={`text-sm text-left ${subText}`}>
                    No projects are opted into the monthly progress tracker. Enable &quot;Include in progress tracker&quot; on a project, or open Projects to review.
                </p>
            ) : (
                <div className={`overflow-x-auto flex-1 min-h-0 overflow-y-auto border-t ${borderSep} pt-3 min-w-0`}>
                    <table data-keep-visible="true" className="w-full text-left text-xs border-collapse min-w-0 table-fixed">
                        <colgroup>
                            <col className="w-[36%]" />
                            <col className="w-[16%]" />
                            <col className="w-[16%]" />
                            <col className="w-[16%]" />
                            <col className="w-[16%]" />
                        </colgroup>
                        <thead>
                            <tr className={`${tableHead} uppercase tracking-wide`}>
                                <th className="pr-2 pb-2 font-medium">Project</th>
                                <th className="pr-2 pb-2 font-medium text-center" style={{ color: '#2563eb' }}>Docs</th>
                                <th className="pr-2 pb-2 font-medium text-center" style={{ color: '#7c3aed' }}>Comp.</th>
                                <th className="pr-2 pb-2 font-medium text-center" style={{ color: '#059669' }}>Data</th>
                                <th className="pb-2 font-medium">Comment</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const { docL, compL, dataL, cmtL } = renderRowLinks(row);
                                return (
                                    <tr key={String(row.id)} className={`border-t ${borderSep} align-top`}>
                                        <td className="py-2 pr-2 align-top">
                                            <a
                                                href={docL}
                                                className={`font-medium ${headerText} hover:text-primary-600 line-clamp-2`}
                                            >
                                                {row.name}
                                            </a>
                                            {row.client ? (
                                                <div className={`text-[10px] ${subText} truncate`} title={row.client}>
                                                    {row.client}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="py-2 pr-2 text-center align-top">
                                            <a href={docL} className="block" title="Open document collection">
                                                <div className={`font-semibold ${headerText}`}>{fmtPct(row.doc.percent)}</div>
                                                <div className={`h-1.5 rounded-full ${barBg} mt-0.5 overflow-hidden`}>
                                                <div
                                                    className="h-full rounded-full transition-all"
                                                    style={{
                                                        width: `${row.doc.percent != null ? Math.min(100, row.doc.percent) : 0}%`,
                                                        background: '#3b82f6'
                                                    }}
                                                />
                                                </div>
                                            </a>
                                        </td>
                                        <td className="py-2 pr-2 text-center align-top">
                                            <a href={compL} className="block" title="Open compliance review">
                                                <div className={`font-semibold ${headerText}`}>{fmtPct(row.compliance.percent)}</div>
                                                <div className={`h-1.5 rounded-full ${barBg} mt-0.5 overflow-hidden`}>
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${row.compliance.percent != null ? Math.min(100, row.compliance.percent) : 0}%`,
                                                        background: '#8b5cf6'
                                                    }}
                                                />
                                                </div>
                                            </a>
                                        </td>
                                        <td className="py-2 pr-2 text-center align-top">
                                            <a href={dataL} className="block" title="Open monthly data review">
                                                <div className={`font-semibold ${headerText}`}>{fmtPct(row.data.percent)}</div>
                                                <div className={`h-1.5 rounded-full ${barBg} mt-0.5 overflow-hidden`}>
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${row.data.percent != null ? Math.min(100, row.data.percent) : 0}%`,
                                                        background: '#10b981'
                                                    }}
                                                />
                                                </div>
                                            </a>
                                        </td>
                                        <td className="py-2 text-[10px] align-top min-w-0">
                                            {row.comments && String(row.comments).trim() ? (
                                                <a href={cmtL} className="block hover:opacity-90" title="Open progress tracker (comments)">
                                                    <p className={`line-clamp-3 ${subText} whitespace-pre-wrap break-words`} title={row.comments}>
                                                        {row.comments}
                                                    </p>
                                                </a>
                                            ) : (
                                                <a href={cmtL} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                    —
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

/** Recent job cards (Service & Maintenance) — list + navigate to detail. */
function normalizeJobCardStatusKey(statusRaw) {
    return String(statusRaw || 'draft')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

function formatJobCardStatusLabel(statusRaw) {
    const s = String(statusRaw || 'draft').trim();
    if (!s) return 'Draft';
    return s
        .replace(/_/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function recentJobCardStatusPillClasses(statusRaw, isDark) {
    const status = normalizeJobCardStatusKey(statusRaw);
    if (status === 'completed') {
        return isDark
            ? 'bg-emerald-900/50 text-emerald-200 border-emerald-800'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (status === 'open') {
        return isDark ? 'bg-sky-900/40 text-sky-200 border-sky-800' : 'bg-sky-50 text-sky-700 border-sky-200';
    }
    if (status === 'cancelled' || status === 'canceled') {
        return isDark ? 'bg-rose-900/40 text-rose-200 border-rose-800' : 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (status === 'submitted') {
        return isDark ? 'bg-amber-900/45 text-amber-100 border-amber-700/60' : 'bg-amber-50 text-amber-900 border-amber-200';
    }
    if (status === 'ready_for_invoice' || status === 'readyforinvoice') {
        return isDark ? 'bg-violet-900/45 text-violet-100 border-violet-700/50' : 'bg-violet-50 text-violet-900 border-violet-200';
    }
    if (status === 'in_progress' || status === 'inprogress' || status === 'active') {
        return isDark ? 'bg-blue-900/40 text-blue-100 border-blue-700/50' : 'bg-blue-50 text-blue-800 border-blue-200';
    }
    return isDark ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-700 border-slate-200';
}

function formatJobCardListWhen(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_e) {
        return '—';
    }
}

/** Narrow screens: shorter stamp (year only when not current year). */
function formatJobCardListWhenCompact(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        const now = new Date();
        const sameYear = d.getFullYear() === now.getFullYear();
        const opts = sameYear
            ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' };
        return d.toLocaleString(undefined, opts);
    } catch (_e) {
        return '—';
    }
}

function recentJobCardsListKey(list) {
    return (list || [])
        .map((jc) => `${jc?.id || ''}:${jc?.updatedAt || jc?.createdAt || ''}:${jc?.status || ''}`)
        .join('|');
}

function RecentJobCardsWidget({ cardBase, headerText, subText, isDark, autoRefresh = true, refreshInterval = 30000 }) {
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);

    const load = React.useCallback(async (opts = {}) => {
        const silent = !!opts.silent;
        const token = window.storage?.getToken?.();
        if (!token) {
            setItems([]);
            setError(null);
            if (!silent) setLoading(false);
            return;
        }
        if (!silent) {
            setLoading(true);
            setError(null);
        }
        try {
            // Match Service & Maintenance list default (JobCards.jsx): newest job card number first.
            const params = new URLSearchParams({
                page: '1',
                pageSize: '8',
                sortField: 'jobCardNumber',
                sortDirection: 'desc'
            });
            const res = await fetch(`/api/jobcards?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                cache: 'no-store'
            });
            if (!res.ok) {
                const text = await res.text();
                let msg = 'Could not load job cards.';
                try {
                    const j = JSON.parse(text);
                    msg = j.message || j.error || msg;
                } catch (_parseErr) {
                    if (res.status === 403) msg = 'You do not have permission to view job cards.';
                }
                throw new Error(msg);
            }
            const raw = await res.json();
            const list = (raw && (raw.jobCards || raw.data?.jobCards || raw.data)) || [];
            const next = Array.isArray(list) ? list : [];
            setItems((prev) => {
                if (silent && recentJobCardsListKey(prev) === recentJobCardsListKey(next)) return prev;
                return next;
            });
            if (!silent) setError(null);
        } catch (e) {
            if (!silent) {
                setError(e?.message || 'Failed to load job cards.');
                setItems([]);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        load({ silent: false });
    }, [load]);

    React.useEffect(() => {
        if (!autoRefresh || !refreshInterval || refreshInterval < 5000) return undefined;
        const id = window.setInterval(() => {
            if (!document.hidden) load({ silent: true });
        }, refreshInterval);
        return () => window.clearInterval(id);
    }, [autoRefresh, refreshInterval, load]);

    React.useEffect(() => {
        const refreshIfVisible = () => {
            if (!document.hidden) load({ silent: true });
        };
        const onSaved = () => refreshIfVisible();
        window.addEventListener('jobcards:saved', onSaved);
        document.addEventListener('visibilitychange', refreshIfVisible);
        window.addEventListener('focus', refreshIfVisible);
        return () => {
            window.removeEventListener('jobcards:saved', onSaved);
            document.removeEventListener('visibilitychange', refreshIfVisible);
            window.removeEventListener('focus', refreshIfVisible);
        };
    }, [load]);

    const openJobCard = (jc) => {
        const id = jc?.id;
        if (!id) return;
        if (window.RouteState?.setPageSubpath) {
            window.RouteState.setPageSubpath('service-maintenance', [String(id)], {
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        } else {
            window.dispatchEvent(
                new CustomEvent('navigateToPage', {
                    detail: { page: 'service-maintenance', subpath: [String(id)] }
                })
            );
        }
    };

    return (
        <div
            className={`dashboard-jobcards-widget ${cardBase} border rounded-lg sm:rounded-2xl p-3 sm:p-5 shadow-sm flex flex-col min-h-0 min-w-0 text-left`}
            style={{ textAlign: 'left' }}
        >
            <div className="djw-toolbar flex items-center justify-between mb-2 sm:mb-3 flex-shrink-0 gap-2 min-h-[44px] sm:min-h-0 text-left">
                <h3 className={`text-sm font-semibold leading-tight pr-1 ${headerText}`}>Recent job cards</h3>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    <button
                        type="button"
                        title="Refresh"
                        aria-label="Refresh job cards"
                        onClick={() => load({ silent: false })}
                        disabled={loading}
                        className={`djw-icon-btn min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg touch-manipulation transition-colors text-left ${
                            isDark ? 'hover:bg-gray-800 active:bg-gray-800/80 text-gray-300' : 'hover:bg-gray-100 active:bg-gray-200/80 text-gray-600'
                        } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <i className={`fas fa-sync-alt text-sm sm:text-xs ${loading ? 'fa-spin' : ''}`} />
                    </button>
                    <i
                        className="fas fa-clipboard-list text-primary-500 opacity-80 text-base flex-shrink-0"
                        title="Service & Maintenance"
                        aria-hidden
                    />
                </div>
            </div>
            {loading && items.length === 0 ? (
                <div className={`text-sm py-2 text-left ${subText}`}>Loading…</div>
            ) : error ? (
                <div className={`text-sm py-1 leading-snug text-left ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                    {error}
                </div>
            ) : items.length === 0 ? (
                <div className={`text-sm py-2 text-left ${subText}`}>No job cards yet.</div>
            ) : (
                <ul className="flex flex-col gap-2 sm:gap-0 min-h-0 max-h-[min(52vh,20rem)] sm:max-h-80 overflow-y-auto overscroll-y-contain sm:divide-y sm:divide-gray-200 dark:sm:divide-gray-700 sm:rounded-lg sm:-mx-1 sm:px-1 -mx-0.5 px-0.5 sm:mx-0 sm:px-0">
                    {items.map((jc) => {
                        const statusLabel = formatJobCardStatusLabel(jc.status);
                        const clientLine = [jc.clientName, jc.siteName].filter(Boolean).join(' · ') || '—';
                        const summary =
                            (jc.reasonForVisit && String(jc.reasonForVisit).trim()) ||
                            (jc.diagnosis && String(jc.diagnosis).trim()) ||
                            '';
                        const tech = jc.agentName || '—';
                        const rowBg = isDark
                            ? 'border-gray-700/90 bg-gray-800/35 sm:border-0 sm:bg-transparent'
                            : 'border-gray-200/90 bg-slate-50/90 sm:border-0 sm:bg-transparent';
                        return (
                            <li key={jc.id} className={`min-w-0 rounded-xl border shadow-sm sm:shadow-none sm:rounded-none ${rowBg}`}>
                                <button
                                    type="button"
                                    onClick={() => openJobCard(jc)}
                                    style={{ textAlign: 'left' }}
                                    className={`djw-row-btn w-full text-left rounded-xl sm:rounded-lg px-3 py-2.5 sm:px-2 sm:py-2.5 flex flex-col gap-1 touch-manipulation transition-colors ${
                                        isDark
                                            ? 'active:bg-gray-800/80 sm:hover:bg-gray-800/90 sm:active:bg-gray-800'
                                            : 'active:bg-white sm:hover:bg-gray-50 sm:active:bg-gray-100'
                                    }`}
                                >
                                    <div className="djw-norowrap flex items-start justify-between gap-2 min-w-0">
                                        <div className="min-w-0 flex-1 text-left">
                                            <div className={`text-base sm:text-sm font-bold tracking-tight tabular-nums leading-tight ${headerText}`}>
                                                {jc.jobCardNumber || '—'}
                                            </div>
                                            <div
                                                className={`text-[11px] sm:text-[11px] font-medium uppercase tracking-wide truncate mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}
                                            >
                                                {clientLine}
                                            </div>
                                        </div>
                                        <span
                                            className={`shrink-0 self-start inline-flex items-center justify-center rounded-lg border px-2 py-1 text-[10px] sm:text-[10px] font-semibold uppercase leading-tight tracking-wide whitespace-nowrap max-w-[48%] sm:max-w-none text-center ${recentJobCardStatusPillClasses(jc.status, isDark)}`}
                                        >
                                            <span className="truncate">{statusLabel}</span>
                                        </span>
                                    </div>
                                    {summary ? (
                                        <p
                                            className={`text-[13px] sm:text-xs line-clamp-2 leading-snug text-left font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}
                                        >
                                            {summary}
                                        </p>
                                    ) : null}
                                    <div
                                        className={`djw-norowrap flex items-baseline justify-between gap-x-2 gap-y-0.5 text-left text-[11px] sm:text-[11px] ${subText}`}
                                    >
                                        <span className="truncate min-w-0 font-medium">{tech}</span>
                                        <span className="tabular-nums flex-shrink-0 opacity-90">
                                            <span className="sm:hidden">{formatJobCardListWhenCompact(jc.createdAt)}</span>
                                            <span className="hidden sm:inline">{formatJobCardListWhen(jc.createdAt)}</span>
                                        </span>
                                    </div>
                                    {jc.callOutCategory ? (
                                        <div className="text-left pt-0.5">
                                            <span
                                                className={`inline-flex max-w-full items-center rounded-md border px-2 py-1 text-[11px] font-semibold leading-snug ${
                                                    isDark
                                                        ? 'border-primary-700/50 bg-primary-900/30 text-primary-200'
                                                        : 'border-primary-200 bg-primary-50 text-primary-800'
                                                }`}
                                            >
                                                <span className="truncate">{String(jc.callOutCategory).trim()}</span>
                                            </span>
                                        </div>
                                    ) : null}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            <div className={`mt-2 sm:mt-3 pt-2 sm:pt-3 border-t flex-shrink-0 text-left ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <button
                    type="button"
                    style={{ textAlign: 'left' }}
                    onClick={() => {
                        if (window.RouteState?.setPageSubpath) {
                            window.RouteState.setPageSubpath('service-maintenance', [], {
                                replace: false,
                                preserveSearch: false,
                                preserveHash: false
                            });
                        } else {
                            window.dispatchEvent(
                                new CustomEvent('navigateToPage', { detail: { page: 'service-maintenance', subpath: [] } })
                            );
                        }
                    }}
                    className={`djw-footer-btn w-full min-h-[44px] sm:min-h-0 text-left flex items-center justify-start rounded-lg border px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-semibold touch-manipulation transition-colors ${
                        isDark
                            ? 'border-primary-700/50 text-primary-200 bg-gray-800/50 hover:bg-gray-800 active:bg-gray-800/90'
                            : 'border-primary-200 text-primary-700 bg-white hover:bg-primary-50 active:bg-primary-50/80'
                    }`}
                >
                    <span className="sm:hidden">Open Service & Maintenance</span>
                    <span className="hidden sm:inline">Open Service & Maintenance →</span>
                </button>
            </div>
        </div>
    );
}

const STOCK_MOVEMENT_PERIOD_MS = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
};

function stockMovementPeriodStorageKey() {
    const uid = window.storage?.getUser?.()?.id || 'anon';
    return `dashboard.stockMovements.period.${uid}`;
}

/** Recent manufacturing stock movements — period filter, mobile-first, optional silent refresh. */
function RecentStockMovementsWidget({ cardBase, headerText, subText, isDark, autoRefresh, refreshInterval }) {
    const [period, setPeriod] = React.useState(() => {
        try {
            const raw = localStorage.getItem(stockMovementPeriodStorageKey());
            if (raw && STOCK_MOVEMENT_PERIOD_MS[raw]) return raw;
        } catch (_) {}
        return '24h';
    });
    const [movements, setMovements] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [silentBusy, setSilentBusy] = React.useState(false);
    const [error, setError] = React.useState(null);

    const setPeriodPersist = React.useCallback((p) => {
        setPeriod(p);
        try {
            localStorage.setItem(stockMovementPeriodStorageKey(), p);
        } catch (_) {}
    }, []);

    const dateAfterIso = React.useMemo(() => {
        const ms = STOCK_MOVEMENT_PERIOD_MS[period] ?? STOCK_MOVEMENT_PERIOD_MS['24h'];
        return new Date(Date.now() - ms).toISOString();
    }, [period]);

    const load = React.useCallback(
        async (silent = false) => {
            const token = window.storage?.getToken?.();
            if (!token) {
                setError('Sign in required');
                setMovements([]);
                setLoading(false);
                return;
            }
            if (silent) {
                setSilentBusy(true);
            } else {
                setLoading(true);
            }
            setError(null);
            try {
                const qs = new URLSearchParams({
                    page: '1',
                    pageSize: '10',
                    dateAfter: dateAfterIso
                });
                const res = await fetch(`/api/manufacturing/stock-movements?${qs.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store'
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                    const msg =
                        body?.error?.message ||
                        body?.message ||
                        (typeof body?.error === 'string' ? body.error : null) ||
                        `HTTP ${res.status}`;
                    setError(msg);
                    if (!silent) setMovements([]);
                    return;
                }
                const list = Array.isArray(body?.data?.movements) ? body.data.movements : [];
                setMovements(list);
            } catch (e) {
                setError(e.message || 'Request failed');
                if (!silent) setMovements([]);
            } finally {
                setLoading(false);
                setSilentBusy(false);
            }
        },
        [dateAfterIso]
    );

    React.useEffect(() => {
        void load(false);
    }, [load]);

    React.useEffect(() => {
        if (!autoRefresh || !refreshInterval || refreshInterval < 5000) return undefined;
        const id = window.setInterval(() => {
            void load(true);
        }, refreshInterval);
        return () => window.clearInterval(id);
    }, [autoRefresh, refreshInterval, load]);

    const openManufacturingMovements = React.useCallback(() => {
        if (!window.RouteState?.setPageSubpath) return;
        window.RouteState.setPageSubpath('manufacturing', ['movements'], {
            replace: false,
            preserveSearch: false,
            preserveHash: false
        });
    }, []);

    const typeBadgeClass = (t) => {
        const k = String(t || '').toLowerCase();
        if (k === 'receipt')
            return isDark ? 'bg-emerald-900/50 text-emerald-200' : 'bg-emerald-100 text-emerald-900';
        if (k === 'consumption' || k === 'sale')
            return isDark ? 'bg-rose-900/45 text-rose-100' : 'bg-rose-100 text-rose-900';
        if (k === 'transfer')
            return isDark ? 'bg-sky-900/45 text-sky-100' : 'bg-sky-100 text-sky-900';
        if (k === 'production')
            return isDark ? 'bg-violet-900/45 text-violet-100' : 'bg-violet-100 text-violet-900';
        if (k === 'adjustment')
            return isDark ? 'bg-amber-900/45 text-amber-100' : 'bg-amber-100 text-amber-900';
        return isDark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800';
    };

    const formatQty = (q) => {
        const n = Number(q);
        if (!Number.isFinite(n)) return '—';
        const abs = Math.abs(n);
        const s = abs >= 100 ? n.toFixed(0) : abs >= 10 ? n.toFixed(1) : n.toFixed(2);
        return n > 0 ? `+${s}` : s;
    };

    const locHint = (m) => {
        const f = String(m.fromLocation || '').trim();
        const t = String(m.toLocation || '').trim();
        if (f && t) return `${f} → ${t}`;
        if (t) return `→ ${t}`;
        if (f) return `${f} →`;
        return '';
    };

    const periodPills = React.useMemo(
        () =>
            ['24h', '7d', '30d', '90d'].map((p) => {
                const on = period === p;
                return (
                    <button
                        key={p}
                        type="button"
                        onClick={() => setPeriodPersist(p)}
                        className={`min-h-[44px] min-w-[56px] px-3 rounded-full text-xs font-semibold ${
                            on
                                ? isDark
                                    ? 'bg-teal-500/30 text-teal-100 ring-1 ring-teal-400/50'
                                    : 'bg-teal-100 text-teal-900 ring-1 ring-teal-200'
                                : isDark
                                  ? 'bg-gray-800 text-gray-400'
                                  : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                        {p}
                    </button>
                );
            }),
        [isDark, period, setPeriodPersist]
    );

    return (
        <div
            className={`${cardBase} border rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0`}
            style={{
                background: isDark
                    ? 'linear-gradient(160deg, rgba(15,118,110,0.18) 0%, rgba(17,24,39,0.96) 42%, rgba(17,24,39,1) 100%)'
                    : 'linear-gradient(160deg, #ecfdf5 0%, #ffffff 45%, #fafafa 100%)'
            }}
        >
            <div className="p-4 sm:p-5 border-b border-black/5 dark:border-white/10 shrink-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm ${
                                    isDark ? 'bg-teal-500/25 text-teal-100' : 'bg-teal-100 text-teal-800'
                                }`}
                            >
                                <i className="fas fa-dolly" aria-hidden />
                            </span>
                            <h3 className={`text-sm font-semibold tracking-tight sm:text-base ${headerText}`}>
                                Recent stock movements
                            </h3>
                        </div>
                        <p className={`mt-1 text-xs leading-snug ${subText}`}>
                            Filtered by movement date used (e.g. job card consumption date)
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                        <button
                            type="button"
                            onClick={() => void load(false)}
                            disabled={loading}
                            className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-opacity ${
                                isDark ? 'bg-gray-800 text-gray-200 hover:bg-gray-750' : 'bg-white text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-50'
                            } ${loading ? 'opacity-60' : ''}`}
                            title="Refresh"
                            aria-label="Refresh stock movements"
                        >
                            <i className={`fas fa-sync-alt text-sm ${loading ? 'animate-spin' : ''}`} aria-hidden />
                        </button>
                        {silentBusy ? (
                            <span className={`text-[10px] uppercase tracking-wide ${subText}`} aria-live="polite">
                                Updating…
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">{periodPills}</div>
            </div>

            <div className="p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {error ? (
                    <div className={`text-sm rounded-xl px-3 py-3 ${isDark ? 'bg-red-950/40 text-red-200' : 'bg-red-50 text-red-800'}`}>
                        {error}
                    </div>
                ) : null}

                {loading && movements.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center py-10 gap-3 ${subText}`}>
                        <i className="fas fa-circle-notch fa-spin text-2xl text-teal-500" aria-hidden />
                        <span className="text-sm">Loading movements…</span>
                    </div>
                ) : null}

                {!loading && !error && movements.length === 0 ? (
                    <div className={`text-sm ${subText}`}>No movements in this period.</div>
                ) : null}

                {movements.length > 0 ? (
                    <ul className="space-y-2">
                        {movements.map((m) => {
                            const loc = locHint(m);
                            return (
                                <li
                                    key={m.id || m.movementId}
                                    className={`rounded-xl border px-3 py-3 sm:px-4 ${
                                        isDark ? 'border-white/10 bg-black/20' : 'border-gray-100 bg-white/80'
                                    }`}
                                >
                                    <div className="flex flex-wrap items-start gap-2">
                                        <span
                                            className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${typeBadgeClass(
                                                m.type
                                            )}`}
                                        >
                                            {m.type || '—'}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className={`text-sm font-medium leading-snug break-words ${headerText}`}>
                                                {m.itemName || '—'}
                                            </div>
                                            <div className={`mt-1 text-xs ${subText} flex flex-wrap gap-x-2 gap-y-0.5`}>
                                                <span className="font-mono">{m.sku || '—'}</span>
                                                <span className={Number(m.quantity) < 0 ? 'text-rose-600 dark:text-rose-300' : ''}>
                                                    {formatQty(m.quantity)}
                                                </span>
                                                <span>{m.date || '—'}</span>
                                            </div>
                                            {loc ? (
                                                <div className={`mt-1 text-[11px] leading-snug break-all ${subText}`}>{loc}</div>
                                            ) : null}
                                            {m.reference ? (
                                                <div className={`mt-0.5 text-[11px] ${subText}`}>Ref: {m.reference}</div>
                                            ) : null}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}
            </div>

            <div
                className={`p-3 sm:px-4 sm:py-3 border-t shrink-0 ${isDark ? 'border-white/10' : 'border-gray-100'} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}
            >
                <button
                    type="button"
                    onClick={openManufacturingMovements}
                    className={`min-h-[44px] w-full sm:w-auto rounded-xl px-4 text-sm font-semibold transition-colors ${
                        isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-750' : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                >
                    Open movements
                </button>
                <p className={`text-[11px] text-center sm:text-right ${subText}`}>Up to 10 rows · newest first</p>
            </div>
        </div>
    );
}

/** Super-admin only: ERP usage (session window, audit activity, modules) — mobile-first. */
function erpUsageFormatMinutes(m) {
    if (m == null || Number.isNaN(m)) return '—';
    if (m < 60) return `${Math.round(m)}m`;
    const h = Math.floor(m / 60);
    const rem = Math.round(m % 60);
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function erpUsageHumanizeModule(key) {
    if (!key || key === '—') return '—';
    const s = String(key).replace(/[-_]+/g, ' ').trim();
    if (!s) return key;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function erpUsageInitials(name) {
    const n = String(name || '?').trim();
    if (!n) return '?';
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
}

function ErpUsageInsightsWidget({ cardBase, headerText, subText, isDark }) {
    const [days, setDays] = React.useState(30);
    const [tab, setTab] = React.useState('time');
    const [data, setData] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    const load = React.useCallback(async () => {
        const token = window.storage?.getToken?.();
        if (!token) {
            setError('Sign in required');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/erp-usage-insights?days=${days}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store'
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                setData(null);
                const msg =
                    body?.error?.message ||
                    body?.message ||
                    (typeof body?.error === 'string' ? body.error : null) ||
                    `HTTP ${res.status}`;
                setError(msg);
                return;
            }
            setData(body?.data ?? body);
        } catch (e) {
            setData(null);
            setError(e.message || 'Request failed');
        } finally {
            setLoading(false);
        }
    }, [days]);

    React.useEffect(() => {
        void load();
    }, [load]);

    const rangePills = React.useMemo(
        () =>
            [7, 30, 90].map((d) => {
                const on = days === d;
                return (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        className={`min-h-[36px] min-w-[52px] px-3 rounded-full text-xs font-medium ${
                            on
                                ? isDark
                                    ? 'bg-violet-500/30 text-violet-100 ring-1 ring-violet-400/50'
                                    : 'bg-violet-100 text-violet-900 ring-1 ring-violet-200'
                                : isDark
                                  ? 'bg-gray-800 text-gray-400'
                                  : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                        {d}d
                    </button>
                );
            }),
        [days, isDark]
    );

    const tabBtn = (id, label) => {
        const active = tab === id;
        return (
            <button
                type="button"
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 min-h-[44px] px-2 py-2.5 text-xs font-semibold rounded-lg transition-colors sm:text-sm ${
                    active
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : isDark
                          ? 'bg-gray-800/80 text-gray-300 hover:bg-gray-800'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
                {label}
            </button>
        );
    };

    const listTime = (data?.topBySessionMinutes || []).slice(0, 10);
    const listAct = (data?.topByActivity || []).slice(0, 10);
    const listMod = (data?.modules || []).slice(0, 16);

    return (
        <div
            className={`${cardBase} border rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0`}
            style={{
                background: isDark
                    ? 'linear-gradient(145deg, rgba(30,27,75,0.35) 0%, rgba(17,24,39,0.95) 45%, rgba(17,24,39,1) 100%)'
                    : 'linear-gradient(145deg, #f5f3ff 0%, #ffffff 40%, #fafafa 100%)'
            }}
        >
            <div className="p-4 sm:p-5 border-b border-black/5 dark:border-white/10 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                                    isDark ? 'bg-indigo-500/30 text-indigo-100' : 'bg-indigo-100 text-indigo-800'
                                }`}
                            >
                                <i className="fas fa-chart-pie" aria-hidden />
                            </span>
                            <h3 className={`text-sm font-semibold tracking-tight sm:text-base ${headerText}`}>ERP usage</h3>
                        </div>
                        <p className={`mt-1 text-xs leading-snug ${subText}`}>
                            Super-admin only · ranked by approximate session time and audit activity
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        disabled={loading}
                        className={`shrink-0 min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-opacity ${
                            isDark ? 'bg-gray-800 text-gray-200 hover:bg-gray-750' : 'bg-white text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-50'
                        } ${loading ? 'opacity-60' : ''}`}
                        title="Refresh"
                        aria-label="Refresh usage data"
                    >
                        <i className={`fas fa-sync-alt text-sm ${loading ? 'animate-spin' : ''}`} aria-hidden />
                    </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">{rangePills}</div>
                <div className="mt-3 flex gap-1.5 p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06]">
                    {tabBtn('time', 'Session time')}
                    {tabBtn('activity', 'Activity')}
                    {tabBtn('modules', 'Modules')}
                </div>
            </div>

            <div className="p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {error ? (
                    <div className={`text-sm rounded-xl px-3 py-3 ${isDark ? 'bg-red-950/40 text-red-200' : 'bg-red-50 text-red-800'}`}>
                        {error}
                    </div>
                ) : null}

                {loading && !data ? (
                    <div className={`flex flex-col items-center justify-center py-10 gap-3 ${subText}`}>
                        <i className="fas fa-circle-notch fa-spin text-2xl text-indigo-500" aria-hidden />
                        <span className="text-sm">Loading usage…</span>
                    </div>
                ) : null}

                {data && tab === 'time' ? (
                    <ul className="space-y-2">
                        {listTime.length === 0 ? (
                            <li className={`text-sm ${subText}`}>No session data in this range.</li>
                        ) : (
                            listTime.map((row, i) => (
                                <li
                                    key={row.userId}
                                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                                        isDark ? 'bg-gray-800/50' : 'bg-white/80 shadow-sm border border-gray-100'
                                    }`}
                                >
                                    <span className={`text-xs font-bold w-6 text-center ${subText}`}>{i + 1}</span>
                                    <span
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                            isDark ? 'bg-violet-600/40 text-violet-100' : 'bg-violet-100 text-violet-800'
                                        }`}
                                    >
                                        {erpUsageInitials(row.name)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-medium truncate ${headerText}`}>{row.name}</div>
                                        {row.lastSeenAt ? (
                                            <div className={`text-[11px] truncate ${subText}`}>
                                                Last seen {new Date(row.lastSeenAt).toLocaleString()}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className={`text-sm font-semibold tabular-nums shrink-0 ${headerText}`}>
                                        {erpUsageFormatMinutes(row.minutes)}
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                ) : null}

                {data && tab === 'activity' ? (
                    <ul className="space-y-2">
                        {listAct.length === 0 ? (
                            <li className={`text-sm ${subText}`}>No audit events in this range.</li>
                        ) : (
                            listAct.map((row, i) => (
                                <li
                                    key={row.userId}
                                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                                        isDark ? 'bg-gray-800/50' : 'bg-white/80 shadow-sm border border-gray-100'
                                    }`}
                                >
                                    <span className={`text-xs font-bold w-6 text-center ${subText}`}>{i + 1}</span>
                                    <span
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                            isDark ? 'bg-emerald-600/35 text-emerald-100' : 'bg-emerald-100 text-emerald-900'
                                        }`}
                                    >
                                        {erpUsageInitials(row.name)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-medium truncate ${headerText}`}>{row.name}</div>
                                        <div className={`text-[11px] truncate ${subText}`}>{row.email || ''}</div>
                                    </div>
                                    <div className={`text-sm font-semibold tabular-nums shrink-0 ${headerText}`}>{row.events}</div>
                                </li>
                            ))
                        )}
                    </ul>
                ) : null}

                {data && tab === 'modules' ? (
                    <div className="flex flex-wrap gap-2">
                        {listMod.length === 0 ? (
                            <div className={`text-sm ${subText}`}>No module hits in this range.</div>
                        ) : (
                            listMod.map((m) => (
                                <div
                                    key={m.module}
                                    className={`inline-flex items-center gap-2 rounded-full pl-3 pr-3 py-2 min-h-[40px] max-w-full ${
                                        isDark ? 'bg-gray-800/80 text-gray-100 ring-1 ring-white/10' : 'bg-gray-900 text-white'
                                    }`}
                                >
                                    <span className="text-xs font-medium truncate">{erpUsageHumanizeModule(m.module)}</span>
                                    <span className="text-xs font-bold tabular-nums opacity-90">{m.events}</span>
                                </div>
                            ))
                        )}
                    </div>
                ) : null}

                {data?.meta?.sessionWindowNote && tab === 'time' ? (
                    <p className={`mt-4 text-[11px] leading-relaxed ${subText}`}>{data.meta.sessionWindowNote}</p>
                ) : null}
                {data?.meta?.sessionsCapped ? (
                    <p className={`mt-2 text-[11px] ${subText}`}>
                        Session sample capped at {data.meta.sessionsSampled} rows; totals may be understated.
                    </p>
                ) : null}
            </div>
        </div>
    );
}

const DashboardLive = () => {
    // Version indicator - logged to console for verification
    React.useEffect(() => {
        console.log('%c✨✨✨ DashboardLive v2.0 LOADED ✨✨✨', 'color: #10b981; font-size: 20px; font-weight: bold; padding: 10px; background: #10b981; color: white;');
        console.log('%c📍 Look for the "Edit Layout" button at the bottom of the dashboard', 'color: #3b82f6; font-size: 14px; font-weight: bold;');
        console.log('%c🎨 Click "Edit Layout" to enable drag, drop, and resize features!', 'color: #2563eb; font-size: 14px; font-weight: bold;');
        // Set a flag so we can verify it loaded
        window.__DASHBOARD_LIVE_V2_LOADED__ = true;
    }, []);
    const [dashboardData, setDashboardData] = useState(() => {
        const offline = readDashboardOfflinePayload();
        const stats = calculateStats(
            offline.clients,
            offline.leads,
            offline.projects,
            offline.timeEntries
        );
        return { ...offline, stats };
    });
    
    const [isLoading, setIsLoading] = useState(() => !dashboardPayloadHasBootstrapData(readDashboardOfflinePayload()));
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [projectsNetworkSynced, setProjectsNetworkSynced] = useState(
        () => !dashboardPayloadHasBootstrapData(readDashboardOfflinePayload())
    );
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
    const [liveSyncStatus, setLiveSyncStatus] = useState('disconnected');
    const { isDark } = window.useTheme();
    const isDashboardAdmin =
        typeof window.isAdminRole === 'function' && window.isAdminRole(window.storage?.getUser?.()?.role);
    const [userName, setUserName] = useState('User');
    const [calendarReady, setCalendarReady] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [availableWidgets, setAvailableWidgets] = useState([]);
    const [selectedWidgets, setSelectedWidgets] = useState([]);
    const [savingWidgets, setSavingWidgets] = useState(false);
    const [widgetLayoutsByBreakpoint, setWidgetLayoutsByBreakpoint] = useState({ mobile: {}, desktop: {} });
    const [draggedWidget, setDraggedWidget] = useState(null);
    const [dragOverWidget, setDragOverWidget] = useState(null);
    const [isResizing, setIsResizing] = useState(null); // widgetId being resized
    const [resizeStart, setResizeStart] = useState(null); // { x, y, w, h }
    const latestLayoutsRef = React.useRef({ mobile: {}, desktop: {} });
    latestLayoutsRef.current = widgetLayoutsByBreakpoint;
    const [editMode, setEditMode] = useState(false);
    const [gridColumnCount, setGridColumnCount] = useState(() =>
        typeof window !== 'undefined' ? syncDashboardGridColumnCount() : 3
    );
    const layoutBucket = isDesktopSiteLayout() || gridColumnCount >= 2 ? 'desktop' : 'mobile';
    const layoutBucketRef = React.useRef(layoutBucket);
    layoutBucketRef.current = layoutBucket;
    const widgetLayouts = widgetLayoutsByBreakpoint[layoutBucket] || {};

    React.useEffect(() => {
        const onLayoutChange = () => setGridColumnCount(syncDashboardGridColumnCount());
        onLayoutChange();
        window.addEventListener('resize', onLayoutChange);
        const observer = new MutationObserver(onLayoutChange);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => {
            window.removeEventListener('resize', onLayoutChange);
            observer.disconnect();
        };
    }, []);

    const lastDashboardRefreshRef = React.useRef(0);

    // Cache-first dashboard load; network refresh runs in the background.
    const loadDashboardData = useCallback(async (options = {}) => {
        const showLoading = options.showLoading === true;
        const forceNetwork = options.forceNetwork === true;
        const offlineBootstrap = readDashboardOfflinePayload();
        const hasBootstrap = dashboardPayloadHasBootstrapData(offlineBootstrap);

        if (hasBootstrap) {
            const stats = calculateStats(
                offlineBootstrap.clients,
                offlineBootstrap.leads,
                offlineBootstrap.projects,
                offlineBootstrap.timeEntries
            );
            setDashboardData({
                clients: offlineBootstrap.clients,
                leads: offlineBootstrap.leads,
                projects: offlineBootstrap.projects,
                timeEntries: offlineBootstrap.timeEntries,
                users: offlineBootstrap.users,
                stats
            });
            setConnectionStatus('connected');
        }

        if (showLoading && !hasBootstrap) {
            setIsLoading(true);
        } else {
            setIsRefreshing(true);
        }
        setError(null);
        if (!hasBootstrap) {
            setConnectionStatus('connecting');
        }

        const roleForLeads = window.storage?.getUser?.()?.role;
        const canViewLeads =
            typeof window.isAdminRole === 'function' && window.isAdminRole(roleForLeads);

        const applyDashboardPayload = (clients, leads, projects, timeEntries, users) => {
            const stats = calculateStats(clients, leads, projects, timeEntries);
            setDashboardData({ clients, leads, projects, timeEntries, users, stats });
            setLastUpdated(new Date());
            lastDashboardRefreshRef.current = Date.now();
        };

        try {
            const token = window.storage?.getToken?.();
            if (!token || !window.DatabaseAPI) {
                applyDashboardPayload(
                    offlineBootstrap.clients,
                    offlineBootstrap.leads,
                    offlineBootstrap.projects,
                    offlineBootstrap.timeEntries,
                    offlineBootstrap.users
                );
                setProjectsNetworkSynced(true);
                setConnectionStatus('connected');
                return;
            }

            const syncPromises = [
                (forceNetwork
                    ? window.DatabaseAPI.getClients(true)
                    : window.DatabaseAPI.getClients(false)
                ).catch((err) => {
                    console.warn('Client sync failed:', err);
                    return { data: { clients: [] } };
                }),
                (canViewLeads
                    ? (forceNetwork
                        ? window.DatabaseAPI.getLeads(true)
                        : window.DatabaseAPI.getLeads(false))
                    : Promise.resolve({ data: { leads: [] } })
                ).catch((err) => {
                    console.warn('Lead sync failed:', err);
                    return { data: { leads: [] } };
                }),
                window.DatabaseAPI.getProjects({ forceRefresh: forceNetwork }).catch((err) => {
                    console.warn('Project sync failed:', err);
                    return { data: [] };
                }),
                window.DatabaseAPI.makeRequest('/time-entries', { forceRefresh: forceNetwork }).catch((err) => {
                    console.warn('Time entry sync failed:', err);
                    return { data: [] };
                })
            ];

            let fetchUsers = false;
            try {
                const role = window.storage?.getUser?.()?.role;
                if (typeof window.isAdminRole === 'function' && window.isAdminRole(role)) {
                    fetchUsers = true;
                    syncPromises.push(
                        window.DatabaseAPI.makeRequest('/users', { forceRefresh: forceNetwork }).catch((err) => {
                            console.warn('User sync failed:', err);
                            return { data: [] };
                        })
                    );
                }
            } catch (_) {}

            const offline = offlineBootstrap;
            const results = await Promise.allSettled(syncPromises);
            const mappedResults = results.map((r) => (r.status === 'fulfilled' ? r.value : { data: [] }));

            const clientsRes = mappedResults[0] || { data: [] };
            const leadsRes = mappedResults[1] || { data: [] };
            const projectsRes = mappedResults[2] || { data: [] };
            const timeEntriesRes = mappedResults[3] || { data: [] };
            const usersRes = fetchUsers && mappedResults[4] ? mappedResults[4] : { data: [] };

            const clientsFromApi = Array.isArray(clientsRes.data?.clients)
                ? clientsRes.data.clients.filter((c) => c.type === 'client' || !c.type)
                : null;
            const clients = clientsFromApi ?? offline.clients;

            const leadsFromAPI = Array.isArray(leadsRes.data?.leads) ? leadsRes.data.leads : [];
            const leads = canViewLeads ? leadsFromAPI : [];

            if (canViewLeads && window.storage?.setLeads) {
                window.storage.setLeads(leadsFromAPI);
            }
            if (window.storage?.setClients && clientsFromApi) {
                window.storage.setClients(clientsFromApi);
            }

            const projects = Array.isArray(projectsRes.data?.projects)
                ? projectsRes.data.projects
                : Array.isArray(projectsRes.data)
                  ? projectsRes.data
                  : offline.projects;
            const timeEntries = Array.isArray(timeEntriesRes.data)
                ? timeEntriesRes.data
                : offline.timeEntries;
            const users = Array.isArray(usersRes?.data?.users)
                ? usersRes.data.users
                : Array.isArray(usersRes?.data)
                  ? usersRes.data
                  : offline.users;

            applyDashboardPayload(clients, leads, projects, timeEntries, users);
            if (Array.isArray(projects) && projects.length > 0 && window.storage?.setProjects) {
                window.storage.setProjects(projects);
            }
            setProjectsNetworkSynced(true);
            setConnectionStatus('connected');
        } catch (error) {
            console.error('❌ Failed to load dashboard data:', error);
            setError(error.message);
            setConnectionStatus('error');
            const offline = readDashboardOfflinePayload();
            applyDashboardPayload(
                offline.clients,
                offline.leads,
                offline.projects,
                offline.timeEntries,
                offline.users
            );
            setProjectsNetworkSynced(true);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    const viewerRole = window.storage?.getUser?.()?.role;
    const isErpSuperUser =
        typeof window.isSuperAdminRole === 'function' && window.isSuperAdminRole(viewerRole);

    // Widget definitions (excluding finance)
    const widgetRegistry = React.useMemo(() => {
        const cardBase = isDark ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white border-gray-100 text-gray-900';
        const subText = isDark ? 'text-gray-400' : 'text-gray-500';
        const headerText = isDark ? 'text-gray-100' : 'text-gray-900';

        const canAccessServiceMaintenance =
            typeof window.permissionChecker?.hasPermission !== 'function' ||
            !window.PERMISSIONS?.ACCESS_SERVICE_MAINTENANCE ||
            window.permissionChecker.hasPermission(window.PERMISSIONS.ACCESS_SERVICE_MAINTENANCE);
        
        const formatCurrency = (val) => {
            try {
                return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0);
            } catch (_) {
                return `$${Math.round(val || 0).toLocaleString()}`;
            }
        };
        
        return [
            ...(isDashboardAdmin
                ? [
                      {
                          id: 'leads-proposal-tender',
                          group: 'Sales',
                          title: 'Proposal & tender leads',
                          render: (data) => {
                              const all = Array.isArray(data.leads) ? data.leads : [];
                              const inStage = all.filter(isProposalOrTenderEngagement);
                              const proposalCount = inStage.filter((l) => leadEngagementKey(l) === 'proposal').length;
                              const tenderCount = inStage.filter((l) => leadEngagementKey(l) === 'tender').length;
                              const sorted = [...inStage].sort((a, b) =>
                                  String(a.name || '').localeCompare(String(b.name || ''), undefined, {
                                      sensitivity: 'base'
                                  })
                              );

                              const openLead = (lead) => {
                                  const id = lead?.id;
                                  if (!id || !window.RouteState?.setPageSubpath) return;
                                  window.RouteState.setPageSubpath('clients', [String(id)], {
                                      replace: false,
                                      preserveSearch: false,
                                      preserveHash: false
                                  });
                              };

                              return (
                                  <div className={`${cardBase} border rounded-xl p-5 shadow-sm flex flex-col min-h-0`}>
                                      <div className="flex items-center justify-between mb-3 flex-shrink-0">
                                          <h3 className={`text-sm font-semibold ${headerText}`}>
                                              Proposal & tender leads
                                          </h3>
                                          <i
                                              className="fas fa-file-signature text-emerald-500 opacity-80"
                                              title="Engagement stage"
                                          ></i>
                                      </div>
                                      {inStage.length === 0 ? (
                                          <div className={`text-sm ${subText}`}>No leads in Proposal or Tender.</div>
                                      ) : (
                                          <>
                                              <div
                                                  className={`grid grid-cols-2 gap-2 text-xs mb-3 flex-shrink-0 ${subText}`}
                                              >
                                                  <div
                                                      className={`rounded-lg border ${
                                                          isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'
                                                      } p-2`}
                                                  >
                                                      <div className={headerText}>Proposal</div>
                                                      <div className={`text-lg font-semibold ${headerText}`}>
                                                          {proposalCount}
                                                      </div>
                                                  </div>
                                                  <div
                                                      className={`rounded-lg border ${
                                                          isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'
                                                      } p-2`}
                                                  >
                                                      <div className={headerText}>Tender</div>
                                                      <div className={`text-lg font-semibold ${headerText}`}>
                                                          {tenderCount}
                                                      </div>
                                                  </div>
                                              </div>
                                              <div className={`text-xs font-medium uppercase tracking-wide mb-1 ${subText}`}>
                                                  Leads
                                              </div>
                                              <ul className="space-y-1.5 overflow-y-auto max-h-72 min-h-0 pr-0.5 overscroll-contain">
                                                  {sorted.map((lead) => {
                                                      const stageLabel = formatEngagementStageLabel(lead);
                                                      const isTender = leadEngagementKey(lead) === 'tender';
                                                      return (
                                                          <li key={lead.id}>
                                                              <button
                                                                  type="button"
                                                                  onClick={() => openLead(lead)}
                                                                  className={`w-full text-left rounded-lg px-2 py-1.5 flex items-center justify-between gap-2 transition-colors ${
                                                                      isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
                                                                  }`}
                                                              >
                                                                  <span className={`text-sm truncate ${headerText}`}>
                                                                      {lead.name || 'Untitled'}
                                                                  </span>
                                                                  <span
                                                                      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                                                                          isTender
                                                                              ? isDark
                                                                                  ? 'bg-amber-900/60 text-amber-200'
                                                                                  : 'bg-amber-100 text-amber-900'
                                                                              : isDark
                                                                                ? 'bg-emerald-900/50 text-emerald-200'
                                                                                : 'bg-emerald-100 text-emerald-900'
                                                                      }`}
                                                                  >
                                                                      {stageLabel}
                                                                  </span>
                                                              </button>
                                                          </li>
                                                      );
                                                  })}
                                              </ul>
                                          </>
                                      )}
                                  </div>
                              );
                          }
                      }
                  ]
                : []),
            {
                id: 'my-project-tasks',
                group: 'Projects',
                title: 'My Tasks',
                render: () => <MyProjectTasksWidget cardBase={cardBase} headerText={headerText} subText={subText} isDark={isDark} />
            },
            {
                id: 'recent-stock-movements',
                group: 'Manufacturing',
                title: 'Stock movements',
                render: () => (
                    <RecentStockMovementsWidget
                        cardBase={cardBase}
                        headerText={headerText}
                        subText={subText}
                        isDark={isDark}
                        autoRefresh={autoRefresh}
                        refreshInterval={refreshInterval}
                    />
                )
            },
            ...(isDashboardAdmin
                ? [
                      {
                          id: 'last-working-month-progress',
                          group: 'Projects',
                          title: 'Last working month',
                          render: (data) => (
                              <LastWorkingMonthProgressWidget
                                  cardBase={cardBase}
                                  headerText={headerText}
                                  subText={subText}
                                  isDark={isDark}
                                  projects={data.projects}
                                  projectsNetworkSynced={projectsNetworkSynced}
                              />
                          )
                      }
                  ]
                : []),
            ...(isErpSuperUser
                ? [
                      {
                          id: 'erp-usage-insights',
                          group: 'Admin',
                          title: 'ERP usage',
                          render: () => (
                              <ErpUsageInsightsWidget
                                  cardBase={cardBase}
                                  headerText={headerText}
                                  subText={subText}
                                  isDark={isDark}
                              />
                          )
                      }
                  ]
                : []),
            ...(canAccessServiceMaintenance
                ? [
                      {
                          id: 'recent-jobcards',
                          group: 'Service',
                          title: 'Recent job cards',
                          render: () => (
                              <RecentJobCardsWidget
                                  cardBase={cardBase}
                                  headerText={headerText}
                                  subText={subText}
                                  isDark={isDark}
                                  autoRefresh={autoRefresh}
                                  refreshInterval={refreshInterval}
                              />
                          )
                      }
                  ]
                : []),
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
                                <i className="fas fa-stream text-blue-500 opacity-70"></i>
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
                id: 'client-activity-metrics',
                group: 'Clients',
                title: 'Account activity',
                render: (data) => (
                    <ClientActivityMetricsWidget
                        cardBase={cardBase}
                        headerText={headerText}
                        subText={subText}
                        isDark={isDark}
                        clients={data.clients}
                        leads={isDashboardAdmin ? data.leads : []}
                        projects={data.projects}
                        timeEntries={data.timeEntries}
                    />
                )
            }
        ];
    }, [isDark, isDashboardAdmin, isErpSuperUser, autoRefresh, refreshInterval, projectsNetworkSynced]);

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

    // Load widget layouts from localStorage (mobile + desktop buckets)
    const loadWidgetLayouts = () => {
        const userId = window.storage?.getUser?.()?.id || 'anon';
        const key = `dashboard.widgetLayouts.${userId}`;
        try {
            const stored = window.localStorage.getItem(key);
            if (stored) {
                const raw = JSON.parse(stored);
                const normalized = normalizeWidgetLayoutsStorage(raw);
                const hadV2 =
                    raw &&
                    typeof raw === 'object' &&
                    !Array.isArray(raw) &&
                    (Object.prototype.hasOwnProperty.call(raw, 'mobile') ||
                        Object.prototype.hasOwnProperty.call(raw, 'desktop'));
                if (!hadV2 && raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length > 0) {
                    persistWidgetLayouts(normalized);
                }
                return normalized;
            }
        } catch (_) {}
        return { mobile: {}, desktop: {} };
    };

    const getDefaultLayout = (widgetId, index) => {
        const existing = widgetLayouts[widgetId];
        if (existing) return existing;
        return defaultLayoutForWidget(widgetId, index, layoutBucket);
    };


    // Merge saved widget ids with registry defaults. Never persist a *shorter* list on load —
    // admin/permission-gated widgets may not be in the registry until the user session is ready.
    const mergeSavedWidgetsWithRegistry = (savedIds) => {
        const next = Array.isArray(savedIds) ? [...savedIds] : [];
        const addIfRegistered = (id) => {
            if (widgetRegistry.some((w) => w.id === id) && !next.includes(id)) {
                next.push(id);
            }
        };
        addIfRegistered('my-project-tasks');
        if (isDashboardAdmin) {
            addIfRegistered('last-working-month-progress');
            addIfRegistered('leads-proposal-tender');
        }
        addIfRegistered('client-activity-metrics');
        addIfRegistered('recent-stock-movements');
        if (isErpSuperUser) addIfRegistered('erp-usage-insights');
        addIfRegistered('recent-jobcards');
        return next;
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
                const merged = mergeSavedWidgetsWithRegistry(parsed);
                setSelectedWidgets(merged);
                if (merged.length > parsed.length) {
                    persistWidgets(merged);
                }
            } else {
                const defaults = ['my-project-tasks', 'client-activity-metrics', 'recent-stock-movements'];
                if (widgetRegistry.some(w => w.id === 'recent-jobcards')) defaults.push('recent-jobcards');
                if (isDashboardAdmin) {
                    defaults.push('last-working-month-progress');
                    defaults.push('leads-proposal-tender');
                }
                if (isErpSuperUser) defaults.push('erp-usage-insights');
                const validDefaults = defaults.filter(id => widgetRegistry.some(w => w.id === id));
                setSelectedWidgets(validDefaults);
            }
            
            // Load widget layouts
            const layouts = loadWidgetLayouts();
            setWidgetLayoutsByBreakpoint(layouts);
        } catch (_) {
            setAvailableWidgets(widgetRegistry);
            const fb = ['my-project-tasks', 'client-activity-metrics', 'recent-stock-movements'];
            if (widgetRegistry.some(w => w.id === 'recent-jobcards')) fb.push('recent-jobcards');
            if (isDashboardAdmin) {
                fb.push('last-working-month-progress');
                fb.push('leads-proposal-tender');
            }
            if (isErpSuperUser) fb.push('erp-usage-insights');
            setSelectedWidgets(fb.filter(id => widgetRegistry.some(w => w.id === id)));
            setWidgetLayoutsByBreakpoint({ mobile: {}, desktop: {} });
        }
    }, [widgetRegistry, isDashboardAdmin, isErpSuperUser]);

    // Desktop-site / tablet bucket: merge in permission-gated widgets (e.g. recent job cards) when the bucket activates.
    React.useEffect(() => {
        if (layoutBucket !== 'desktop') return;
        setSelectedWidgets((prev) => {
            const merged = mergeSavedWidgetsWithRegistry(prev);
            if (merged.length === prev.length && merged.every((id, idx) => id === prev[idx])) return prev;
            persistWidgets(merged);
            return merged;
        });
    }, [layoutBucket, widgetRegistry, isDashboardAdmin, isErpSuperUser]);

    const handleToggleWidget = (id) => {
        setSelectedWidgets(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            persistWidgets(next);
            
            // Remove layout if widget is removed
            if (!next.includes(id)) {
                setWidgetLayoutsByBreakpoint(prevLayouts => {
                    const newMobile = { ...prevLayouts.mobile };
                    const newDesktop = { ...prevLayouts.desktop };
                    delete newMobile[id];
                    delete newDesktop[id];
                    const newLayouts = { mobile: newMobile, desktop: newDesktop };
                    persistWidgetLayouts(newLayouts);
                    return newLayouts;
                });
            }
            
            return next;
        });
    };

    const handleResetWidgets = () => {
        const defaults = ['my-project-tasks', 'client-activity-metrics', 'recent-stock-movements'];
        if (availableWidgets.some(w => w.id === 'recent-jobcards')) defaults.push('recent-jobcards');
        if (isDashboardAdmin) defaults.push('last-working-month-progress');
        if (isErpSuperUser) defaults.push('erp-usage-insights');
        const valid = defaults.filter((id) => availableWidgets.some((w) => w.id === id));
        setSelectedWidgets(valid);
        persistWidgets(valid);
        const empty = { mobile: {}, desktop: {} };
        setWidgetLayoutsByBreakpoint(empty);
        persistWidgetLayouts(empty);
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

        const bucket = layoutBucketRef.current;
        const draggedIndex = selectedWidgets.indexOf(draggedWidget);
        const targetIndex = selectedWidgets.indexOf(targetWidgetId);

        setWidgetLayoutsByBreakpoint(prev => {
            const cur = { ...(prev[bucket] || {}) };
            const draggedLayout = cur[draggedWidget] || defaultLayoutForWidget(draggedWidget, draggedIndex, bucket);
            const targetLayout = cur[targetWidgetId] || defaultLayoutForWidget(targetWidgetId, targetIndex, bucket);

            const newBucket = {
                ...cur,
                [draggedWidget]: { ...draggedLayout, order: targetIndex },
                [targetWidgetId]: { ...targetLayout, order: draggedIndex }
            };
            const next = { ...prev, [bucket]: newBucket };
            persistWidgetLayouts(next);
            return next;
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
        if (!isResizing || !resizeStart) return;

        const { widgetId, direction } = isResizing;
        const start = resizeStart;
        let rafId = null;
        let lastEvent = null;

        const handleMouseMove = (e) => {
            lastEvent = e;
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                const ev = lastEvent;
                if (!ev) return;
                const deltaX = ev.clientX - start.x;
                const deltaY = ev.clientY - start.y;
                const gridContainer = document.querySelector('.dashboard-live-widget-grid');
                let cellWidth = 300;
                let cellHeight = 200;
                if (gridContainer) {
                    const containerWidth = gridContainer.offsetWidth;
                    const cols = syncDashboardGridColumnCount();
                    const gap = 20; /* gap-5 */
                    cellWidth = cols > 0 ? (containerWidth - gap * (cols - 1)) / cols : containerWidth;
                    cellHeight = 200;
                }
                const deltaW = Math.round(deltaX / cellWidth);
                const deltaH = Math.round(deltaY / cellHeight);
                const bucket = layoutBucketRef.current;
                const cols = syncDashboardGridColumnCount();
                setWidgetLayoutsByBreakpoint((prev) => {
                    const cur = { ...(prev[bucket] || {}) };
                    const idx = selectedWidgets.indexOf(widgetId);
                    const layout =
                        cur[widgetId] ||
                        defaultLayoutForWidget(widgetId, idx === -1 ? 0 : idx, bucket);
                    let newW = start.w;
                    let newH = start.h;
                    if (cols > 1) {
                        if (direction.includes('e')) {
                            newW = Math.max(1, Math.min(3, start.w + deltaW));
                        } else if (direction.includes('w')) {
                            newW = Math.max(1, Math.min(3, start.w - deltaW));
                        }
                    } else {
                        newW = 1;
                    }
                    if (direction.includes('s')) {
                        newH = Math.max(1, Math.min(3, start.h + deltaH));
                    }
                    const newBucket = {
                        ...cur,
                        [widgetId]: {
                            ...layout,
                            w: newW,
                            h: newH,
                            order: layout.order !== undefined ? layout.order : (idx === -1 ? 0 : idx)
                        }
                    };
                    const next = { ...prev, [bucket]: newBucket };
                    latestLayoutsRef.current = next;
                    return next;
                });
            });
        };

        const handleMouseUp = () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = null;
            lastEvent = null;
            persistWidgetLayouts(latestLayoutsRef.current);
            setIsResizing(null);
            setResizeStart(null);
        };

        const cursor =
            direction === 'w' ? 'ew-resize' : direction === 's' ? 'ns-resize' : 'se-resize';

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = cursor;

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isResizing, resizeStart, selectedWidgets]);

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
                    // Non-admins must not receive lead payloads from background sync
                    if (message.dataType === 'leads') {
                        const rr = window.storage?.getUser?.()?.role;
                        if (typeof window.isAdminRole === 'function' && !window.isAdminRole(rr)) {
                            setLastUpdated(message.timestamp);
                            break;
                        }
                    }
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

    // Initial load — render cached data first, refresh quietly in background.
    useEffect(() => {
        loadDashboardData({ showLoading: false });
    }, [loadDashboardData]);

    // Refresh when returning to the tab, but only if data is stale (avoids refetch storms).
    useEffect(() => {
        const DASHBOARD_STALE_MS = 120000;
        const refreshIfVisible = () => {
            if (document.hidden) return;
            const age = Date.now() - lastDashboardRefreshRef.current;
            if (age < DASHBOARD_STALE_MS) return;
            loadDashboardData({ showLoading: false });
        };
        document.addEventListener('visibilitychange', refreshIfVisible);
        window.addEventListener('focus', refreshIfVisible);
        return () => {
            document.removeEventListener('visibilitychange', refreshIfVisible);
            window.removeEventListener('focus', refreshIfVisible);
        };
    }, [loadDashboardData]);

    // Manual refresh
    const handleRefresh = () => {
        loadDashboardData({ showLoading: false, forceNetwork: true });
        if (window.LiveDataSync?.forceSync) {
            void window.LiveDataSync.forceSync();
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
        <div className="erp-module-root space-y-6">
            <div className="flex w-full min-w-0 flex-col gap-3 text-left sm:flex-row sm:items-start sm:gap-8">
                <div className="shrink-0 sm:pt-0.5">
                    <h2 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Welcome, {userName}</h2>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                    <p
                        className={`text-sm leading-relaxed sm:text-base ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                    >
                        {"Here's what's happening today"}
                    </p>
                    {editMode ? (
                        <div
                            className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed sm:py-3 sm:text-[15px] ${isDark ? 'border-blue-800 bg-blue-950/40 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-900'}`}
                            role="status"
                        >
                            <span className="inline-flex w-full min-w-0 items-start gap-2">
                                <i
                                    className={`mt-0.5 shrink-0 opacity-80 fas ${layoutBucket === 'mobile' ? 'fa-mobile-alt' : 'fa-columns'}`}
                                    aria-hidden
                                />
                                <span className="min-w-0 flex-1">
                                    Editing the{' '}
                                    <strong className="font-semibold">
                                        {layoutBucket === 'mobile' ? 'phone' : 'tablet / desktop'}
                                    </strong>{' '}
                                    widget layout (saved separately from the other breakpoint). Drag tiles to reorder
                                    {gridColumnCount >= 2
                                        ? '; drag the corner or left edge to resize width, or the corner to change height.'
                                        : '; drag the corner to change tile height.'}
                                </span>
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>

            <div 
                className="dashboard-live-widget-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
                style={{
                    /* Fixed row height so grid-row span controls tile height (content scrolls inside). */
                    gridAutoRows: '200px'
                }}
            >
                {selectedWidgets
                    .filter((id) => availableWidgets.some((w) => w.id === id))
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
                        const spanW = Math.min(w, gridColumnCount);
                        const spanH = h;
                        
                        return (
                            <div
                                key={id}
                                draggable={editMode}
                                onDragStart={(e) => handleDragStart(e, id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, id)}
                                onDrop={(e) => handleDrop(e, id)}
                                onDragLeave={handleDragLeave}
                                className={`relative min-w-0 min-h-0 overflow-hidden ${isResizing?.widgetId === id ? '' : 'transition-all'} ${editMode ? 'cursor-move' : ''} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                                style={{
                                    gridColumn: `span ${spanW}`,
                                    gridRow: `span ${spanH}`
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

                                        {/* Left edge — shrink/grow width (wide layouts only) */}
                                        {gridColumnCount >= 2 ? (
                                            <div
                                                className="absolute left-0 top-8 bottom-8 w-2 bg-blue-600/80 hover:bg-blue-700 z-20 rounded-r cursor-ew-resize"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleResizeStart(e, id, 'w');
                                                }}
                                                title="Drag to change tile width"
                                            />
                                        ) : null}

                                        {/* Resize handles - larger and more visible */}
                                        <div
                                            className={`absolute right-0 bottom-0 w-8 h-8 bg-blue-600 hover:bg-blue-700 z-20 rounded-tl-lg flex items-center justify-center shadow-lg ${
                                                gridColumnCount >= 2 ? 'cursor-se-resize' : 'cursor-s-resize'
                                            }`}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleResizeStart(e, id, gridColumnCount >= 2 ? 'se' : 's');
                                            }}
                                            title={
                                                gridColumnCount >= 2
                                                    ? 'Drag to resize width and height'
                                                    : 'Drag vertically to change tile height'
                                            }
                                        >
                                            <div className="w-4 h-4 border-r-2 border-b-2 border-white"></div>
                                        </div>
                                        
                                        {/* Size indicator */}
                                        <div className="absolute left-2 top-2 z-20">
                                            <div className="px-2 py-1 rounded bg-blue-600 text-white text-xs font-semibold shadow-lg">
                                                {spanW}×{spanH}
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
                                
                                <div className="h-full w-full min-h-0 flex flex-col">
                                    <WidgetWrapper widgetDef={def} dashboardData={dashboardData} />
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* Edit Layout and Manage Widgets Buttons at Bottom */}
            <div className={`flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3 pt-6 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <button
                    onClick={() => setManageOpen(true)}
                    className={`w-full sm:w-auto px-5 py-2.5 text-sm font-medium rounded-lg ${isDark ? 'bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-750' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'} transition-all duration-200`}
                >
                    <i className="fas fa-cog mr-2"></i>
                    Manage Widgets
                </button>
                <button
                    onClick={() => setEditMode(!editMode)}
                    className={`w-full sm:w-auto px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                        editMode
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                    title={
                        editMode
                            ? 'Exit edit mode to hide controls'
                            : 'Reorder and resize widgets; phone and wider screens each keep their own layout'
                    }
                >
                    <i className={`fas ${editMode ? 'fa-times' : 'fa-edit'} mr-2`}></i>
                    {editMode ? 'Exit Edit Mode' : 'Edit Layout'}
                </button>
            </div>

            {manageOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black bg-opacity-40" onClick={() => setManageOpen(false)}></div>
                    <div className={`${isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'} relative rounded-xl shadow-xl w-full max-h-[90vh] overflow-hidden flex flex-col mx-4 max-w-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                        <div className={`p-5 border-b flex-shrink-0 ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">Manage Widgets</h3>
                                <button className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} transition-colors`} onClick={() => setManageOpen(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div className="p-5 overflow-y-auto flex-1 min-h-0">
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
                        <div className={`p-5 border-t flex-shrink-0 ${isDark ? 'border-gray-800' : 'border-gray-100'} flex items-center justify-between`}>
                            <div className="flex items-center gap-3">
                                <button
                                    className={`text-sm px-4 py-2 rounded-lg ${isDark ? 'bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-750' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'} transition-all duration-200`}
                                    onClick={handleResetWidgets}
                                >
                                    Reset to defaults
                                </button>
                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <i className="fas fa-info-circle mr-1"></i>
                                    Use &quot;Edit Layout&quot; on phone or a wide screen — each saves its own order and sizes.
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
try {
    window.dispatchEvent(new CustomEvent('dashboardLiveReady'));
} catch (_) {}
