// Get React hooks from window
const { useState, useEffect, useRef, memo } = React;
const storage = window.storage;

// Main component - completely rebuilt for reliability
const ProjectProgressTracker = function ProjectProgressTrackerComponent(props) {
    const {
        onBack: onBackProp,
        focusProjectId: focusProjectIdProp = null,
        focusMonthIndex: focusMonthIndexProp = null,
        focusField: focusFieldProp = null,
        focusYear: focusYearProp = null,
        focusMonthName: focusMonthNameProp = null,
        onFocusHandled: onFocusHandledProp = null
    } = props || {};

    // Reduced logging - only log on initial mount to reduce noise
    const hasLoggedRef = useRef(false);
    useEffect(() => {
        if (!hasLoggedRef.current) {
            console.log('🔍 ProjectProgressTracker: Component mounted');
            hasLoggedRef.current = true;
        }
    }, []);
    
    // Check if this is being called
    if (!props) {
        console.warn('⚠️ ProjectProgressTracker: No props received, using defaults');
    }
    
    // Validate props
    const onBack = typeof onBackProp === 'function' ? onBackProp : () => console.warn('onBack not available');
    
    // Safe constants
    const currentYear = Number(new Date().getFullYear()) || 2025;
    const currentMonth = Number(new Date().getMonth()) || 0;
    
    // Working months calculation
    const getWorkingMonths = () => {
        const lastMonth = currentMonth - 1 < 0 ? currentMonth - 1 + 12 : currentMonth - 1;
        return [Number(lastMonth), Number(currentMonth)];
    };
    
    const workingMonths = getWorkingMonths();
    // Show whole year for comprehensive tracking
    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
    ];
    
    // State - always initialize with empty array to prevent undefined/null issues
    const [projects, setProjects] = useState(() => []);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);
    
    // Modal state for editing progress data
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null); // {project, month, field, currentValue, tempValue}
    
    // Refs
    const tableRef = useRef(null);
    const [focusedCellKey, setFocusedCellKey] = useState(null);
    const [focusedRowId, setFocusedRowId] = useState(null);
    const usersCacheRef = useRef([]);
    const usersLoadPromiseRef = useRef(null);
    const focusRequestRef = useRef(null);
    const pendingFocusRef = useRef(false);
    
    // Auto focus on highlighted month columns when data loads
    useEffect(() => {
        try {
            if (!tableRef?.current) return;
            if (selectedYear !== currentYear) return;
            
            const focusIndexes = Array.isArray(workingMonths) ? workingMonths : [];
            const fallbackIndex = typeof currentMonth === 'number' ? currentMonth : 0;
            const targetIndex = focusIndexes.length > 0
                ? Number(focusIndexes[focusIndexes.length - 1])
                : fallbackIndex;
            
            if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= months.length) return;
            
            const targetMonth = months[targetIndex];
            if (!targetMonth) return;
            
            window.requestAnimationFrame(() => {
                try {
                    const container = tableRef.current;
                    const headerCell = container.querySelector(`[data-month-header="${targetMonth}"]`);
                    if (headerCell && typeof headerCell.offsetLeft === 'number') {
                        const stickyColumnWidth = 320;
                        const desiredScroll = Math.max(headerCell.offsetLeft - stickyColumnWidth, 0);
                        container.scrollTo({
                            left: desiredScroll,
                            behavior: 'smooth'
                        });
                    }
                } catch (scrollErr) {
                    console.warn('⚠️ ProjectProgressTracker: Failed to auto-scroll to focused month:', scrollErr);
                }
            });
        } catch (err) {
            console.warn('⚠️ ProjectProgressTracker: Auto focus effect error:', err);
        }
    }, [projects, selectedYear]);

    // Load projects
    useEffect(() => {
        const load = async () => {
            try {
                console.log('📋 ProjectProgressTracker: Loading projects from database...');
                if (window.DatabaseAPI && window.DatabaseAPI.getProjects) {
                    const response = await window.DatabaseAPI.getProjects();
                    console.log('📋 ProjectProgressTracker: Raw response:', response);
                    console.log('📋 ProjectProgressTracker: Response structure:', {
                        hasData: !!response?.data,
                        hasProjects: !!response?.data?.projects,
                        isProjectsArray: Array.isArray(response?.data?.projects),
                        projectsLength: response?.data?.projects?.length || 0,
                        dataKeys: response?.data ? Object.keys(response.data) : [],
                        responseKeys: Object.keys(response || {}),
                        responseType: typeof response,
                        dataType: typeof response?.data
                    });
                    
                    let projs = [];
                    
                    // Try all possible response formats (matching Projects.jsx logic)
                    if (response?.data?.projects && Array.isArray(response.data.projects)) {
                        projs = response.data.projects;
                        console.log('✅ ProjectProgressTracker: Using response.data.projects, count:', projs.length);
                    } else if (response?.data?.data?.projects && Array.isArray(response.data.data.projects)) {
                        projs = response.data.data.projects;
                        console.log('✅ ProjectProgressTracker: Using response.data.data.projects, count:', projs.length);
                    } else if (response?.projects && Array.isArray(response.projects)) {
                        projs = response.projects;
                        console.log('✅ ProjectProgressTracker: Using response.projects, count:', projs.length);
                    } else if (Array.isArray(response?.data)) {
                        projs = response.data;
                        console.log('✅ ProjectProgressTracker: Using response.data as array, count:', projs.length);
                    } else if (Array.isArray(response)) {
                        projs = response;
                        console.log('✅ ProjectProgressTracker: Using response as array, count:', projs.length);
                    } else {
                        console.warn('⚠️ ProjectProgressTracker: No projects found in standard locations');
                        projs = [];
                    }
                    
                    // Normalize projects: map clientName to client for frontend compatibility
                    // Also parse monthlyProgress if it's a JSON string
                    const normalizedProjects = (Array.isArray(projs) ? projs : []).map(p => {
                        let monthlyProgress = p.monthlyProgress;
                        
                        // Parse monthlyProgress if it's a JSON string
                        if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                            try {
                                monthlyProgress = JSON.parse(monthlyProgress);
                            } catch (e) {
                                console.warn('⚠️ ProjectProgressTracker: Failed to parse monthlyProgress JSON:', e);
                                monthlyProgress = {};
                            }
                        }
                        
                        return {
                        ...p,
                            client: p.clientName || p.client || '',
                            monthlyProgress: monthlyProgress && typeof monthlyProgress === 'object' && !Array.isArray(monthlyProgress) ? monthlyProgress : {}
                        };
                    });
                    
                    // Filter to projects that have monthlyProgress data OR are MONTHLY type
                    // This allows both explicitly MONTHLY type projects and any project with monthly progress data
                    const monthlyProjects = normalizedProjects.filter(p => {
                        if (!p || typeof p !== 'object') return false;
                        
                        // Include if it has monthlyProgress data
                        if (p.monthlyProgress && typeof p.monthlyProgress === 'object' && Object.keys(p.monthlyProgress).length > 0) {
                            return true;
                        }
                        
                        // Also include if type starts with MONTHLY (case-insensitive)
                        const rawType = p.type;
                        if (rawType !== null && rawType !== undefined) {
                        try {
                            const projectType = String(rawType || '').toUpperCase().trim();
                                if (projectType.length > 0 && projectType.startsWith('MONTHLY')) {
                                    return true;
                                }
                        } catch (e) {
                                // If type conversion fails, continue to check other criteria
                            }
                        }
                        
                        return false;
                    });
                    
                    console.log('✅ ProjectProgressTracker: Loaded', normalizedProjects.length, 'total projects from API');
                    console.log('📋 ProjectProgressTracker: Filtered to', monthlyProjects.length, 'projects with monthly progress');
                    
                    if (monthlyProjects.length > 0) {
                        console.log('📋 ProjectProgressTracker: First project sample:', monthlyProjects[0]);
                    } else if (normalizedProjects.length > 0) {
                        console.warn('⚠️ ProjectProgressTracker: No projects with monthly progress found');
                    } else {
                        console.log('ℹ️ ProjectProgressTracker: No projects loaded from API');
                    }
                    
                    // Always set an array (never null/undefined)
                    setProjects(Array.isArray(monthlyProjects) ? monthlyProjects : []);
                } else {
                    console.error('❌ ProjectProgressTracker: DatabaseAPI.getProjects not available');
                    setLoadError('Database API not available');
                }
            } catch (err) {
                console.error('❌ ProjectProgressTracker: Load error:', err);
                console.error('❌ Error details:', {
                    message: err?.message,
                    stack: err?.stack,
                    name: err?.name
                });
                setLoadError(String(err?.message || 'Failed to load projects'));
                // Always ensure projects is an array, never null/undefined
                setProjects([]);
            }
        };
        load();
    }, []);
    
    useEffect(() => {
        fetchUsersSafe().catch(error => {
            console.warn('⚠️ ProjectProgressTracker: Initial user preload failed:', error);
        });
    }, []);

    useEffect(() => {
        if (!focusProjectIdProp) {
            return;
        }

        const normalizedProjectId = String(focusProjectIdProp);
        let normalizedMonthIndex = null;
        if (typeof focusMonthIndexProp === 'number' && !Number.isNaN(focusMonthIndexProp)) {
            normalizedMonthIndex = focusMonthIndexProp;
        } else if (
            focusMonthIndexProp !== null &&
            focusMonthIndexProp !== undefined &&
            !Number.isNaN(Number(focusMonthIndexProp))
        ) {
            normalizedMonthIndex = Number(focusMonthIndexProp);
        }

        const normalizedYear =
            focusYearProp !== null &&
            focusYearProp !== undefined &&
            !Number.isNaN(Number(focusYearProp))
                ? Number(focusYearProp)
                : null;

        focusRequestRef.current = {
            projectId: normalizedProjectId,
            monthIndex: normalizedMonthIndex,
            monthName: focusMonthNameProp || null,
            field: focusFieldProp || 'comments',
            year: normalizedYear
        };
        pendingFocusRef.current = true;
    }, [focusProjectIdProp, focusMonthIndexProp, focusFieldProp, focusYearProp, focusMonthNameProp]);

    useEffect(() => {
        if (!pendingFocusRef.current) {
            return;
        }

        const focusRequest = focusRequestRef.current;
        if (!focusRequest || !focusRequest.projectId) {
            return;
        }

        if (!Array.isArray(projects) || projects.length === 0) {
            return;
        }

        const targetYear = focusRequest.year;
        if (
            targetYear !== null &&
            targetYear !== undefined &&
            !Number.isNaN(targetYear) &&
            targetYear !== selectedYear
        ) {
            setSelectedYear(targetYear);
            return;
        }

        const resolvedMonthIndex =
            typeof focusRequest.monthIndex === 'number' &&
            !Number.isNaN(focusRequest.monthIndex) &&
            focusRequest.monthIndex >= 0
                ? focusRequest.monthIndex
                : months.indexOf(String(focusRequest.monthName || ''));
        const resolvedMonthName =
            resolvedMonthIndex >= 0 && resolvedMonthIndex < months.length
                ? months[resolvedMonthIndex]
                : focusRequest.monthName || months[Math.max(currentMonth, 0)];
        const resolvedField = focusRequest.field || 'comments';
        const cellKey = `${focusRequest.projectId}-${resolvedMonthName}-${resolvedField}`;

        const attemptFocus = (attempt = 0) => {
            const container = tableRef.current;
            if (!container) {
                if (attempt < 6) {
                    setTimeout(() => attemptFocus(attempt + 1), 200);
                }
                return;
            }

            const selector = `[data-cell-key="${escapeAttributeValue(cellKey)}"]`;
            const targetCell = container.querySelector(selector);

            if (targetCell) {
                setFocusedCellKey(cellKey);
                setFocusedRowId(focusRequest.projectId);
                try {
                    targetCell.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'center'
                    });
                } catch (error) {
                    console.warn('⚠️ ProjectProgressTracker: scrollIntoView failed for focus cell:', error);
                }
                pendingFocusRef.current = false;
                focusRequestRef.current = null;
                if (typeof onFocusHandledProp === 'function') {
                    try {
                        onFocusHandledProp();
                    } catch (error) {
                        console.error('❌ ProjectProgressTracker: Error running onFocusHandled callback:', error);
                    }
                }
            } else if (attempt < 6) {
                setTimeout(() => attemptFocus(attempt + 1), 200);
            } else {
                pendingFocusRef.current = false;
                focusRequestRef.current = null;
                if (typeof onFocusHandledProp === 'function') {
                    try {
                        onFocusHandledProp();
                    } catch (error) {
                        console.error('❌ ProjectProgressTracker: Error running onFocusHandled callback after retries:', error);
                    }
                }
            }
        };

        attemptFocus();
    }, [projects, selectedYear, onFocusHandledProp]);
    
    // Validate projects before render
    // Normalize and validate projects - handle both numeric and string IDs, client/clientName
    // Wrap in try-catch to ensure it never crashes, always returns an array
    let safeProjects = [];
    try {
        if (Array.isArray(projects) && projects.length > 0) {
            safeProjects = projects.filter(p => {
                try {
                    // More flexible validation: ID can be string or number, name must exist
                    if (!p || typeof p !== 'object') return false;
                    if (p.id === undefined || p.id === null) return false;
                    if (typeof p.name !== 'string' || p.name.trim() === '') return false;
                    return true;
                } catch (e) {
                    console.warn('⚠️ ProjectProgressTracker: Error validating project:', p, e);
                    return false;
                }
            }).map(p => {
                try {
                    // Normalize client/clientName (like Projects.jsx does)
                    const client = p.clientName || p.client || '';
                    
                    // Parse monthlyProgress if it's still a JSON string
                    let monthlyProgress = p.monthlyProgress;
                    if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                        try {
                            monthlyProgress = JSON.parse(monthlyProgress);
                        } catch (e) {
                            console.warn('⚠️ ProjectProgressTracker: Failed to parse monthlyProgress in mapping:', e);
                            monthlyProgress = {};
                        }
                    }
                    
                    return {
                        id: String(p.id || ''),
                        name: String(p.name || ''),
                        client: String(client),
                        manager: String(p.manager || p.assignedTo || '-'),
                        type: String(p.type || '-'),
                        status: String(p.status || 'Unknown'),
                        monthlyProgress: monthlyProgress && typeof monthlyProgress === 'object' && !Array.isArray(monthlyProgress) ? monthlyProgress : {}
                    };
                } catch (e) {
                    console.warn('⚠️ ProjectProgressTracker: Error mapping project:', p, e);
                    // Return a minimal valid project object to prevent crashes
                    return {
                        id: String(p?.id || 'unknown'),
                        name: String(p?.name || 'Invalid Project'),
                        client: String(p?.clientName || p?.client || ''),
                        manager: '-',
                        type: String(p?.type || '-'),
                        status: 'Unknown',
                        monthlyProgress: {}
                    };
                }
            });
        }
    } catch (e) {
        console.error('❌ ProjectProgressTracker: Error in safeProjects calculation:', e);
        safeProjects = []; // Always return an array
    }
    
    // Final safety check - ensure safeProjects is always an array
    if (!Array.isArray(safeProjects)) {
        console.error('❌ ProjectProgressTracker: safeProjects is not an array, resetting');
        safeProjects = [];
    }
    
    // Status config
    const getStatusConfig = (status) => {
        const configs = {
            'not-started': { label: 'Not Started', color: 'bg-red-100 text-red-800', cellColor: 'bg-red-50' },
            'data-received': { label: 'Data Received', color: 'bg-orange-100 text-orange-800', cellColor: 'bg-orange-50' },
            'in-progress': { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800', cellColor: 'bg-yellow-50' },
            'ready-checking': { label: 'Ready for Checking', color: 'bg-lime-100 text-lime-800', cellColor: 'bg-lime-50' },
            'checked': { label: 'Checked', color: 'bg-cyan-100 text-cyan-800', cellColor: 'bg-cyan-50' },
            'reports-prepared': { label: 'Reports Prepared', color: 'bg-blue-100 text-blue-800', cellColor: 'bg-blue-50' },
            'done': { label: 'Done', color: 'bg-green-100 text-green-800', cellColor: 'bg-green-50' }
        };
        return configs[String(status || '')] || configs['not-started'];
    };
    
    // Get progress data safely - with full error handling
    const getProgressData = (project, month, field) => {
        try {
            if (!project || !month || !field) return '';
            const safeYear = Number(selectedYear) || currentYear;
            if (isNaN(safeYear)) return '';
            
            const key = String(month || '') + '-' + String(safeYear);
            if (!key || key.length < 5) return '';
            
            const progress = project.monthlyProgress || {};
            if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return '';
            
            const monthData = progress[key] || {};
            if (!monthData || typeof monthData !== 'object' || Array.isArray(monthData)) return '';
            
            const fieldData = monthData[field];
            
            // Extract link or text from object, or return string directly
            if (typeof fieldData === 'string') {
                return fieldData;
            } else if (fieldData && typeof fieldData === 'object' && !Array.isArray(fieldData)) {
                // If it's an object, try to get link or text
                return fieldData.link || fieldData.text || '';
            }
            
            return fieldData || '';
        } catch (e) {
            console.warn('⚠️ ProjectProgressTracker: Error in getProgressData:', e);
            return '';
        }
    };
    
    // Validate progress data before saving
    const validateProgressData = (progress) => {
        try {
            // Ensure it's an object
            if (typeof progress !== 'object' || Array.isArray(progress)) {
                return { valid: false, error: 'Progress data must be an object' };
            }
            
            // Validate structure - each key should be "Month-Year" format
            for (const key in progress) {
                if (typeof progress[key] !== 'object' || Array.isArray(progress[key])) {
                    return { valid: false, error: `Invalid month data structure for ${key}` };
                }
                
                // Each month data should only contain valid fields
                const validFields = ['compliance', 'data', 'comments'];
                for (const field in progress[key]) {
                    if (!validFields.includes(field)) {
                        console.warn(`⚠️ Unknown field in progress data: ${field}`);
                    }
                    
                    // Values should be strings
                    if (progress[key][field] !== null && typeof progress[key][field] !== 'string') {
                        return { valid: false, error: `Field ${field} must be a string` };
                    }
                }
            }
            
            return { valid: true };
        } catch (e) {
            return { valid: false, error: `Validation error: ${e.message}` };
        }
    };

    const escapeAttributeValue = (value) => {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    };

    const fetchUsersSafe = async () => {
        if (Array.isArray(usersCacheRef.current) && usersCacheRef.current.length > 0) {
            return usersCacheRef.current;
        }

        if (usersLoadPromiseRef.current) {
            try {
                await usersLoadPromiseRef.current;
                return usersCacheRef.current;
            } catch (error) {
                console.error('❌ ProjectProgressTracker: Error awaiting cached users promise:', error);
                usersLoadPromiseRef.current = null;
            }
        }

        usersLoadPromiseRef.current = (async () => {
            let fetchedUsers = [];
            try {
                if (window.DatabaseAPI && typeof window.DatabaseAPI.getUsers === 'function') {
                    const response = await window.DatabaseAPI.getUsers();
                    fetchedUsers = response?.data?.users || response?.data?.data?.users || response?.users || [];
                } else if (window.api && typeof window.api.getUsers === 'function') {
                    const response = await window.api.getUsers();
                    fetchedUsers = response?.data?.users || response?.users || [];
                }
            } catch (error) {
                console.error('❌ ProjectProgressTracker: Failed to load users for @mentions:', error);
            }

            if (!Array.isArray(fetchedUsers)) {
                fetchedUsers = [];
            }

            usersCacheRef.current = fetchedUsers;
            return fetchedUsers;
        })();

        try {
            return await usersLoadPromiseRef.current;
        } catch (error) {
            console.error('❌ ProjectProgressTracker: Error loading users:', error);
            usersLoadPromiseRef.current = null;
            return usersCacheRef.current || [];
        }
    };

    const buildProgressTrackerLink = (projectId, monthName, monthIndex, year, field = 'comments') => {
        try {
            const basePath = `${window.location.origin}${window.location.pathname}`;
            const params = new URLSearchParams();
            params.set('progressTracker', '1');

            if (projectId) {
                params.set('projectId', String(projectId));
            }

            if (typeof monthIndex === 'number' && !Number.isNaN(monthIndex) && monthIndex >= 0) {
                params.set('monthIndex', String(monthIndex));
            }

            if (monthName) {
                params.set('month', monthName);
            }

            if (year) {
                params.set('year', String(year));
            }

            if (field) {
                params.set('field', field);
            }

            return `${basePath}#/projects?${params.toString()}`;
        } catch (error) {
            console.error('❌ ProjectProgressTracker: Failed to build tracker link:', error);
            return '#/projects';
        }
    };

    const processCommentMentions = async (commentText, project, monthName, monthIndex, year, field) => {
        try {
            if (!commentText || !window.MentionHelper || !window.MentionHelper.hasMentions(commentText)) {
                return;
            }

            const allUsers = await fetchUsersSafe();
            if (!Array.isArray(allUsers) || allUsers.length === 0) {
                console.warn('⚠️ ProjectProgressTracker: No users available for @mention notifications');
                return;
            }

            let currentUserInfo = null;
            try {
                if (window.storage && typeof window.storage.getUserInfo === 'function') {
                    currentUserInfo = window.storage.getUserInfo();
                } else if (window.useAuth && typeof window.useAuth === 'function') {
                    currentUserInfo = window.useAuth()?.user || null;
                }
            } catch (error) {
                console.warn('⚠️ ProjectProgressTracker: Unable to determine current user for mention notifications:', error);
            }

            const authorName =
                currentUserInfo?.name ||
                currentUserInfo?.email ||
                'Unknown';

            const safeProjectName = (project && project.name) || 'Project';
            const resolvedMonthIndex =
                typeof monthIndex === 'number' && !Number.isNaN(monthIndex) && monthIndex >= 0
                    ? monthIndex
                    : months.indexOf(String(monthName || ''));
            const resolvedMonthName =
                typeof monthName === 'string' && monthName
                    ? monthName
                    : resolvedMonthIndex >= 0
                        ? months[resolvedMonthIndex]
                        : '';
            const resolvedYear = Number(year) || Number(selectedYear) || currentYear;
            const resolvedField = field || 'comments';

            const contextTitle = `${safeProjectName} • ${resolvedMonthName || 'Progress'} ${resolvedYear}`;
            const contextLink = buildProgressTrackerLink(
                project?.id,
                resolvedMonthName,
                resolvedMonthIndex >= 0 ? resolvedMonthIndex : null,
                resolvedYear,
                resolvedField
            );

            await window.MentionHelper.processMentions(
                commentText,
                contextTitle,
                contextLink,
                authorName,
                allUsers,
                {
                    projectId: project?.id,
                    projectName: safeProjectName,
                    month: resolvedMonthName,
                    monthIndex: resolvedMonthIndex >= 0 ? resolvedMonthIndex : null,
                    year: resolvedYear,
                    field: resolvedField
                }
            );
        } catch (error) {
            console.error('❌ ProjectProgressTracker: Error processing @mentions:', error);
        }
    };
    
    // Save progress data with safety checks
    const saveProgressData = async (project, month, field, value) => {
        // Validate inputs
        if (!project || !project.id) {
            console.error('❌ ProjectProgressTracker: Invalid project for save');
            alert('Invalid project. Cannot save.');
            return;
        }
        
        if (!month || !field) {
            console.error('❌ ProjectProgressTracker: Invalid month or field');
            return;
        }
        
        // Sanitize value - ensure it's a string and limit length for safety
        const sanitizedValue = typeof value === 'string' ? value.slice(0, 5000) : String(value || '').slice(0, 5000);
        
        try {
            setSaving(true);
            const safeYear = Number(selectedYear) || currentYear;
            if (isNaN(safeYear)) {
                throw new Error('Invalid year');
            }
            
            const key = String(month) + '-' + String(safeYear);
            
            // Get current monthlyProgress - preserve all existing data
            const currentProgress = project.monthlyProgress || {};
            
            // Ensure currentProgress is an object (not a string)
            let parsedProgress = currentProgress;
            if (typeof currentProgress === 'string' && currentProgress.trim()) {
                try {
                    parsedProgress = JSON.parse(currentProgress);
                } catch (e) {
                    console.warn('⚠️ ProjectProgressTracker: Failed to parse existing monthlyProgress, creating new:', e);
                    parsedProgress = {};
                }
            }
            
            // Ensure parsedProgress is a valid object
            if (typeof parsedProgress !== 'object' || Array.isArray(parsedProgress)) {
                parsedProgress = {};
            }
            
            // Preserve existing month data for all months
            const currentMonthData = parsedProgress[key] || {};
            
            // Only update the specific field, preserve all other fields in this month
            const updatedMonthData = {
                ...currentMonthData,
                [field]: sanitizedValue
            };
            
            // Preserve all other months' data
            const updatedProgress = {
                ...parsedProgress,
                [key]: updatedMonthData
            };
            
            // Validate before saving
            const validation = validateProgressData(updatedProgress);
            if (!validation.valid) {
                throw new Error(`Data validation failed: ${validation.error}`);
            }
            
            // Store backup of current state before update
            const backupProgress = JSON.parse(JSON.stringify(parsedProgress));
            
            // Clear cache BEFORE updating to ensure fresh data after save
            if (window.DatabaseAPI && window.DatabaseAPI._responseCache) {
                window.DatabaseAPI._responseCache.delete('GET:/projects');
                window.DatabaseAPI._responseCache.delete(`GET:/projects/${project.id}`);
                console.log('🗑️ ProjectProgressTracker: Cleared project caches before save');
            }
            
            // Update project via API - only send monthlyProgress field to prevent overwriting other fields
            const updatePayload = {
                monthlyProgress: JSON.stringify(updatedProgress)
            };
            
            console.log('💾 ProjectProgressTracker: Saving progress data:', {
                projectId: project.id,
                month: month,
                field: field,
                valueLength: sanitizedValue.length,
                progressKeys: Object.keys(updatedProgress),
                monthKey: key
            });
            
            let updateSuccess = false;
            let apiError = null;
            let savedProject = null;
            
            try {
                if (window.DatabaseAPI && window.DatabaseAPI.updateProject) {
                    const response = await window.DatabaseAPI.updateProject(project.id, updatePayload);
                    console.log('✅ ProjectProgressTracker: API update response:', response);
                    console.log('🔍 ProjectProgressTracker: Response structure:', {
                        hasData: !!response?.data,
                        hasProject: !!response?.data?.project,
                        hasDirectProject: !!response?.project,
                        dataKeys: response?.data ? Object.keys(response.data) : [],
                        responseKeys: Object.keys(response || {}),
                        monthlyProgressType: typeof (response?.data?.project?.monthlyProgress || response?.project?.monthlyProgress),
                        monthlyProgressValue: response?.data?.project?.monthlyProgress || response?.project?.monthlyProgress
                    });
                    savedProject = response?.data?.project || response?.project || response?.data;
                    updateSuccess = true;
                } else if (window.api && window.api.updateProject) {
                    const response = await window.api.updateProject(project.id, updatePayload);
                    console.log('✅ ProjectProgressTracker: API update response:', response);
                    console.log('🔍 ProjectProgressTracker: Response structure:', {
                        hasData: !!response?.data,
                        hasProject: !!response?.data?.project,
                        hasDirectProject: !!response?.project,
                        dataKeys: response?.data ? Object.keys(response.data) : [],
                        responseKeys: Object.keys(response || {}),
                        monthlyProgressType: typeof (response?.data?.project?.monthlyProgress || response?.project?.monthlyProgress),
                        monthlyProgressValue: response?.data?.project?.monthlyProgress || response?.project?.monthlyProgress
                    });
                    savedProject = response?.data?.project || response?.project || response?.data;
                    updateSuccess = true;
                } else {
                    throw new Error('Update API not available');
                }
            } catch (apiErr) {
                apiError = apiErr;
                console.error('❌ ProjectProgressTracker: API update failed:', apiErr);
                console.error('❌ ProjectProgressTracker: Error details:', {
                    message: apiErr?.message,
                    stack: apiErr?.stack,
                    name: apiErr?.name
                });
                
                // Restore backup on failure
                setProjects(prevProjects => prevProjects.map(p => 
                    String(p?.id) === String(project.id)
                        ? { ...p, monthlyProgress: backupProgress }
                        : p
                ));
                
                throw apiErr;
            }
            
            if (updateSuccess) {
                // Update local state with saved data (use API response if available, otherwise use local update)
                let finalProgress = updatedProgress;
                
                // Try to get monthlyProgress from saved project
                const savedMonthlyProgress = savedProject?.monthlyProgress;
                
                if (savedMonthlyProgress) {
                    try {
                        // Parse if it's a string, otherwise use directly
                        finalProgress = typeof savedMonthlyProgress === 'string' 
                            ? JSON.parse(savedMonthlyProgress) 
                            : savedMonthlyProgress;
                        
                        // Validate that we got valid data
                        if (typeof finalProgress !== 'object' || Array.isArray(finalProgress)) {
                            console.warn('⚠️ ProjectProgressTracker: Parsed monthlyProgress is not an object, using local update');
                            finalProgress = updatedProgress;
                        } else {
                            console.log('✅ ProjectProgressTracker: Using saved project data from API response');
                        }
                    } catch (parseErr) {
                        console.warn('⚠️ ProjectProgressTracker: Failed to parse saved project monthlyProgress, using local update:', parseErr);
                        finalProgress = updatedProgress;
                    }
                } else {
                    // API response doesn't have monthlyProgress, use our local update (which is correct)
                    console.log('ℹ️ ProjectProgressTracker: API response missing monthlyProgress, using local update (this is expected)');
                    finalProgress = updatedProgress;
                }
                
                console.log('✅ ProjectProgressTracker: Updating local state with saved data:', {
                    projectId: project.id,
                    finalProgressKeys: Object.keys(finalProgress),
                    monthKey: key,
                    fieldValue: finalProgress[key]?.[field]
                });
                
                // Update the project reference directly
                try {
                    project.monthlyProgress = finalProgress;
                } catch (syncErr) {
                    console.warn('⚠️ ProjectProgressTracker: Failed to sync project reference after save:', syncErr);
                }
                
                // Update state with the saved data - use String comparison for IDs
                setProjects(prevProjects => prevProjects.map(p => {
                    if (String(p?.id) === String(project.id)) {
                        return { ...p, monthlyProgress: finalProgress };
                    }
                    return p;
                }));
                
                if (field === 'comments') {
                    const safeMonthName = String(month || '');
                    const monthIdx = months.indexOf(safeMonthName);
                    processCommentMentions(
                        sanitizedValue,
                        project,
                        safeMonthName,
                        monthIdx,
                        safeYear,
                        field
                    );
                }
                
                // Close modal after successful save
                setIsModalOpen(false);
                setModalData(null);
            }
        } catch (e) {
            console.error('❌ ProjectProgressTracker: Error saving progress data:', e);
            const errorMessage = e.message || 'Failed to save. Please try again.';
            alert(`Save failed: ${errorMessage}`);
            // Don't close modal on error - let user retry or cancel
        } finally {
            setSaving(false);
        }
    };
    
    // Open modal for editing a cell
    const openEditModal = (project, month, field) => {
        const currentValue = getProgressData(project, month, field);
        setModalData({
            project: project,
            month: month,
            field: field,
            currentValue: currentValue || '',
            tempValue: currentValue || ''
        });
        setIsModalOpen(true);
    };
    
    // Close modal without saving
    const closeEditModal = () => {
        setIsModalOpen(false);
        setModalData(null);
    };
    
    // Handle modal input change
    const handleModalInputChange = (value) => {
        if (modalData) {
            setModalData({
                ...modalData,
                tempValue: value
            });
        }
    };
    
    // Handle save from modal
    const handleModalSave = async () => {
        if (!modalData) return;
        
        const { project, month, field, tempValue } = modalData;
        await saveProgressData(project, month, field, tempValue);
    };
    
    // Render progress cell - clickable display cell that opens modal
    const renderProgressCell = (project, month, field, rowBgColor = '#ffffff', providedKey = null) => {
        // Validate inputs
        if (!project || !project.id || !month || !field) {
            const defaultBgColor = rowBgColor === '#ffffff' ? '#ffffff' : '#f3f4f6';
            return React.createElement('td', {
                style: {
                    backgroundColor: defaultBgColor,
                    border: '1px solid #d1d5db'
                },
                className: 'px-2 py-1 text-xs'
            }, React.createElement('span', { className: 'text-gray-400 text-[10px]' }, '-'));
        }
        
        const safeMonth = String(month || '');
        const monthIdx = months.indexOf(safeMonth);
        const isWorking = Array.isArray(workingMonths) && workingMonths.includes(monthIdx) && selectedYear === currentYear;
        const cellKey = `${project.id}-${safeMonth}-${field}`;
        const cellIdentifier = providedKey || cellKey;
        const isFocusedCell = focusedCellKey === cellIdentifier;
        
        // Get current value from project data
        const currentValue = getProgressData(project, safeMonth, field);
        const displayValue = currentValue || '';
        const hasValue = displayValue && displayValue.trim().length > 0;
        
        // Handle cell click - open modal
        const handleCellClick = () => {
            openEditModal(project, safeMonth, field);
        };
        
        // Modern cell styling with enhanced visual design
        const defaultBgColor = rowBgColor === '#ffffff' ? '#ffffff' : '#f8fafc';
        const calculatedBackground = isFocusedCell
            ? '#dbeafe'
            : isWorking
                ? 'rgba(59, 130, 246, 0.05)'
                : defaultBgColor;
        const cellStyle = {
            padding: '8px 12px',
            border: 'none',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: calculatedBackground,
            minHeight: field === 'comments' ? '60px' : '40px',
            verticalAlign: 'top',
            width: field === 'comments' ? '160px' : field === 'compliance' ? '130px' : '130px',
            minWidth: field === 'comments' ? '160px' : field === 'compliance' ? '130px' : '130px',
            transition: 'all 0.2s ease',
            position: 'relative',
            boxShadow: isFocusedCell ? '0 0 0 2px rgba(59, 130, 246, 0.35)' : 'none',
            borderRadius: '10px',
            cursor: 'pointer'
        };
        
        // Placeholder text based on field type
        const placeholderText = field === 'comments' 
            ? 'Add comments...' 
            : field === 'compliance' 
                ? 'Enter link...' 
                : 'Enter link...';
        
        // Render clickable display cell
        if (field === 'comments') {
            return React.createElement('td', {
                key: cellIdentifier,
                style: cellStyle,
                className: 'relative group',
                'data-cell-key': cellIdentifier,
                'data-project-id': project.id,
                'data-month-name': safeMonth,
                'data-month-index': monthIdx >= 0 ? String(monthIdx) : '',
                'data-field': field,
                onClick: handleCellClick
            }, React.createElement('div', {
                style: {
                    width: '100%',
                    minHeight: '44px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    color: hasValue ? '#111827' : '#9ca3af',
                    lineHeight: '1.5',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                },
                className: 'hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm',
                title: hasValue ? displayValue : 'Click to ' + placeholderText.toLowerCase()
            }, hasValue ? displayValue : React.createElement('span', { style: { fontStyle: 'italic' } }, placeholderText)));
        } else {
            // Clickable display cell for compliance and data fields
            return React.createElement('td', {
                key: cellIdentifier,
                style: cellStyle,
                className: 'relative group',
                'data-cell-key': cellIdentifier,
                'data-project-id': project.id,
                'data-month-name': safeMonth,
                'data-month-index': monthIdx >= 0 ? String(monthIdx) : '',
                'data-field': field,
                onClick: handleCellClick
            }, React.createElement('div', { 
                style: { 
                    position: 'relative', 
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                } 
            },
                React.createElement('div', {
                    style: {
                        width: '100%',
                        height: '36px',
                        padding: '8px 12px',
                        paddingRight: hasValue ? '32px' : '12px',
                        fontSize: '12px',
                        fontFamily: 'inherit',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        backgroundColor: '#ffffff',
                        color: hasValue ? '#111827' : '#9ca3af',
                        transition: 'all 0.2s ease',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                    },
                    className: 'hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm',
                    title: hasValue ? displayValue : 'Click to ' + placeholderText.toLowerCase()
                }, hasValue ? displayValue : React.createElement('span', { style: { fontStyle: 'italic' } }, placeholderText)),
                hasValue && displayValue.trim() ? React.createElement('a', {
                    href: displayValue.startsWith('http') ? displayValue : `https://${displayValue}`,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    style: {
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#3b82f6',
                        fontSize: '12px',
                        textDecoration: 'none',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'all 0.2s ease',
                        zIndex: 10
                    },
                    className: 'hover:bg-blue-100',
                    onClick: (e) => {
                        e.stopPropagation(); // Prevent opening modal when clicking link
                    }
                }, React.createElement('i', { className: 'fas fa-external-link-alt' })) : null
            ));
        }
    };
    
    // Safe year
    const safeYear = Number(selectedYear) || currentYear;
    
    // Year options
    const yearOptions = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        if (typeof i === 'number' && !isNaN(i)) {
            yearOptions.push(Number(i));
        }
    }
    
    // Main render using React.createElement
    return React.createElement('div', { className: 'space-y-4 p-4 md:p-6' },
        // Modern Header with Card Design
        React.createElement('div', { 
            className: 'bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6',
            style: { backgroundImage: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' }
        },
            React.createElement('div', { className: 'flex flex-col md:flex-row md:items-center md:justify-between gap-4' },
                React.createElement('div', { className: 'flex items-center gap-3' },
                    React.createElement('button', {
                        onClick: onBack,
                        className: 'p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95',
                        style: { minWidth: '40px', minHeight: '40px' }
                    }, React.createElement('i', { className: 'fas fa-arrow-left text-lg' })),
                    React.createElement('div', null,
                        React.createElement('h1', { 
                            className: 'text-xl md:text-2xl font-bold text-gray-900 mb-1',
                            style: { letterSpacing: '-0.02em' }
                        }, 'Project Progress Tracker'),
                            React.createElement('p', { className: 'text-sm text-gray-500 flex items-center gap-2' },
                            React.createElement('i', { className: 'fas fa-info-circle text-xs' }),
                            'Track monthly progress across the year with emphasis on the current and previous month'
                        )
                    )
                ),
                React.createElement('div', { className: 'flex items-center gap-3' },
                    React.createElement('div', { className: 'flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200' },
                        React.createElement('i', { className: 'fas fa-calendar-alt text-gray-400 text-sm' }),
                        React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, 'Year:'),
                        React.createElement('select', {
                            value: String(safeYear),
                            onChange: (e) => {
                                const newYear = parseInt(e.target.value);
                                if (!isNaN(newYear)) setSelectedYear(newYear);
                            },
                            className: 'ml-1 px-3 py-1.5 text-sm font-semibold border-0 bg-transparent text-gray-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 rounded',
                            style: { appearance: 'none', backgroundImage: 'none' }
                        }, (Array.isArray(yearOptions) ? yearOptions : []).map(y => 
                            React.createElement('option', { key: String(y), value: String(y) }, String(y) + (y === currentYear ? ' (Current)' : ''))
                        ))
                    ),
                    React.createElement('button', {
                        onClick: () => {
                            // Export functionality can be added here
                            console.log('Export to Excel');
                        },
                        className: 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:shadow-md active:scale-95 flex items-center gap-2',
                    },
                        React.createElement('i', { className: 'fas fa-file-excel' }),
                        React.createElement('span', { className: 'hidden md:inline' }, 'Export')
                    )
                )
            )
        ),
        // Error state - Modern Design
        loadError ? React.createElement('div', { 
            className: 'bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm'
        },
            React.createElement('div', { className: 'flex items-start gap-3' },
                React.createElement('i', { className: 'fas fa-exclamation-circle text-red-500 text-xl mt-0.5' }),
                React.createElement('div', { className: 'flex-1' },
                    React.createElement('p', { className: 'text-red-800 font-semibold mb-1' }, 'Error loading projects'),
                    React.createElement('p', { className: 'text-red-600 text-sm mb-3' }, String(loadError)),
                    React.createElement('button', {
                        onClick: () => window.location.reload(),
                        className: 'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors'
                    }, 'Reload Page')
                )
            )
        ) : null,
        // Working Months Info - Modern Badge Design
        React.createElement('div', { 
            className: 'flex flex-col md:flex-row md:items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200',
            style: { 
                paddingLeft: '1px',
            }
        },
            React.createElement('div', {
                className: 'px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm',
                style: { 
                    width: '100%',
                    maxWidth: '320px',
                    flexShrink: 0
                }
            },
                React.createElement('i', { className: 'fas fa-calendar-check' }),
                React.createElement('span', null, 'Working Months')
            ),
            React.createElement('div', { className: 'flex-1 flex items-center gap-2' },
                React.createElement('i', { className: 'fas fa-lightbulb text-blue-500' }),
                React.createElement('span', { 
                    className: 'text-sm text-gray-700'
                }, 'Highlighted columns mark the current month and the month before it')
            )
        ),
        // Modern Table Container with Enhanced Styling
        React.createElement('div', { 
            ref: tableRef, 
            className: 'overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200',
            style: { 
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }
        },
            React.createElement('table', { 
                className: 'text-left border-collapse w-full',
                style: { borderSpacing: 0, tableLayout: 'auto' }
            },
                React.createElement('thead', { 
                    className: 'bg-gradient-to-r from-gray-50 to-gray-100',
                    style: { 
                        borderBottom: '2px solid #e5e7eb',
                        position: 'sticky',
                        top: 0,
                        zIndex: 20
                    }
                },
                    // First row: Month headers - Modern Design
                    React.createElement('tr', null,
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '12px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                backgroundColor: '#1f2937',
                                color: '#ffffff',
                                border: 'none',
                                borderRight: '2px solid #374151',
                                position: 'sticky',
                                left: 0,
                                zIndex: 15,
                                minWidth: '320px',
                                width: '320px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            },
                            className: 'text-left sticky left-0'
                        }, 
                            React.createElement('div', { className: 'flex items-center gap-2' },
                                React.createElement('i', { className: 'fas fa-project-diagram text-sm' }),
                                React.createElement('span', null, 'Project')
                            )
                        ),
                        (Array.isArray(months) ? months : []).map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeYear === currentYear;
                            return React.createElement('th', {
                                key: safeMonth + '-header',
                                colSpan: 3,
                                style: {
                                    padding: '12px 16px',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    textAlign: 'center',
                                    backgroundColor: isWorking ? '#3b82f6' : '#f9fafb',
                                    backgroundImage: isWorking ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'none',
                                    color: isWorking ? '#ffffff' : '#374151',
                                    border: 'none',
                                    borderLeft: idx === 0 ? '2px solid #374151' : '1px solid #e5e7eb',
                                    borderBottom: '2px solid ' + (isWorking ? '#1e40af' : '#e5e7eb'),
                                    minWidth: '390px',
                                    width: '390px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    position: 'relative'
                                },
                                'data-month-header': safeMonth
                            }, 
                                isWorking ? React.createElement('div', { className: 'flex items-center justify-center gap-2' },
                                    React.createElement('i', { className: 'fas fa-star text-xs' }),
                                    React.createElement('span', null, safeMonth.slice(0, 3) + " '" + String(safeYear).slice(-2)),
                                    React.createElement('span', { 
                                        className: 'ml-1 px-1.5 py-0.5 bg-white bg-opacity-20 rounded text-[10px] font-bold'
                                    }, 'WORKING')
                                ) : safeMonth.slice(0, 3) + " '" + String(safeYear).slice(-2)
                            );
                        }),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '12px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                backgroundColor: '#1f2937',
                                color: '#ffffff',
                                border: 'none',
                                borderLeft: '2px solid #374151',
                                minWidth: '120px',
                                width: '120px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }
                        }, 
                            React.createElement('div', { className: 'flex items-center gap-2' },
                                React.createElement('i', { className: 'fas fa-user-tie text-sm' }),
                                React.createElement('span', null, 'PM')
                            )
                        ),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '12px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                backgroundColor: '#1f2937',
                                color: '#ffffff',
                                border: 'none',
                                minWidth: '140px',
                                width: '140px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }
                        }, 
                            React.createElement('div', { className: 'flex items-center gap-2' },
                                React.createElement('i', { className: 'fas fa-tag text-sm' }),
                                React.createElement('span', null, 'Type')
                            )
                        ),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '12px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                backgroundColor: '#1f2937',
                                color: '#ffffff',
                                border: 'none',
                                minWidth: '120px',
                                width: '120px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }
                        }, 
                            React.createElement('div', { className: 'flex items-center gap-2' },
                                React.createElement('i', { className: 'fas fa-circle-check text-sm' }),
                                React.createElement('span', null, 'Status')
                            )
                        )
                    ),
                    // Second row: Sub-headers (Compliance, Data, Comments) - Modern Design
                    React.createElement('tr', null,
                        (Array.isArray(months) ? months : []).map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeYear === currentYear;
                            return React.createElement(React.Fragment, { key: safeMonth + '-subheaders' },
                                React.createElement('th', { 
                                    style: {
                                        padding: '8px 12px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                                        color: isWorking ? '#1e40af' : '#6b7280',
                                        border: 'none',
                                        borderLeft: idx === 0 ? '2px solid #374151' : '1px solid #e5e7eb',
                                        borderBottom: '1px solid #e5e7eb',
                                        minWidth: '130px',
                                        width: '130px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em'
                                    }
                                }, 
                                    React.createElement('div', { className: 'flex items-center gap-1.5' },
                                        React.createElement('i', { className: 'fas fa-shield-check text-xs' }),
                                        React.createElement('span', null, 'Compliance')
                                    )
                                ),
                                React.createElement('th', { 
                                    style: {
                                        padding: '8px 12px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                                        color: isWorking ? '#1e40af' : '#6b7280',
                                        border: 'none',
                                        borderBottom: '1px solid #e5e7eb',
                                        minWidth: '130px',
                                        width: '130px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em'
                                    }
                                }, 
                                    React.createElement('div', { className: 'flex items-center gap-1.5' },
                                        React.createElement('i', { className: 'fas fa-database text-xs' }),
                                        React.createElement('span', null, 'Data')
                                    )
                                ),
                                React.createElement('th', {
                                    style: {
                                        padding: '8px 12px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                                        color: isWorking ? '#1e40af' : '#6b7280',
                                        border: 'none',
                                        borderBottom: '1px solid #e5e7eb',
                                        minWidth: '160px',
                                        width: '160px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em'
                                    }
                                }, 
                                    React.createElement('div', { className: 'flex items-center gap-1.5' },
                                        React.createElement('i', { className: 'fas fa-comment-dots text-xs' }),
                                        React.createElement('span', null, 'Comments')
                                    )
                                )
                            );
                        })
                    )
                ),
                React.createElement('tbody', null,
                    safeProjects.length === 0 ? React.createElement('tr', null,
                        React.createElement('td', { 
                            colSpan: months.length * 3 + 4, 
                            className: 'px-8 py-16 text-center',
                            style: { 
                                backgroundColor: '#f8fafc',
                                border: 'none'
                            }
                        }, 
                            loadError 
                                ? React.createElement('div', { 
                                    className: 'flex flex-col items-center gap-4 max-w-md mx-auto',
                                    style: { padding: '24px' }
                                },
                                    React.createElement('div', {
                                        className: 'w-16 h-16 rounded-full bg-red-100 flex items-center justify-center',
                                        style: { backgroundColor: '#fee2e2' }
                                    },
                                        React.createElement('i', { className: 'fas fa-exclamation-triangle text-red-600 text-2xl' })
                                    ),
                                    React.createElement('div', { className: 'space-y-2' },
                                        React.createElement('h3', { className: 'text-lg font-semibold text-gray-900' }, 'Error loading projects'),
                                        React.createElement('p', { className: 'text-sm text-gray-600' }, String(loadError))
                                    ),
                                    React.createElement('button', {
                                        onClick: () => window.location.reload(),
                                        className: 'px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm'
                                    }, 'Reload Page')
                                )
                                : projects.length === 0
                                    ? React.createElement('div', { 
                                        className: 'flex flex-col items-center gap-4 max-w-md mx-auto',
                                        style: { padding: '24px' }
                                    },
                                        React.createElement('div', {
                                            className: 'w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center',
                                            style: { backgroundColor: '#dbeafe' }
                                        },
                                            React.createElement('i', { className: 'fas fa-filter text-blue-600 text-2xl' })
                                        ),
                                        React.createElement('div', { className: 'space-y-2 text-center' },
                                            React.createElement('h3', { className: 'text-lg font-semibold text-gray-900' }, 'No projects found'),
                                            React.createElement('p', { className: 'text-sm text-gray-600' }, 'Projects need monthly progress data or MONTHLY type to appear here')
                                        )
                                    )
                                    : React.createElement('div', { 
                                        className: 'flex flex-col items-center gap-4 max-w-md mx-auto',
                                        style: { padding: '24px' }
                                    },
                                        React.createElement('div', {
                                            className: 'w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center',
                                            style: { backgroundColor: '#f3f4f6' }
                                        },
                                            React.createElement('i', { className: 'fas fa-info-circle text-gray-500 text-2xl' })
                                        ),
                                        React.createElement('div', { className: 'space-y-2 text-center' },
                                            React.createElement('h3', { className: 'text-lg font-semibold text-gray-900' }, 'No valid projects to display'),
                                            React.createElement('p', { className: 'text-sm text-gray-600' }, 'Projects may be missing required fields')
                                        )
                                    )
                        )
                    ) : (Array.isArray(safeProjects) && safeProjects.length > 0 ? safeProjects.map((project, rowIndex) => {
                        // Double-check project is valid before rendering
                        if (!project || !project.id) {
                            console.warn('⚠️ ProjectProgressTracker: Invalid project in map:', project);
                            return null;
                        }
                        
                        // Modern row styling with subtle gradients
                        const isEvenRow = rowIndex % 2 === 0;
                        const rowBgColor = isEvenRow ? '#ffffff' : '#f8fafc';
                        const isRowFocused = focusedRowId === project.id;
                        const rowBaseBgColor = isRowFocused ? '#eff6ff' : rowBgColor;
                        
                        // Build all cells for this row
                        const monthCells = (Array.isArray(months) ? months : []).reduce((acc, month) => {
                            const safeMonth = String(month || '');
                            acc.push(
                                renderProgressCell(project, safeMonth, 'compliance', rowBaseBgColor, `${project.id}-${safeMonth}-compliance`),
                                renderProgressCell(project, safeMonth, 'data', rowBaseBgColor, `${project.id}-${safeMonth}-data`),
                                renderProgressCell(project, safeMonth, 'comments', rowBaseBgColor, `${project.id}-${safeMonth}-comments`)
                            );
                            return acc;
                        }, []);
                        
                        // Build all children for the row - flatten monthCells to ensure no nested arrays
                        const rowChildren = [
                            React.createElement('td', { 
                                style: {
                                    padding: '12px 16px',
                                    fontSize: '13px',
                                    backgroundColor: rowBaseBgColor,
                                    border: 'none',
                                    borderRight: '2px solid #374151',
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 9,
                                    minWidth: '320px',
                                    width: '320px',
                                    transition: 'background-color 0.2s ease'
                                },
                                className: 'sticky left-0',
                                'data-project-id': project.id
                            },
                                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                                    React.createElement('span', { 
                                        style: { 
                                            fontWeight: '600', 
                                            color: '#111827', 
                                            fontSize: '13px',
                                            lineHeight: '1.4'
                                        } 
                                    }, String(project.name || 'Unnamed Project')),
                                    project.type && project.type !== '-' && project.type.trim() ? React.createElement('span', { 
                                        style: { 
                                            color: '#6b7280', 
                                            fontSize: '11px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        } 
                                    },
                                        React.createElement('i', { className: 'fas fa-tag text-[9px]' }),
                                        String(project.type)
                                    ) : null,
                                    React.createElement('span', { 
                                        style: { 
                                            color: '#9ca3af', 
                                            fontSize: '11px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        } 
                                    },
                                        React.createElement('i', { className: 'fas fa-building text-[9px]' }),
                                        String(project.client || 'No Client')
                                    )
                                )
                            ),
                            ...monthCells,
                            React.createElement('td', { 
                                style: {
                                    padding: '12px 16px',
                                    fontSize: '12px',
                                    border: 'none',
                                    borderLeft: '2px solid #374151',
                                    backgroundColor: rowBaseBgColor,
                                    color: '#374151',
                                    minWidth: '120px',
                                    width: '120px',
                                    fontWeight: '500'
                                }
                            }, 
                                project.manager && project.manager !== '-' ? React.createElement('div', { className: 'flex items-center gap-2' },
                                    React.createElement('div', {
                                        className: 'w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center',
                                        style: { backgroundColor: '#dbeafe' }
                                    },
                                        React.createElement('i', { className: 'fas fa-user text-blue-600 text-xs' })
                                    ),
                                    React.createElement('span', null, String(project.manager))
                                ) : React.createElement('span', { className: 'text-gray-400' }, '-')
                            ),
                            React.createElement('td', { 
                                style: {
                                    padding: '12px 16px',
                                    fontSize: '12px',
                                    border: 'none',
                                    backgroundColor: rowBaseBgColor,
                                    color: '#374151',
                                    minWidth: '140px',
                                    width: '140px',
                                    fontWeight: '500'
                                }
                            }, 
                                project.type && project.type !== '-' ? React.createElement('span', {
                                    className: 'px-2.5 py-1 bg-purple-100 text-purple-700 rounded-md text-xs font-semibold',
                                    style: { display: 'inline-block' }
                                }, String(project.type)) : React.createElement('span', { className: 'text-gray-400' }, '-')
                            ),
                            React.createElement('td', { 
                                style: {
                                    padding: '12px 16px',
                                    border: 'none',
                                    backgroundColor: rowBaseBgColor,
                                    minWidth: '120px',
                                    width: '120px'
                                }
                            },
                                React.createElement('span', {
                                    className: 'px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5',
                                    style: { 
                                        display: 'inline-flex',
                                        backgroundColor: '#d1fae5',
                                        color: '#065f46'
                                    }
                                },
                                    React.createElement('i', { className: 'fas fa-circle-check text-[8px]' }),
                                    String(project.status || 'Active')
                                )
                            )
                        ];
                        
                        // Use React.createElement with all children as separate arguments
                        const rowStyle = {
                            borderBottom: '1px solid #e5e7eb',
                            backgroundColor: rowBaseBgColor,
                            transition: 'all 0.2s ease',
                            boxShadow: isRowFocused ? 'inset 0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none'
                        };

                        return React.createElement('tr', { 
                            key: String(project.id),
                            'data-project-row': project.id,
                            style: rowStyle,
                            onMouseEnter: (e) => {
                                if (!isRowFocused) {
                                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                                    e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(59, 130, 246, 0.1)';
                                }
                            },
                            onMouseLeave: (e) => {
                                e.currentTarget.style.backgroundColor = rowBaseBgColor;
                                e.currentTarget.style.boxShadow = isRowFocused ? 'inset 0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none';
                            }
                        }, ...rowChildren);
                    }).filter(item => item !== null) : []
                    )
                )
            )
        )
    );
};

// Memoize component to prevent unnecessary re-renders
const ProjectProgressTrackerMemo = memo(ProjectProgressTracker);

// Register globally
try {
    window.ProjectProgressTracker = ProjectProgressTrackerMemo;
    console.log('✅ ProjectProgressTracker registered successfully');
} catch (error) {
    console.error('❌ Failed to register ProjectProgressTracker:', error);
    window.ProjectProgressTracker = () => React.createElement('div', { className: 'p-4 bg-red-50' },
        React.createElement('p', { className: 'text-red-800' }, 'Component registration failed')
    );
}
