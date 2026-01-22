// Get dependencies from window
const { useState, useEffect, useRef, useMemo, useCallback, useContext } = React;
const storage = window.storage;
const ProjectModal = window.ProjectModal;
const ProjectDetail = window.ProjectDetail;
const SectionCommentWidget = window.SectionCommentWidget;

// Utility function for project status colors
const getStatusColorClasses = (status) => {
    const statusMap = {
        'In Progress': 'bg-blue-100 text-blue-700',
        'Active': 'bg-green-100 text-green-700',
        'Completed': 'bg-purple-100 text-purple-700',
        'On Hold': 'bg-yellow-100 text-yellow-700',
        'Cancelled': 'bg-red-100 text-red-700',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-700';
};

// Safe useAuth wrapper - always returns a consistent hook result
// CRITICAL FIX for React error #321: Must always call hooks unconditionally
// The issue: conditionally calling window.useAuth() causes different hook counts between renders
// Solution: Always call window.useAuth() unconditionally (following App.jsx pattern)
// React tracks hook calls consistently - if useAuth throws, we catch and return default
const useAuthSafe = () => {
    // CRITICAL: Always call window.useAuth() unconditionally - no conditional checks
    // This ensures React sees the same hook call pattern on every render
    // Following the pattern from App.jsx which always calls useAuth in try-catch
    
    let user = null;
    let logout = () => {
        console.warn('⚠️ Projects: useAuth not available, cannot logout');
        window.location.hash = '#/login';
    };
    let loading = false;
    let refreshUser = async () => null;
    
    try {
        // Always call window.useAuth() - React tracks this consistently
        // If it doesn't exist, this will throw ReferenceError, which we catch
        // If context isn't available, it will throw React error #321, which we also catch
        const authState = window.useAuth();
        if (authState && typeof authState === 'object') {
            user = authState.user || null;
            logout = authState.logout || logout;
            loading = authState.loading !== undefined ? authState.loading : false;
            refreshUser = authState.refreshUser || refreshUser;
        }
    } catch (error) {
        // React error #321/#300 means context not found - expected if AuthProvider isn't ready
        // ReferenceError means window.useAuth doesn't exist yet
        // Both are recoverable - component will re-render when provider/useAuth is ready
        const isContextError = error.message && (
            error.message.includes('321') || 
            error.message.includes('300') ||
            error.message.includes('Context')
        );
        const isReferenceError = error.name === 'ReferenceError' || 
            (error.message && error.message.includes('useAuth'));
        
        // Only log if it's an unexpected error
        if (!isContextError && !isReferenceError) {
            console.warn('⚠️ Projects: useAuth hook threw an error:', error);
        }
        // Fall through to use default values
    }
    
    // Always return the same structure - ensures consistent return value
    return {
        user,
        logout,
        loading,
        refreshUser
    };
};

const Projects = () => {
    // Removed verbose mount/render log to reduce console noise.
    // For detailed diagnostics, prefer using window.debug.log when needed.
    // CRITICAL: Always call useAuthSafe() unconditionally at the top level
    // This ensures hooks are always called in the same order on every render
    const { logout } = useAuthSafe();
    const [projects, setProjects] = useState([]); // Projects are database-only
    const [showModal, setShowModal] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [viewingProject, setViewingProject] = useState(null);
    const [showProgressTracker, setShowProgressTracker] = useState(false);
    const [trackerFocus, setTrackerFocus] = useState(null);
    const [draggedProject, setDraggedProject] = useState(null);
    const mouseDownRef = useRef(null);
    const handleViewProjectRef = useRef(null);
    // Refs to prevent infinite loops in route handling
    const lastProcessedRouteRef = useRef(null);
    const lastProcessedProjectIdRef = useRef(null);
    const routeCheckInProgressRef = useRef(false);
    const lastHandleViewProjectCallRef = useRef({ projectId: null, timestamp: 0 });
    const [selectedClient, setSelectedClient] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    // Load view mode from localStorage, defaulting to 'list' if not set
    const [viewMode, setViewMode] = useState(() => {
        try {
            const saved = localStorage.getItem('projectsViewMode');
            return saved === 'grid' || saved === 'list' ? saved : 'list';
        } catch (e) {
            return 'list';
        }
    });
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [waitingForProjectDetail, setWaitingForProjectDetail] = useState(false);
    const [projectDetailAvailable, setProjectDetailAvailable] = useState(!!window.ProjectDetail);
    const [waitingForTracker, setWaitingForTracker] = useState(false);
    const [forceRender, setForceRender] = useState(0); // Force re-render when ProjectDetail loads
    const [deleteConfirmation, setDeleteConfirmation] = useState({ show: false, projectId: null });
    
    const openProgressTrackerHash = (params = {}) => {
        try {
            const basePath = '#/projects';
            const searchParams = new URLSearchParams();
            searchParams.set('progressTracker', '1');

            if (params.projectId) {
                searchParams.set('projectId', params.projectId);
            }
            if (typeof params.monthIndex === 'number' && !Number.isNaN(params.monthIndex)) {
                searchParams.set('monthIndex', String(params.monthIndex));
            }
            if (params.month) {
                searchParams.set('month', params.month);
            }
            if (params.field) {
                searchParams.set('field', params.field);
            }
            if (params.year) {
                searchParams.set('year', String(params.year));
            }

            const newHash = `${basePath}?${searchParams.toString()}`;

            // Always try to keep URL in sync, but don't rely on it for state
            if (window.location.hash !== newHash) {
                window.location.hash = newHash;
            }

            // Ensure tracker UI always opens when button is clicked,
            // even if the router/hash handling changes
            setShowProgressTracker(true);
            setTrackerFocus({
                projectId: params.projectId || null,
                monthIndex: typeof params.monthIndex === 'number' && !Number.isNaN(params.monthIndex) ? params.monthIndex : null,
                month: params.month || null,
                field: params.field || null,
                year: params.year || null
            });
        } catch (error) {
            console.error('❌ Projects: Failed to set progress tracker hash:', error);
            setShowProgressTracker(true);
        }
    };

    const clearProgressTrackerHash = () => {
        try {
            setShowProgressTracker(false);
            setTrackerFocus(null);
            const hash = window.location.hash || '#/projects';
            const trimmed = hash.startsWith('#') ? hash.substring(1) : hash;
            const [pathPart = '/projects', queryString = ''] = trimmed.split('?');
            const params = new URLSearchParams(queryString);
            params.delete('progressTracker');
            params.delete('projectId');
            params.delete('monthIndex');
            params.delete('month');
            params.delete('field');
            params.delete('year');
            const cleanQuery = params.toString();
            const normalizedPath = pathPart || '/projects';
            const newHash = `#${normalizedPath}${cleanQuery ? `?${cleanQuery}` : ''}`;
            if (window.location.hash !== newHash) {
                window.location.hash = newHash;
            }
        } catch (error) {
            console.error('❌ Projects: Failed to clear progress tracker hash:', error);
        }
    };

    useEffect(() => {
        const handleHashChangeForTracker = () => {
            try {
                const hash = window.location.hash || '';
                const trimmed = hash.startsWith('#') ? hash.substring(1) : hash;
                const [pathPart = '', queryString = ''] = trimmed.split('?');
                const normalizedPath = (pathPart || '').replace(/^\/+/, '');
                if (normalizedPath !== 'projects') {
                    return;
                }

                const params = new URLSearchParams(queryString);
                if (params.get('progressTracker')) {
                    const rawMonthIndex = params.get('monthIndex');
                    const rawYear = params.get('year');
                    const parsedMonthIndex = rawMonthIndex !== null ? Number(rawMonthIndex) : null;
                    const parsedYear = rawYear !== null ? Number(rawYear) : null;

                    setTrackerFocus({
                        projectId: params.get('projectId') || null,
                        monthIndex: parsedMonthIndex !== null && !Number.isNaN(parsedMonthIndex) ? parsedMonthIndex : null,
                        month: params.get('month') || null,
                        field: params.get('field') || null,
                        year: parsedYear !== null && !Number.isNaN(parsedYear) ? parsedYear : null
                    });
                    setShowProgressTracker(true);
                } else {
                    setTrackerFocus(null);
                    setShowProgressTracker(prev => (prev ? false : prev));
                }
            } catch (error) {
                console.error('❌ Projects: Error parsing hash for progress tracker:', error);
            }
        };

        handleHashChangeForTracker();
        window.addEventListener('hashchange', handleHashChangeForTracker);
        return () => window.removeEventListener('hashchange', handleHashChangeForTracker);
    }, []);
    
    // Helper function to update project URL with tab/section/comment info
    const updateProjectUrl = useCallback((projectId, options = {}) => {
        if (!window.RouteState || !projectId) return;
        
        const segments = [String(projectId)];
        const searchParams = new URLSearchParams();
        
        // Only add parameters if they're explicitly provided and not null
        // If a parameter is null, it means we want to remove it (don't add it to searchParams)
        if (options.tab !== undefined && options.tab !== null) {
            searchParams.set('tab', options.tab);
        }
        if (options.section !== undefined && options.section !== null) {
            searchParams.set('section', options.section);
        }
        if (options.commentId !== undefined && options.commentId !== null) {
            searchParams.set('commentId', options.commentId);
        }
        if (options.task !== undefined && options.task !== null) {
            searchParams.set('task', options.task);
        }
        // If task is explicitly null, don't add it (effectively removes it from URL)
        
        const search = searchParams.toString();
        // Use navigate directly to support search parameter
        window.RouteState.navigate({
            page: 'projects',
            segments: segments,
            search: search ? `?${search}` : '',
            hash: '',
            replace: false,
            preserveSearch: false,
            preserveHash: false
        });
    }, []);
    
    // Expose URL update function for ProjectDetail to use
    useEffect(() => {
        if (viewingProject && viewingProject.id) {
            window.updateProjectUrl = (options = {}) => {
                updateProjectUrl(viewingProject.id, options);
            };
        } else {
            window.updateProjectUrl = null;
        }
    }, [viewingProject, updateProjectUrl]);
    
    // Listen for entity navigation events (from notifications, comments, etc.)
    useEffect(() => {
        const handleEntityNavigation = async (event) => {
            console.log('📥 Projects: Received openEntityDetail event:', event.detail);
            if (!event.detail) return;
            
            const { entityType, entityId, options } = event.detail;
            if (!entityType || !entityId) {
                console.log('⚠️ Projects: openEntityDetail event missing entityType or entityId');
                return;
            }
            
            console.log('🔍 Projects: Processing openEntityDetail:', { entityType, entityId, options, projectsCount: projects.length });
            
            // Handle project and task entities
            if (entityType === 'project') {
                // Find the project in our data
                let project = projects.find(p => p.id === entityId || String(p.id) === String(entityId));
                console.log('🔍 Projects: Looking for project:', entityId, 'Found in cache:', !!project);
                
                // If project not found in cache, try to fetch it
                if (!project && window.DatabaseAPI?.getProject) {
                    console.log('📡 Projects: Project not in cache, fetching from API...');
                    try {
                        const response = await window.DatabaseAPI.getProject(entityId);
                        const projectData = response?.data?.project || response?.project;
                        if (projectData) {
                            project = projectData;
                            console.log('✅ Projects: Fetched project from API:', project.name);
                            // Add to projects array if not already there
                            if (!projects.find(p => String(p.id) === String(entityId))) {
                                setProjects(prev => [...prev, project]);
                            }
                        }
                    } catch (error) {
                        console.error('❌ Projects: Failed to fetch project:', error);
                    }
                }
                
                if (project) {
                    setSelectedProject(project);
                    setViewingProject(project);
                    setShowModal(false);
                    
                    // Update URL with project ID and any options
                    updateProjectUrl(entityId, options);
                    
                    // Handle task opening if specified
                    if (options?.task) {
                        console.log('📋 Projects: Task specified in openEntityDetail event, will open task:', options.task);
                        // Wait for ProjectDetail to load and tasks to be available, then dispatch openTask event
                        setTimeout(() => {
                            console.log('📋 Projects: Dispatching openTask event for task:', options.task);
                            window.dispatchEvent(new CustomEvent('openTask', {
                                detail: { 
                                    taskId: options.task,
                                    tab: options.tab || 'details'
                                }
                            }));
                        }, 1000); // Increased delay to ensure ProjectDetail is loaded and tasks are available
                    } else if (options?.tab) {
                        // Handle tab navigation if specified
                        // ProjectDetail component will handle tab switching
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('switchProjectTab', {
                                detail: { tab: options.tab, section: options.section, commentId: options.commentId }
                            }));
                        }, 100);
                    }
                } else {
                    // Project not found in cache, try to fetch it
                    console.log(`Project with id ${entityId} not found in cache, attempting to fetch...`);
                    // Try to load the project
                    try {
                        if (window.DatabaseAPI?.getProject) {
                            const response = await window.DatabaseAPI.getProject(entityId);
                            const projectData = response?.data?.project || response?.project;
                            if (projectData) {
                                setSelectedProject(projectData);
                                setViewingProject(projectData);
                                setShowModal(false);
                                
                                // Update URL with project ID and any options
                                updateProjectUrl(entityId, options);
                                
                                // Handle task opening if specified
                                if (options?.task) {
                                    console.log('📋 Projects: Task specified in openEntityDetail event (API fetch), will open task:', options.task);
                                    // Wait for ProjectDetail to load and tasks to be available, then dispatch openTask event
                                    setTimeout(() => {
                                        console.log('📋 Projects: Dispatching openTask event for task:', options.task);
                                        window.dispatchEvent(new CustomEvent('openTask', {
                                            detail: { 
                                                taskId: options.task,
                                                tab: options.tab || 'details'
                                            }
                                        }));
                                    }, 1000); // Increased delay to ensure ProjectDetail is loaded and tasks are available
                                } else if (options?.tab) {
                                    // Handle tab navigation if specified
                                    setTimeout(() => {
                                        window.dispatchEvent(new CustomEvent('switchProjectTab', {
                                            detail: { tab: options.tab, section: options.section, commentId: options.commentId }
                                        }));
                                    }, 100);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Failed to load project:', error);
                    }
                }
            } else if (entityType === 'task') {
                // For tasks, we need to find the parent project first
                // Tasks can be nested: /projects/{projectId}/tasks/{taskId}
                const projectId = options?.projectId || options?.parentId;
                if (projectId) {
                    const project = projects.find(p => p.id === projectId);
                    if (project) {
                        setSelectedProject(project);
                        setViewingProject(project);
                        setShowModal(false);
                        
                        // Dispatch event for ProjectDetail to handle task selection
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('openTask', {
                                detail: { 
                                    taskId: entityId, 
                                    tab: options.tab || 'comments',
                                    commentId: options.commentId
                                }
                            }));
                        }, 200);
                    } else {
                        // Project not found, try to fetch it
                        console.log(`Project ${projectId} not found in cache for task ${entityId}, attempting to fetch...`);
                        try {
                            if (window.DatabaseAPI?.getProject) {
                                const response = await window.DatabaseAPI.getProject(projectId);
                                const projectData = response?.data?.project || response?.project;
                                if (projectData) {
                                    setSelectedProject(projectData);
                                    setViewingProject(projectData);
                                    setShowModal(false);
                                    
                                    setTimeout(() => {
                                        window.dispatchEvent(new CustomEvent('openTask', {
                                            detail: { 
                                                taskId: entityId, 
                                                tab: options.tab || 'comments',
                                                commentId: options.commentId
                                            }
                                        }));
                                    }, 200);
                                }
                            }
                        } catch (error) {
                            console.error('Failed to load project for task:', error);
                        }
                    }
                } else {
                    console.warn(`Task ${entityId} navigation: No project ID provided in options`);
                }
            }
        };
        
        window.addEventListener('openEntityDetail', handleEntityNavigation);
        return () => window.removeEventListener('openEntityDetail', handleEntityNavigation);
    }, [projects, updateProjectUrl]);
    
    // Listen for route changes to handle project navigation and URL-based project opening
    useEffect(() => {
        // Prevent infinite loops - only log once per route change
        if (routeCheckInProgressRef.current) {
            return;
        }
        
        if (!window.RouteState) {
            // Retry after a short delay
            const retryTimeout = setTimeout(() => {
                if (window.RouteState && !routeCheckInProgressRef.current) {
                    routeCheckInProgressRef.current = true;
                    setForceRender(prev => prev + 1);
                    setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                }
            }, 500);
            return () => clearTimeout(retryTimeout);
        }
        
        routeCheckInProgressRef.current = true;
        
        const handleRouteChange = async (route) => {
            // Prevent processing the same route multiple times
            const routeKey = route ? `${route.page}-${route.segments?.join('-')}-${route.search?.toString()}` : 'none';
            if (lastProcessedRouteRef.current === routeKey) {
                return;
            }
            lastProcessedRouteRef.current = routeKey;
            
            // If we're on the projects page
            if (route?.page === 'projects') {
                // If there are no segments, reset selected project
                if (!route.segments || route.segments.length === 0) {
                    // Clear sessionStorage to prevent auto-opening a project
                    sessionStorage.removeItem('openProjectId');
                    sessionStorage.removeItem('openTaskId');
                    if (selectedProject || viewingProject) {
                        setSelectedProject(null);
                        setViewingProject(null);
                    }
                } else {
                    // URL contains a project ID - open that project
                    const projectId = route.segments[0];
                    const taskId = route.search?.get('task');
                    
                    if (projectId) {
                        // Prevent processing the same project multiple times
                        if (lastProcessedProjectIdRef.current === projectId && viewingProject && String(viewingProject.id) === String(projectId)) {
                            routeCheckInProgressRef.current = false;
                            return;
                        }
                        lastProcessedProjectIdRef.current = projectId;
                        
                        // Check if we're already viewing this project
                        if (viewingProject && String(viewingProject.id) === String(projectId)) {
                            // Already viewing this project, but check if we need to handle tab/section/task
                            const tab = route.search?.get('tab');
                            const section = route.search?.get('section');
                            const commentId = route.search?.get('commentId');
                            
                            if (taskId) {
                                console.log('📋 Projects: Will open task with retry logic:', taskId);
                                // Use retry logic to ensure ProjectDetail catches the event
                                const dispatchOpenTask = (attempt = 1) => {
                                    console.log(`📋 Projects: Dispatching openTask event (attempt ${attempt}) for task:`, taskId);
                                    window.dispatchEvent(new CustomEvent('openTask', {
                                        detail: { 
                                            taskId: taskId,
                                            tab: tab || 'details'
                                        }
                                    }));
                                    
                                    // Retry up to 5 times with increasing delays
                                    if (attempt < 5) {
                                        setTimeout(() => dispatchOpenTask(attempt + 1), 1000 * attempt);
                                    }
                                };
                                
                                // Start after 1 second, then retry at 2s, 3s, 4s, 5s
                                setTimeout(() => dispatchOpenTask(1), 1000);
                            } else if (tab || section || commentId) {
                                // Dispatch event to ProjectDetail to switch tab/section
                                setTimeout(() => {
                                    if (tab) {
                                        window.dispatchEvent(new CustomEvent('switchProjectTab', {
                                            detail: { tab, section, commentId }
                                        }));
                                    }
                                    if (section) {
                                        window.dispatchEvent(new CustomEvent('switchProjectSection', {
                                            detail: { section, commentId }
                                        }));
                                    }
                                    if (commentId) {
                                        window.dispatchEvent(new CustomEvent('scrollToComment', {
                                            detail: { commentId }
                                        }));
                                    }
                                }, 100);
                            }
                            return; // Already viewing this project
                        }
                        
                        // Find project in cache or fetch it
                        const cachedProject = projects.find(p => String(p.id) === String(projectId));
                        if (cachedProject) {
                            console.log('✅ Projects: Found project in cache, opening:', cachedProject.name);
                            // Directly set state to open the project - more reliable than using ref
                            setSelectedProject(cachedProject);
                            setViewingProject(cachedProject);
                            setShowModal(false);
                            
                            // Check if there's a task parameter in the URL to open
                            if (taskId) {
                                console.log('📋 Projects: Task parameter found, will open task with retry logic:', taskId);
                                // Use retry logic to ensure ProjectDetail catches the event
                                const dispatchOpenTask = (attempt = 1) => {
                                    console.log(`📋 Projects: Dispatching openTask event (attempt ${attempt}) for task:`, taskId);
                                    window.dispatchEvent(new CustomEvent('openTask', {
                                        detail: { 
                                            taskId: taskId,
                                            tab: 'details'
                                        }
                                    }));
                                    
                                    // Retry up to 5 times with increasing delays
                                    if (attempt < 5) {
                                        setTimeout(() => dispatchOpenTask(attempt + 1), 1000 * attempt);
                                    }
                                };
                                
                                // Start after 1 second, then retry at 2s, 3s, 4s, 5s
                                setTimeout(() => dispatchOpenTask(1), 1000);
                            }
                        } else {
                            console.log('⚠️ Projects: Project not in cache, fetching from API:', projectId);
                            // Project not in cache, try to fetch it
                            try {
                                if (window.DatabaseAPI?.getProject) {
                                    const response = await window.DatabaseAPI.getProject(projectId);
                                    const projectData = response?.data?.project || response?.project || response?.data;
                                    if (projectData) {
                                        console.log('✅ Projects: Fetched project from API, opening:', projectData.name);
                                        // Directly set state to open the project - more reliable than using ref
                                        setSelectedProject(projectData);
                                        setViewingProject(projectData);
                                        setShowModal(false);
                                        
                                        // Add to projects array if not already there
                                        if (!projects.find(p => String(p.id) === String(projectId))) {
                                            setProjects(prev => [...prev, projectData]);
                                        }
                                        
                                        // Check if there's a task parameter in the URL to open
                                        if (taskId) {
                                            console.log('📋 Projects: Task parameter found, will open task with retry logic:', taskId);
                                            // Use retry logic to ensure ProjectDetail catches the event
                                            const dispatchOpenTask = (attempt = 1) => {
                                                console.log(`📋 Projects: Dispatching openTask event (attempt ${attempt}) for task:`, taskId);
                                                window.dispatchEvent(new CustomEvent('openTask', {
                                                    detail: { 
                                                        taskId: taskId,
                                                        tab: 'details'
                                                    }
                                                }));
                                                
                                                // Retry up to 5 times with increasing delays
                                                if (attempt < 5) {
                                                    setTimeout(() => dispatchOpenTask(attempt + 1), 1000 * attempt);
                                                }
                                            };
                                            
                                            // Start after 1 second, then retry at 2s, 3s, 4s, 5s
                                            setTimeout(() => dispatchOpenTask(1), 1000);
                                        }
                                    } else {
                                        console.warn('⚠️ Projects: API did not return project data for:', projectId);
                                    }
                                } else {
                                    console.warn('⚠️ Projects: DatabaseAPI.getProject not available');
                                }
                            } catch (error) {
                                console.error('❌ Projects: Failed to load project from URL:', error);
                            }
                        }
                    }
                }
            }
        };
        
        // Check initial route immediately - this is critical for handling navigation from other pages
        // This will run every time the effect runs (when projects load, etc.)
        const checkAndHandleRoute = () => {
            // ALWAYS check window.location directly first as primary method
            const urlPath = window.location.pathname || '';
            const urlSearch = window.location.search || '';
            const urlParams = new URLSearchParams(urlSearch);
            
            // Parse project ID and task from URL directly
            let projectId = null;
            let taskId = null;
            
            if (urlPath.includes('/projects/')) {
                const pathParts = urlPath.split('/projects/')[1].split('/');
                projectId = pathParts[0];
                taskId = urlParams.get('task');
            }
            
            // If we found a project ID in the URL, handle it immediately
            if (projectId) {
                // Debug log removed to prevent noisy console output in production.
                // Use window.debug.log if detailed routing diagnostics are needed.
                // Create a route-like object
                const route = {
                    page: 'projects',
                    segments: [projectId],
                    search: urlParams
                };
                handleRouteChange(route);
                return; // Don't check RouteState if we already handled it
            }
            
            // Fallback to RouteState if available
            if (window.RouteState) {
                const currentRoute = window.RouteState.getRoute();
                
                if (currentRoute?.page === 'projects' && currentRoute.segments && currentRoute.segments.length > 0) {
                    // We're on a project page - handle it
                    handleRouteChange(currentRoute);
                }
            } else {
                setTimeout(checkAndHandleRoute, 200);
            }
        };
        
        // Check route immediately
        checkAndHandleRoute();
        
        // Subscribe to route changes (if RouteState is available)
        let unsubscribe = null;
        if (window.RouteState && typeof window.RouteState.subscribe === 'function') {
            unsubscribe = window.RouteState.subscribe((route) => {
                if (!routeCheckInProgressRef.current) {
                    handleRouteChange(route);
                }
            });
        }
        
        // Also listen for popstate events (browser back/forward)
        const handlePopState = () => {
            if (!routeCheckInProgressRef.current && window.RouteState) {
                const route = window.RouteState.getRoute();
                handleRouteChange(route);
            }
        };
        window.addEventListener('popstate', handlePopState);
        
        // Also listen for custom route:change events (dispatched by MainLayout)
        const handleRouteChangeEvent = (event) => {
            if (!routeCheckInProgressRef.current) {
                const route = event.detail || window.RouteState?.getRoute();
                if (route) {
                    handleRouteChange(route);
                }
            }
        };
        window.addEventListener('route:change', handleRouteChangeEvent);
        
        // Set up an interval to periodically check the route (fallback for missed events)
        const routeCheckInterval = setInterval(() => {
            if (routeCheckInProgressRef.current) return;
            
            // Check URL directly first
            const urlPath = window.location.pathname || '';
            let projectId = null;
            
            if (urlPath.includes('/projects/')) {
                const pathParts = urlPath.split('/projects/')[1].split('/');
                projectId = pathParts[0];
            } else if (window.RouteState) {
                const currentRoute = window.RouteState.getRoute();
                if (currentRoute?.page === 'projects' && currentRoute.segments && currentRoute.segments.length > 0) {
                    projectId = currentRoute.segments[0];
                }
            }
            
            // Only check if we're not already viewing this project
            if (projectId && (!viewingProject || String(viewingProject.id) !== String(projectId))) {
                checkAndHandleRoute();
            }
        }, 2000); // Check every 2 seconds (reduced frequency)
        
        return () => {
            routeCheckInProgressRef.current = false;
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
            window.removeEventListener('popstate', handlePopState);
            window.removeEventListener('route:change', handleRouteChangeEvent);
            clearInterval(routeCheckInterval);
        };
    }, [selectedProject, viewingProject, projects]);
    
    // Listen for explicit navigation to projects list (e.g., clicking "Projects" in sidebar while already on projects page)
    useEffect(() => {
        const handleNavigateToProjectsList = (event) => {
            // Clear sessionStorage to prevent auto-opening a project
            sessionStorage.removeItem('openProjectId');
            sessionStorage.removeItem('openTaskId');
            // Clear the project detail view when explicitly navigating to projects list
            if (viewingProject) {
                setViewingProject(null);
            }
            if (selectedProject) {
                setSelectedProject(null);
            }
        };
        
        window.addEventListener('navigateToProjectsList', handleNavigateToProjectsList);
        return () => window.removeEventListener('navigateToProjectsList', handleNavigateToProjectsList);
    }, [viewingProject, selectedProject]);
    
    // Ensure storage is available
    useEffect(() => {
        if (!window.storage) {
            console.error('❌ Projects: Storage not available! Make sure localStorage.js is loaded before Projects component.');
            // Try to wait for storage to be available
            const checkStorage = () => {
                if (window.storage) {
                } else {
                    setTimeout(checkStorage, 100);
                }
            };
            checkStorage();
        } else {
        }
    }, []);
    
    // Wait for ProjectProgressTracker component to load when needed
    useEffect(() => {
        if (showProgressTracker && !window.ProjectProgressTracker && !waitingForTracker) {
            console.warn('⚠️ Projects: ProjectProgressTracker not available yet, waiting...');
            setWaitingForTracker(true);
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max (increased from 2 seconds)
            
            // Listen for componentLoaded event
            const handleComponentLoaded = (event) => {
                if (event.detail && event.detail.component === 'ProjectProgressTracker') {
                    console.log('✅ Projects: Received componentLoaded event for ProjectProgressTracker');
                    setWaitingForTracker(false);
                    setForceRender(prev => prev + 1);
                }
            };
            window.addEventListener('componentLoaded', handleComponentLoaded);
            
            // Also try to manually trigger component loading if it's not loaded
            const tryLoadComponent = () => {
                // Check if component-loader has loaded it
                const script = document.querySelector('script[data-component-path*="ProjectProgressTracker"]');
                if (!script) {
                    console.warn('⚠️ Projects: ProjectProgressTracker script tag not found, component may not be loading');
                    // Try to trigger component-loader to load it
                    if (typeof window.loadComponent === 'function') {
                        console.log('🔄 Projects: Attempting to manually load ProjectProgressTracker...');
                        window.loadComponent('components/projects/ProjectProgressTracker.jsx');
                    }
                }
            };
            
            // Try loading immediately
            tryLoadComponent();
            
            const checkInterval = setInterval(() => {
                attempts++;
                if (window.ProjectProgressTracker) {
                    console.log('✅ Projects: ProjectProgressTracker is now available');
                    clearInterval(checkInterval);
                    window.removeEventListener('componentLoaded', handleComponentLoaded);
                    setWaitingForTracker(false);
                    setForceRender(prev => prev + 1);
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    window.removeEventListener('componentLoaded', handleComponentLoaded);
                    setWaitingForTracker(false);
                    console.error('❌ ProjectProgressTracker still not available after waiting', {
                        attempts,
                        maxAttempts,
                        windowHasReact: typeof window.React !== 'undefined',
                        scriptExists: !!document.querySelector('script[data-component-path*="ProjectProgressTracker"]')
                    });
                    // Try one more time to load
                    tryLoadComponent();
                }
            }, 100);
            
            // Cleanup function
            return () => {
                clearInterval(checkInterval);
                window.removeEventListener('componentLoaded', handleComponentLoaded);
            };
        }
    }, [showProgressTracker, waitingForTracker]);
    
    // Load projects from data service on mount
    useEffect(() => {
        let isMounted = true;
        
        const loadProjects = async () => {
            // Use a ref or flag instead of checking projects directly to avoid dependency issues
            setIsLoading(true);
            setLoadError(null);
            
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    console.warn('⚠️ Projects: No authentication token found - logging out');
                    if (isMounted) {
                        setProjects([]);
                        setIsLoading(false);
                    }
                    await logout();
                    window.location.hash = '#/login';
                    return;
                }

                
                // Wait for DatabaseAPI to be available (with timeout - max 2 seconds)
                // Use exponential backoff instead of fixed 100ms polling for better performance
                if (!window.DatabaseAPI) {
                    let waitAttempts = 0;
                    const maxWaitAttempts = 20; // Reduced from 50 to 20
                    let delay = 50; // Start with 50ms
                    
                    while (!window.DatabaseAPI && waitAttempts < maxWaitAttempts) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        waitAttempts++;
                        // Exponential backoff: 50ms, 100ms, 150ms, 200ms, etc. (max 500ms)
                        delay = Math.min(50 + (waitAttempts * 50), 500);
                    }
                }
                
                if (!window.DatabaseAPI) {
                    console.error('❌ Projects: DatabaseAPI not available on window object after waiting 5 seconds');
                    console.error('🔍 Available window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('database') || k.toLowerCase().includes('api')));
                    console.error('🔍 Checking if databaseAPI.js script is loaded:', document.querySelector('script[src*="databaseAPI"]'));
                    
                    if (isMounted) {
                        setProjects([]);
                        setLoadError('Database API not available. The databaseAPI.js script may not have loaded. Please refresh the page.');
                        setIsLoading(false);
                    }
                    return;
                }
                
                if (!window.DatabaseAPI.getProjects) {
                    console.error('❌ Projects: DatabaseAPI.getProjects method not available');
                    console.error('🔍 DatabaseAPI methods:', Object.keys(window.DatabaseAPI));
                    console.error('🔍 DatabaseAPI type:', typeof window.DatabaseAPI);
                    
                    if (isMounted) {
                        setProjects([]);
                        setLoadError('Projects API method not available. Please refresh the page. If the issue persists, check the browser console for errors.');
                        setIsLoading(false);
                    }
                    return;
                }
                
                let response;
                try {
                    // Request only first 100 projects for faster initial load
                    // Full list can be loaded on demand if needed
                    response = await window.DatabaseAPI.getProjects({ limit: 100, page: 1 });
                    
                    // Validate response exists
                    if (!response) {
                        throw new Error('API returned null or undefined response');
                    }
                    
                    // Check if response is an error response
                    if (response.error) {
                        const errorMsg = response.error.message || response.error || 'Unknown API error';
                        throw new Error(`API returned error: ${errorMsg}`);
                    }
                    
                } catch (apiError) {
                    console.error('❌ Projects: DatabaseAPI.getProjects threw an error:', apiError);
                    console.error('❌ API Error details:', {
                        message: apiError.message,
                        stack: apiError.stack,
                        name: apiError.name
                    });
                    throw apiError; // Re-throw to be caught by outer catch
                }
                
                // Handle different response structures - try all possible formats
                let apiProjects = [];
                
                // Try response.data.projects first (most common format)
                if (response?.data?.projects && Array.isArray(response.data.projects)) {
                    apiProjects = response.data.projects;
                } 
                // Try response.data.data.projects (nested data wrapper)
                else if (response?.data?.data?.projects && Array.isArray(response.data.data.projects)) {
                    apiProjects = response.data.data.projects;
                }
                // Try response.projects (direct projects array)
                else if (response?.projects && Array.isArray(response.projects)) {
                    apiProjects = response.projects;
                } 
                // Try response.data as array
                else if (Array.isArray(response?.data)) {
                    apiProjects = response.data;
                } 
                // Try response as array
                else if (Array.isArray(response)) {
                    apiProjects = response;
                } 
                // Last resort: try to find any array in the response
                else {
                    console.warn('⚠️ No projects found in standard locations. Searching response structure...');
                    console.warn('⚠️ Full response structure:', JSON.stringify(response, null, 2).substring(0, 500));
                    
                    // Try to find any array in the response that might be projects
                    const findProjectsInObject = (obj) => {
                        if (Array.isArray(obj)) {
                            return obj.length > 0 && obj[0]?.name ? obj : null;
                        }
                        if (typeof obj === 'object' && obj !== null) {
                            for (const key in obj) {
                                const result = findProjectsInObject(obj[key]);
                                if (result) return result;
                            }
                        }
                        return null;
                    };
                    
                    const foundProjects = findProjectsInObject(response);
                    if (foundProjects) {
                        apiProjects = foundProjects;
                    } else {
                        console.error('❌ Could not find projects array in response');
                        console.error('❌ Full response structure:', JSON.stringify(response, null, 2).substring(0, 1000));
                        apiProjects = [];
                        // If we can't find projects but response exists, this might be an error response
                        if (response?.error) {
                            throw new Error(response.error.message || response.error || 'Unknown error from API');
                        }
                    }
                }
                
                if (apiProjects.length > 0) {
                } else if (response && !response.error) {
                    console.warn('⚠️ Projects: API returned empty array (no projects found)');
                }
                
                // Normalize projects: map clientName to client for frontend compatibility
                const normalizedProjects = (Array.isArray(apiProjects) ? apiProjects : []).map(p => {
                    try {
                        return {
                            ...p,
                            client: p.clientName || p.client || ''
                        };
                    } catch (normalizeError) {
                        console.error('❌ Error normalizing project:', p, normalizeError);
                        return p; // Return original if normalization fails
                    }
                });
                
                
                // Ensure we always set an array (only if component is still mounted)
                if (isMounted) {
                    setProjects(normalizedProjects);
                    setIsLoading(false);
                    
                    // Sync existing projects with clients (non-blocking, won't crash on failure)
                    syncProjectsWithClients(apiProjects).catch(err => {
                        console.warn('⚠️ Projects: Client sync failed, but continuing anyway:', err.message);
                    });
                    
                    // Check if there's a project to open immediately after loading
                    // Only open from sessionStorage if the current route has segments (i.e., we're navigating to a specific project)
                    const currentRoute = window.RouteState?.getRoute();
                    const shouldOpenFromStorage = currentRoute?.page === 'projects' && 
                                                 currentRoute.segments && 
                                                 currentRoute.segments.length > 0;
                    
                    const projectIdToOpen = sessionStorage.getItem('openProjectId');
                    const taskIdToOpen = sessionStorage.getItem('openTaskId');
                    if (projectIdToOpen && shouldOpenFromStorage) {
                        console.log('🔍 Projects: Checking sessionStorage for project to open:', projectIdToOpen);
                        let project = apiProjects.find(p => String(p.id) === String(projectIdToOpen));
                        
                        // If project not found in loaded projects, try to fetch it from API
                        if (!project && window.DatabaseAPI?.getProject) {
                            console.log('📡 Projects: Project not in loaded list, fetching from API...');
                            window.DatabaseAPI.getProject(projectIdToOpen)
                                .then(response => {
                                    const projectData = response?.data?.project || response?.project;
                                    if (projectData) {
                                        const fetchedProject = {
                                            ...projectData,
                                            client: projectData.clientName || projectData.client || ''
                                        };
                                        console.log('✅ Projects: Fetched project from API:', fetchedProject.name);
                                        // Add to projects array
                                        setProjects(prev => {
                                            const exists = prev.find(p => String(p.id) === String(projectIdToOpen));
                                            if (!exists) {
                                                return [...prev, fetchedProject];
                                            }
                                            return prev;
                                        });
                                        // Open the project
                                        setViewingProject(fetchedProject);
                                        setShowModal(false);
                                        if (taskIdToOpen) {
                                            // Use retry logic to ensure ProjectDetail catches the event
                                            const dispatchOpenTask = (attempt = 1) => {
                                                console.log(`📋 Projects: Dispatching openTask event (attempt ${attempt}) for task:`, taskIdToOpen);
                                                window.dispatchEvent(new CustomEvent('openTask', {
                                                    detail: { taskId: taskIdToOpen, tab: 'details' }
                                                }));
                                                
                                                // Retry up to 5 times with increasing delays
                                                if (attempt < 5) {
                                                    setTimeout(() => dispatchOpenTask(attempt + 1), 1000 * attempt);
                                                }
                                            };
                                            
                                            // Start after 1 second, then retry at 2s, 3s, 4s, 5s
                                            setTimeout(() => dispatchOpenTask(1), 1000);
                                        }
                                    }
                                })
                                .catch(error => {
                                    console.error('❌ Projects: Failed to fetch project from API:', error);
                                });
                            // Continue with project opening logic below
                            return;
                        }
                        
                        if (project) {
                            console.log('✅ Projects: Opening project from sessionStorage:', project.name);
                            // Open the project immediately
                            setViewingProject(project);
                            setShowModal(false);
                            // Clear the flags
                            sessionStorage.removeItem('openProjectId');
                            
                            // If there's a task ID, dispatch openTask event after ProjectDetail loads
                            if (taskIdToOpen) {
                                console.log('📋 Projects: Task ID found in sessionStorage, will open task:', taskIdToOpen);
                                sessionStorage.removeItem('openTaskId');
                                
                                // Use retry logic to ensure ProjectDetail catches the event
                                const dispatchOpenTask = (attempt = 1) => {
                                    console.log(`📋 Projects: Dispatching openTask event (attempt ${attempt}) for task:`, taskIdToOpen);
                                    window.dispatchEvent(new CustomEvent('openTask', {
                                        detail: { 
                                            taskId: taskIdToOpen,
                                            tab: 'details'
                                        }
                                    }));
                                    
                                    // Retry up to 5 times with increasing delays
                                    if (attempt < 5) {
                                        setTimeout(() => dispatchOpenTask(attempt + 1), 1000 * attempt);
                                    }
                                };
                                
                                // Start after 1 second, then retry at 2s, 3s, 4s, 5s
                                setTimeout(() => dispatchOpenTask(1), 1000);
                            }
                        } else {
                            console.warn('⚠️ Projects: Project not found in loaded projects and API fetch failed:', projectIdToOpen);
                            sessionStorage.removeItem('openProjectId');
                            sessionStorage.removeItem('openTaskId');
                        }
                    } else if (projectIdToOpen && !shouldOpenFromStorage) {
                        // We're on the projects list but sessionStorage has a project ID - clear it
                        console.log('🧹 Projects: Clearing sessionStorage project ID - navigating to projects list');
                        sessionStorage.removeItem('openProjectId');
                        sessionStorage.removeItem('openTaskId');
                    }
                    
                }
            } catch (error) {
                console.error('❌ Projects: Error loading projects from database:', error);
                console.error('❌ Error details:', {
                    message: error.message,
                    stack: error.stack,
                    response: error.response,
                    status: error.status
                });
                if (isMounted) {
                    setProjects([]);
                    setIsLoading(false);
                    
                    // Set user-friendly error message with retry guidance
                    if (error.message.includes('401') || error.message.includes('Authentication')) {
                        console.warn('⚠️ Authentication error - redirecting to login');
                        setLoadError('Authentication expired. Redirecting to login...');
                        setTimeout(() => {
                            window.location.hash = '#/login';
                        }, 1500);
                    } else if (error.message.includes('404')) {
                        setLoadError('Projects API endpoint not found. Please contact support.');
                    } else if (error.message.includes('500') || error.message.includes('Server')) {
                        setLoadError('Server error loading projects. Please try again later.');
                    } else if (error.message.includes('Network') || error.message.includes('Unable to connect') || error.message.includes('fetch')) {
                        setLoadError('Network error: Unable to connect to server. The request was retried automatically. Please check your internet connection and refresh the page if the problem persists.');
                    } else {
                        setLoadError(`Failed to load projects: ${error.message}. Please try refreshing the page.`);
                    }
                }
            }
        };

        loadProjects();
        
        // Cleanup function to prevent state updates after unmount
        return () => {
            isMounted = false;
        };
    }, []); // Only run once on initial mount

    // Check route immediately on mount - this handles navigation from other pages
    // This runs ONCE on mount to catch immediate navigation
    // IMMEDIATE route check - runs FIRST on mount, before projects load
    useEffect(() => {
        console.log('🚀 Projects: IMMEDIATE route check on mount');
        
        // Parse URL directly - check both pathname and hash (for hash-based routing)
        const urlPath = window.location.pathname || '';
        const urlHash = window.location.hash || '';
        const urlSearch = window.location.search || '';
        const urlParams = new URLSearchParams(urlSearch);
        
        let projectId = null;
        let taskId = null;
        
        // PRIORITY: Check hash first (for hash-based routing like #/projects/123?task=456 or #/projects/123?docSectionId=...)
        // This is critical for email links which use hash-based routing
        let hashParams = null;
        if (urlHash.includes('/projects/')) {
            const hashParts = urlHash.split('/projects/')[1].split('/');
            projectId = hashParts[0].split('?')[0]; // Remove query params from ID
            // Check for query params in hash
            if (urlHash.includes('?')) {
                const hashQuery = urlHash.split('?')[1];
                hashParams = new URLSearchParams(hashQuery);
                taskId = hashParams.get('task') || urlParams.get('task');
            } else {
                taskId = urlParams.get('task');
            }
        }
        
        // Fallback to pathname if not found in hash
        if (!projectId && urlPath.includes('/projects/')) {
            const pathParts = urlPath.split('/projects/')[1].split('/');
            projectId = pathParts[0];
            if (!taskId) {
                taskId = urlParams.get('task');
            }
        }
        
        if (projectId) {
            console.log('✅ Projects: IMMEDIATE - Found project in URL:', { projectId, taskId, hasHashParams: !!hashParams });
            
            // Fetch and open project immediately
            const fetchAndOpen = async () => {
                if (window.DatabaseAPI?.getProject) {
                    try {
                        console.log('📡 Projects: IMMEDIATE - Fetching project:', projectId);
                        const response = await window.DatabaseAPI.getProject(projectId);
                        const projectData = response?.data?.project || response?.project || response?.data;
                        
                        if (projectData) {
                            const fetchedProject = {
                                ...projectData,
                                client: projectData.clientName || projectData.client || ''
                            };
                            console.log('✅ Projects: IMMEDIATE - Opening project:', fetchedProject.name);
                            
                            // Add to projects array
                            setProjects(prev => {
                                const exists = prev.find(p => String(p.id) === String(projectId));
                                return exists ? prev : [...prev, fetchedProject];
                            });
                            
                            // Open immediately
                            setViewingProject(fetchedProject);
                            setSelectedProject(fetchedProject);
                            setShowModal(false);
                            
                            // Update URL - preserve hash if it contains document collection tracker parameters
                            const hasDocCollectionParams = hashParams && (
                                hashParams.has('docSectionId') || 
                                hashParams.has('docDocumentId') || 
                                hashParams.has('docMonth')
                            );
                            
                            if (hasDocCollectionParams) {
                                // For document collection tracker, DON'T call RouteState.navigate() 
                                // as it converts hash URLs to pathname URLs, losing the hash
                                // The hash is already correct (#/projects/{id}?docSectionId=...), 
                                // we just opened the project, so leave the hash alone
                                // ProjectDetail and MonthlyDocumentCollectionTracker will detect the hash params
                                console.log('✅ Projects: Preserving hash with document collection parameters:', urlHash);
                            } else if (window.RouteState) {
                                try {
                                    if (taskId) {
                                        // For tasks, use search params
                                        window.RouteState.navigate({
                                            page: 'projects',
                                            segments: [projectId],
                                            search: `?task=${encodeURIComponent(taskId)}`,
                                            preserveSearch: false,
                                            preserveHash: false
                                        });
                                    } else {
                                        // No special params, just navigate to project
                                        window.RouteState.navigate({
                                            page: 'projects',
                                            segments: [projectId],
                                            preserveSearch: false,
                                            preserveHash: false
                                        });
                                    }
                                } catch (e) {
                                    console.warn('⚠️ Projects: Failed to update URL:', e);
                                }
                            }
                            
                            // Open task with retry
                            if (taskId) {
                                console.log('📋 Projects: IMMEDIATE - Opening task:', taskId);
                                const dispatchTask = (attempt = 1) => {
                                    window.dispatchEvent(new CustomEvent('openTask', {
                                        detail: { taskId: taskId, tab: 'details' }
                                    }));
                                    if (attempt < 5) {
                                        setTimeout(() => dispatchTask(attempt + 1), 1000 * attempt);
                                    }
                                };
                                setTimeout(() => dispatchTask(1), 1000);
                            }
                        }
                    } catch (error) {
                        console.error('❌ Projects: IMMEDIATE - Failed to fetch:', error);
                    }
                }
            };
            
            fetchAndOpen();
        }
    }, []); // Run ONLY on mount
    
    useEffect(() => {
        if (routeCheckInProgressRef.current) {
            return;
        }
        
        // Also check sessionStorage in case it was set by the global listener
        const storedProjectId = sessionStorage.getItem('openProjectId');
        const storedTaskId = sessionStorage.getItem('openTaskId');
        
        const tryOpenProjectFromRoute = async () => {
            // First check sessionStorage (set by global listener or previous attempt)
            const sessionProjectId = sessionStorage.getItem('openProjectId');
            const sessionTaskId = sessionStorage.getItem('openTaskId');
            
            let projectId = null;
            let taskId = null;
            
            // Try to get from RouteState first
            if (window.RouteState) {
                const currentRoute = window.RouteState.getRoute();
                
                if (currentRoute?.page === 'projects' && currentRoute.segments && currentRoute.segments.length > 0) {
                    projectId = currentRoute.segments[0];
                    taskId = currentRoute.search?.get('task');
                }
            } else {
                // Use sessionStorage if RouteState not available
                if (sessionProjectId) {
                    projectId = sessionProjectId;
                    taskId = sessionTaskId;
                } else {
                    // Retry after a short delay
                    setTimeout(tryOpenProjectFromRoute, 200);
                    return;
                }
            }
            
            // Store in sessionStorage immediately
            if (projectId) {
                // Prevent processing the same project multiple times
                if (lastProcessedProjectIdRef.current === projectId) {
                    return;
                }
                routeCheckInProgressRef.current = true;
                lastProcessedProjectIdRef.current = projectId;
                
                sessionStorage.setItem('openProjectId', projectId);
                if (taskId) {
                    sessionStorage.setItem('openTaskId', taskId);
                }
                
                // Try to fetch from API immediately (don't wait for projects to load)
                if (window.DatabaseAPI?.getProject) {
                    try {
                        const response = await window.DatabaseAPI.getProject(projectId);
                        const projectData = response?.data?.project || response?.project;
                        if (projectData) {
                            const fetchedProject = {
                                ...projectData,
                                client: projectData.clientName || projectData.client || ''
                            };
                            // Add to projects array
                            setProjects(prev => {
                                const exists = prev.find(p => String(p.id) === String(projectId));
                                if (!exists) {
                                    return [...prev, fetchedProject];
                                }
                                return prev;
                            });
                                // Open the project immediately
                                setViewingProject(fetchedProject);
                                setShowModal(false);
                                setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                                
                                // Update URL to include task parameter if present
                                if (taskId && window.RouteState) {
                                    updateProjectUrl(projectId, { task: taskId });
                                }
                                
                                if (taskId) {
                                    // Dispatch multiple times with increasing delays to ensure ProjectDetail catches it
                                    // ProjectDetail needs time to mount and load tasks
                                    const dispatchOpenTask = (attempt = 1) => {
                                        window.dispatchEvent(new CustomEvent('openTask', {
                                            detail: { taskId: taskId, tab: 'details' }
                                        }));
                                        
                                        // Retry up to 5 times with increasing delays
                                        if (attempt < 5) {
                                            setTimeout(() => dispatchOpenTask(attempt + 1), 1000 * attempt);
                                        }
                                    };
                                    
                                    // Start after 1 second, then retry at 2s, 3s, 4s, 5s
                                    setTimeout(() => dispatchOpenTask(1), 1000);
                                }
                                return;
                        }
                    } catch (error) {
                        console.error('❌ Projects: Failed to fetch project from API on mount:', error);
                        setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                    }
                }
            }
        };
        
        // Try immediately
        tryOpenProjectFromRoute();
    }, []); // Only run once on mount
    
    // Check route when projects load - this handles cases where projects weren't loaded yet
    // NOTE: Removed viewingProject from dependencies to prevent infinite loops
    useEffect(() => {
        if (routeCheckInProgressRef.current) {
            return;
        }
        
        const tryOpenProjectFromRoute = async () => {
            if (!window.RouteState) {
                setTimeout(tryOpenProjectFromRoute, 200);
                return;
            }
            
            if (routeCheckInProgressRef.current) {
                return;
            }
            
            const currentRoute = window.RouteState.getRoute();
            
            if (currentRoute?.page === 'projects' && currentRoute.segments && currentRoute.segments.length > 0) {
                const projectId = currentRoute.segments[0];
                const taskId = currentRoute.search?.get('task');
                
                // Prevent processing the same project multiple times
                // Use ref to check if we've already processed this project
                if (lastProcessedProjectIdRef.current === projectId) {
                    // Only handle task opening if we're already viewing this project
                    if (taskId && viewingProject && String(viewingProject.id) === String(projectId)) {
                        console.log('📋 Projects: Already viewing project, opening task:', taskId);
                        const dispatchOpenTask = (attempt = 1) => {
                            window.dispatchEvent(new CustomEvent('openTask', {
                                detail: { taskId: taskId, tab: 'details' }
                            }));
                            if (attempt < 5) {
                                setTimeout(() => dispatchOpenTask(attempt + 1), 1000 * attempt);
                            }
                        };
                        setTimeout(() => dispatchOpenTask(1), 1000);
                    }
                    return;
                }
                
                // Store in sessionStorage for later use
                if (projectId) {
                    sessionStorage.setItem('openProjectId', projectId);
                    if (taskId) {
                        sessionStorage.setItem('openTaskId', taskId);
                    }
                    
                    // Helper function to dispatch openTask with retry logic
                    const dispatchOpenTaskWithRetry = (taskIdToOpen) => {
                        console.log('📋 Projects: Will open task with retry logic:', taskIdToOpen);
                        const dispatchOpenTask = (attempt = 1) => {
                            console.log(`📋 Projects: Dispatching openTask event (attempt ${attempt}) for task:`, taskIdToOpen);
                            window.dispatchEvent(new CustomEvent('openTask', {
                                detail: { taskId: taskIdToOpen, tab: 'details' }
                            }));
                            
                            // Retry up to 5 times with increasing delays
                            if (attempt < 5) {
                                setTimeout(() => dispatchOpenTask(attempt + 1), 1000 * attempt);
                            }
                        };
                        
                        // Start after 1 second, then retry at 2s, 3s, 4s, 5s
                        setTimeout(() => dispatchOpenTask(1), 1000);
                    };
                    
                    // Check if we're already viewing this project (using current state via closure)
                    // This check happens before we set lastProcessedProjectIdRef to prevent loops
                    if (viewingProject && String(viewingProject.id) === String(projectId)) {
                        // Mark as processed to prevent re-processing
                        lastProcessedProjectIdRef.current = projectId;
                        if (taskId) {
                            console.log('📋 Projects: Already viewing project, opening task:', taskId);
                            dispatchOpenTaskWithRetry(taskId);
                        }
                        return;
                    }
                    
                    // Try to find project in already loaded projects
                    const existingProject = projects.find(p => String(p.id) === String(projectId));
                    if (existingProject) {
                        routeCheckInProgressRef.current = true;
                        lastProcessedProjectIdRef.current = projectId;
                        setViewingProject(existingProject);
                        setShowModal(false);
                        setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                        
                        // Update URL to include task parameter if present
                        if (taskId && window.RouteState) {
                            updateProjectUrl(projectId, { task: taskId });
                        }
                        
                        if (taskId) {
                            dispatchOpenTaskWithRetry(taskId);
                        }
                        return;
                    }
                    
                    // If project not in loaded list, try to fetch it from API
                    if (window.DatabaseAPI?.getProject) {
                        try {
                            routeCheckInProgressRef.current = true;
                            lastProcessedProjectIdRef.current = projectId; // Set early to prevent duplicate processing
                            const response = await window.DatabaseAPI.getProject(projectId);
                            const projectData = response?.data?.project || response?.project;
                            if (projectData) {
                                const fetchedProject = {
                                    ...projectData,
                                    client: projectData.clientName || projectData.client || ''
                                };
                                // Add to projects array
                                setProjects(prev => {
                                    const exists = prev.find(p => String(p.id) === String(projectId));
                                    if (!exists) {
                                        return [...prev, fetchedProject];
                                    }
                                    return prev;
                                });
                                // Open the project immediately
                                setViewingProject(fetchedProject);
                                setShowModal(false);
                                setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                                
                                // Update URL to include task parameter if present
                                if (taskId && window.RouteState) {
                                    updateProjectUrl(projectId, { task: taskId });
                                }
                                
                                if (taskId) {
                                    dispatchOpenTaskWithRetry(taskId);
                                }
                                return;
                            } else {
                                // Reset ref if fetch failed
                                lastProcessedProjectIdRef.current = null;
                            }
                        } catch (error) {
                            console.error('❌ Projects: Failed to fetch project from API:', error);
                            // Reset ref on error
                            lastProcessedProjectIdRef.current = null;
                            setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                        }
                    }
                }
            }
        };
        
        // Try immediately
        tryOpenProjectFromRoute();
    }, [projects]); // Only run when projects load - removed viewingProject to prevent infinite loops

    // Check route after projects are loaded to open project from URL
    useEffect(() => {
        if (routeCheckInProgressRef.current) {
            return;
        }
        
        // Wait for RouteState to be available
        if (!window.RouteState) {
            const retryTimeout = setTimeout(() => {
                if (window.RouteState && !routeCheckInProgressRef.current) {
                    // Re-trigger this effect by checking again
                    const currentRoute = window.RouteState.getRoute();
                    if (currentRoute?.page === 'projects' && currentRoute.segments && currentRoute.segments.length > 0) {
                        // Process route if projects are loaded
                        if (projects.length > 0) {
                            const projectId = currentRoute.segments[0];
                            const taskId = currentRoute.search?.get('task');
                            const projectToOpen = projects.find(p => String(p.id) === String(projectId));
                            if (projectToOpen && (!viewingProject || String(viewingProject.id) !== String(projectId))) {
                                // Prevent processing the same project multiple times
                                if (lastProcessedProjectIdRef.current === projectId) {
                                    return;
                                }
                                routeCheckInProgressRef.current = true;
                                lastProcessedProjectIdRef.current = projectId;
                                
                                // CRITICAL: Always refresh from database to ensure we have latest data
                                if (window.DatabaseAPI?.getProject) {
                                    window.DatabaseAPI.getProject(projectId)
                                        .then(response => {
                                            const freshProjectData = response?.data?.project || response?.project || response?.data;
                                            if (freshProjectData) {
                                                const normalizedProject = {
                                                    ...freshProjectData,
                                                    client: freshProjectData.clientName || freshProjectData.client || ''
                                                };
                                                setProjects(prev => prev.map(p => String(p.id) === String(projectId) ? normalizedProject : p));
                                                setViewingProject(normalizedProject);
                                                setShowModal(false);
                                                setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                                                if (taskId) {
                                                    setTimeout(() => {
                                                        window.dispatchEvent(new CustomEvent('openTask', {
                                                            detail: { taskId: taskId, tab: 'details' }
                                                        }));
                                                    }, 1500);
                                                }
                                            } else {
                                                setViewingProject(projectToOpen);
                                                setShowModal(false);
                                                setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                                            }
                                        })
                                        .catch(() => {
                                            setViewingProject(projectToOpen);
                                            setShowModal(false);
                                            setTimeout(() => { routeCheckInProgressRef.current = false; }, 100);
                                        });
                                } else {
                                    setViewingProject(projectToOpen);
                                    setShowModal(false);
                                }
                            }
                        }
                    }
                }
            }, 500);
            return () => clearTimeout(retryTimeout);
        }
        
        const currentRoute = window.RouteState.getRoute();
        console.log('🔍 Projects: Checking route, projects loaded:', projects.length, 'route:', currentRoute);
        
        // Get project ID from route or sessionStorage
        let projectId = null;
        let taskId = null;
        
        if (currentRoute?.page === 'projects' && currentRoute.segments && currentRoute.segments.length > 0) {
            projectId = currentRoute.segments[0];
            taskId = currentRoute.search?.get('task');
        } else {
            // Check sessionStorage as fallback
            const storedProjectId = sessionStorage.getItem('openProjectId');
            const storedTaskId = sessionStorage.getItem('openTaskId');
            if (storedProjectId) {
                projectId = storedProjectId;
                taskId = storedTaskId;
                console.log('📦 Projects: Using project ID from sessionStorage:', projectId);
            }
        }
        
        if (!projectId) {
            console.log('⏸️ Projects: No project ID found in route or sessionStorage');
            return;
        }
        
        // Check if we're already viewing this project
        if (viewingProject && String(viewingProject.id) === String(projectId)) {
            // Already viewing - just handle task parameter if present
            if (taskId) {
                console.log('📋 Projects: Already viewing project, dispatching openTask for task:', taskId);
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('openTask', {
                        detail: { taskId: taskId, tab: 'details' }
                    }));
                }, 500);
            }
            return;
        }
        
        // If projects haven't loaded yet, store in sessionStorage and wait
        if (projects.length === 0) {
            console.log('⏸️ Projects: Projects not loaded yet, storing project ID in sessionStorage');
            if (projectId) {
                sessionStorage.setItem('openProjectId', projectId);
                if (taskId) {
                    sessionStorage.setItem('openTaskId', taskId);
                }
            }
            return;
        }
        
        // Find project in loaded projects
        let projectToOpen = projects.find(p => String(p.id) === String(projectId));
        
        // If project not found, try to fetch it from API
        if (!projectToOpen && window.DatabaseAPI?.getProject) {
            console.log('📡 Projects: Project not in loaded list, fetching from API...');
            window.DatabaseAPI.getProject(projectId)
                .then(response => {
                    const projectData = response?.data?.project || response?.project;
                    if (projectData) {
                        const fetchedProject = {
                            ...projectData,
                            client: projectData.clientName || projectData.client || ''
                        };
                        console.log('✅ Projects: Fetched project from API:', fetchedProject.name);
                        // Add to projects array
                        setProjects(prev => {
                            const exists = prev.find(p => String(p.id) === String(projectId));
                            if (!exists) {
                                return [...prev, fetchedProject];
                            }
                            return prev;
                        });
                        // Open the project
                        setViewingProject(fetchedProject);
                        setShowModal(false);
                        if (taskId) {
                            setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('openTask', {
                                    detail: { taskId: taskId, tab: 'details' }
                                }));
                            }, 2000);
                        }
                    }
                })
                .catch(error => {
                    console.error('❌ Projects: Failed to fetch project from API:', error);
                });
            // Return early - will open project in .then() above
            return;
        }
        
        if (projectToOpen) {
            console.log('✅ Projects: Found project, opening from URL:', projectToOpen.name);
            
            // CRITICAL: Always refresh from database to ensure we have latest data (especially hasWeeklyFMSReviewProcess)
            // This ensures that when navigating back, we get the updated project data
            if (window.DatabaseAPI?.getProject) {
                console.log('🔄 Projects: Refreshing project from database to ensure latest data...');
                window.DatabaseAPI.getProject(projectId)
                    .then(response => {
                        const freshProjectData = response?.data?.project || response?.project || response?.data;
                        if (freshProjectData) {
                            const normalizedProject = {
                                ...freshProjectData,
                                client: freshProjectData.clientName || freshProjectData.client || ''
                            };
                            console.log('✅ Projects: Refreshed project from database:', normalizedProject.name, {
                                hasWeeklyFMSReviewProcess: normalizedProject.hasWeeklyFMSReviewProcess,
                                hasWeeklyFMSReviewProcessType: typeof normalizedProject.hasWeeklyFMSReviewProcess,
                                rawValue: freshProjectData.hasWeeklyFMSReviewProcess
                            });
                            
                            // Update projects array with fresh data
                            setProjects(prev => {
                                const exists = prev.find(p => String(p.id) === String(projectId));
                                if (exists) {
                                    return prev.map(p => String(p.id) === String(projectId) ? normalizedProject : p);
                                }
                                return [...prev, normalizedProject];
                            });
                            
                            // Set viewingProject with fresh data
                            setViewingProject(normalizedProject);
                            setShowModal(false);
                            
                            // Handle task opening if specified
                            if (taskId) {
                                console.log('📋 Projects: Task ID found in route, will open task:', taskId);
                                setTimeout(() => {
                                    console.log('📋 Projects: Dispatching openTask event for task:', taskId);
                                    window.dispatchEvent(new CustomEvent('openTask', {
                                        detail: { 
                                            taskId: taskId,
                                            tab: 'details'
                                        }
                                    }));
                                }, 2000); // Give ProjectDetail time to load
                            }
                        } else {
                            // Fallback to cached project if refresh fails
                            console.warn('⚠️ Projects: Failed to get fresh project data, using cached:', projectToOpen.name);
                            setViewingProject(projectToOpen);
                            setShowModal(false);
                        }
                    })
                    .catch(error => {
                        console.error('❌ Projects: Failed to refresh project from database, using cached:', error);
                        // Fallback to cached project if refresh fails
                        setViewingProject(projectToOpen);
                        setShowModal(false);
                    });
            } else {
                // Fallback if DatabaseAPI not available
                console.log('⚠️ Projects: DatabaseAPI not available, using cached project');
                setViewingProject(projectToOpen);
                setShowModal(false);
            }
        } else {
            console.log('⚠️ Projects: Project not found in loaded projects and API fetch failed, route:', projectId, 'Available project IDs:', projects.map(p => p.id));
        }
    }, [projects, viewingProject]); // Run when projects load or viewingProject changes

    // Update handleViewProject ref when it's defined (after component fully renders)
    useEffect(() => {
        // Set the ref after a short delay to ensure handleViewProject is defined
        const timer = setTimeout(() => {
            if (typeof handleViewProject === 'function') {
                handleViewProjectRef.current = handleViewProject;
                console.log('✅ Projects: handleViewProject ref set');
            }
        }, 100);
        return () => clearTimeout(timer);
    }, []); // Only run once after component mounts

    // Proactively load ProjectDetail component when Projects component mounts
    useEffect(() => {
        // Check if already available
        if (window.ProjectDetail) {
            setProjectDetailAvailable(true);
            return;
        }
        
        // Wait a bit for lazy loader to finish, then check again
        const checkForProjectDetail = () => {
            if (window.ProjectDetail) {
                setProjectDetailAvailable(true);
                return true;
            }
            return false;
        };
        
        // Check immediately
        if (checkForProjectDetail()) return;
        
        // Wait for lazy loader to complete (max 3 seconds)
        let attempts = 0;
        const maxAttempts = 30;
        const checkInterval = setInterval(() => {
            attempts++;
            if (checkForProjectDetail() || attempts >= maxAttempts) {
                clearInterval(checkInterval);
                if (!window.ProjectDetail && attempts >= maxAttempts) {
                    // Try to load manually
                    loadProjectDetail().catch(err => {
                        console.warn('⚠️ Projects: Failed to proactively load ProjectDetail (will retry when needed):', err.message);
                    });
                }
            }
        }, 100);
        
        return () => clearInterval(checkInterval);
    }, []); // Only run once on mount

    // BULLETPROOF ProjectDetail loader with multiple strategies and retries
    const loadProjectDetail = async (retryCount = 0) => {
        const maxRetries = 3;
        
        if (window.ProjectDetail) {
            setProjectDetailAvailable(true);
            return true;
        }
        
        // Strategy 0: Wait for existing script to finish
        const existingScript = document.querySelector(`script[src*="ProjectDetail.js"]`);
        if (existingScript && !existingScript.complete) {
            return new Promise((resolve) => {
                let attempts = 0;
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (window.ProjectDetail) {
                        setProjectDetailAvailable(true);
                        clearInterval(checkInterval);
                        resolve(true);
                    } else if (attempts >= 100) { // Wait up to 10 seconds
                        console.warn('⚠️ ProjectDetail script loaded but component not registered after 10s');
                        clearInterval(checkInterval);
                        // Continue to next strategy
                        resolve(loadProjectDetail(retryCount + 1));
                    }
                }, 100);
            });
        }
        
        // Strategy 1: Try blob URL method (most reliable)
        const tryBlobMethod = async (path) => {
            try {
                const response = await fetch(path, { cache: 'no-cache' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const text = await response.text();
                if (text.trim().startsWith('<') || text.trim().startsWith('<!DOCTYPE')) {
                    throw new Error('Response is HTML (404 page)');
                }
                
                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.async = false;
                
                const blob = new Blob([text], { type: 'application/javascript' });
                const blobUrl = URL.createObjectURL(blob);
                script.src = blobUrl;
                
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        URL.revokeObjectURL(blobUrl);
                        reject(new Error('Timeout after 8 seconds'));
                    }, 8000);
                    
                    let attempts = 0;
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (window.ProjectDetail) {
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            URL.revokeObjectURL(blobUrl);
                            setProjectDetailAvailable(true);
                            resolve(true);
                        } else if (attempts >= 80) {
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            URL.revokeObjectURL(blobUrl);
                            reject(new Error('Not registered after 8 seconds'));
                        }
                    }, 100);
                    
                    script.onerror = (error) => {
                        URL.revokeObjectURL(blobUrl);
                        clearTimeout(timeout);
                        clearInterval(checkInterval);
                        reject(new Error(`Script execution error: ${error.message || 'Unknown'}`));
                    };
                    
                    document.head.appendChild(script);
                });
            } catch (error) {
                throw new Error(`Blob method failed: ${error.message}`);
            }
        };
        
        // Strategy 2: Direct script tag (fallback)
        const tryDirectMethod = async (path) => {
            try {
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = path;
                    script.type = 'text/javascript';
                    script.async = false;
                    
                    const timeout = setTimeout(() => {
                        script.remove();
                        reject(new Error('Timeout after 8 seconds'));
                    }, 8000);
                    
                    let attempts = 0;
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (window.ProjectDetail) {
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            setProjectDetailAvailable(true);
                            resolve(true);
                        } else if (attempts >= 80) {
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            script.remove();
                            reject(new Error('Not registered after 8 seconds'));
                        }
                    }, 100);
                    
                    script.onload = () => {
                        // Check again after script loads
                        setTimeout(() => {
                            if (window.ProjectDetail) {
                                clearTimeout(timeout);
                                clearInterval(checkInterval);
                                setProjectDetailAvailable(true);
                                resolve(true);
                            }
                        }, 200);
                    };
                    
                    script.onerror = () => {
                        clearTimeout(timeout);
                        clearInterval(checkInterval);
                        script.remove();
                        reject(new Error('Script load failed'));
                    };
                    
                    document.head.appendChild(script);
                });
            } catch (error) {
                throw new Error(`Direct method failed: ${error.message}`);
            }
        };
        
        // Try multiple paths
        const paths = [
            './dist/src/components/projects/ProjectDetail.js',
            '/dist/src/components/projects/ProjectDetail.js',
            `${window.location.origin}/dist/src/components/projects/ProjectDetail.js`
        ];
        
        for (const path of paths) {
            // Try blob method first
            try {
                const result = await tryBlobMethod(path);
                if (result) return true;
            } catch (blobError) {
                console.warn(`⚠️ Blob method failed for ${path}:`, blobError.message);
                
                // Try direct method
                try {
                    const result = await tryDirectMethod(path);
                    if (result) return true;
                } catch (directError) {
                    console.warn(`⚠️ Direct method failed for ${path}:`, directError.message);
                }
            }
        }
        
        // If all strategies failed and we have retries left, wait and retry
        if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return loadProjectDetail(retryCount + 1);
        }
        
        console.error('❌ All ProjectDetail loading strategies exhausted');
        return false;
    };
    
    // Wait for ProjectDetail component to load if it's not available yet
    useEffect(() => {
        // Check immediately
        if (window.ProjectDetail) {
            setProjectDetailAvailable(true);
            setWaitingForProjectDetail(false);
            return;
        }
        
        if (viewingProject) {
            setWaitingForProjectDetail(true);
            let checkInterval = null;
            let cancelled = false;
            
            // Try to actively load it first
            loadProjectDetail().then(success => {
                if (cancelled) return;
                if (success) {
                    setWaitingForProjectDetail(false);
                    // Removed forced re-render - React will re-render automatically
                } else {
                    // Fall back to polling
                    let checkCount = 0;
                    const maxChecks = 50; // 5 seconds total (50 * 100ms)
                    
                    checkInterval = setInterval(() => {
                        if (cancelled) {
                            clearInterval(checkInterval);
                            return;
                        }
                        checkCount++;
                        if (window.ProjectDetail) {
                            setProjectDetailAvailable(true);
                            setWaitingForProjectDetail(false);
                            clearInterval(checkInterval);
                            // Removed forced re-render - React will re-render automatically
                        } else if (checkCount >= maxChecks) {
                            setWaitingForProjectDetail(false);
                            clearInterval(checkInterval);
                        }
                    }, 100);
                }
            });
            
            return () => {
                cancelled = true;
                if (checkInterval) clearInterval(checkInterval);
            };
        }
    }, [viewingProject]);
    
    // BULLETPROOF: Listen for when ProjectDetail loads globally and force re-render
    useEffect(() => {
        const checkProjectDetail = () => {
            if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                if (!projectDetailAvailable) {
                    setProjectDetailAvailable(true);
                    setWaitingForProjectDetail(false);
                    setForceRender(prev => prev + 1);
                }
                // Force a re-render by updating state if we're viewing a project
                if (viewingProject) {
                    // Trigger a state update to force re-render
                    setViewingProject({ ...viewingProject });
                    setForceRender(prev => prev + 1);
                }
            }
        };
        
        // Check immediately
        checkProjectDetail();
        
        // Check periodically even when not viewing a project
        // Use longer interval (1 second) to reduce performance impact
        const interval = setInterval(checkProjectDetail, 1000);
        
        // Also check on window load events
        window.addEventListener('load', checkProjectDetail);
        
        // Listen for custom event when components are loaded
        const handleComponentLoaded = (event) => {
            if (event.detail && event.detail.component === 'ProjectDetail') {
                checkProjectDetail();
                setForceRender(prev => prev + 1);
            }
        };
        window.addEventListener('componentLoaded', handleComponentLoaded);
        
        return () => {
            clearInterval(interval);
            window.removeEventListener('load', checkProjectDetail);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, [projectDetailAvailable, viewingProject]);

    // Helper function to sync existing projects with clients
    // This is a non-critical operation - failures won't crash the component
    const syncProjectsWithClients = async (projectsList) => {
        try {
            // Don't sync if clients API is failing - skip silently to prevent crashes
            if (!window.dataService) {
                return;
            }
            
            if (typeof window.dataService.getClients !== 'function' || typeof window.dataService.setClients !== 'function') {
                return;
            }
            
            // Try to get clients with timeout and error handling
            const getClientsPromise = window.dataService.getClients();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Client sync timeout')), 5000)
            );
            
            const clients = await Promise.race([getClientsPromise, timeoutPromise]).catch(error => {
                // If clients API fails, just skip the sync - don't crash
                console.warn('⚠️ Projects: Failed to get clients for sync (non-critical):', error.message);
                return null;
            });
            
            if (!clients || !Array.isArray(clients)) {
                return;
            }
            
            const updatedClients = clients.map(client => {
                const clientProjects = projectsList.filter(p => p.client === client.name || p.clientName === client.name);
                const projectIds = clientProjects.map(p => p.id);
                return {
                    ...client,
                    projectIds: projectIds
                };
            });
            
            await window.dataService.setClients(updatedClients).catch(err => {
                console.warn('⚠️ Projects: Failed to save clients (non-critical):', err.message);
            });
            
            // Dispatch event to notify other components (optional, non-blocking)
            try {
                window.dispatchEvent(new CustomEvent('clientsUpdated'));
            } catch (eventError) {
                console.warn('⚠️ Projects: Failed to dispatch clientsUpdated event:', eventError);
            }
        } catch (error) {
            // This is a non-critical operation - log but don't throw
            console.warn('⚠️ Projects: Error syncing projects with clients (non-critical):', error.message);
            // Don't rethrow - we want this to fail silently
        }
    };
    
    // Note: Projects are database-first, so we don't need to save them back to dataService
    // Individual project saves are handled by handleSaveProject which directly updates the database

    // Helper function to count all nested subtasks
    const countAllSubtasks = (subtasks) => {
        if (!subtasks || subtasks.length === 0) return 0;
        let count = subtasks.length;
        subtasks.forEach(st => {
            if (st.subtasks && st.subtasks.length > 0) {
                count += countAllSubtasks(st.subtasks);
            }
        });
        return count;
    };

    const handleAddProject = useCallback(() => {
        setSelectedProject(null);
        setShowModal(true);
    }, []);

    const handleEditProject = async (project) => {
        try {
            // Fetch full project data for editing
            // Always use safe fallback approach to avoid function errors
            let response;
            
            // Safely check and use DatabaseAPI.getProject
            try {
                if (window.DatabaseAPI && 
                    window.DatabaseAPI.getProject && 
                    typeof window.DatabaseAPI.getProject === 'function') {
                    response = await window.DatabaseAPI.getProject(project.id);
                } else {
                    throw new Error('DatabaseAPI.getProject not available');
                }
            } catch (apiError) {
                // Try window.api.getProject as fallback
                try {
                    if (window.api && 
                        window.api.getProject && 
                        typeof window.api.getProject === 'function') {
                        response = await window.api.getProject(project.id);
                    } else {
                        throw new Error('window.api.getProject not available');
                    }
                } catch (api2Error) {
                    // Final fallback: fetch directly
                    const fetchResponse = await fetch(`/api/projects/${project.id}`, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
                        }
                    });
                    if (!fetchResponse.ok) {
                        throw new Error(`HTTP error! status: ${fetchResponse.status}`);
                    }
                    const data = await fetchResponse.json();
                    response = { data: { project: data.project || data.data || data } };
                }
            }
            const fullProject = response?.data?.project || response?.project || response?.data;
            
            if (!fullProject) {
                throw new Error('Failed to fetch project details');
            }
            
            // Normalize client field
            const normalizedProject = {
                ...fullProject,
                client: fullProject.clientName || fullProject.client || ''
            };
            
            setSelectedProject(normalizedProject);
            setShowModal(true);
        } catch (error) {
            console.error('Error loading project for editing:', error);
            alert('Error loading project: ' + error.message);
        }
    };

    const handleViewProject = async (project) => {
        console.log('🔵 handleViewProject called with project:', project?.id, project?.name);
        
        // Prevent duplicate calls for the same project within 500ms
        const now = Date.now();
        const projectId = project?.id;
        if (projectId && 
            lastHandleViewProjectCallRef.current.projectId === projectId && 
            now - lastHandleViewProjectCallRef.current.timestamp < 500) {
            console.log('⚠️ handleViewProject: Ignoring duplicate call for project:', projectId);
            return;
        }
        lastHandleViewProjectCallRef.current = { projectId, timestamp: now };
        
        // Update ref so it can be accessed from other useEffects
        handleViewProjectRef.current = handleViewProject;
        
        // BULLETPROOF: ALWAYS check if ProjectDetail is loaded AND initialized
        // The lazy loader might say it's loaded, but initialization might still be waiting for dependencies
        if (!window.ProjectDetail || typeof window.ProjectDetail !== 'function') {
            
            // Reset the flag if component isn't actually available
            if (projectDetailAvailable) {
                console.warn('⚠️ projectDetailAvailable flag is true but component not loaded - resetting flag');
                setProjectDetailAvailable(false);
            }
            
            setWaitingForProjectDetail(true);
            
            // BULLETPROOF: Try multiple strategies to load ProjectDetail
            // Strategy 1: Wait for initialization to complete (up to 5 seconds)
            // ProjectDetail might be loading but waiting for dependencies
            let loaded = false;
            for (let i = 0; i < 50; i++) {
                if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                    loaded = true;
                    break;
                }
                // Check if it's still initializing
                if (window._projectDetailInitializing) {
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Strategy 2: Use the bulletproof loader
            if (!loaded) {
                loaded = await loadProjectDetail();
            }
            
            // Strategy 3: Direct script injection as fallback
            if (!loaded && (!window.ProjectDetail || typeof window.ProjectDetail !== 'function')) {
                loaded = await new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.src = '/dist/src/components/projects/ProjectDetail.js';
                    script.async = true;
                    script.onload = () => {
                        // Wait for initialization to complete (up to 5 seconds)
                        let initAttempts = 0;
                        const checkInit = setInterval(() => {
                            initAttempts++;
                            if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                                clearInterval(checkInit);
                                resolve(true);
                            } else if (initAttempts >= 50) {
                                console.warn('⚠️ Direct script loaded but ProjectDetail not initialized after 5s');
                                clearInterval(checkInit);
                                resolve(false);
                            }
                        }, 100);
                    };
                    script.onerror = () => {
                        console.error('❌ Direct script injection failed');
                        resolve(false);
                    };
                    document.body.appendChild(script);
                });
            }
            
            if (loaded && window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
                setForceRender(prev => prev + 1);
            } else {
                console.error('❌ handleViewProject: ProjectDetail failed to load after all strategies');
                console.error('🔍 Final check - window.ProjectDetail:', typeof window.ProjectDetail);
                console.error('🔍 Initialization state:', window._projectDetailInitializing);
                console.error('🔍 Available components:', Object.keys(window).filter(k => k.includes('Project')));
                setWaitingForProjectDetail(false);
                alert('Failed to load ProjectDetail component. Please refresh the page.');
                return;
            }
        } else {
            // Component exists, ensure flag is set
            if (!projectDetailAvailable) {
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
            }
        }
        
        try {
            // Fetch full project data from API for detail view
            // Always use safe fallback approach to avoid function errors
            let response;
            
            // Safely check and use DatabaseAPI.getProject
            try {
                if (window.DatabaseAPI && 
                    window.DatabaseAPI.getProject && 
                    typeof window.DatabaseAPI.getProject === 'function') {
                    response = await window.DatabaseAPI.getProject(project.id);
                } else {
                    throw new Error('DatabaseAPI.getProject not available');
                }
            } catch (apiError) {
                console.warn('⚠️ DatabaseAPI.getProject failed, trying fallback:', apiError);
                // Try window.api.getProject as fallback
                try {
                    if (window.api && 
                        window.api.getProject && 
                        typeof window.api.getProject === 'function') {
                        response = await window.api.getProject(project.id);
                    } else {
                        throw new Error('window.api.getProject not available');
                    }
                } catch (api2Error) {
                    console.warn('⚠️ window.api.getProject failed, trying direct fetch:', api2Error);
                    // Final fallback: fetch directly
                    try {
                        // Get token from proper storage location
                        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || '';
                        const fetchResponse = await fetch(`/api/projects/${project.id}`, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': token ? `Bearer ${token}` : ''
                            }
                        });
                        if (!fetchResponse.ok) {
                            const errorText = await fetchResponse.text();
                            let errorData;
                            try {
                                errorData = JSON.parse(errorText);
                            } catch {
                                errorData = { message: errorText || `HTTP ${fetchResponse.status}` };
                            }
                            throw new Error(`HTTP error! status: ${fetchResponse.status}, message: ${errorData.message || errorData.error || 'Unknown error'}`);
                        }
                        const data = await fetchResponse.json();
                        response = { data: { project: data.project || data.data || data } };
                    } catch (fetchError) {
                        console.error('❌ All project fetch methods failed:', {
                            apiError: apiError.message,
                            api2Error: api2Error.message,
                            fetchError: fetchError.message,
                            projectId: project.id
                        });
                        throw new Error(`Failed to fetch project: ${fetchError.message || apiError.message || 'Unknown error'}`);
                    }
                }
            }
            const fullProject = response?.data?.project || response?.project || response?.data;
            
            if (!fullProject) {
                throw new Error('Failed to fetch project details');
            }
            
            // Parse JSON string fields from database before passing to ProjectDetail
            const normalizedProject = {
                ...fullProject,
                client: fullProject.clientName || fullProject.client || '',
                // All data now comes from tables via API, not JSON fields - use arrays directly
                taskLists: Array.isArray(fullProject.taskLists) ? fullProject.taskLists : [],
                tasks: Array.isArray(fullProject.tasksList) ? fullProject.tasksList : (Array.isArray(fullProject.tasks) ? fullProject.tasks : []),
                customFieldDefinitions: Array.isArray(fullProject.customFieldDefinitions) ? fullProject.customFieldDefinitions : [],
                documents: Array.isArray(fullProject.documents) ? fullProject.documents : [],
                comments: Array.isArray(fullProject.comments) ? fullProject.comments : [],
                activityLog: Array.isArray(fullProject.activityLog) ? fullProject.activityLog : [],
                team: Array.isArray(fullProject.team) ? fullProject.team : [],
                // Ensure hasDocumentCollectionProcess is properly included (boolean from database)
                // Handle both boolean and string values from database - normalize to boolean
                hasDocumentCollectionProcess: (() => {
                    const value = fullProject.hasDocumentCollectionProcess;
                    if (value === true || value === 'true' || value === 1) return true;
                    if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
                    return false;
                })(),
                // Ensure hasWeeklyFMSReviewProcess is properly included
                hasWeeklyFMSReviewProcess: (() => {
                    const value = fullProject.hasWeeklyFMSReviewProcess;
                    if (value === true || value === 'true' || value === 1) return true;
                    if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
                    return false;
                })(),
                weeklyFMSReviewSections: Array.isArray(fullProject.weeklyFMSReviewSections) ? fullProject.weeklyFMSReviewSections : []
            };
            
            // Expose a function to update viewingProject from child components
            // This allows ProjectDetail to refresh the project data after saving
            window.updateViewingProject = (updatedProject) => {
                // Skip update if skipDocumentSectionsUpdate flag is set (prevents remounting during auto-save)
                if (updatedProject.skipDocumentSectionsUpdate) {
                    return;
                }
                
                
                // Normalize the project the same way we do in handleViewProject
                // All data now comes from tables via API, not JSON fields - use arrays directly
                const normalized = {
                    ...updatedProject,
                    client: updatedProject.clientName || updatedProject.client || '',
                    taskLists: Array.isArray(updatedProject.taskLists) ? updatedProject.taskLists : [],
                    tasks: Array.isArray(updatedProject.tasksList) ? updatedProject.tasksList : (Array.isArray(updatedProject.tasks) ? updatedProject.tasks : []),
                    customFieldDefinitions: Array.isArray(updatedProject.customFieldDefinitions) ? updatedProject.customFieldDefinitions : [],
                    documents: Array.isArray(updatedProject.documents) ? updatedProject.documents : [],
                    comments: Array.isArray(updatedProject.comments) ? updatedProject.comments : [],
                    activityLog: Array.isArray(updatedProject.activityLog) ? updatedProject.activityLog : [],
                    team: Array.isArray(updatedProject.team) ? updatedProject.team : [],
                    documentSections: Array.isArray(updatedProject.documentSections) ? updatedProject.documentSections : [],
                    hasDocumentCollectionProcess: (() => {
                        const value = updatedProject.hasDocumentCollectionProcess;
                        if (value === true || value === 'true' || value === 1) return true;
                        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
                        return false;
                    })(),
                    hasWeeklyFMSReviewProcess: (() => {
                        const value = updatedProject.hasWeeklyFMSReviewProcess;
                        if (value === true || value === 'true' || value === 1) return true;
                        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
                        return false;
                    })(),
                    weeklyFMSReviewSections: Array.isArray(updatedProject.weeklyFMSReviewSections) ? updatedProject.weeklyFMSReviewSections : []
                };
                
                // Use smart comparison to prevent unnecessary re-renders
                setViewingProject(prev => {
                    if (!prev || prev.id !== normalized.id) {
                        return normalized;
                    }
                    // Compare important fields to see if anything actually changed
                    const importantFields = ['name', 'client', 'status', 'hasDocumentCollectionProcess', 'hasWeeklyFMSReviewProcess', 'tasks', 'taskLists', 'customFieldDefinitions', 'documents', 'weeklyFMSReviewSections'];
                    const hasChanges = importantFields.some(field => {
                        const prevValue = prev[field];
                        const newValue = normalized[field];
                        return JSON.stringify(prevValue) !== JSON.stringify(newValue);
                    });
                    
                    if (!hasChanges) {
                        return prev; // Return previous object to prevent re-render
                    }
                    
                    // Also update the projects array to keep it in sync
                    setProjects(prevProjects => {
                        return prevProjects.map(p => {
                            if (String(p.id) === String(normalized.id)) {
                                return normalized;
                            }
                            return p;
                        });
                    });
                    
                    return normalized;
                });
            };
            
            // Update URL FIRST, before setting viewingProject
            // This ensures URL is updated even if ProjectDetail isn't loaded yet
            // Wait for RouteState if not immediately available (it loads asynchronously)
            const updateUrl = async () => {
                if (normalizedProject.id) {
                    // Wait up to 2 seconds for RouteState to load
                    let attempts = 0;
                    while (!window.RouteState && attempts < 20) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        attempts++;
                    }
                    
                    if (window.RouteState) {
                        console.log('🔗 Updating URL for project:', normalizedProject.id);
                        try {
                            window.RouteState.setPageSubpath('projects', [String(normalizedProject.id)], {
                                replace: false,
                                preserveSearch: false,
                                preserveHash: false
                            });
                            console.log('✅ URL updated to:', window.location.pathname);
                        } catch (error) {
                            console.error('❌ Error updating URL:', error);
                        }
                    } else if (window.EntityUrl) {
                        // Fallback to EntityUrl if RouteState not available after waiting
                        console.log('⚠️ RouteState not available after waiting, using EntityUrl fallback');
                        window.EntityUrl.navigateToEntity('project', String(normalizedProject.id));
                    } else {
                        console.warn('⚠️ Neither RouteState nor EntityUrl available for URL update');
                    }
                }
            };
            // Fire and forget - but catch errors to prevent unhandled promise rejections
            updateUrl().catch(error => {
                console.error('❌ Error in updateUrl (non-critical):', error);
            });
            
            // Only set viewingProject if ProjectDetail is available
            if (window.ProjectDetail) {
                // Only update if the project actually changed (prevent unnecessary re-renders)
                setViewingProject(prev => {
                    // If it's the same project ID, check if data actually changed
                    if (prev && prev.id === normalizedProject.id) {
                        // Compare important fields to see if anything actually changed
                        const importantFields = ['name', 'client', 'status', 'hasDocumentCollectionProcess', 'hasWeeklyFMSReviewProcess', 'tasks', 'taskLists', 'documentSections', 'weeklyFMSReviewSections', 'customFieldDefinitions', 'documents'];
                        const hasChanges = importantFields.some(field => {
                            const prevValue = prev[field];
                            const newValue = normalizedProject[field];
                            return JSON.stringify(prevValue) !== JSON.stringify(newValue);
                        });
                        
                        if (!hasChanges) {
                            return prev; // Return previous object to prevent re-render
                        }
                    } else {
                    }
                    return { ...normalizedProject };
                });
            } else {
                console.error('❌ ProjectDetail still not available after loading attempt');
                console.error('🔍 Debug info:', {
                    windowProjectDetail: typeof window.ProjectDetail,
                    projectDetailAvailable: projectDetailAvailable,
                    waitingForProjectDetail: waitingForProjectDetail,
                    lazyLoaderComplete: !!document.querySelector('script[src*="lazy-load-components"]'),
                    availableComponents: Object.keys(window).filter(key => key.includes('Project') || key.includes('Detail'))
                });
                // Still set viewingProject so the loading UI can show
                setViewingProject(prev => {
                    // Only update if it's a different project
                    if (prev && prev.id === normalizedProject.id) {
                        return prev;
                    }
                    return normalizedProject;
                });
                
                // Update URL even if ProjectDetail isn't loaded yet
                if (window.RouteState && normalizedProject.id) {
                    console.log('🔗 Updating URL for project (ProjectDetail not loaded yet):', normalizedProject.id);
                    window.RouteState.setPageSubpath('projects', [String(normalizedProject.id)], {
                        replace: false,
                        preserveSearch: false,
                        preserveHash: false
                    });
                    console.log('✅ URL updated to:', window.location.pathname);
                }
                // The render will show the loading state
            }
        } catch (error) {
            console.error('❌ Error in handleViewProject:', {
                error: error.message,
                stack: error.stack,
                projectId: project?.id,
                projectName: project?.name
            });
            // Prevent unhandled promise rejection - wrap all operations
            try {
                // Use setTimeout to ensure alert doesn't block and cause issues
                setTimeout(() => {
                    try {
                        alert('Error opening project: ' + (error.message || 'Unknown error occurred'));
                    } catch (alertError) {
                        console.error('❌ Failed to show error alert:', alertError);
                    }
                }, 0);
            } catch (alertError) {
                console.error('❌ Failed to schedule error alert:', alertError);
            }
            // Reset state on error - wrap in try-catch to prevent errors
            try {
                setWaitingForProjectDetail(false);
            } catch (stateError) {
                console.error('❌ Failed to reset waiting state:', stateError);
            }
        }
    };

    // Helper function to update client's projectIds - must be defined before handleSaveProject
    const updateClientProjectIds = useCallback(async (oldClientName, newClientName, projectId) => {
        try {
            if (window.dataService && typeof window.dataService.getClients === 'function' && typeof window.dataService.setClients === 'function') {
                const clients = await window.dataService.getClients() || [];
                const updatedClients = clients.map(client => {
                    if (oldClientName && client.name === oldClientName) {
                        // Remove project from old client
                        return {
                            ...client,
                            projectIds: Array.isArray(client.projectIds) ? client.projectIds.filter(id => id !== projectId) : []
                        };
                    }
                    if (newClientName && client.name === newClientName) {
                        // Add project to new client
                        const projectIds = client.projectIds || [];
                        if (!projectIds.includes(projectId)) {
                            return {
                                ...client,
                                projectIds: [...projectIds, projectId]
                            };
                        }
                    }
                    return client;
                });
                await window.dataService.setClients(updatedClients);
                
                // Dispatch event to notify other components
                window.dispatchEvent(new CustomEvent('clientsUpdated'));
            } else {
                console.warn('DataService not available for updating client project IDs');
            }
        } catch (error) {
            console.error('Error updating client project IDs:', error);
        }
    }, []);

    const handleSaveProject = useCallback(async (projectData) => {
        
        // Validate required fields
        if (!projectData || !projectData.name || projectData.name.trim() === '') {
            console.error('❌ Invalid project data:', projectData);
            alert('Project name is required');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ Projects: No authentication token found - logging out');
                await logout();
                window.location.hash = '#/login';
                return;
            }

            if (selectedProject) {
                // Editing existing project
                const updatedProject = { ...selectedProject, ...projectData };
                const apiResponse = await window.DatabaseAPI.updateProject(selectedProject.id, updatedProject);
                
                // Extract the project from the response structure { data: { project: {...} } }
                const updatedProjectFromAPI = apiResponse?.data?.project || apiResponse?.project || apiResponse?.data;
                
                if (updatedProjectFromAPI && updatedProjectFromAPI.id) {
                    // Normalize: map clientName to client for frontend compatibility
                    const normalizedProject = {
                        ...updatedProjectFromAPI,
                        client: updatedProjectFromAPI.clientName || updatedProjectFromAPI.client || ''
                    };
                    const updatedProjects = projects.map(p => 
                        p.id === selectedProject.id ? normalizedProject : p
                    );
                    setProjects(updatedProjects);
                } else {
                    console.error('❌ API did not return updated project, using local update');
                    const updatedProjects = projects.map(p => 
                        p.id === selectedProject.id ? updatedProject : p
                    );
                    setProjects(updatedProjects);
                }
                
                // Update client's projectIds if client changed
                if (projectData.client && projectData.client !== selectedProject.client) {
                    updateClientProjectIds(selectedProject.client, projectData.client, selectedProject.id);
                }
            } else {
                // Creating new project
                const newProject = {
                    name: projectData.name,
                    clientName: projectData.client || '',
                    description: projectData.description || '',
                    type: projectData.type || 'Monthly Review',
                    status: projectData.status || 'Active',
                    startDate: projectData.startDate && projectData.startDate.trim() !== '' ? projectData.startDate : new Date().toISOString(),
                    dueDate: projectData.dueDate && projectData.dueDate.trim() !== '' ? projectData.dueDate : null,
                    assignedTo: projectData.assignedTo || '',
                    budget: 0,
                    priority: 'Medium',
                    // JSON fields removed - data now stored in separate tables
                    // Frontend should use dedicated APIs to create these:
                    // - taskLists → /api/project-task-lists
                    // - customFieldDefinitions → /api/project-custom-fields
                    // - team → /api/project-team-members
                    tasksList: '[]', // Legacy - deprecated, use Task table
                    taskLists: '[]', // Legacy - deprecated, use ProjectTaskList table
                    customFieldDefinitions: '[]', // Legacy - deprecated, use ProjectCustomFieldDefinition table
                    team: '[]', // Legacy - deprecated, use ProjectTeamMember table
                    notes: ''
                };
                
                
                console.log('📤 Projects: Creating project with data:', {
                    name: newProject.name,
                    clientName: newProject.clientName,
                    hasName: !!newProject.name,
                    dataKeys: Object.keys(newProject)
                });
                
                const apiResponse = await window.DatabaseAPI.createProject(newProject);
                
                console.log('📥 Projects: API response received:', {
                    hasResponse: !!apiResponse,
                    responseKeys: apiResponse ? Object.keys(apiResponse) : [],
                    hasData: !!apiResponse?.data,
                    hasProject: !!apiResponse?.data?.project,
                    responseStructure: apiResponse
                });
                
                // Extract the project from the response structure { data: { project: {...} } }
                const savedProject = apiResponse?.data?.project || apiResponse?.project || apiResponse?.data;
                
                console.log('📦 Projects: Extracted project:', {
                    hasProject: !!savedProject,
                    hasId: !!savedProject?.id,
                    projectId: savedProject?.id,
                    projectName: savedProject?.name
                });
                
                if (savedProject && savedProject.id) {
                    // Normalize: map clientName to client for frontend compatibility
                    const normalizedProject = {
                        ...savedProject,
                        client: savedProject.clientName || savedProject.client || ''
                    };
                    console.log('✅ Projects: Project created successfully:', normalizedProject.name);
                    setProjects([...projects, normalizedProject]);
                    
                    // Update client's projectIds for new project
                    if (projectData.client) {
                        updateClientProjectIds(null, projectData.client, savedProject.id);
                    }
                } else {
                    console.error('❌ Projects: API did not return a valid project with id:', {
                        savedProject,
                        apiResponse,
                        responseStructure: {
                            'apiResponse?.data?.project': apiResponse?.data?.project,
                            'apiResponse?.project': apiResponse?.project,
                            'apiResponse?.data': apiResponse?.data
                        }
                    });
                    alert('Project created but failed to retrieve. Please refresh the page.');
                }
            }
            setShowModal(false);
            setSelectedProject(null);
        } catch (error) {
            console.error('❌ Projects: Error saving project:', {
                error,
                message: error.message,
                status: error.status,
                code: error.code,
                stack: error.stack,
                projectData: selectedProject ? 'editing' : 'creating',
                projectName: projectData?.name
            });
            
            // Provide more helpful error messages
            let errorMessage = 'Failed to save project';
            if (error.message) {
                errorMessage += ': ' + error.message;
            } else if (error.status) {
                errorMessage += ` (HTTP ${error.status})`;
            }
            
            alert(errorMessage);
        }
    }, [selectedProject, projects, logout, updateClientProjectIds]);

    const handleDeleteProject = useCallback(async (projectId) => {
        // Show confirmation modal instead of browser confirm
        setDeleteConfirmation({ show: true, projectId });
    }, [projects, viewingProject, logout, updateClientProjectIds]);
    
    const confirmDeleteProject = useCallback(async () => {
        const projectId = deleteConfirmation.projectId;
        if (!projectId) return;
        
        setDeleteConfirmation({ show: false, projectId: null });

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ Projects: No authentication token found - logging out');
                await logout();
                window.location.hash = '#/login';
                return;
            }

            const projectToDelete = projects.find(p => p.id === projectId);
            
            
            // Call the delete API
            const result = await window.DatabaseAPI.deleteProject(projectId);
            
            // Update local state - remove the deleted project
            setProjects(prevProjects => {
                const updated = prevProjects.filter(p => p.id !== projectId);
                return updated;
            });
            
            // If viewing the deleted project, close the detail view
            if (viewingProject && viewingProject.id === projectId) {
                setViewingProject(null);
            }
            
            // Remove project from client's projectIds
            if (projectToDelete && projectToDelete.client) {
                updateClientProjectIds(projectToDelete.client, null, projectId);
            }
            
            // Reload projects to ensure consistency
            const reloadProjects = async () => {
                try {
                    const response = await window.DatabaseAPI.getProjects();
                    let apiProjects = [];
                    if (response?.data?.projects) {
                        apiProjects = response.data.projects;
                    } else if (response?.projects) {
                        apiProjects = response.projects;
                    } else if (Array.isArray(response?.data)) {
                        apiProjects = response.data;
                    } else if (Array.isArray(response)) {
                        apiProjects = response;
                    }
                    const normalizedProjects = (Array.isArray(apiProjects) ? apiProjects : []).map(p => ({
                        ...p,
                        client: p.clientName || p.client || ''
                    }));
                    setProjects(normalizedProjects);
                } catch (reloadError) {
                    console.error('❌ Error reloading projects:', reloadError);
                }
            };
            
            // Small delay then reload
            setTimeout(reloadProjects, 500);
            
        } catch (error) {
            console.error('❌ Error deleting project:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                projectId: projectId
            });
            alert('Failed to delete project: ' + (error.message || 'Unknown error'));
        }
    }, [deleteConfirmation.projectId, projects, viewingProject, logout, updateClientProjectIds]);
    
    const cancelDeleteProject = useCallback(() => {
        setDeleteConfirmation({ show: false, projectId: null });
    }, []);

    // Get unique clients from projects - memoized
    const uniqueClients = useMemo(() => {
        return [...new Set(projects.map(p => p.client))].sort();
    }, [projects]);

    // Memoize client counts to avoid recalculating on every render
    const clientCounts = useMemo(() => {
        const counts = {};
        projects.forEach(p => {
            const client = p.client || '';
            counts[client] = (counts[client] || 0) + 1;
        });
        return counts;
    }, [projects]);

    // Debounce search term to reduce filter operations while typing
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300); // 300ms debounce delay

        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Filter projects by selected client, search term, status and sort alphabetically by client name - memoized
    const filteredProjects = useMemo(() => {
        const lowerSearchTerm = debouncedSearchTerm.toLowerCase();
        return projects.filter(p => {
            const matchesClient = selectedClient === 'all' || p.client === selectedClient;
            const matchesSearch = debouncedSearchTerm === '' || 
                p.name.toLowerCase().includes(lowerSearchTerm) ||
                (p.client || '').toLowerCase().includes(lowerSearchTerm) ||
                p.type.toLowerCase().includes(lowerSearchTerm) ||
                p.assignedTo?.toLowerCase().includes(lowerSearchTerm);
            const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
            return matchesClient && matchesSearch && matchesStatus;
        }).sort((a, b) => {
            const aClient = a.client || '';
            const bClient = b.client || '';
            return aClient.localeCompare(bClient);
        });
    }, [projects, selectedClient, debouncedSearchTerm, filterStatus]);

    // Function to render Progress Tracker
    const renderProgressTracker = () => {
        
        // Wrap in ErrorBoundary for additional safety
        // Use React.createElement to avoid JSX issues with window components
        const ErrorBoundary = window.ErrorBoundary || (({ children }) => children);
        const ProjectProgressTracker = window.ProjectProgressTracker;
        
        // Validate component before rendering
        // Handle both function components and React.memo wrapped components
        
        const isValidComponent = ProjectProgressTracker && (
            typeof ProjectProgressTracker === 'function' ||
            (typeof ProjectProgressTracker === 'object' && (ProjectProgressTracker.$$typeof || ProjectProgressTracker.type))
        );
        
        
        if (!isValidComponent) {
            console.error('❌ ProjectProgressTracker is not a valid component:', typeof ProjectProgressTracker, ProjectProgressTracker);
            return (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <button 
                            onClick={() => clearProgressTrackerHash()} 
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h1 className="text-lg font-semibold text-gray-900">Project Progress Tracker</h1>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start">
                            <i className="fas fa-exclamation-triangle text-red-600 mt-0.5 mr-3"></i>
                            <div className="flex-1">
                                <h3 className="text-sm font-semibold text-red-800 mb-1">Invalid Component</h3>
                                <p className="text-sm text-red-700">
                                    The Progress Tracker component is not a valid React component. Please refresh the page.
                                </p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-medium"
                                >
                                    Reload Page
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        
        // Check if ProjectProgressTracker is actually callable
        let ComponentToRender = ProjectProgressTracker;
        if (typeof ProjectProgressTracker === 'object' && ProjectProgressTracker.type) {
            // It's a React.memo or forwardRef component - use the .type
            ComponentToRender = ProjectProgressTracker.type;
        }
        
        if (typeof ComponentToRender !== 'function') {
            console.error('❌ ComponentToRender is not a function:', typeof ComponentToRender, ComponentToRender);
            return (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                    <button 
                        onClick={() => clearProgressTrackerHash()} 
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h1 className="text-lg font-semibold text-gray-900">Project Progress Tracker</h1>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                            Component is not a valid function. Type: {typeof ComponentToRender}
                        </p>
                    </div>
                </div>
            );
        }
        
        try {
            
            // Create the props object - ensure all values are primitives or valid React elements
            const trackerProps = {
                onBack: () => {
                    clearProgressTrackerHash();
                },
                focusProjectId: trackerFocus?.projectId || null,
                focusMonthIndex:
                    typeof trackerFocus?.monthIndex === 'number' && !Number.isNaN(trackerFocus.monthIndex)
                        ? trackerFocus.monthIndex
                        : null,
                focusField: trackerFocus?.field || null,
                focusYear:
                    typeof trackerFocus?.year === 'number' && !Number.isNaN(trackerFocus.year)
                        ? trackerFocus.year
                        : null,
                focusMonthName: trackerFocus?.month || null,
                onFocusHandled: () => setTrackerFocus(null)
            };
            
            
            // Use React.createElement (the correct way to render components)
            let trackerElement;
            try {
                trackerElement = React.createElement(ComponentToRender, trackerProps);
                
                // Validate the element
                if (!trackerElement || typeof trackerElement !== 'object') {
                    throw new Error('React.createElement did not return a valid element');
                }
            } catch (createError) {
                console.error('❌ Error creating ProjectProgressTracker element:', createError);
                console.error('❌ CreateError stack:', createError.stack);
                throw createError;
            }
            
            // Wrap in ErrorBoundary
            let wrappedElement;
            try {
                wrappedElement = React.createElement(
                    ErrorBoundary,
                    null,
                    trackerElement
                );
            } catch (wrapError) {
                console.error('❌ Error wrapping in ErrorBoundary:', wrapError);
                // If ErrorBoundary fails, just return the tracker element directly
                return trackerElement;
            }
            
            return wrappedElement;
        } catch (renderError) {
            console.error('❌ Error rendering ProjectProgressTracker:', renderError);
            console.error('❌ Error stack:', renderError.stack);
            return (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <button 
                            onClick={() => clearProgressTrackerHash()} 
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h1 className="text-lg font-semibold text-gray-900">Project Progress Tracker</h1>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start">
                            <i className="fas fa-exclamation-triangle text-red-600 mt-0.5 mr-3"></i>
                            <div className="flex-1">
                                <h3 className="text-sm font-semibold text-red-800 mb-1">Render Error</h3>
                                <p className="text-sm text-red-700">
                                    Failed to render the Progress Tracker component: {renderError.message}
                                </p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-medium"
                                >
                                    Reload Page
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    };

    // Render Progress Tracker with comprehensive error handling
    if (showProgressTracker) {
        // Early return with loading message if component not available
        if (!window.ProjectProgressTracker) {
            console.warn('⚠️ Projects: ProjectProgressTracker not available yet');
            return React.createElement('div', { className: 'space-y-3' },
                React.createElement('div', { className: 'flex items-center justify-between' },
                    React.createElement('button', {
                        onClick: () => clearProgressTrackerHash(),
                        className: 'p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'
                    }, React.createElement('i', { className: 'fas fa-arrow-left' })),
                    React.createElement('h1', { className: 'text-lg font-semibold text-gray-900' }, 'Project Progress Tracker')
                ),
                React.createElement('div', { className: 'bg-yellow-50 border border-yellow-200 rounded-lg p-4' },
                    React.createElement('div', { className: 'flex items-start' },
                        React.createElement('i', { className: 'fas fa-spinner fa-spin text-yellow-600 mt-0.5 mr-3' }),
                        React.createElement('div', { className: 'flex-1' },
                            React.createElement('h3', { className: 'text-sm font-semibold text-yellow-800 mb-1' }, 'Loading Progress Tracker...'),
                            React.createElement('p', { className: 'text-sm text-yellow-700' }, 
                                'The Progress Tracker component is still loading. Please wait a moment...')
                        )
                    )
                )
            );
        }
        
        // Wrap entire section in try-catch at render level
        try {
            return renderProgressTracker();
        } catch (error) {
            console.error('❌ Fatal error rendering Progress Tracker:', error);
            return (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                    <button 
                        onClick={() => clearProgressTrackerHash()} 
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h1 className="text-lg font-semibold text-gray-900">Project Progress Tracker</h1>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start">
                            <i className="fas fa-exclamation-triangle text-red-600 mt-0.5 mr-3"></i>
                            <div className="flex-1">
                                <h3 className="text-sm font-semibold text-red-800 mb-1">Fatal Error</h3>
                                <p className="text-sm text-red-700">
                                    {error.message || 'An unexpected error occurred'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    }

    // BULLETPROOF: Aggressive monitoring when viewing a project
    useEffect(() => {
        if (!viewingProject) return;
        
        // If ProjectDetail is missing, try loading immediately
        if (!window.ProjectDetail) {
            setWaitingForProjectDetail(true);
            
            // Try loading with aggressive retries
            let retryCount = 0;
            const maxRetries = 5;
            
            const attemptLoad = () => {
                loadProjectDetail().then(loaded => {
                    if (loaded && window.ProjectDetail) {
                        setProjectDetailAvailable(true);
                        setWaitingForProjectDetail(false);
                        // Force re-render
                        setViewingProject({ ...viewingProject });
                    } else if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(attemptLoad, 500);
                    } else {
                        console.error('❌ Effect: All load attempts exhausted');
                        setWaitingForProjectDetail(false);
                    }
                });
            };
            
            attemptLoad();
        }
        
        // Optimized polling while viewing project - check every 1 second (reduced from 200ms)
        // Also listen for componentLoaded events to avoid unnecessary polling
        const handleComponentLoaded = (event) => {
            if (event.detail?.component === 'ProjectDetail' && window.ProjectDetail) {
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
            }
        };
        window.addEventListener('componentLoaded', handleComponentLoaded);
        
        const checkInterval = setInterval(() => {
            if (window.ProjectDetail) {
                if (!projectDetailAvailable) {
                    setProjectDetailAvailable(true);
                    setWaitingForProjectDetail(false);
                }
            } else if (!waitingForProjectDetail) {
                // Component disappeared? Try loading again (but less aggressively)
                console.warn('⚠️ Effect: ProjectDetail disappeared, reloading...');
                setWaitingForProjectDetail(true);
                loadProjectDetail().then(loaded => {
                    setWaitingForProjectDetail(false);
                    if (loaded && window.ProjectDetail) {
                        setProjectDetailAvailable(true);
                    }
                });
            }
        }, 1000); // Check every 1 second (optimized from 200ms)
        
        return () => {
            clearInterval(checkInterval);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, [viewingProject, waitingForProjectDetail, projectDetailAvailable]);

    // BULLETPROOF: Immediate check when viewingProject changes (runs synchronously before paint)
    React.useLayoutEffect(() => {
        if (!viewingProject || window.ProjectDetail) return;
        
        // Immediate aggressive check - try multiple times quickly
        let attempts = 0;
        let cancelled = false;
        const quickCheck = () => {
            if (cancelled) return;
            attempts++;
            if (window.ProjectDetail) {
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
                return;
            }
            if (attempts < 5) {
                setTimeout(quickCheck, 200); // Check every 200ms for 1 second (optimized from 50ms)
            } else {
                // If still not found, trigger full load
                setWaitingForProjectDetail(prev => {
                    if (prev) return prev; // Already loading
                    return true; // Set to true immediately
                });
                loadProjectDetail().then(loaded => {
                    if (cancelled) return;
                    if (loaded && window.ProjectDetail) {
                        setProjectDetailAvailable(true);
                        setWaitingForProjectDetail(false);
                        setViewingProject(prev => prev ? { ...prev } : null);
                    } else {
                        setWaitingForProjectDetail(false);
                    }
                }).catch(err => {
                    if (cancelled) return;
                    console.error('❌ LayoutEffect: Failed to load ProjectDetail:', err);
                    setWaitingForProjectDetail(false);
                });
            }
        };
        quickCheck();
        return () => { cancelled = true; }; // Cleanup
    }, [viewingProject?.id]); // Only when project ID changes

    // BULLETPROOF: Set up a listener for when ProjectDetail becomes available
    React.useEffect(() => {
        if (!viewingProject) return;
        
        const checkInterval = setInterval(() => {
            if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
                setForceRender(prev => prev + 1);
                clearInterval(checkInterval);
            }
        }, 100);
        
        return () => clearInterval(checkInterval);
    }, [viewingProject?.id, forceRender]);

    if (viewingProject) {
        try {
            // Check window.ProjectDetail directly (it may be loaded lazily)
            const ProjectDetailComponent = window.ProjectDetail;
            
            // Validate that ProjectDetailComponent is a valid React component
            const isValidComponent = ProjectDetailComponent && (
                typeof ProjectDetailComponent === 'function' || 
                (typeof ProjectDetailComponent === 'object' && ProjectDetailComponent.$$typeof)
            );
            
            if (!isValidComponent) {
                // If we just set viewingProject, ProjectDetail should already be loaded
                // But if it's not, show loading state and keep trying
                console.warn('ProjectDetail component not found yet, waiting...', {
                    windowProjectDetail: typeof window.ProjectDetail,
                    projectDetailAvailable: projectDetailAvailable,
                    waitingForProjectDetail: waitingForProjectDetail,
                    isValidComponent: isValidComponent,
                    availableComponents: Object.keys(window).filter(key => key.includes('Project') || key.includes('Detail')),
                    forceRender: forceRender
                });
                
                // CRITICAL: Try immediate check first (in case it just registered)
                // This handles the race condition where lazy loader resolves but component isn't registered yet
                if (window.ProjectDetail && typeof window.ProjectDetail === 'function' && !waitingForProjectDetail) {
                    // Component just became available - update state and re-render
                    setProjectDetailAvailable(true);
                    setWaitingForProjectDetail(false);
                    setForceRender(prev => prev + 1);
                    // Return loading state - next render will show the component
                    return (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            <h2 className="text-lg font-semibold text-blue-800 mb-2">
                                Loading Project Details...
                            </h2>
                        </div>
                    );
                }
                
                // Try to load ProjectDetail if not already loading
                if (!waitingForProjectDetail) {
                    loadProjectDetail().then(loaded => {
                        if (loaded && window.ProjectDetail) {
                            setProjectDetailAvailable(true);
                            setWaitingForProjectDetail(false);
                            setForceRender(prev => prev + 1);
                        }
                    }).catch(err => {
                        console.warn('Failed to load ProjectDetail:', err);
                    });
                }
                
                return (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <h2 className="text-lg font-semibold text-blue-800 mb-2">
                            Loading Project Details...
                        </h2>
                        <p className="text-sm text-blue-600 mb-4">
                            Loading the ProjectDetail component. Please wait...
                        </p>
                        <p className="text-xs text-blue-500 mb-4">
                            If this takes too long, try refreshing the page.
                        </p>
                        <button 
                            onClick={() => {
                                window.location.reload();
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium mr-2"
                        >
                            <i className="fas fa-sync-alt mr-2"></i>
                            Reload Page
                        </button>
                        <button
                            onClick={() => {
                                setViewingProject(null);
                                // Update URL to clear project ID
                                if (window.RouteState) {
                                    window.RouteState.setPageSubpath('projects', [], {
                                        replace: false,
                                        preserveSearch: false,
                                        preserveHash: false
                                    });
                                }
                            }}
                            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm font-medium"
                        >
                            <i className="fas fa-arrow-left mr-2"></i>
                            Back to Projects
                        </button>
                    </div>
                );
            }
            
            // Double-check before rendering
            if (!window.ProjectDetail || typeof window.ProjectDetail !== 'function') {
                console.error('❌ ProjectDetail component not loaded or invalid:', {
                    exists: !!window.ProjectDetail,
                    type: typeof window.ProjectDetail,
                    isFunction: typeof window.ProjectDetail === 'function'
                });
                return (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                        <i className="fas fa-exclamation-triangle text-3xl text-red-500 mb-3"></i>
                        <h2 className="text-lg font-semibold text-red-800 mb-2">
                            ProjectDetail Component Not Loaded
                        </h2>
                        <p className="text-sm text-red-600 mb-4">
                            The ProjectDetail component is not available. Check the browser console for more details.
                        </p>
                        <div className="flex gap-2 justify-center">
                            <button 
                                onClick={() => window.location.reload()}
                                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-medium"
                            >
                                <i className="fas fa-sync-alt mr-2"></i>
                                Reload Page
                            </button>
                        <button
                            onClick={() => {
                                setViewingProject(null);
                                // Update URL to clear project ID
                                if (window.RouteState) {
                                    window.RouteState.setPageSubpath('projects', [], {
                                        replace: false,
                                        preserveSearch: false,
                                        preserveHash: false
                                    });
                                }
                            }}
                            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm font-medium"
                        >
                            <i className="fas fa-arrow-left mr-2"></i>
                            Back to Projects
                        </button>
                        </div>
                    </div>
                );
            }
            
            return <ProjectDetailComponent 
                project={viewingProject} 
                onBack={() => {
                    setViewingProject(null);
                    // Update URL to clear project ID
                    if (window.RouteState) {
                        window.RouteState.setPageSubpath('projects', [], {
                            replace: false,
                            preserveSearch: false,
                            preserveHash: false
                        });
                    }
                }}
                onDelete={handleDeleteProject}
            />;
        } catch (error) {
            console.error('Error rendering ProjectDetail:', error);
            return (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h2 className="text-lg font-semibold text-red-800 mb-2">Error loading project</h2>
                    <p className="text-sm text-red-600 mb-3">{error.message}</p>
                    <button 
                        onClick={() => setViewingProject(null)}
                        className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm font-medium"
                    >
                        Back to Projects
                    </button>
                </div>
            );
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex-1 flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Projects</h1>
                        <p className="text-xs text-gray-600">Manage and track all your projects</p>
                    </div>
                    {SectionCommentWidget && (
                        <SectionCommentWidget 
                            sectionId="projects-main"
                            sectionName="Projects"
                        />
                    )}
                </div>
                <div className="flex gap-2">
                    {/* View Toggle */}
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden shrink-0" role="group" aria-label="View mode selector">
                        <button
                            onClick={() => {
                                setViewMode('grid');
                                try {
                                    localStorage.setItem('projectsViewMode', 'grid');
                                } catch (e) {
                                    console.warn('Failed to save view mode preference:', e);
                                }
                            }}
                            className={`px-3 py-2 text-sm font-medium transition-colors shrink-0 ${
                                viewMode === 'grid'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                            title="Grid View"
                            aria-label="Switch to grid view"
                            aria-pressed={viewMode === 'grid'}
                        >
                            <i className="fas fa-th" aria-hidden="true"></i>
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('list');
                                try {
                                    localStorage.setItem('projectsViewMode', 'list');
                                } catch (e) {
                                    console.warn('Failed to save view mode preference:', e);
                                }
                            }}
                            className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 shrink-0 ${
                                viewMode === 'list'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                            title="List View"
                            aria-label="Switch to list view"
                            aria-pressed={viewMode === 'list'}
                        >
                            <i className="fas fa-list" aria-hidden="true"></i>
                        </button>
                    </div>
                    <button 
                        onClick={() => {
                            openProgressTrackerHash();
                            // Also log after state update
                            setTimeout(() => {
                            }, 100);
                        }}
                        className="px-3 py-1.5 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors flex items-center text-sm font-medium"
                        aria-label="Open progress tracker"
                    >
                        <i className="fas fa-chart-line mr-1.5 text-xs" aria-hidden="true"></i>
                        Progress Tracker
                    </button>
                    <button 
                        onClick={handleAddProject}
                        className="bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors flex items-center text-sm font-medium"
                        aria-label="Create new project"
                    >
                        <i className="fas fa-plus mr-1.5 text-xs" aria-hidden="true"></i>
                        New Project
                    </button>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex gap-2.5">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search projects by name, client, type, or team member..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            aria-label="Search projects"
                        />
                    </div>
                    <select
                        value={selectedClient}
                        onChange={(e) => setSelectedClient(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        aria-label="Filter by client"
                    >
                        <option value="all">All Clients ({projects.length})</option>
                        {uniqueClients.map(client => {
                            const clientCount = clientCounts[client] || 0;
                            return (
                                <option key={client} value={client}>
                                    {client} ({clientCount})
                                </option>
                            );
                        })}
                    </select>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        aria-label="Filter by status"
                    >
                        <option value="all">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="In Progress">In Progress</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="col-span-full text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-3"></div>
                    <p className="text-gray-500 text-sm">Loading projects...</p>
                </div>
            )}

            {/* Error State */}
            {loadError && !isLoading && (
                <div className="col-span-full bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start">
                        <i className="fas fa-exclamation-circle text-red-600 mt-0.5 mr-3"></i>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-red-800 mb-1">Error Loading Projects</h3>
                            <p className="text-sm text-red-700 mb-3">{loadError}</p>
                            <button
                                onClick={() => {
                                    setLoadError(null);
                                    setIsLoading(true);
                                    window.location.reload();
                                }}
                                className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-medium"
                            >
                                <i className="fas fa-redo mr-1.5"></i>
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Project Cards */}
            {!isLoading && !loadError && (
                <>
                    {filteredProjects.length === 0 ? (
                        <div className="col-span-full text-center py-12">
                            <i className="fas fa-filter text-4xl text-gray-300 mb-3"></i>
                            <p className="text-gray-500 text-sm mb-2">
                                {projects.length === 0 
                                    ? 'No projects yet. Create your first project!' 
                                    : 'No projects match your filters'}
                            </p>
                            {(searchTerm !== '' || selectedClient !== 'all' || filterStatus !== 'all') && (
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setSelectedClient('all');
                                        setFilterStatus('all');
                                    }}
                                    className="mt-3 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                >
                                    <i className="fas fa-redo mr-1.5"></i>
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredProjects.map((project, index) => (
                                <div 
                                    key={project.id}
                                    draggable
                                    onMouseDown={(e) => {
                                        // Store mouse position to detect if this was a click or drag
                                        mouseDownRef.current = { 
                                            x: e.clientX, 
                                            y: e.clientY,
                                            time: Date.now()
                                        };
                                    }}
                                    onDragStart={(e) => {
                                        setDraggedProject(index);
                                        e.dataTransfer.effectAllowed = 'move';
                                        // Clear mouse down since we're dragging
                                        mouseDownRef.current = null;
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggedProject === null) return;
                                        
                                        const newProjects = [...filteredProjects];
                                        const draggedItem = newProjects[draggedProject];
                                        newProjects.splice(draggedProject, 1);
                                        newProjects.splice(index, 0, draggedItem);
                                        
                                        // Update the original projects array with the new order
                                        // We need to merge the reordered filtered projects back into the full list
                                        const updatedProjects = projects.map(p => {
                                            const filteredIndex = newProjects.findIndex(fp => fp.id === p.id);
                                            return filteredIndex !== -1 ? newProjects[filteredIndex] : p;
                                        });
                                        setProjects(updatedProjects);
                                        setDraggedProject(null);
                                        mouseDownRef.current = null;
                                    }}
                                    onDragEnd={() => {
                                        setDraggedProject(null);
                                        // Clear after a short delay to allow onClick to check draggedProject
                                        setTimeout(() => {
                                            mouseDownRef.current = null;
                                        }, 100);
                                    }}
                                    onClick={(e) => {
                                        console.log('🟢 Project card clicked:', project?.id, project?.name);
                                        console.log('🟢 draggedProject:', draggedProject);
                                        console.log('🟢 mouseDownRef:', mouseDownRef.current);
                                        
                                        // Only handle click if we didn't drag
                                        // If draggedProject is set, we just finished a drag, so ignore click
                                        if (draggedProject !== null) {
                                            console.log('⚠️ Click ignored - drag in progress');
                                            return;
                                        }
                                        
                                        // Check if mouse moved significantly (indicates drag, not click)
                                        if (mouseDownRef.current) {
                                            const deltaX = Math.abs(e.clientX - mouseDownRef.current.x);
                                            const deltaY = Math.abs(e.clientY - mouseDownRef.current.y);
                                            const deltaTime = Date.now() - mouseDownRef.current.time;
                                            
                                            console.log('🟢 Mouse movement check:', { deltaX, deltaY, deltaTime });
                                            
                                            // If mouse moved more than 5px or took longer than 200ms, it was likely a drag attempt
                                            if (deltaX > 5 || deltaY > 5 || deltaTime > 200) {
                                                console.log('⚠️ Click ignored - mouse moved too much or took too long');
                                                mouseDownRef.current = null;
                                                return;
                                            }
                                        }
                                        
                                        // It's a click - open the project
                                        console.log('✅ Calling handleViewProject for project:', project?.id);
                                        try {
                                            handleViewProject(project);
                                        } catch (error) {
                                            console.error('❌ Error in handleViewProject:', error);
                                        }
                                        mouseDownRef.current = null;
                                    }}
                                    className="bg-white rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all p-4 cursor-pointer"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{project.name}</h3>
                                            <p className="text-xs text-gray-500">{project.client}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${getStatusColorClasses(project.status)}`}>
                                                {project.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-3">
                                        <div className="flex items-center text-xs text-gray-600">
                                            <i className="fas fa-tag mr-2 w-3 text-[10px]"></i>
                                            {project.type}
                                        </div>
                                        <div className="flex items-center text-xs text-gray-600">
                                            <i className="fas fa-calendar mr-2 w-3 text-[10px]"></i>
                                            {project.startDate} - {project.dueDate}
                                        </div>
                                        <div className="flex items-center text-xs text-gray-600">
                                            <i className="fas fa-user mr-2 w-3 text-[10px]"></i>
                                            {project.assignedTo}
                                        </div>
                                        <div className="flex items-center text-xs text-gray-600">
                                            <i className="fas fa-tasks mr-2 w-3 text-[10px]"></i>
                                            {project.tasksCount || 0} tasks
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Project</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Client</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Dates</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Assigned To</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Tasks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {filteredProjects.map((project) => (
                                            <tr
                                                key={project.id}
                                                onClick={() => handleViewProject(project)}
                                                className="hover:bg-gray-50 cursor-pointer transition-colors"
                                            >
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">{project.name}</div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600">{project.client}</div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600">{project.type}</div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs rounded font-medium ${getStatusColorClasses(project.status)}`}>
                                                        {project.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600">
                                                        {project.startDate && project.dueDate 
                                                            ? `${project.startDate} - ${project.dueDate}`
                                                            : project.dueDate || project.startDate || 'No dates'
                                                        }
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600">{project.assignedTo || 'Unassigned'}</div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600">{project.tasksCount || 0}</div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                ProjectModal ? (
                    <ProjectModal
                        project={selectedProject}
                        onSave={handleSaveProject}
                        onDelete={handleDeleteProject}
                        onClose={() => {
                            setShowModal(false);
                            setSelectedProject(null);
                        }}
                    />
                ) : (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg p-4 w-full max-w-md">
                            <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
                            <p className="text-sm text-gray-600 mb-3">Project editor failed to load. Please wait a moment and try again.</p>
                            <div className="flex justify-end">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmation.show && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-confirmation-title">
                    <div className="bg-white rounded-lg p-4 w-full max-w-md">
                        <div className="flex items-start mb-4">
                            <div className="flex-shrink-0">
                                <i className="fas fa-exclamation-triangle text-2xl text-red-600"></i>
                            </div>
                            <div className="ml-3 flex-1">
                                <h2 id="delete-confirmation-title" className="text-lg font-semibold text-gray-900 mb-2">
                                    Delete Project
                                </h2>
                                <p className="text-sm text-gray-600">
                                    Are you sure you want to delete this project? This action cannot be undone.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={cancelDeleteProject}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                aria-label="Cancel deletion"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteProject}
                                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                                aria-label="Confirm deletion"
                            >
                                Delete Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally with version identifier for cache-busting
try {
    // Clear any old version first and force replacement
    const oldVersion = window.Projects?._version;
    if (window.Projects) {
        // Delete the old version to ensure clean replacement
        delete window.Projects;
    }
    window.Projects = Projects;
    window.Projects._version = '20251112-list-view';
    window.Projects._hasListView = true;
    
    // Set up a global event listener for openEntityDetail that works even before Projects component mounts
    // This ensures navigation from dashboard works immediately
    if (typeof window.addEventListener === 'function' && !window._projectsGlobalListenerSet) {
        window._projectsGlobalListenerSet = true;
        const globalHandler = async (event) => {
            if (!event.detail || event.detail.entityType !== 'project') return;
            
            const { entityId, options } = event.detail;
            if (!entityId) return;
            
            console.log('🌐 Projects: Global openEntityDetail handler triggered:', { entityId, options });
            
            // Store in sessionStorage so Projects component can pick it up when it mounts
            if (entityId) {
                sessionStorage.setItem('openProjectId', entityId);
                if (options?.task) {
                    sessionStorage.setItem('openTaskId', options.task);
                }
                console.log('💾 Projects: Stored project ID in sessionStorage for later opening:', entityId);
            }
        };
        
        window.addEventListener('openEntityDetail', globalHandler, true); // Use capture phase
        console.log('✅ Projects: Global openEntityDetail listener registered');
    }
    
    // Dispatch event to notify that Projects component is ready
    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('projectsComponentReady', { 
            detail: { version: '20251112-list-view', hasListView: true } 
        }));
    }
} catch (error) {
    console.error('❌ Error registering Projects component:', error);
}
