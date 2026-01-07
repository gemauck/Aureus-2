// Database-First Projects Component - No localStorage dependency
const { useState, useEffect, useRef, useCallback } = React;

const DEFAULT_TASK_LISTS = [
    { id: 1, name: 'To Do', color: 'blue' },
    { id: 2, name: 'In Progress', color: 'yellow' },
    { id: 3, name: 'Done', color: 'green' }
];

const cloneDefaultValue = (value) => {
    if (Array.isArray(value)) {
        return [...value];
    }
    if (value && typeof value === 'object') {
        return { ...value };
    }
    return value;
};

const parseJSONField = (field, defaultValue = []) => {
    if (field === null || typeof field === 'undefined' || field === '') {
        return cloneDefaultValue(defaultValue);
    }

    if (Array.isArray(field) || (typeof field === 'object' && field !== null)) {
        return field;
    }

    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed) {
            return cloneDefaultValue(defaultValue);
        }
        try {
            return JSON.parse(trimmed);
        } catch (error) {
            console.warn('Failed to parse JSON field:', error);
            return cloneDefaultValue(defaultValue);
        }
    }

    return cloneDefaultValue(defaultValue);
};

const formatDate = (date) => {
    if (!date) return '';
    try {
        const d = new Date(date);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    } catch {
        return '';
    }
};

const extractProjectFromResponse = (response) => {
    if (!response) return null;
    if (response.data?.project) return response.data.project;
    if (response.project) return response.project;
    return response;
};

const normalizeProject = (project) => {
    if (!project || typeof project !== 'object') {
        return null;
    }

    const parsedTaskLists = parseJSONField(project.taskLists, DEFAULT_TASK_LISTS);
    const parsedTasks = Array.isArray(project.tasks)
        ? project.tasks
        : parseJSONField(project.tasksList, []);
    const parsedCustomFields = parseJSONField(project.customFieldDefinitions, []);
    const parsedDocuments = parseJSONField(project.documents, []);
    const parsedComments = parseJSONField(project.comments, []);
    const parsedActivityLog = parseJSONField(project.activityLog, []);
    const parsedTeam = parseJSONField(project.team, []);
    const parsedDocumentSections = parseJSONField(project.documentSections, []);
    const hasDocProcess = project.hasDocumentCollectionProcess === true ||
        project.hasDocumentCollectionProcess === 'true' ||
        project.hasDocumentCollectionProcess === 1;

    return {
        id: project.id,
        name: project.name || '',
        client: project.clientName || project.client || '',
        clientName: project.clientName || project.client || '',
        clientId: project.clientId || null,
        type: project.type || 'Project',
        status: project.status || 'Active',
        startDate: formatDate(project.startDate),
        dueDate: formatDate(project.dueDate),
        progress: typeof project.progress === 'number' ? project.progress : Number(project.progress) || 0,
        assignedTo: project.assignedTo || '',
        description: project.description || '',
        budget: Number(project.budget) || 0,
        actualCost: Number(project.actualCost) || 0,
        priority: project.priority || 'Medium',
        tasks: parsedTasks,
        taskLists: parsedTaskLists,
        customFieldDefinitions: parsedCustomFields,
        documents: parsedDocuments,
        comments: parsedComments,
        activityLog: parsedActivityLog,
        team: parsedTeam,
        notes: project.notes || '',
        hasDocumentCollectionProcess: hasDocProcess,
        documentSections: parsedDocumentSections,
        monthlyProgress: typeof project.monthlyProgress === 'string'
            ? project.monthlyProgress
            : JSON.stringify(project.monthlyProgress || {}),
        ownerId: project.ownerId || '',
        createdAt: project.createdAt || '',
        updatedAt: project.updatedAt || ''
    };
};

const ProjectsDatabaseFirst = () => {
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterType, setFilterType] = useState('All Types');
    const [isLoading, setIsLoading] = useState(true);
    const [selectedProjects, setSelectedProjects] = useState([]);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [showProgressTracker, setShowProgressTracker] = useState(false);
    const [trackerAvailable, setTrackerAvailable] = useState(!!window.ProjectProgressTracker);
    const [waitingForTracker, setWaitingForTracker] = useState(false);
    const [projectDetailComponent, setProjectDetailComponent] = useState(
        typeof window !== 'undefined' && typeof window.ProjectDetail === 'function'
            ? () => window.ProjectDetail
            : null
    );
    const [isProjectDetailLoading, setIsProjectDetailLoading] = useState(false);
    const projectDetailLoadPromiseRef = useRef(null);
    const { isDark } = window.useTheme();
    
    // View preference: 'grid' or 'list', loaded from localStorage
    const [viewMode, setViewMode] = useState(() => {
        const saved = localStorage.getItem('projectsViewMode');
        return saved === 'list' ? 'list' : 'grid';
    });
    
    // Sort state for list view
    const [sortColumn, setSortColumn] = useState('name'); // Default sort by name
    const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
    
    // IMMEDIATE route check on mount - opens project from URL directly
    useEffect(() => {
        console.log('🚀 ProjectsDatabaseFirst: IMMEDIATE route check on mount');
        
        // Parse URL directly - check both pathname and hash
        const urlPath = window.location.pathname || '';
        const urlHash = window.location.hash || '';
        const urlSearch = window.location.search || '';
        const urlParams = new URLSearchParams(urlSearch);
        
        let projectId = null;
        let taskId = null;
        
        // Check pathname first
        if (urlPath.includes('/projects/')) {
            const pathParts = urlPath.split('/projects/')[1].split('/');
            projectId = pathParts[0];
            taskId = urlParams.get('task');
        }
        
        // Also check hash (for hash-based routing)
        if (!projectId && urlHash.includes('/projects/')) {
            const hashParts = urlHash.split('/projects/')[1].split('/');
            projectId = hashParts[0].split('?')[0];
            if (urlHash.includes('?')) {
                const hashQuery = urlHash.split('?')[1];
                const hashParams = new URLSearchParams(hashQuery);
                taskId = hashParams.get('task') || urlParams.get('task');
            } else {
                taskId = urlParams.get('task');
            }
        }
        
        if (projectId) {
            console.log('✅ ProjectsDatabaseFirst: IMMEDIATE - Found project in URL:', { projectId, taskId });
            
            // Fetch and open project immediately
            const fetchAndOpen = async () => {
                if (window.DatabaseAPI?.getProject) {
                    try {
                        console.log('📡 ProjectsDatabaseFirst: IMMEDIATE - Fetching project:', projectId);
                        const response = await window.DatabaseAPI.getProject(projectId);
                        const projectData = response?.data?.project || response?.project || response?.data;
                        
                        if (projectData) {
                            const fetchedProject = normalizeProject(projectData);
                            console.log('✅ ProjectsDatabaseFirst: IMMEDIATE - Opening project:', fetchedProject.name);
                            
                            // Add to projects array
                            setProjects(prev => {
                                const exists = prev.find(p => String(p.id) === String(projectId));
                                return exists ? prev : [...prev, fetchedProject];
                            });
                            
                            // Open immediately
                            setSelectedProject(fetchedProject);
                            setShowModal(false);
                            
                            // Update URL if RouteState is available
                            if (taskId && window.RouteState) {
                                try {
                                    window.RouteState.navigate({
                                        page: 'projects',
                                        segments: [projectId],
                                        search: `?task=${encodeURIComponent(taskId)}`,
                                        preserveSearch: false,
                                        preserveHash: false
                                    });
                                } catch (e) {
                                    console.warn('⚠️ ProjectsDatabaseFirst: Failed to update URL:', e);
                                }
                            }
                            
                            // Open task with retry
                            if (taskId) {
                                console.log('📋 ProjectsDatabaseFirst: IMMEDIATE - Opening task:', taskId);
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
                        console.error('❌ ProjectsDatabaseFirst: IMMEDIATE - Failed to fetch:', error);
                    }
                }
            };
            
            fetchAndOpen();
        }
    }, []); // Run ONLY on mount
    // Monitor availability of ProjectDetail component
    useEffect(() => {
        if (projectDetailComponent) {
            return;
        }

        if (typeof window !== 'undefined' && typeof window.ProjectDetail === 'function') {
            setProjectDetailComponent(() => window.ProjectDetail);
            return;
        }

        const handleComponentLoaded = (event) => {
            if (event?.detail?.component === 'ProjectDetail' && typeof window.ProjectDetail === 'function') {
                setProjectDetailComponent(() => window.ProjectDetail);
            }
        };

        window.addEventListener('componentLoaded', handleComponentLoaded);

        let attempts = 0;
        const maxAttempts = 40;
        const intervalId = setInterval(() => {
            attempts += 1;
            if (typeof window.ProjectDetail === 'function') {
                setProjectDetailComponent(() => window.ProjectDetail);
                clearInterval(intervalId);
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
        }, 100);

        return () => {
            window.removeEventListener('componentLoaded', handleComponentLoaded);
            clearInterval(intervalId);
        };
    }, [projectDetailComponent]);

    const ensureProjectDetailLoaded = useCallback(async () => {
        if (typeof window === 'undefined') {
            return false;
        }

        if (typeof window.ProjectDetail === 'function') {
            if (!projectDetailComponent) {
                setProjectDetailComponent(() => window.ProjectDetail);
            }
            return true;
        }

        if (projectDetailLoadPromiseRef.current) {
            return projectDetailLoadPromiseRef.current;
        }

        setIsProjectDetailLoading(true);

        const loadPromise = new Promise((resolve) => {
            const existingScript = document.querySelector('script[data-project-detail-loader="true"]');
            if (existingScript) {
                existingScript.remove();
            }

            const script = document.createElement('script');
            script.src = `/dist/src/components/projects/ProjectDetail.js?v=project-detail-on-demand-${Date.now()}`;
            script.async = true;
            script.dataset.projectDetailLoader = 'true';

            script.onload = () => {
                setIsProjectDetailLoading(false);
                projectDetailLoadPromiseRef.current = null;
                if (typeof window.ProjectDetail === 'function') {
                    setProjectDetailComponent(() => window.ProjectDetail);
                    resolve(true);
                } else {
                    console.error('❌ ProjectDetail loader: script executed but component did not register on window.ProjectDetail');
                    resolve(false);
                }
            };

            script.onerror = () => {
                setIsProjectDetailLoading(false);
                projectDetailLoadPromiseRef.current = null;
                console.error('❌ ProjectDetail loader failed: unable to load ProjectDetail.js');
                resolve(false);
            };

            document.body.appendChild(script);
        });

        projectDetailLoadPromiseRef.current = loadPromise;
        return loadPromise;
    }, [projectDetailComponent]);

    useEffect(() => {
        if (selectedProject) {
            ensureProjectDetailLoaded();
        }
    }, [selectedProject, ensureProjectDetailLoaded]);


    // Monitor availability of the ProjectProgressTracker component
    useEffect(() => {
        const checkTracker = () => {
            if (window.ProjectProgressTracker) {
                setTrackerAvailable(true);
                return true;
            }
            return false;
        };

        // Initial check
        checkTracker();

        const interval = setInterval(() => {
            if (checkTracker()) {
                clearInterval(interval);
            }
        }, 200);

        const handleComponentLoaded = (event) => {
            if (event?.detail?.component === 'ProjectProgressTracker') {
                setTrackerAvailable(true);
            }
        };

        window.addEventListener('componentLoaded', handleComponentLoaded);

        return () => {
            clearInterval(interval);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, []);

    // When user opens the tracker and it's not yet available, patiently wait for it
    useEffect(() => {
        if (!showProgressTracker || trackerAvailable || waitingForTracker) {
            return;
        }

        setWaitingForTracker(true);
        let attempts = 0;
        const maxAttempts = 40; // 4 seconds

        const interval = setInterval(() => {
            attempts += 1;
            if (window.ProjectProgressTracker) {
                setTrackerAvailable(true);
                setWaitingForTracker(false);
                clearInterval(interval);
            } else if (attempts >= maxAttempts) {
                setWaitingForTracker(false);
                clearInterval(interval);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [showProgressTracker, trackerAvailable, waitingForTracker]);

    // Load projects from database
    const loadProjects = async (retryCount = 0) => {
        // Ensure loading state is set
        setIsLoading(true);
        
        // Add timeout wrapper to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Request timeout: Projects failed to load after 30 seconds. Please check your connection and try again.'));
            }, 30000); // 30 second timeout
        });

        try {
            console.log('🔄 Loading projects from database...', { retryCount });
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ No authentication token found');
                setIsLoading(false);
                window.location.hash = '#/login';
                return [];
            }

            // Check if API is available
            if (!window.api || typeof window.api.getProjects !== 'function') {
                console.error('❌ window.api.getProjects is not available', {
                    hasApi: !!window.api,
                    hasGetProjects: !!(window.api && typeof window.api.getProjects === 'function')
                });
                setIsLoading(false);
                alert('API not available. Please refresh the page.');
                return [];
            }

            console.log('📡 Making API request to get projects...');
            
            // Race between the actual request and timeout
            const response = await Promise.race([
                window.api.getProjects(),
                timeoutPromise
            ]);
            
            console.log('✅ Received response from API:', {
                hasData: !!response?.data,
                hasProjects: !!response?.data?.projects,
                responseKeys: response ? Object.keys(response) : []
            });
            
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
            
            
            if (!Array.isArray(apiProjects)) {
                console.error('❌ apiProjects is not an array:', apiProjects);
                apiProjects = [];
            }
            
            console.log(`✅ Loaded ${apiProjects.length} projects from database`);
            
            const processedProjects = apiProjects
                .map(normalizeProject)
                .filter(Boolean);
            
            setProjects(processedProjects);
            setIsLoading(false);
            return processedProjects;
        } catch (error) {
            console.error('❌ Failed to load projects from database:', {
                message: error?.message,
                code: error?.code,
                status: error?.status,
                stack: error?.stack?.substring(0, 200)
            });
            
            setIsLoading(false);
            
            // Handle specific error types
            if (error?.message?.includes?.('Unauthorized') || error?.message?.includes?.('401') || error?.status === 401) {
                console.warn('⚠️ Unauthorized - redirecting to login');
                window.storage?.removeToken?.();
                window.storage?.removeUser?.();
                window.location.hash = '#/login';
                return []; // Return empty array to prevent further processing
            } else if (error?.message?.includes?.('timeout') || error?.message?.includes?.('Request timeout')) {
                // Retry once on timeout
                if (retryCount < 1) {
                    console.log('🔄 Retrying after timeout...');
                    return loadProjects(retryCount + 1);
                }
                alert('Request timed out. Please check your connection and try again.');
            } else if (error?.code === 'DATABASE_CONNECTION_ERROR' || error?.isDatabaseError) {
                // Retry once on database connection error
                if (retryCount < 1) {
                    console.log('🔄 Retrying after database connection error...');
                    setTimeout(() => loadProjects(retryCount + 1), 2000);
                    return [];
                }
                alert('Database connection error. Please try again in a moment.');
            } else {
                const errorMsg = error?.message || 'Unknown error';
                console.error('Full error details:', error);
                // Only show alert if not retrying
                if (retryCount >= 1) {
                    alert(`Failed to load projects from database: ${errorMsg}. Please try again.`);
                }
            }
            
            // Set empty array to show "no projects" state instead of infinite loading
            setProjects([]);
            return [];
        }
    };

    // Save project to database
    const handleSaveProject = async (projectData) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to save project data');
                return;
            }

            const comprehensiveProject = {
                id: selectedProject ? selectedProject.id : Date.now().toString(),
                name: projectData.name || '',
                client: projectData.client || '',
                type: projectData.type || 'Project',
                status: projectData.status || 'Active',
                startDate: projectData.startDate || new Date().toISOString().split('T')[0],
                dueDate: projectData.dueDate || '',
                progress: projectData.progress || 0,
                assignedTo: projectData.assignedTo || '',
                description: projectData.description || '',
                budget: projectData.budget || 0,
                actualCost: projectData.actualCost || 0,
                tasks: projectData.tasks || [],
                taskLists: projectData.taskLists || [
                    { id: 1, name: 'To Do', color: 'blue' },
                    { id: 2, name: 'In Progress', color: 'yellow' },
                    { id: 3, name: 'Done', color: 'green' }
                ],
                customFieldDefinitions: projectData.customFieldDefinitions || [],
                documents: projectData.documents || [],
                comments: projectData.comments || [],
                activityLog: projectData.activityLog || []
            };

            let apiResponse;
            if (selectedProject) {
                apiResponse = await window.api.updateProject(comprehensiveProject.id, {
                    ...comprehensiveProject,
                    clientName: comprehensiveProject.client
                });
            } else {
                apiResponse = await window.api.createProject({
                    ...comprehensiveProject,
                    clientName: comprehensiveProject.client
                });
            }

            const normalizedFromApi = normalizeProject(extractProjectFromResponse(apiResponse));
            const fallbackNormalized = normalizeProject({
                ...selectedProject,
                ...comprehensiveProject,
                clientName: comprehensiveProject.client
            });
            const nextProject = normalizedFromApi || fallbackNormalized;

            if (nextProject) {
                if (selectedProject) {
                    // Updating existing project - update in place
                    setProjects(prev => prev.map(p => (p.id === nextProject.id ? nextProject : p)));
                    setSelectedProject(nextProject);
                    // For edits, optionally refresh to get latest server state (but not immediately)
                    setTimeout(async () => {
                        try {
                            const refreshedProjects = await loadProjects();
                            const refreshedProject = refreshedProjects.find(p => p.id === nextProject.id);
                            if (refreshedProject) {
                                setSelectedProject(refreshedProject);
                            }
                        } catch (error) {
                            console.warn('⚠️ Failed to refresh project after edit:', error);
                            // Ignore - we already updated locally
                        }
                    }, 1000); // Small delay to let UI update first
                } else {
                    // Creating new project - add immediately to state (NO reload needed)
                    console.log('✅ Adding new project to list immediately:', nextProject.name);
                    setProjects(prev => {
                        // Check if project already exists (avoid duplicates)
                        const exists = prev.find(p => p.id === nextProject.id);
                        if (exists) {
                            console.log('ℹ️ Project already in list, updating instead');
                            return prev.map(p => (p.id === nextProject.id ? nextProject : p));
                        }
                        // Add new project to the beginning of the list (most recent first)
                        return [nextProject, ...prev].filter(Boolean);
                    });
                    setShowModal(false);
                    setSelectedProject(null);
                    // Don't reload for new projects - we already added it to state
                    console.log('✅ New project added to list, no reload needed');
                }
            } else if (!selectedProject) {
                setShowModal(false);
                setSelectedProject(null);
            }
            
        } catch (error) {
            console.error('❌ Failed to save project to database:', error);
            alert('Failed to save project to database. Please try again.');
        }
    };

    // Delete project from database
    const handleDeleteProject = async (projectId) => {
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to delete project');
                return;
            }

            // Find the project to get its name for better error messages
            const projectToDelete = projects.find(p => p.id === projectId);
            console.log('🗑️ Deleting project:', {
                projectId,
                projectName: projectToDelete?.name || 'Unknown',
                projectExists: !!projectToDelete,
                idType: typeof projectId,
                idLength: projectId?.length
            });

            // Check if project exists before attempting deletion
            if (!projectToDelete) {
                console.warn('⚠️ Project not found in local state, may have already been deleted');
                // Still try to delete from server in case it exists there
                // but don't show error if it doesn't exist
            }

            try {
                await window.api.deleteProject(projectId);
                console.log('✅ Project deleted successfully:', projectId);
            } catch (deleteError) {
                // If project not found (404), it's already deleted - that's fine
                if (deleteError?.status === 404 || deleteError?.message?.includes('not found')) {
                    console.log('ℹ️ Project already deleted (404) - removing from local state');
                } else {
                    throw deleteError; // Re-throw other errors
                }
            }
            
            // Update local state (remove project even if server said 404)
            setProjects(prev => prev.filter(p => p.id !== projectId));
            setSelectedProject(null);
            
            // Only reload if we successfully deleted (not if it was already gone)
            if (projectToDelete) {
                await loadProjects();
            }
            
        } catch (error) {
            console.error('❌ Failed to delete project from database:', {
                error,
                message: error.message,
                status: error.status,
                code: error.code,
                projectId,
                projectName: projects.find(p => p.id === projectId)?.name || 'Unknown'
            });
            
            // Provide more helpful error messages
            let errorMessage = 'Failed to delete project';
            if (error.message) {
                if (error.message.includes('not found') || error.status === 404) {
                    // Project already deleted - just remove from local state
                    setProjects(prev => prev.filter(p => p.id !== projectId));
                    setSelectedProject(null);
                    return; // Don't show error for already-deleted projects
                } else if (error.message.includes('Unauthorized') || error.status === 401) {
                    errorMessage = 'Session expired. Please log in again.';
                    window.storage?.removeToken?.();
                    window.storage?.removeUser?.();
                    window.location.hash = '#/login';
                } else {
                    errorMessage += ': ' + error.message;
                }
            } else if (error.status) {
                errorMessage += ` (HTTP ${error.status})`;
            }
            
            alert(errorMessage);
        }
    };

    // Bulk delete projects
    const handleBulkDelete = async () => {
        if (selectedProjects.length === 0) return;
        
        const projectNames = selectedProjects.map(id => {
            const project = projects.find(p => p.id === id);
            return project ? project.name : `Project ${id}`;
        }).join(', ');
        
        if (!confirm(`Are you sure you want to delete ${selectedProjects.length} project(s)?\n\nProjects: ${projectNames}\n\nThis action cannot be undone.`)) {
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to delete projects');
                return;
            }

            // Delete each project
            for (const projectId of selectedProjects) {
                await window.api.deleteProject(projectId);
            }
            
            
            // Update local state
            setProjects(prev => prev.filter(p => !selectedProjects.includes(p.id)));
            setSelectedProjects([]);
            setShowBulkActions(false);
            await loadProjects();
            
        } catch (error) {
            console.error('❌ Failed to bulk delete projects from database:', error);
            alert('Failed to delete projects from database. Please try again.');
        }
    };

    // Toggle project selection
    const toggleProjectSelection = (projectId) => {
        setSelectedProjects(prev => 
            prev.includes(projectId) 
                ? prev.filter(id => id !== projectId)
                : [...prev, projectId]
        );
    };

    // Select all projects
    const selectAllProjects = () => {
        setSelectedProjects(filteredProjects.map(p => p.id));
    };

    // Clear selection
    const clearSelection = () => {
        setSelectedProjects([]);
    };

    // Handle column sorting
    const handleSort = (column) => {
        if (sortColumn === column) {
            // Toggle direction if clicking the same column
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new column and default to ascending
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    // Sort function
    const sortProjects = (a, b) => {
        let aValue, bValue;
        
        switch (sortColumn) {
            case 'name':
                aValue = (a.name || '').toLowerCase();
                bValue = (b.name || '').toLowerCase();
                break;
            case 'client':
                aValue = (a.client || '').toLowerCase();
                bValue = (b.client || '').toLowerCase();
                break;
            case 'type':
                aValue = (a.type || '').toLowerCase();
                bValue = (b.type || '').toLowerCase();
                break;
            case 'status':
                aValue = (a.status || '').toLowerCase();
                bValue = (b.status || '').toLowerCase();
                break;
            case 'dueDate':
                aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                break;
            case 'assignedTo':
                aValue = (a.assignedTo || 'Unassigned').toLowerCase();
                bValue = (b.assignedTo || 'Unassigned').toLowerCase();
                break;
            default:
                aValue = (a.name || '').toLowerCase();
                bValue = (b.name || '').toLowerCase();
        }
        
        let comparison = 0;
        if (sortColumn === 'dueDate') {
            // Numeric comparison for dates
            comparison = aValue - bValue;
        } else {
            // String comparison
            comparison = aValue.localeCompare(bValue);
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
    };

    // Filter and search
    const safeProjects = Array.isArray(projects) ? projects.filter(Boolean) : [];

    const filteredProjects = safeProjects
        .filter(project => {
            const projectName = (project?.name || '').toLowerCase();
            const clientName = (project?.client || '').toLowerCase();
            const normalizedSearch = (searchTerm || '').toLowerCase();
            const matchesSearch = normalizedSearch === '' 
                || projectName.includes(normalizedSearch) 
                || clientName.includes(normalizedSearch);
            const matchesStatus = filterStatus === 'All Status' || project.status === filterStatus;
            const matchesType = filterType === 'All Types' || project.type === filterType;
            return matchesSearch && matchesStatus && matchesType;
        })
        .sort(sortProjects);

    // Load data on mount
    useEffect(() => {
        loadProjects();
    }, []);

    // Auto-refresh data every 2 minutes (only when page is visible)
    useEffect(() => {
        // Only auto-refresh if page is visible
        const handleVisibilityChange = () => {
            if (document.hidden) {
                return; // Don't refresh when page is hidden
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        const interval = setInterval(() => {
            // Only refresh if page is visible
            if (!document.hidden) {
                loadProjects();
            }
        }, 120000); // 2 minutes (reduced frequency)

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    if (showProgressTracker) {
        const TrackerComponent = window.ProjectProgressTracker;
        const renderTracker = () => {
            if (TrackerComponent && typeof TrackerComponent === 'function') {
                return <TrackerComponent onBack={() => setShowProgressTracker(false)} />;
            }

            // React.memo components can be used directly as JSX as well
            if (TrackerComponent && typeof TrackerComponent === 'object') {
                return <TrackerComponent onBack={() => setShowProgressTracker(false)} />;
            }

            if (waitingForTracker) {
                return (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-blue-50 border-blue-200 text-blue-700'} border rounded-xl p-6`}>
                        <div className="flex items-center space-x-3">
                            <i className="fas fa-spinner fa-spin"></i>
                            <span>Loading Project Progress Tracker...</span>
                        </div>
                    </div>
                );
            }

            return (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-red-50 border-red-200 text-red-700'} border rounded-xl p-6`}>
                    <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                            <i className="fas fa-exclamation-triangle"></i>
                            <div>
                                <p className="font-semibold text-sm">Project Progress Tracker component is not available.</p>
                                <p className="text-xs opacity-80">Please refresh the page or contact support if the issue persists.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setWaitingForTracker(true);
                                setTrackerAvailable(!!window.ProjectProgressTracker);
                                setTimeout(() => setWaitingForTracker(false), 2000);
                            }}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                        >
                            <i className="fas fa-sync-alt mr-2"></i>
                            Retry Loading
                        </button>
                    </div>
                </div>
            );
        };

        return (
            <div className="space-y-6">
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={() => setShowProgressTracker(false)}
                                className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                <i className="fas fa-arrow-left mr-2"></i>
                                Back to Projects
                            </button>
                            <div>
                                <h2 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    Project Progress Tracker
                                </h2>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Track monthly progress across active projects
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 text-xs">
                            <span className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Projects loaded:</span>
                            <span className={`${isDark ? 'text-gray-200' : 'text-gray-900'} font-semibold`}>{projects.length}</span>
                        </div>
                    </div>
                </div>
                {renderTracker()}
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-4"></i>
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading projects from database...</p>
                </div>
            </div>
        );
    }
    if (selectedProject && !showModal) {
        if (projectDetailComponent) {
            const ProjectDetailView = projectDetailComponent;
            return (
                <div className="space-y-6">
                    <ProjectDetailView
                        project={selectedProject}
                        onBack={() => setSelectedProject(null)}
                        onDelete={(projectId) => handleDeleteProject(projectId)}
                        onProjectUpdate={async (updatedProject) => {
                            const normalizedProject = normalizeProject(updatedProject);
                            if (!normalizedProject?.id) {
                                return;
                            }
                            setProjects(prev => prev.map(p => (p.id === normalizedProject.id ? normalizedProject : p)));
                            setSelectedProject(normalizedProject);
                            await loadProjects();
                        }}
                    />
                </div>
            );
        }

        return (
            <div
                className={`space-y-4 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-700'} border rounded-xl p-6`}
            >
                <div className="flex items-center justify-between gap-3">
                    <button
                        onClick={() => setSelectedProject(null)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        <i className="fas fa-arrow-left text-xs"></i>
                        Back to projects
                    </button>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <i className="fas fa-spinner fa-spin text-primary-500"></i>
                        Preparing project detail...
                    </div>
                </div>
                <p className="text-sm opacity-80">
                    Loading the detailed project view. This may take a moment the first time you open it.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-xl ${isDark ? 'bg-primary-600' : 'bg-primary-500'} flex items-center justify-center`}>
                            <i className="fas fa-project-diagram text-white text-lg"></i>
                        </div>
                        <div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Projects</h1>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Database-synchronized project management</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        {selectedProjects.length > 0 && (
                            <div className="flex items-center space-x-2">
                                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                    {selectedProjects.length} selected
                                </span>
                                <button
                                    onClick={handleBulkDelete}
                                    className="bg-red-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm"
                                >
                                    <i className="fas fa-trash mr-1"></i>
                                    Delete Selected
                                </button>
                                <button
                                    onClick={clearSelection}
                                    className="bg-gray-500 text-white px-3 py-2 rounded-lg font-medium hover:bg-gray-600 transition-colors text-sm"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                        {/* View Toggle */}
                        <div className={`flex items-center space-x-1 border rounded-lg p-1 ${isDark ? 'border-gray-600' : 'border-gray-300'}`}>
                            <button
                                onClick={() => {
                                    setViewMode('grid');
                                    localStorage.setItem('projectsViewMode', 'grid');
                                }}
                                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                    viewMode === 'grid'
                                        ? 'bg-primary-600 text-white'
                                        : `${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`
                                }`}
                                title="Grid View"
                            >
                                <i className="fas fa-th"></i>
                            </button>
                            <button
                                onClick={() => {
                                    setViewMode('list');
                                    localStorage.setItem('projectsViewMode', 'list');
                                }}
                                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                    viewMode === 'list'
                                        ? 'bg-primary-600 text-white'
                                        : `${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`
                                }`}
                                title="List View"
                            >
                                <i className="fas fa-list"></i>
                            </button>
                        </div>
                        <button
                            onClick={() => setShowBulkActions(!showBulkActions)}
                            className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${
                                showBulkActions 
                                    ? 'bg-primary-100 text-primary-700 border border-primary-200' 
                                    : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                            }`}
                        >
                            <i className="fas fa-check-square mr-1"></i>
                            Bulk Actions
                        </button>
                        <button
                            onClick={() => setShowProgressTracker(true)}
                            className="flex items-center space-x-2 px-4 py-2 border border-primary-600 text-primary-600 rounded-lg text-sm font-medium hover:bg-primary-50 transition-all duration-200"
                        >
                            <i className="fas fa-chart-line text-xs"></i>
                            <span>Progress Tracker</span>
                            {!trackerAvailable && (
                                <span className="ml-1 text-[10px] uppercase tracking-wide text-primary-400">Beta</span>
                            )}
                        </button>
                        <button 
                            onClick={() => {
                                setSelectedProject(null);
                                setShowModal(true);
                            }}
                            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all duration-200"
                        >
                            <i className="fas fa-plus text-xs"></i>
                            <span>Add Project</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {showBulkActions && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-4`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedProjects.length === filteredProjects.length && filteredProjects.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            selectAllProjects();
                                        } else {
                                            clearSelection();
                                        }
                                    }}
                                    className={`w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 ${
                                        isDark ? 'bg-gray-700 border-gray-600' : ''
                                    }`}
                                />
                                <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Select All ({filteredProjects.length} projects)
                                </span>
                            </label>
                        </div>
                        <div className="text-sm text-gray-500">
                            Click "Bulk Actions" again to exit selection mode
                        </div>
                    </div>
                </div>
            )}

            {/* Search and Filters */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="space-y-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full px-4 py-3 pl-10 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        />
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All Status</option>
                            <option>Active</option>
                            <option>Completed</option>
                            <option>On Hold</option>
                            <option>Cancelled</option>
                        </select>
                        
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All Types</option>
                            <option>Monthly Review</option>
                            <option>Audit</option>
                            <option>Analysis</option>
                            <option>Implementation</option>
                            <option>Consultation</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Projects View */}
            <div className="space-y-4">
                {filteredProjects.length === 0 ? (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-8 text-center`}>
                        <i className="fas fa-project-diagram text-4xl text-gray-400 mb-4"></i>
                        <h3 className={`text-lg font-medium ${isDark ? 'text-gray-300' : 'text-gray-900'} mb-2`}>
                            No projects found
                        </h3>
                        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                            Get started by adding your first project
                        </p>
                        <button
                            onClick={() => {
                                setSelectedProject(null);
                                setShowModal(true);
                            }}
                            className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                        >
                            Add Project
                        </button>
                    </div>
                ) : viewMode === 'list' ? (
                    /* List View */
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl overflow-hidden`}>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} border-b ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                                    <tr>
                                        {showBulkActions && (
                                            <th className="px-4 py-3 text-left">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedProjects.length === filteredProjects.length && filteredProjects.length > 0}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            selectAllProjects();
                                                        } else {
                                                            clearSelection();
                                                        }
                                                    }}
                                                    className={`w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 ${
                                                        isDark ? 'bg-gray-700 border-gray-600' : ''
                                                    }`}
                                                />
                                            </th>
                                        )}
                                        <th 
                                            className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'} uppercase tracking-wider cursor-pointer transition-colors select-none`}
                                            onClick={() => handleSort('name')}
                                        >
                                            <div className="flex items-center space-x-1">
                                                <span>Project</span>
                                                {sortColumn === 'name' && (
                                                    <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-primary-600`}></i>
                                                )}
                                                {sortColumn !== 'name' && (
                                                    <i className={`fas fa-sort text-gray-400 opacity-50`}></i>
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'} uppercase tracking-wider cursor-pointer transition-colors select-none`}
                                            onClick={() => handleSort('client')}
                                        >
                                            <div className="flex items-center space-x-1">
                                                <span>Client</span>
                                                {sortColumn === 'client' && (
                                                    <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-primary-600`}></i>
                                                )}
                                                {sortColumn !== 'client' && (
                                                    <i className={`fas fa-sort text-gray-400 opacity-50`}></i>
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'} uppercase tracking-wider cursor-pointer transition-colors select-none`}
                                            onClick={() => handleSort('type')}
                                        >
                                            <div className="flex items-center space-x-1">
                                                <span>Type</span>
                                                {sortColumn === 'type' && (
                                                    <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-primary-600`}></i>
                                                )}
                                                {sortColumn !== 'type' && (
                                                    <i className={`fas fa-sort text-gray-400 opacity-50`}></i>
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'} uppercase tracking-wider cursor-pointer transition-colors select-none`}
                                            onClick={() => handleSort('status')}
                                        >
                                            <div className="flex items-center space-x-1">
                                                <span>Status</span>
                                                {sortColumn === 'status' && (
                                                    <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-primary-600`}></i>
                                                )}
                                                {sortColumn !== 'status' && (
                                                    <i className={`fas fa-sort text-gray-400 opacity-50`}></i>
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'} uppercase tracking-wider cursor-pointer transition-colors select-none`}
                                            onClick={() => handleSort('dueDate')}
                                        >
                                            <div className="flex items-center space-x-1">
                                                <span>Due Date</span>
                                                {sortColumn === 'dueDate' && (
                                                    <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-primary-600`}></i>
                                                )}
                                                {sortColumn !== 'dueDate' && (
                                                    <i className={`fas fa-sort text-gray-400 opacity-50`}></i>
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'} uppercase tracking-wider cursor-pointer transition-colors select-none`}
                                            onClick={() => handleSort('assignedTo')}
                                        >
                                            <div className="flex items-center space-x-1">
                                                <span>Assigned To</span>
                                                {sortColumn === 'assignedTo' && (
                                                    <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-primary-600`}></i>
                                                )}
                                                {sortColumn !== 'assignedTo' && (
                                                    <i className={`fas fa-sort text-gray-400 opacity-50`}></i>
                                                )}
                                            </div>
                                        </th>
                                        <th className={`px-6 py-3 text-right text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider`}>
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className={`${isDark ? 'bg-gray-800' : 'bg-white'} divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                                    {filteredProjects.map(project => (
                                        <tr 
                                            key={project.id}
                                            className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition-colors ${
                                                showBulkActions ? 'cursor-default' : 'cursor-pointer'
                                            }`}
                                            onClick={() => {
                                                if (!showBulkActions) {
                                                    setSelectedProject(project);
                                                }
                                            }}
                                        >
                                            {showBulkActions && (
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedProjects.includes(project.id)}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            toggleProjectSelection(project.id);
                                                        }}
                                                        className={`w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 ${
                                                            isDark ? 'bg-gray-700 border-gray-600' : ''
                                                        }`}
                                                    />
                                                </td>
                                            )}
                                            <td className={`px-6 py-4 whitespace-nowrap`}>
                                                <div className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {project.name}
                                                </div>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap`}>
                                                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    {project.client}
                                                </div>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap`}>
                                                <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    {project.type}
                                                </div>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap`}>
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                    project.status === 'Active' ? 'bg-green-100 text-green-800' : 
                                                    project.status === 'Completed' ? 'bg-blue-100 text-blue-800' :
                                                    project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {project.status}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap`}>
                                                <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'No due date'}
                                                </div>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap`}>
                                                <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    {project.assignedTo || 'Unassigned'}
                                                </div>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium`}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteProject(project.id);
                                                    }}
                                                    className={`p-1 rounded-full transition-colors ${
                                                        isDark 
                                                            ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' 
                                                            : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                                                    }`}
                                                    title="Delete Project"
                                                >
                                                    <i className="fas fa-trash text-sm"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* Grid View */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map(project => (
                            <div 
                                key={project.id}
                                className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-xl p-6 transition-all duration-200 hover:shadow-lg ${
                                    showBulkActions ? 'cursor-default' : 'cursor-pointer'
                                }`}
                                onClick={() => {
                                    if (!showBulkActions) {
                                        setSelectedProject(project);
                                    }
                                }}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-start space-x-3 flex-1">
                                        {showBulkActions && (
                                            <input
                                                type="checkbox"
                                                checked={selectedProjects.includes(project.id)}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    toggleProjectSelection(project.id);
                                                }}
                                                className={`mt-1 w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 ${
                                                    isDark ? 'bg-gray-700 border-gray-600' : ''
                                                }`}
                                            />
                                        )}
                                        <div className="flex-1">
                                            <h3 className={`font-semibold text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-1`}>
                                                {project.name}
                                            </h3>
                                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {project.client}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            project.status === 'Active' ? 'bg-green-100 text-green-800' : 
                                            project.status === 'Completed' ? 'bg-blue-100 text-blue-800' :
                                            project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {project.status}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProject(project.id);
                                            }}
                                            className={`p-1 rounded-full transition-colors ${
                                                isDark 
                                                    ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' 
                                                    : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                                            }`}
                                            title="Delete Project"
                                        >
                                            <i className="fas fa-trash text-sm"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Type:</span>
                                        <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {project.type}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between text-sm">
                                        <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Due:</span>
                                        <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'No due date'}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between text-sm">
                                        <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Assigned:</span>
                                        <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {project.assignedTo || 'Unassigned'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Project Modal */}
            {showModal && (
                <ProjectModal
                    project={selectedProject}
                    onSave={handleSaveProject}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedProject(null);
                    }}
                    allClients={[]} // Will be loaded from database
                />
            )}

            {/* Project detail rendering handled by early return above */}
        </div>
    );
};

// Make available globally
window.ProjectsDatabaseFirst = ProjectsDatabaseFirst;
