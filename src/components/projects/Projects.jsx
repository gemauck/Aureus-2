// Get dependencies from window
const { useState, useEffect, useRef, useCallback } = React;
const storage = window.storage;
const ProjectModal = window.ProjectModal;
const ProjectDetail = window.ProjectDetail;
const SectionCommentWidget = window.SectionCommentWidget;

// Safe useAuth wrapper - always returns a consistent hook result
const useAuthSafe = () => {
    if (window.useAuth && typeof window.useAuth === 'function') {
        return window.useAuth();
    }
    // Return a default object if useAuth is not available yet
    return {
        user: null,
        logout: () => {
            console.warn('⚠️ Projects: useAuth not available, cannot logout');
            window.location.hash = '#/login';
        },
        loading: false,
        refreshUser: async () => null
    };
};

const Projects = () => {
    const { logout } = useAuthSafe();
    const [projects, setProjects] = useState([]); // Projects are database-only
    const [showModal, setShowModal] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [viewingProject, setViewingProject] = useState(null);
    
    // Memoize callbacks to prevent unnecessary re-renders of ProjectDetail
    const handleBackFromProject = useCallback(() => {
        setViewingProject(null);
    }, []);
    const [showProgressTracker, setShowProgressTracker] = useState(false);
    const [trackerFocus, setTrackerFocus] = useState(null);
    const [draggedProject, setDraggedProject] = useState(null);
    const mouseDownRef = useRef(null);
    const [selectedClient, setSelectedClient] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    // Always default to 'grid' view for recent upgrades - ensure consistent loading
    const [viewMode, setViewMode] = useState(() => {
        // Check localStorage but default to 'grid' to ensure recent upgrades are shown
        if (typeof window !== 'undefined' && window.localStorage) {
            const saved = window.localStorage.getItem('projectsViewMode');
            // Only use saved value if it's valid, otherwise default to 'grid'
            return (saved === 'grid' || saved === 'list') ? saved : 'grid';
        }
        return 'grid';
    });
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [waitingForProjectDetail, setWaitingForProjectDetail] = useState(false);
    const [projectDetailAvailable, setProjectDetailAvailable] = useState(!!window.ProjectDetail);
    const [waitingForTracker, setWaitingForTracker] = useState(false);
    const [forceRender, setForceRender] = useState(0); // Force re-render when ProjectDetail loads
    const [projectModalComponent, setProjectModalComponent] = useState(() => 
        typeof window.ProjectModal === 'function' ? window.ProjectModal : null
    );
    const [isProjectModalLoading, setIsProjectModalLoading] = useState(false);
    
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
            if (window.location.hash !== newHash) {
                window.location.hash = newHash;
            } else {
                setShowProgressTracker(true);
                setTrackerFocus({
                    projectId: params.projectId || null,
                    monthIndex: typeof params.monthIndex === 'number' && !Number.isNaN(params.monthIndex) ? params.monthIndex : null,
                    month: params.month || null,
                    field: params.field || null,
                    year: params.year || null
                });
            }
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

    // Persist viewMode to localStorage and ensure it defaults to 'grid' for recent upgrades
    useEffect(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            // Always default to 'grid' to ensure recent upgrades are shown
            if (!viewMode || (viewMode !== 'grid' && viewMode !== 'list')) {
                setViewMode('grid');
                window.localStorage.setItem('projectsViewMode', 'grid');
            } else {
                window.localStorage.setItem('projectsViewMode', viewMode);
            }
        }
    }, [viewMode]);
    
    // Ensure ProjectModal is loaded
    useEffect(() => {
        if (!projectModalComponent && window.ProjectModal && typeof window.ProjectModal === 'function') {
            setProjectModalComponent(window.ProjectModal);
        }
    }, [projectModalComponent]);
    
    // Wait for ProjectProgressTracker component to load when needed
    useEffect(() => {
        if (showProgressTracker && !window.ProjectProgressTracker && !waitingForTracker) {
            console.warn('⚠️ Projects: ProjectProgressTracker not available yet, waiting...');
            setWaitingForTracker(true);
            let attempts = 0;
            const maxAttempts = 20; // 2 seconds max
            
            // Listen for componentLoaded event
            const handleComponentLoaded = (event) => {
                if (event.detail && event.detail.component === 'ProjectProgressTracker') {
                    console.log('✅ ProjectProgressTracker loaded via componentLoaded event');
                    setWaitingForTracker(false);
                    setForceRender(prev => prev + 1);
                }
            };
            window.addEventListener('componentLoaded', handleComponentLoaded);
            
            const checkInterval = setInterval(() => {
                attempts++;
                if (window.ProjectProgressTracker || attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    window.removeEventListener('componentLoaded', handleComponentLoaded);
                    setWaitingForTracker(false);
                    if (window.ProjectProgressTracker) {
                        console.log('✅ ProjectProgressTracker became available');
                    } else {
                        console.error('❌ ProjectProgressTracker still not available after waiting');
                    }
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
            
            // Check for refresh parameter in URL - clear cache if present
            const hash = window.location.hash || '';
            const urlParams = new URLSearchParams(hash.split('?')[1] || '');
            const shouldRefresh = urlParams.has('refresh') || urlParams.has('forceRefresh');
            
            if (shouldRefresh) {
                console.log('🔄 Projects: Refresh parameter detected, clearing cache...');
                // Clear projects cache
                if (window.DatabaseAPI?.clearEndpointCache) {
                    window.DatabaseAPI.clearEndpointCache('/projects', 'GET');
                }
                if (window.DatabaseAPI?._responseCache) {
                    window.DatabaseAPI._responseCache.delete('GET:/projects');
                }
                // Clear ComponentCache for projects
                if (window.ComponentCache?.clear) {
                    window.ComponentCache.clear('projects');
                }
                console.log('✅ Projects cache cleared');
            }
            
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

                console.log('🔄 Projects: Loading projects from database');
                
                // Wait for DatabaseAPI to be available (with timeout - max 5 seconds)
                let waitAttempts = 0;
                const maxWaitAttempts = 50; // 5 seconds total (50 * 100ms)
                
                while (!window.DatabaseAPI && waitAttempts < maxWaitAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    waitAttempts++;
                    
                    // Log progress every 10 attempts (1 second)
                    if (waitAttempts % 10 === 0) {
                        console.log(`⏳ Projects: Waiting for DatabaseAPI... (${waitAttempts * 100}ms elapsed)`);
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
                
                console.log('✅ DatabaseAPI.getProjects is available, making request...');
                let response;
                try {
                    response = await window.DatabaseAPI.getProjects();
                    
                    // Validate response exists
                    if (!response) {
                        throw new Error('API returned null or undefined response');
                    }
                    
                    // Check if response is an error response
                    if (response.error) {
                        const errorMsg = response.error.message || response.error || 'Unknown API error';
                        throw new Error(`API returned error: ${errorMsg}`);
                    }
                    
                    console.log('📡 Raw response from database:', response);
                    console.log('📡 Response structure check:', {
                        hasData: !!response?.data,
                        hasProjects: !!response?.data?.projects,
                        isProjectsArray: Array.isArray(response?.data?.projects),
                        projectsLength: response?.data?.projects?.length || 0,
                        dataKeys: response?.data ? Object.keys(response.data) : [],
                        responseKeys: Object.keys(response || {}),
                        responseType: typeof response,
                        dataType: typeof response?.data,
                        fullResponse: JSON.stringify(response).substring(0, 500)
                    });
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
                        console.error('❌ Full response structure:', JSON.stringify(response, null, 2).substring(0, 1000));
                        apiProjects = [];
                        // If we can't find projects but response exists, this might be an error response
                        if (response?.error) {
                            throw new Error(response.error.message || response.error || 'Unknown error from API');
                        }
                    }
                }
                
                console.log('📡 Database returned projects:', apiProjects?.length || 0);
                if (apiProjects.length > 0) {
                    console.log('📡 First project sample:', apiProjects[0]);
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
                
                console.log('📡 Normalized projects:', normalizedProjects?.length || 0);
                
                // Ensure we always set an array (only if component is still mounted)
                if (isMounted) {
                    setProjects(normalizedProjects);
                    setIsLoading(false);
                    
                    // Sync existing projects with clients (non-blocking, won't crash on failure)
                    syncProjectsWithClients(apiProjects).catch(err => {
                        console.warn('⚠️ Projects: Client sync failed, but continuing anyway:', err.message);
                    });
                    
                    // Check if there's a project to open immediately after loading
                    const projectIdToOpen = sessionStorage.getItem('openProjectId');
                    if (projectIdToOpen) {
                        const project = apiProjects.find(p => p.id === parseInt(projectIdToOpen));
                        if (project) {
                            // Only open if we're not already viewing this project (prevent unnecessary re-renders)
                            setViewingProject(prev => {
                                if (prev && prev.id === project.id) {
                                    console.log('⏭️ Already viewing this project, skipping setViewingProject');
                                    return prev;
                                }
                                return project;
                            });
                            // Clear the flag
                            sessionStorage.removeItem('openProjectId');
                        }
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

    // Proactively load ProjectDetail component when Projects component mounts
    useEffect(() => {
        // Check if already available
        if (window.ProjectDetail) {
            console.log('✅ Projects: ProjectDetail already available on mount');
            setProjectDetailAvailable(true);
            return;
        }
        
        // Wait a bit for lazy loader to finish, then check again
        const checkForProjectDetail = () => {
            if (window.ProjectDetail) {
                console.log('✅ Projects: ProjectDetail loaded by lazy loader');
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
                    console.log('📥 Projects: ProjectDetail not loaded by lazy loader, loading manually...');
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
            console.log('✅ ProjectDetail already available');
            setProjectDetailAvailable(true);
            return true;
        }
        
        // Strategy 0: Wait for existing script to finish
        const existingScript = document.querySelector(`script[src*="ProjectDetail.js"]`);
        if (existingScript && !existingScript.complete) {
            console.log('⏳ ProjectDetail script already loading, waiting...');
            return new Promise((resolve) => {
                let attempts = 0;
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (window.ProjectDetail) {
                        console.log('✅ ProjectDetail loaded from existing script');
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
                console.log(`📥 Strategy 1 (Blob): Loading ProjectDetail from ${path}...`);
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
                            console.log('✅ Strategy 1 (Blob): ProjectDetail registered successfully');
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
                console.log(`📥 Strategy 2 (Direct): Loading ProjectDetail from ${path}...`);
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
                            console.log('✅ Strategy 2 (Direct): ProjectDetail registered successfully');
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
            console.log(`🔄 All strategies failed, retrying in 1 second... (${retryCount + 1}/${maxRetries})`);
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
    // ⚠️ FIXED: Removed periodic setInterval that was causing constant re-renders
    // Only check when ProjectDetail becomes available, not continuously
    useEffect(() => {
        const checkProjectDetail = () => {
            if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                if (!projectDetailAvailable) {
                    console.log('✅ ProjectDetail became available, updating state');
                    setProjectDetailAvailable(true);
                    setWaitingForProjectDetail(false);
                    setForceRender(prev => prev + 1);
                }
                // REMOVED: Periodic re-render that was causing refresh issues
                // Only update state when ProjectDetail first becomes available
            }
        };
        
        // Check immediately
        checkProjectDetail();
        
        // REMOVED: Periodic interval that was causing constant re-renders every 200ms
        // This was the main cause of the refresh issue
        
        // Also check on window load events
        window.addEventListener('load', checkProjectDetail);
        
        // Listen for custom event when components are loaded
        const handleComponentLoaded = (event) => {
            if (event.detail && event.detail.component === 'ProjectDetail') {
                console.log('✅ ProjectDetail loaded via componentLoaded event - forcing re-render');
                checkProjectDetail();
                setForceRender(prev => prev + 1);
            }
        };
        window.addEventListener('componentLoaded', handleComponentLoaded);
        
        return () => {
            window.removeEventListener('load', checkProjectDetail);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, [projectDetailAvailable]); // Removed viewingProject from dependencies to prevent re-renders

    // Helper function to sync existing projects with clients
    // This is a non-critical operation - failures won't crash the component
    const syncProjectsWithClients = async (projectsList) => {
        try {
            // Don't sync if clients API is failing - skip silently to prevent crashes
            if (!window.dataService) {
                console.log('⚠️ Projects: dataService not available, skipping client sync');
                return;
            }
            
            if (typeof window.dataService.getClients !== 'function' || typeof window.dataService.setClients !== 'function') {
                console.log('⚠️ Projects: dataService methods not available, skipping client sync');
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
                console.log('⚠️ Projects: No clients available for sync, skipping');
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

    const handleAddProject = async () => {
        // Ensure ProjectModal is loaded before showing modal
        if (!projectModalComponent && !isProjectModalLoading) {
            console.log('⏳ ProjectModal not loaded, loading now...');
            setIsProjectModalLoading(true);
            
            // Try to load ProjectModal
            let loaded = false;
            for (let i = 0; i < 50; i++) {
                if (window.ProjectModal && typeof window.ProjectModal === 'function') {
                    console.log('✅ ProjectModal loaded');
                    setProjectModalComponent(window.ProjectModal);
                    loaded = true;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (!loaded) {
                // Try loading the script directly
                console.log('🚀 Attempting to load ProjectModal script...');
                const script = document.createElement('script');
                script.src = '/dist/src/components/projects/ProjectModal.js';
                script.async = true;
                await new Promise((resolve, reject) => {
                    script.onload = () => {
                        // Wait for initialization
                        let attempts = 0;
                        const checkInit = setInterval(() => {
                            attempts++;
                            if (window.ProjectModal && typeof window.ProjectModal === 'function') {
                                console.log('✅ ProjectModal loaded via script');
                                setProjectModalComponent(window.ProjectModal);
                                clearInterval(checkInit);
                                setIsProjectModalLoading(false);
                                resolve();
                            } else if (attempts >= 50) {
                                console.error('❌ ProjectModal failed to initialize');
                                clearInterval(checkInit);
                                setIsProjectModalLoading(false);
                                alert('Failed to load project editor. Please refresh the page.');
                                reject(new Error('ProjectModal failed to load'));
                            }
                        }, 100);
                    };
                    script.onerror = () => {
                        console.error('❌ Failed to load ProjectModal script');
                        setIsProjectModalLoading(false);
                        alert('Failed to load project editor. Please refresh the page.');
                        reject(new Error('Failed to load ProjectModal script'));
                    };
                    document.body.appendChild(script);
                });
            } else {
                setIsProjectModalLoading(false);
            }
        }
        
        // Only show modal if ProjectModal is loaded
        if (projectModalComponent || (window.ProjectModal && typeof window.ProjectModal === 'function')) {
            if (!projectModalComponent) {
                setProjectModalComponent(window.ProjectModal);
            }
            setSelectedProject(null);
            setShowModal(true);
        } else {
            alert('Project editor is still loading. Please wait a moment and try again.');
        }
    };

    const handleEditProject = async (project) => {
        try {
            // Ensure ProjectModal is loaded before showing modal
            if (!projectModalComponent && !isProjectModalLoading) {
                console.log('⏳ ProjectModal not loaded for edit, loading now...');
                setIsProjectModalLoading(true);
                
                // Try to load ProjectModal
                let loaded = false;
                for (let i = 0; i < 50; i++) {
                    if (window.ProjectModal && typeof window.ProjectModal === 'function') {
                        console.log('✅ ProjectModal loaded');
                        setProjectModalComponent(window.ProjectModal);
                        loaded = true;
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                if (!loaded) {
                    // Try loading the script directly
                    console.log('🚀 Attempting to load ProjectModal script...');
                    const script = document.createElement('script');
                    script.src = '/dist/src/components/projects/ProjectModal.js';
                    script.async = true;
                    await new Promise((resolve, reject) => {
                        script.onload = () => {
                            // Wait for initialization
                            let attempts = 0;
                            const checkInit = setInterval(() => {
                                attempts++;
                                if (window.ProjectModal && typeof window.ProjectModal === 'function') {
                                    console.log('✅ ProjectModal loaded via script');
                                    setProjectModalComponent(window.ProjectModal);
                                    clearInterval(checkInit);
                                    setIsProjectModalLoading(false);
                                    resolve();
                                } else if (attempts >= 50) {
                                    console.error('❌ ProjectModal failed to initialize');
                                    clearInterval(checkInit);
                                    setIsProjectModalLoading(false);
                                    alert('Failed to load project editor. Please refresh the page.');
                                    reject(new Error('ProjectModal failed to load'));
                                }
                            }, 100);
                        };
                        script.onerror = () => {
                            console.error('❌ Failed to load ProjectModal script');
                            setIsProjectModalLoading(false);
                            alert('Failed to load project editor. Please refresh the page.');
                            reject(new Error('Failed to load ProjectModal script'));
                        };
                        document.body.appendChild(script);
                    });
                } else {
                    setIsProjectModalLoading(false);
                }
            }
            
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
            
            // Only show modal if ProjectModal is loaded
            if (projectModalComponent || (window.ProjectModal && typeof window.ProjectModal === 'function')) {
                if (!projectModalComponent) {
                    setProjectModalComponent(window.ProjectModal);
                }
                setSelectedProject(normalizedProject);
                setShowModal(true);
            } else {
                alert('Project editor is still loading. Please wait a moment and try again.');
            }
        } catch (error) {
            console.error('Error loading project for editing:', error);
            alert('Error loading project: ' + error.message);
        }
    };

    const handleViewProject = async (project) => {
        // Skip if we're already viewing this exact project (prevent unnecessary re-renders)
        if (viewingProject && viewingProject.id === project.id) {
            console.log('⏭️ Already viewing this project, skipping handleViewProject');
            return;
        }
        
        console.log('Viewing project:', project);
        console.log('ProjectDetail component exists:', !!window.ProjectDetail, 'type:', typeof window.ProjectDetail);
        console.log('🔍 ProjectDetail initialization state:', {
            exists: !!window.ProjectDetail,
            type: typeof window.ProjectDetail,
            isFunction: typeof window.ProjectDetail === 'function',
            initializing: !!window._projectDetailInitializing,
            projectDetailAvailable: projectDetailAvailable
        });
        
        // BULLETPROOF: ALWAYS check if ProjectDetail is loaded AND initialized
        // The lazy loader might say it's loaded, but initialization might still be waiting for dependencies
        if (!window.ProjectDetail || typeof window.ProjectDetail !== 'function') {
            console.log('🔵 handleViewProject: ProjectDetail not available, loading NOW with all strategies...');
            
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
            console.log('⏳ Strategy 1: Waiting for ProjectDetail initialization to complete...');
            for (let i = 0; i < 50; i++) {
                if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                    console.log(`✅ ProjectDetail found after ${i * 100}ms wait (initialization completed)`);
                    loaded = true;
                    break;
                }
                // Check if it's still initializing
                if (window._projectDetailInitializing) {
                    console.log(`⏳ ProjectDetail still initializing... (attempt ${i + 1}/50)`);
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Strategy 2: Use the bulletproof loader
            if (!loaded) {
                console.log('🚀 Strategy 2: Using bulletproof loader...');
                loaded = await loadProjectDetail();
            }
            
            // Strategy 3: Direct script injection as fallback
            if (!loaded && (!window.ProjectDetail || typeof window.ProjectDetail !== 'function')) {
                console.log('🚀 Strategy 3: Direct script injection...');
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
                                console.log('✅ Direct script injection successful, ProjectDetail initialized');
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
                console.log('✅ handleViewProject: ProjectDetail loaded and initialized successfully');
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
                console.log('✅ ProjectDetail is available, updating flag');
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
                team: typeof fullProject.team === 'string' ? JSON.parse(fullProject.team || '[]') : (fullProject.team || []),
                // Ensure hasDocumentCollectionProcess is properly included (boolean from database)
                // Handle both boolean and string values from database - normalize to boolean
                hasDocumentCollectionProcess: (() => {
                    const value = fullProject.hasDocumentCollectionProcess;
                    if (value === true || value === 'true' || value === 1) return true;
                    if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
                    return false;
                })()
            };
            console.log('Normalized project for ProjectDetail:', normalizedProject);
            console.log('🔍 hasDocumentCollectionProcess value:', {
                raw: fullProject.hasDocumentCollectionProcess,
                normalized: normalizedProject.hasDocumentCollectionProcess,
                type: typeof fullProject.hasDocumentCollectionProcess,
                isTrue: fullProject.hasDocumentCollectionProcess === true,
                isStringTrue: fullProject.hasDocumentCollectionProcess === 'true',
                fullProjectKeys: Object.keys(fullProject).filter(k => k.includes('Document') || k.includes('document'))
            });
            console.log('🔍 Full API response structure:', {
                hasData: !!response?.data,
                hasProject: !!response?.data?.project,
                responseKeys: Object.keys(response || {}),
                dataKeys: response?.data ? Object.keys(response.data) : [],
                projectKeys: response?.data?.project ? Object.keys(response.data.project).filter(k => k.includes('Document') || k.includes('document')) : []
            });
            
            // Expose a function to update viewingProject from child components
            // This allows ProjectDetail to refresh the project data after saving
            // ⚠️ FIXED: Prevent unnecessary re-renders by checking if project actually changed
            window.updateViewingProject = (updatedProject) => {
                if (!updatedProject || !updatedProject.id) {
                    console.warn('⚠️ updateViewingProject called with invalid project');
                    return;
                }

                if (updatedProject.skipDocumentSectionsUpdate) {
                    console.log('⏭️ Skipping updateViewingProject: skipDocumentSectionsUpdate flag set');
                    return;
                }
                
                // Only update if we're actually viewing this project
                if (!viewingProject || viewingProject.id !== updatedProject.id) {
                    console.log('⏭️ Skipping updateViewingProject: not viewing this project');
                    return;
                }
                
                // Check if the project data actually changed (deep comparison for documentSections)
                const currentDocumentSections = viewingProject.documentSections;
                const newDocumentSections = updatedProject.documentSections;
                const documentSectionsChanged = currentDocumentSections !== newDocumentSections;
                
                // If only documentSections changed and we're in document collection view, skip update
                // This prevents reloads when auto-saving document sections
                if (documentSectionsChanged && !updatedProject.skipDocumentSectionsUpdate) {
                    const isDocumentCollectionView = window.location.hash.includes('documentCollection') || 
                                                     (viewingProject.hasDocumentCollectionProcess && 
                                                      documentSectionsChanged);
                    if (isDocumentCollectionView) {
                        console.log('⏭️ Skipping updateViewingProject: documentSections changed during document collection editing');
                        return;
                    }
                }
                
                // Check if other important fields changed
                const importantFields = ['name', 'client', 'status', 'hasDocumentCollectionProcess', 'tasks', 'taskLists'];
                const hasImportantChanges = importantFields.some(field => {
                    return JSON.stringify(viewingProject[field]) !== JSON.stringify(updatedProject[field]);
                });
                
                if (!hasImportantChanges && !documentSectionsChanged) {
                    console.log('⏭️ Skipping updateViewingProject: no important changes detected');
                    return;
                }
                
                console.log('🔄 updateViewingProject: updating project (important changes detected)');
                console.log('🔄 Updating viewingProject from child component:', {
                    id: updatedProject.id,
                    hasDocumentCollectionProcess: updatedProject.hasDocumentCollectionProcess
                });
                // Normalize the project the same way we do in handleViewProject
                const normalized = {
                    ...updatedProject,
                    client: updatedProject.clientName || updatedProject.client || '',
                    taskLists: typeof updatedProject.taskLists === 'string' ? JSON.parse(updatedProject.taskLists || '[]') : (updatedProject.taskLists || []),
                    tasks: typeof updatedProject.tasksList === 'string' ? JSON.parse(updatedProject.tasksList || '[]') : (updatedProject.tasks || updatedProject.tasksList || []),
                    customFieldDefinitions: typeof updatedProject.customFieldDefinitions === 'string' ? JSON.parse(updatedProject.customFieldDefinitions || '[]') : (updatedProject.customFieldDefinitions || []),
                    documents: typeof updatedProject.documents === 'string' ? JSON.parse(updatedProject.documents || '[]') : (updatedProject.documents || []),
                    comments: typeof updatedProject.comments === 'string' ? JSON.parse(updatedProject.comments || '[]') : (updatedProject.comments || []),
                    activityLog: typeof updatedProject.activityLog === 'string' ? JSON.parse(updatedProject.activityLog || '[]') : (updatedProject.activityLog || []),
                    team: typeof updatedProject.team === 'string' ? JSON.parse(updatedProject.team || '[]') : (updatedProject.team || []),
                    hasDocumentCollectionProcess: (() => {
                        const value = updatedProject.hasDocumentCollectionProcess;
                        if (value === true || value === 'true' || value === 1) return true;
                        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
                        return false;
                    })()
                };
                
                // Use smart comparison to prevent unnecessary re-renders
                setViewingProject(prev => {
                    if (!prev || prev.id !== normalized.id) {
                        return normalized;
                    }
                    // Compare important fields to see if anything actually changed
                    const importantFields = ['name', 'client', 'status', 'hasDocumentCollectionProcess', 'tasks', 'taskLists', 'documentSections'];
                    const hasChanges = importantFields.some(field => {
                        const prevValue = prev[field];
                        const newValue = normalized[field];
                        // Use JSON.stringify for deep comparison of objects/arrays
                        return JSON.stringify(prevValue) !== JSON.stringify(newValue);
                    });
                    
                    if (!hasChanges) {
                        console.log('⏭️ Skipping viewingProject update: project data unchanged');
                        return prev; // Return previous object to prevent re-render
                    }
                    console.log('🔄 Updating viewingProject: project data changed');
                    return normalized;
                });
            };
            
            // Only set viewingProject if ProjectDetail is available
            if (window.ProjectDetail) {
                console.log('✅ ProjectDetail is available, setting viewingProject');
                // Only update if the project actually changed (prevent unnecessary re-renders)
                setViewingProject(prev => {
                    // If it's the same project ID, check if data actually changed
                    if (prev && prev.id === normalizedProject.id) {
                        // Compare important fields to see if anything actually changed
                        const importantFields = ['name', 'client', 'status', 'hasDocumentCollectionProcess', 'tasks', 'taskLists', 'documentSections'];
                        const hasChanges = importantFields.some(field => {
                            const prevValue = prev[field];
                            const newValue = normalizedProject[field];
                            // Use JSON.stringify for deep comparison of objects/arrays
                            return JSON.stringify(prevValue) !== JSON.stringify(newValue);
                        });
                        
                        if (!hasChanges) {
                            console.log('⏭️ Skipping viewingProject update: project data unchanged');
                            return prev; // Return previous object to prevent re-render
                        }
                        console.log('🔄 Updating viewingProject: project data changed');
                    }
                    // Create a new object reference only when data actually changed
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
                setViewingProject(normalizedProject);
                // The render will show the loading state
            }
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
            (p.client || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.assignedTo?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
        return matchesClient && matchesSearch && matchesStatus;
    }).sort((a, b) => {
        const aClient = a.client || '';
        const bClient = b.client || '';
        return aClient.localeCompare(bClient);
    });

    // Function to render Progress Tracker
    const renderProgressTracker = () => {
        console.log('🔍 Projects: showProgressTracker is true, checking component availability...');
        console.log('🔍 window.ProjectProgressTracker:', window.ProjectProgressTracker);
        console.log('🔍 typeof window.ProjectProgressTracker:', typeof window.ProjectProgressTracker);
        
        // Wrap in ErrorBoundary for additional safety
        // Use React.createElement to avoid JSX issues with window components
        const ErrorBoundary = window.ErrorBoundary || (({ children }) => children);
        const ProjectProgressTracker = window.ProjectProgressTracker;
        
        // Validate component before rendering
        // Handle both function components and React.memo wrapped components
        console.log('🔍 Validating ProjectProgressTracker component...');
        console.log('🔍 ProjectProgressTracker type:', typeof ProjectProgressTracker);
        console.log('🔍 ProjectProgressTracker value:', ProjectProgressTracker);
        
        const isValidComponent = ProjectProgressTracker && (
            typeof ProjectProgressTracker === 'function' ||
            (typeof ProjectProgressTracker === 'object' && (ProjectProgressTracker.$$typeof || ProjectProgressTracker.type))
        );
        
        console.log('🔍 isValidComponent:', isValidComponent);
        
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
            console.log('🔍 Using ProjectProgressTracker.type (React.memo/forwardRef detected)');
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
            console.log('🔍 Creating ProjectProgressTracker element...');
            console.log('🔍 React available:', !!React);
            console.log('🔍 ComponentToRender type:', typeof ComponentToRender);
            
            // Create the props object - ensure all values are primitives or valid React elements
            const trackerProps = {
                onBack: () => {
                    console.log('🔍 ProjectProgressTracker onBack called');
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
            
            console.log('🔍 Tracker props:', trackerProps);
            
            // Use React.createElement (the correct way to render components)
            let trackerElement;
            try {
                console.log('🔍 Creating element with React.createElement...');
                trackerElement = React.createElement(ComponentToRender, trackerProps);
                console.log('✅ ProjectProgressTracker element created:', trackerElement);
                
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
                console.log('✅ Wrapped in ErrorBoundary:', wrappedElement);
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
            console.log('🔵 Effect: ProjectDetail missing while viewing project, loading NOW...');
            setWaitingForProjectDetail(true);
            
            // Try loading with aggressive retries
            let retryCount = 0;
            const maxRetries = 5;
            
            const attemptLoad = () => {
                loadProjectDetail().then(loaded => {
                    if (loaded && window.ProjectDetail) {
                        console.log('✅ Effect: ProjectDetail loaded successfully');
                        setProjectDetailAvailable(true);
                        setWaitingForProjectDetail(false);
                        // REMOVED: Force re-render that was causing refresh issues
                        // React will re-render automatically when projectDetailAvailable changes
                    } else if (retryCount < maxRetries) {
                        retryCount++;
                        console.log(`🔄 Effect: Load failed, retrying in 500ms... (${retryCount}/${maxRetries})`);
                        setTimeout(attemptLoad, 500);
                    } else {
                        console.error('❌ Effect: All load attempts exhausted');
                        setWaitingForProjectDetail(false);
                    }
                });
            };
            
            attemptLoad();
        }
        
        // ⚠️ FIXED: Removed continuous polling that was causing constant re-renders
        // Only check when viewingProject changes, not continuously
        // The component will be available when needed without constant polling

    // BULLETPROOF: Immediate check when viewingProject changes (runs synchronously before paint)
    React.useLayoutEffect(() => {
        if (!viewingProject || window.ProjectDetail) return;
        
        // Immediate aggressive check - try multiple times quickly
        console.log('⚡ LayoutEffect: Immediate ProjectDetail check for viewingProject');
        let attempts = 0;
        let cancelled = false;
        const quickCheck = () => {
            if (cancelled) return;
            attempts++;
            if (window.ProjectDetail) {
                console.log('✅ LayoutEffect: ProjectDetail found!', attempts);
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
                return;
            }
            if (attempts < 10) {
                setTimeout(quickCheck, 50); // Check every 50ms for 500ms
            } else {
                // If still not found, trigger full load
                setWaitingForProjectDetail(prev => {
                    if (prev) return prev; // Already loading
                    return true; // Set to true immediately
                });
                console.log('🚀 LayoutEffect: Triggering full ProjectDetail load...');
                loadProjectDetail().then(loaded => {
                    if (cancelled) return;
                    if (loaded && window.ProjectDetail) {
                        console.log('✅ LayoutEffect: ProjectDetail loaded successfully');
                        setProjectDetailAvailable(true);
                        setWaitingForProjectDetail(false);
                        // REMOVED: Creating new object reference causes unnecessary re-renders
                        // setViewingProject(prev => prev ? { ...prev } : null);
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
        
        // Only check if ProjectDetail is not already available (prevent unnecessary checks)
        if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
            if (!projectDetailAvailable) {
                console.log('✅ ProjectDetail detected in render check');
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
            }
            return; // Early return - no need to set up interval
        }
        
        const checkInterval = setInterval(() => {
            if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                console.log('✅ ProjectDetail detected in render check');
                setProjectDetailAvailable(true);
                setWaitingForProjectDetail(false);
                // REMOVED: setForceRender to prevent infinite loop
                // setForceRender(prev => prev + 1);
                clearInterval(checkInterval);
            }
        }, 100);
        
        return () => clearInterval(checkInterval);
    }, [viewingProject?.id]); // REMOVED: forceRender dependency to prevent loop

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
                    console.log('✅ Render: ProjectDetail just became available!');
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
                    console.log('🚀 Triggering ProjectDetail load from render...');
                    loadProjectDetail().then(loaded => {
                        if (loaded && window.ProjectDetail) {
                            console.log('✅ ProjectDetail loaded successfully from render');
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
                                console.log('🔄 Manual reload button clicked');
                                window.location.reload();
                            }}
                            className="bg-blue-600 text-white px-4 py-2.5 sm:py-2 rounded-lg hover:bg-blue-700 text-sm font-medium min-h-[44px] sm:min-h-0"
                        >
                            <i className="fas fa-sync-alt mr-2"></i>
                            Reload Page
                        </button>
                        <button 
                            onClick={() => setViewingProject(null)}
                            className="bg-gray-600 text-white px-4 py-2.5 sm:py-2 rounded-lg hover:bg-gray-700 text-sm font-medium min-h-[44px] sm:min-h-0"
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
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                            <button 
                                onClick={() => window.location.reload()}
                                className="bg-red-600 text-white px-4 py-2.5 sm:py-2 rounded-lg hover:bg-red-700 text-sm font-medium min-h-[44px] sm:min-h-0"
                            >
                                <i className="fas fa-sync-alt mr-2"></i>
                                Reload Page
                            </button>
                            <button 
                                onClick={() => setViewingProject(null)}
                                className="bg-gray-600 text-white px-4 py-2.5 sm:py-2 rounded-lg hover:bg-gray-700 text-sm font-medium min-h-[44px] sm:min-h-0"
                            >
                                <i className="fas fa-arrow-left mr-2"></i>
                                Back to Projects
                            </button>
                        </div>
                    </div>
                );
            }
            
            console.log('✅ Rendering ProjectDetail component with project:', viewingProject.id);
            
            return (
                <ProjectDetailComponent 
                    project={viewingProject} 
                    onBack={handleBackFromProject}
                    onDelete={handleDeleteProject}
                />
            );
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

    // Get modal component
    const ModalComponent = showModal ? (window.ProjectModal && typeof window.ProjectModal === 'function' ? window.ProjectModal : null) : null;

    return (
        <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
                <div className="flex-1 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base sm:text-lg font-semibold text-gray-900">Projects</h1>
                        <p className="text-xs text-gray-600">Manage and track all your projects</p>
                    </div>
                    {SectionCommentWidget && (
                        <div className="hidden sm:block ml-2">
                            <SectionCommentWidget 
                                sectionId="projects-main"
                                sectionName="Projects"
                            />
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                    {/* View Toggle */}
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden shrink-0">
                        <button
                            onClick={() => {
                                setViewMode('grid');
                                if (typeof window !== 'undefined' && window.localStorage) {
                                    window.localStorage.setItem('projectsViewMode', 'grid');
                                }
                            }}
                            className={`px-3 py-2 sm:py-2 text-sm font-medium transition-colors shrink-0 min-h-[44px] sm:min-h-0 ${
                                viewMode === 'grid'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                            title="Grid View"
                        >
                            <i className="fas fa-th"></i>
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('list');
                                if (typeof window !== 'undefined' && window.localStorage) {
                                    window.localStorage.setItem('projectsViewMode', 'list');
                                }
                            }}
                            className={`px-3 py-2 sm:py-2 text-sm font-medium transition-colors border-l border-gray-300 shrink-0 min-h-[44px] sm:min-h-0 ${
                                viewMode === 'list'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                            title="List View"
                        >
                            <i className="fas fa-list"></i>
                        </button>
                    </div>
                    <button 
                        onClick={() => {
                            console.log('🔍 Progress Tracker button clicked');
                            console.log('🔍 window.ProjectProgressTracker before setShowProgressTracker:', window.ProjectProgressTracker);
                            openProgressTrackerHash();
                            // Also log after state update
                            setTimeout(() => {
                                console.log('🔍 window.ProjectProgressTracker after setShowProgressTracker:', window.ProjectProgressTracker);
                            }, 100);
                        }}
                        className="px-3 py-2 sm:py-1.5 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors flex items-center text-sm font-medium min-h-[44px] sm:min-h-0 whitespace-nowrap"
                    >
                        <i className="fas fa-chart-line mr-1.5 text-xs"></i>
                        <span className="hidden sm:inline">Progress Tracker</span>
                        <span className="sm:hidden">Tracker</span>
                    </button>
                    <button 
                        onClick={handleAddProject}
                        className="bg-primary-600 text-white px-3 py-2 sm:py-1.5 rounded-lg hover:bg-primary-700 transition-colors flex items-center text-sm font-medium min-h-[44px] sm:min-h-0 whitespace-nowrap"
                    >
                        <i className="fas fa-plus mr-1.5 text-xs"></i>
                        <span className="hidden sm:inline">New Project</span>
                        <span className="sm:hidden">New</span>
                    </button>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5">
                    <div className="flex-1 w-full min-w-0">
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-3 py-2 sm:py-1.5 text-sm sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[44px] sm:min-h-0"
                        />
                    </div>
                    <select
                        value={selectedClient}
                        onChange={(e) => setSelectedClient(e.target.value)}
                        className="px-3 py-2 sm:py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[44px] sm:min-h-0 w-full sm:w-auto"
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
                        className="px-3 py-2 sm:py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[44px] sm:min-h-0 w-full sm:w-auto"
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
                        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
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
                                        // Only handle click if we didn't drag
                                        // If draggedProject is set, we just finished a drag, so ignore click
                                        if (draggedProject !== null) {
                                            return;
                                        }
                                        
                                        // Check if mouse moved significantly (indicates drag, not click)
                                        if (mouseDownRef.current) {
                                            const deltaX = Math.abs(e.clientX - mouseDownRef.current.x);
                                            const deltaY = Math.abs(e.clientY - mouseDownRef.current.y);
                                            const deltaTime = Date.now() - mouseDownRef.current.time;
                                            
                                            // If mouse moved more than 5px or took longer than 200ms, it was likely a drag attempt
                                            if (deltaX > 5 || deltaY > 5 || deltaTime > 200) {
                                                mouseDownRef.current = null;
                                                return;
                                            }
                                        }
                                        
                                        // It's a click - open the project
                                        handleViewProject(project);
                                        mouseDownRef.current = null;
                                    }}
                                    className="bg-white rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all p-3 sm:p-4 cursor-pointer"
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
                                            {project.type === 'Monthly Review' ? (
                                                <i className="fas fa-comments mr-2 w-3 text-[10px] text-primary-500"></i>
                                            ) : project.type === 'Audit' ? (
                                                <i className="fas fa-clipboard-list mr-2 w-3 text-[10px] text-primary-500"></i>
                                            ) : (
                                                <i className="fas fa-tag mr-2 w-3 text-[10px]"></i>
                                            )}
                                            {project.type || 'Monthly Review'}
                                        </div>
                                        <div className="flex items-center text-xs text-gray-600">
                                            <i className="fas fa-calendar mr-2 w-3 text-[10px]"></i>
                                            {project.startDate && project.dueDate 
                                                ? `${project.startDate} - ${project.dueDate}`
                                                : project.dueDate 
                                                    ? project.dueDate
                                                    : project.startDate 
                                                        ? project.startDate
                                                        : project.date || 'No due date'}
                                        </div>
                                        {project.assignedTo && (
                                            <div className="flex items-center text-xs text-gray-600">
                                                <i className="fas fa-user mr-2 w-3 text-[10px]"></i>
                                                {project.assignedTo}
                                            </div>
                                        )}
                                        <div className="flex items-center text-xs text-gray-600">
                                            <i className="fas fa-tasks mr-2 w-3 text-[10px]"></i>
                                            {project.tasksCount || 0} {project.tasksCount === 1 ? 'task' : 'tasks'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto -mx-3 sm:mx-0">
                                <table className="w-full min-w-[640px] sm:min-w-0">
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
                                                    <span className={`px-2 py-1 text-xs rounded font-medium ${
                                                        project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                                        project.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                        project.status === 'Completed' ? 'bg-purple-100 text-purple-700' :
                                                        project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-700' :
                                                        project.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
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
            {showModal && ModalComponent && (
                <ModalComponent
                    project={selectedProject}
                    onSave={handleSaveProject}
                    onDelete={handleDeleteProject}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedProject(null);
                    }}
                />
            )}
            {showModal && !ModalComponent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
                    <div className="bg-white rounded-lg p-3 sm:p-4 w-full max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Loading Project Editor</h2>
                        <p className="text-sm text-gray-600 mb-3">Please wait while the project editor loads...</p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setSelectedProject(null);
                                }}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    ));
};

// Make available globally with version identifier for cache-busting
try {
    // Clear any old version first and force replacement
    const oldVersion = window.Projects?._version;
    if (window.Projects) {
        console.log('🔄 Replacing existing Projects component (old version: ' + (oldVersion || 'unknown') + ') with new version');
        // Delete the old version to ensure clean replacement
        delete window.Projects;
    }
    window.Projects = Projects;
    window.Projects._version = '20251112-upgraded-cards';
    window.Projects._hasListView = true;
    window.Projects._hasUpgradedCards = true;
    console.log('✅ Projects component registered on window.Projects (version: 20251112-upgraded-cards)');
    console.log('✅ Projects component includes list view toggle buttons');
    console.log('✅ Projects component includes upgraded project cards with review type icons');
    console.log('✅ Projects component version:', window.Projects._version);
    console.log('✅ Projects component has list view:', window.Projects._hasListView);
    console.log('✅ Projects component has upgraded cards:', window.Projects._hasUpgradedCards);
    
    // Dispatch event to notify that Projects component is ready
    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('projectsComponentReady', { 
            detail: { version: '20251112-upgraded-cards', hasListView: true, hasUpgradedCards: true } 
        }));
    }
} catch (error) {
    console.error('❌ Error registering Projects component:', error);
}
