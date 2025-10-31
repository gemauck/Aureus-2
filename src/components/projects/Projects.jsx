// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;
const ProjectModal = window.ProjectModal;
const ProjectDetail = window.ProjectDetail;
const SectionCommentWidget = window.SectionCommentWidget;

const Projects = () => {
    const { logout } = window.useAuth();
    const [projects, setProjects] = useState([]); // Projects are database-only
    const [showModal, setShowModal] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [viewingProject, setViewingProject] = useState(null);
    const [showProgressTracker, setShowProgressTracker] = useState(false);
    const [draggedProject, setDraggedProject] = useState(null);
    const [selectedClient, setSelectedClient] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [waitingForProjectDetail, setWaitingForProjectDetail] = useState(false);
    const [projectDetailAvailable, setProjectDetailAvailable] = useState(!!window.ProjectDetail);
    
    // Ensure storage is available
    useEffect(() => {
        if (!window.storage) {
            console.error('❌ Projects: Storage not available! Make sure localStorage.js is loaded before Projects component.');
            // Try to wait for storage to be available
            const checkStorage = () => {
                if (window.storage) {
                    console.log('✅ Projects: Storage became available');
                } else {
                    setTimeout(checkStorage, 100);
                }
            };
            checkStorage();
        } else {
            console.log('✅ Projects: Storage is available');
        }
    }, []);
    
    // Load projects from data service on mount
    useEffect(() => {
        const loadProjects = async () => {
            // Skip if we already have projects (component staying mounted)
            if (projects.length > 0) {
                console.log(`⚡ Projects: Skipping load - already have ${projects.length} projects`);
                setIsLoading(false);
                return;
            }
            
            setIsLoading(true);
            setLoadError(null);
            
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    console.warn('⚠️ Projects: No authentication token found - logging out');
                    setProjects([]);
                    setIsLoading(false);
                    await logout();
                    window.location.hash = '#/login';
                    return;
                }

                console.log('🔄 Projects: Loading projects from database');
                
                // Wait for DatabaseAPI to be available (with timeout)
                let waitAttempts = 0;
                while (!window.DatabaseAPI && waitAttempts < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    waitAttempts++;
                }
                
                if (!window.DatabaseAPI) {
                    console.error('❌ Projects: DatabaseAPI not available on window object after waiting');
                    console.error('🔍 Available window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('database') || k.toLowerCase().includes('api')));
                    setProjects([]);
                    setLoadError('Database API not available. Please refresh the page.');
                    setIsLoading(false);
                    return;
                }
                
                if (!window.DatabaseAPI.getProjects) {
                    console.error('❌ Projects: DatabaseAPI.getProjects method not available');
                    console.error('🔍 DatabaseAPI methods:', Object.keys(window.DatabaseAPI));
                    setProjects([]);
                    setLoadError('Projects API method not available. Please refresh the page.');
                    setIsLoading(false);
                    return;
                }
                
                console.log('✅ DatabaseAPI.getProjects is available, making request...');
                const response = await window.DatabaseAPI.getProjects();
                console.log('📡 Raw response from database:', response);
                console.log('📡 Response structure check:', {
                    hasData: !!response?.data,
                    hasProjects: !!response?.data?.projects,
                    isProjectsArray: Array.isArray(response?.data?.projects),
                    projectsLength: response?.data?.projects?.length || 0,
                    dataKeys: response?.data ? Object.keys(response.data) : [],
                    responseKeys: Object.keys(response || {}),
                    responseType: typeof response,
                    dataType: typeof response?.data
                });
                
                // Handle different response structures - try all possible formats
                let apiProjects = [];
                
                // Try response.data.projects first (most common format)
                if (response?.data?.projects && Array.isArray(response.data.projects)) {
                    apiProjects = response.data.projects;
                    console.log('✅ Using response.data.projects, count:', apiProjects.length);
                } 
                // Try response.data.data.projects (nested data wrapper)
                else if (response?.data?.data?.projects && Array.isArray(response.data.data.projects)) {
                    apiProjects = response.data.data.projects;
                    console.log('✅ Using response.data.data.projects, count:', apiProjects.length);
                }
                // Try response.projects (direct projects array)
                else if (response?.projects && Array.isArray(response.projects)) {
                    apiProjects = response.projects;
                    console.log('✅ Using response.projects, count:', apiProjects.length);
                } 
                // Try response.data as array
                else if (Array.isArray(response?.data)) {
                    apiProjects = response.data;
                    console.log('✅ Using response.data as array, count:', apiProjects.length);
                } 
                // Try response as array
                else if (Array.isArray(response)) {
                    apiProjects = response;
                    console.log('✅ Using response as array, count:', apiProjects.length);
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
                        console.log('✅ Found projects in nested structure, count:', apiProjects.length);
                    } else {
                        console.error('❌ Could not find projects array in response');
                        apiProjects = [];
                    }
                }
                
                console.log('📡 Database returned projects:', apiProjects?.length || 0);
                if (apiProjects.length > 0) {
                    console.log('📡 First project sample:', apiProjects[0]);
                }
                
                // Normalize projects: map clientName to client for frontend compatibility
                const normalizedProjects = (Array.isArray(apiProjects) ? apiProjects : []).map(p => ({
                    ...p,
                    client: p.clientName || p.client || ''
                }));
                
                console.log('📡 Normalized projects:', normalizedProjects?.length || 0);
                
                // Ensure we always set an array
                setProjects(normalizedProjects);
                setIsLoading(false);
                
                // Sync existing projects with clients
                syncProjectsWithClients(apiProjects);
                
                // Check if there's a project to open immediately after loading
                const projectIdToOpen = sessionStorage.getItem('openProjectId');
                if (projectIdToOpen) {
                    const project = apiProjects.find(p => p.id === parseInt(projectIdToOpen));
                    if (project) {
                        // Open the project immediately
                        setViewingProject(project);
                        // Clear the flag
                        sessionStorage.removeItem('openProjectId');
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
        };

        loadProjects();
    }, []); // Only run once on initial mount

    // Helper function to sync existing projects with clients
    const syncProjectsWithClients = async (projectsList) => {
        try {
            if (window.dataService && typeof window.dataService.getClients === 'function' && typeof window.dataService.setClients === 'function') {
                const clients = await window.dataService.getClients() || [];
                const updatedClients = clients.map(client => {
                    const clientProjects = projectsList.filter(p => p.client === client.name);
                    const projectIds = clientProjects.map(p => p.id);
                    return {
                        ...client,
                        projectIds: projectIds
                    };
                });
                await window.dataService.setClients(updatedClients);
                
                // Dispatch event to notify other components
                window.dispatchEvent(new CustomEvent('clientsUpdated'));
            }
        } catch (error) {
            console.warn('Error syncing projects with clients:', error);
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

    const handleAddProject = () => {
        setSelectedProject(null);
        setShowModal(true);
    };

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
        console.log('Viewing project:', project);
        console.log('ProjectDetail component exists:', !!window.ProjectDetail, 'local:', !!ProjectDetail);
        console.log('🔍 DatabaseAPI check:', {
            exists: !!window.DatabaseAPI,
            hasGetProject: !!(window.DatabaseAPI && window.DatabaseAPI.getProject),
            getProjectType: window.DatabaseAPI?.getProject ? typeof window.DatabaseAPI.getProject : 'undefined',
            apiExists: !!window.api,
            apiHasGetProject: !!(window.api && window.api.getProject)
        });
        try {
            // Fetch full project data from API for detail view
            // Always use safe fallback approach to avoid function errors
            let response;
            
            // Safely check and use DatabaseAPI.getProject
            try {
                if (window.DatabaseAPI && 
                    window.DatabaseAPI.getProject && 
                    typeof window.DatabaseAPI.getProject === 'function') {
                    console.log('✅ Using window.DatabaseAPI.getProject');
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
                        console.log('✅ Using window.api.getProject');
                        response = await window.api.getProject(project.id);
                    } else {
                        throw new Error('window.api.getProject not available');
                    }
                } catch (api2Error) {
                    console.log('✅ Using direct fetch fallback');
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
            
            // Parse JSON string fields from database before passing to ProjectDetail
            const normalizedProject = {
                ...fullProject,
                client: fullProject.clientName || fullProject.client || '',
                taskLists: typeof fullProject.taskLists === 'string' ? JSON.parse(fullProject.taskLists || '[]') : (fullProject.taskLists || []),
                tasks: typeof fullProject.tasksList === 'string' ? JSON.parse(fullProject.tasksList || '[]') : (fullProject.tasks || fullProject.tasksList || []),
                customFieldDefinitions: typeof fullProject.customFieldDefinitions === 'string' ? JSON.parse(fullProject.customFieldDefinitions || '[]') : (fullProject.customFieldDefinitions || []),
                documents: typeof fullProject.documents === 'string' ? JSON.parse(fullProject.documents || '[]') : (fullProject.documents || []),
                comments: typeof fullProject.comments === 'string' ? JSON.parse(fullProject.comments || '[]') : (fullProject.comments || []),
                activityLog: typeof fullProject.activityLog === 'string' ? JSON.parse(fullProject.activityLog || '[]') : (fullProject.activityLog || []),
                team: typeof fullProject.team === 'string' ? JSON.parse(fullProject.team || '[]') : (fullProject.team || [])
            };
            console.log('Normalized project for ProjectDetail:', normalizedProject);
            setViewingProject(normalizedProject);
        } catch (error) {
            console.error('Error setting viewingProject:', error);
            alert('Error opening project: ' + error.message);
        }
    };

    const handleSaveProject = async (projectData) => {
        console.log('💾 handleSaveProject called:');
        console.log('  - projectData.name:', projectData?.name);
        console.log('  - projectData.client:', projectData?.client);
        console.log('  - full projectData:', JSON.stringify(projectData, null, 2));
        
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
                console.log('🌐 Updating project in database:', selectedProject.id);
                const updatedProject = { ...selectedProject, ...projectData };
                const apiResponse = await window.DatabaseAPI.updateProject(selectedProject.id, updatedProject);
                console.log('📥 Update API Response:', apiResponse);
                
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
                    taskLists: JSON.stringify([{ id: 1, name: 'To Do', color: 'blue' }]),
                    tasksList: JSON.stringify([]),
                    customFieldDefinitions: JSON.stringify([]),
                    team: JSON.stringify([]),
                    notes: ''
                };
                
                console.log('🌐 Creating project in database:');
                console.log('  - name:', newProject.name);
                console.log('  - clientName:', newProject.clientName);
                console.log('  - type:', newProject.type);
                console.log('  - full project data:', JSON.stringify(newProject, null, 2));
                
                const apiResponse = await window.DatabaseAPI.createProject(newProject);
                console.log('📥 API Response:', apiResponse);
                
                // Extract the project from the response structure { data: { project: {...} } }
                const savedProject = apiResponse?.data?.project || apiResponse?.project || apiResponse?.data;
                console.log('📥 Extracted project:', savedProject);
                
                if (savedProject && savedProject.id) {
                    // Normalize: map clientName to client for frontend compatibility
                    const normalizedProject = {
                        ...savedProject,
                        client: savedProject.clientName || savedProject.client || ''
                    };
                    setProjects([...projects, normalizedProject]);
                    
                    // Update client's projectIds for new project
                    if (projectData.client) {
                        updateClientProjectIds(null, projectData.client, savedProject.id);
                    }
                } else {
                    console.error('❌ API did not return a valid project with id:', savedProject);
                    alert('Project created but failed to retrieve. Please refresh the page.');
                }
            }
            setShowModal(false);
            setSelectedProject(null);
        } catch (error) {
            console.error('❌ Error saving project:', error);
            alert('Failed to save project: ' + error.message);
        }
    };

    // Helper function to update client's projectIds
    const updateClientProjectIds = async (oldClientName, newClientName, projectId) => {
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
    };

    const handleDeleteProject = async (projectId) => {
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
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

            const projectToDelete = projects.find(p => p.id === projectId);
            
            console.log('🗑️ Deleting project from database:', projectId);
            
            // Call the delete API
            const result = await window.DatabaseAPI.deleteProject(projectId);
            console.log('✅ Delete API response:', result);
            
            // Update local state - remove the deleted project
            setProjects(prevProjects => {
                const updated = prevProjects.filter(p => p.id !== projectId);
                console.log(`✅ Updated projects list: ${prevProjects.length} -> ${updated.length}`);
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
                    console.log('✅ Projects reloaded after deletion');
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
    };

    // Get unique clients from projects
    const uniqueClients = [...new Set(projects.map(p => p.client))].sort();

    // Filter projects by selected client, search term, status and sort alphabetically by client name
    const filteredProjects = projects.filter(p => {
        const matchesClient = selectedClient === 'all' || p.client === selectedClient;
        const matchesSearch = searchTerm === '' || 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.assignedTo?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
        return matchesClient && matchesSearch && matchesStatus;
    }).sort((a, b) => a.client.localeCompare(b.client));

    if (showProgressTracker) {
        return <window.ProjectProgressTracker onBack={() => setShowProgressTracker(false)} />;
    }

    // Function to actively load ProjectDetail if not available
    const loadProjectDetail = async () => {
        if (window.ProjectDetail) {
            console.log('✅ ProjectDetail already available');
            setProjectDetailAvailable(true);
            return true;
        }
        
        // Check if script is already in DOM
        const existingScript = document.querySelector(`script[src*="ProjectDetail.js"]`);
        if (existingScript) {
            console.log('⏳ ProjectDetail script already loading, waiting...');
            // Wait for it to finish loading
            return new Promise((resolve) => {
                let attempts = 0;
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (window.ProjectDetail) {
                        console.log('✅ ProjectDetail loaded from existing script');
                        setProjectDetailAvailable(true);
                        clearInterval(checkInterval);
                        resolve(true);
                    } else if (attempts >= 50) {
                        console.warn('⚠️ ProjectDetail script loaded but component not registered');
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }, 100);
            });
        }
        
        // Try to load ProjectDetail from the lazy loader path
        const projectDetailPath = './dist/src/components/projects/ProjectDetail.js';
        console.log('📥 Loading ProjectDetail from:', projectDetailPath);
        
        try {
            const script = document.createElement('script');
            script.src = projectDetailPath;
            script.type = 'text/javascript';
            script.async = false; // Load synchronously to ensure it executes
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('ProjectDetail load timeout after 5 seconds'));
                }, 5000);
                
                script.onload = () => {
                    console.log('✅ ProjectDetail script loaded, checking registration...');
                    // Wait for the script to execute and register
                    let attempts = 0;
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (window.ProjectDetail) {
                            console.log('✅ ProjectDetail registered successfully');
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            setProjectDetailAvailable(true);
                            resolve(true);
                        } else if (attempts >= 20) {
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            reject(new Error('ProjectDetail not registered after script load (waited 2s)'));
                        }
                    }, 100);
                };
                
                script.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error('❌ Failed to load ProjectDetail script:', error);
                    reject(new Error(`Failed to load ProjectDetail script: ${error.message || 'Unknown error'}`));
                };
                
                document.head.appendChild(script);
            });
            return true;
        } catch (error) {
            console.error('❌ Failed to actively load ProjectDetail:', error);
            // Try alternative path
            const altPath = '/dist/src/components/projects/ProjectDetail.js';
            console.log('🔄 Trying alternative path:', altPath);
            
            try {
                const script2 = document.createElement('script');
                script2.src = altPath;
                script2.type = 'text/javascript';
                script2.async = false;
                
                await new Promise((resolve, reject) => {
                    script2.onload = () => {
                        setTimeout(() => {
                            if (window.ProjectDetail) {
                                setProjectDetailAvailable(true);
                                resolve(true);
                            } else {
                                reject(new Error('ProjectDetail not registered from alt path'));
                            }
                        }, 200);
                    };
                    script2.onerror = () => reject(new Error('Alt path also failed'));
                    document.head.appendChild(script2);
                });
                return true;
            } catch (altError) {
                console.error('❌ Alternative path also failed:', altError);
                return false;
            }
        }
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
                    setViewingProject({...viewingProject}); // Force re-render
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
                            // Force re-render
                            setViewingProject({...viewingProject});
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
    
    // Also listen for when ProjectDetail loads globally
    useEffect(() => {
        const checkProjectDetail = () => {
            if (window.ProjectDetail && !projectDetailAvailable) {
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
                if (viewingProject) {
                    // Force re-render to show ProjectDetail
                    setViewingProject({...viewingProject});
                }
            }
        };
        
        // Check periodically even when not viewing a project
        const interval = setInterval(checkProjectDetail, 500);
        
        // Also check on window load events
        window.addEventListener('load', checkProjectDetail);
        
        return () => {
            clearInterval(interval);
            window.removeEventListener('load', checkProjectDetail);
        };
    }, [projectDetailAvailable, viewingProject]);

    if (viewingProject) {
        try {
            // Check window.ProjectDetail directly (it may be loaded lazily)
            const ProjectDetailComponent = window.ProjectDetail;
            if (!ProjectDetailComponent) {
                console.error('ProjectDetail component not found!', {
                    windowProjectDetail: typeof window.ProjectDetail,
                    localProjectDetail: typeof ProjectDetail,
                    projectDetailAvailable: projectDetailAvailable,
                    waitingForProjectDetail: waitingForProjectDetail,
                    availableComponents: Object.keys(window).filter(key => key.includes('Project') || key.includes('Detail'))
                });
                
                return (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h2 className="text-lg font-semibold text-red-800 mb-2">
                            {waitingForProjectDetail ? 'Loading ProjectDetail...' : 'Error: ProjectDetail component not loaded'}
                        </h2>
                        <p className="text-sm text-red-600 mb-3">
                            {waitingForProjectDetail 
                                ? 'Waiting for ProjectDetail component to load...' 
                                : 'The ProjectDetail component is not available. It may still be loading. Please wait a moment and try again.'}
                        </p>
                        <button 
                            onClick={() => setViewingProject(null)}
                            className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm font-medium"
                        >
                            Back to Projects
                        </button>
                    </div>
                );
            }
            return <ProjectDetailComponent 
                project={viewingProject} 
                onBack={() => setViewingProject(null)}
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
                    <button 
                        onClick={() => setShowProgressTracker(true)}
                        className="px-3 py-1.5 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors flex items-center text-sm font-medium"
                    >
                        <i className="fas fa-chart-line mr-1.5 text-xs"></i>
                        Progress Tracker
                    </button>
                    <button 
                        onClick={handleAddProject}
                        className="bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors flex items-center text-sm font-medium"
                    >
                        <i className="fas fa-plus mr-1.5 text-xs"></i>
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
                        />
                    </div>
                    <select
                        value={selectedClient}
                        onChange={(e) => setSelectedClient(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Clients ({projects.length})</option>
                        {uniqueClients.map(client => {
                            const clientCount = projects.filter(p => p.client === client).length;
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
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredProjects.map((project, index) => (
                                <div 
                                    key={project.id}
                                    draggable
                                    onDragStart={(e) => {
                                        setDraggedProject(index);
                                        e.dataTransfer.effectAllowed = 'move';
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
                                    }}
                                    onDragEnd={() => setDraggedProject(null)}
                                    onClick={() => handleViewProject(project)}
                                    className="bg-white rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all p-4 cursor-pointer"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{project.name}</h3>
                                            <p className="text-xs text-gray-500">{project.client}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${
                                                project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                                project.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                project.status === 'Completed' ? 'bg-purple-100 text-purple-700' :
                                                project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-700' :
                                                project.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
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
        </div>
    );
};

// Make available globally
try {
    window.Projects = Projects;
    console.log('✅ Projects component registered on window.Projects');
} catch (error) {
    console.error('❌ Error registering Projects component:', error);
}
