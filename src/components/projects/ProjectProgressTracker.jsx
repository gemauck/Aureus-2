// Get React hooks from window
const { useState, useEffect, useRef } = React;
const storage = window.storage;

// Main component - completely rebuilt for reliability
const ProjectProgressTracker = function ProjectProgressTrackerComponent(props) {
    // Immediate logging to confirm function is called
    console.log('🔍 ProjectProgressTracker: FUNCTION CALLED');
    console.log('🔍 Props received:', props);
    console.log('🔍 Props type:', typeof props);
    console.log('🔍 React available:', typeof React !== 'undefined');
    console.log('🔍 useState available:', typeof useState !== 'undefined');
    
    // Check if this is being called
    if (!props) {
        console.warn('⚠️ ProjectProgressTracker: No props received, using defaults');
    }
    
    // Validate props
    const onBack = props && typeof props.onBack === 'function' ? props.onBack : () => console.warn('onBack not available');
    
    // Safe constants
    const currentYear = Number(new Date().getFullYear()) || 2025;
    const currentMonth = Number(new Date().getMonth()) || 0;
    
    // Working months calculation
    const getWorkingMonths = () => {
        const two = currentMonth - 2 < 0 ? currentMonth - 2 + 12 : currentMonth - 2;
        const one = currentMonth - 1 < 0 ? currentMonth - 1 + 12 : currentMonth - 1;
        return [Number(two), Number(one)];
    };
    
    const workingMonths = getWorkingMonths();
    // Show only Jan-Sep (first 9 months) as per the original design
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September'];
    
    // State - always initialize with empty array to prevent undefined/null issues
    const [projects, setProjects] = useState(() => []);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [loadError, setLoadError] = useState(null);
    
    // Refs
    const tableRef = useRef(null);
    
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
            if (!project || !month || !field) return null;
            const safeYear = Number(selectedYear) || currentYear;
            if (isNaN(safeYear)) return null; // Safety check for year
            
            const key = String(month || '') + '-' + String(safeYear);
            if (!key || key.length < 5) return null; // Invalid key format
            
            const progress = project.monthlyProgress;
            if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return null;
            
            const monthData = progress[key];
            if (!monthData || typeof monthData !== 'object' || Array.isArray(monthData)) return null;
            
            const fieldData = monthData[field];
            if (fieldData && typeof fieldData === 'object' && !Array.isArray(fieldData) && !(fieldData instanceof Date)) {
                return null;
            }
            return fieldData || null;
        } catch (e) {
            console.warn('⚠️ ProjectProgressTracker: Error in getProgressData:', e);
            return null;
        }
    };
    
    // Render progress cell - with full error handling
    const renderProgressCell = (project, month, field) => {
        // Validate inputs
        if (!project || !project.id || !month || !field) {
            console.warn('⚠️ ProjectProgressTracker: Invalid renderProgressCell params:', { project: !!project, month, field });
            return React.createElement('td', {
                key: (project?.id || 'unknown') + '-' + String(month) + '-' + String(field),
                className: 'px-2 py-1 text-xs border-l border-gray-100'
            }, React.createElement('span', { className: 'text-gray-400 text-[10px]' }, '-'));
        }
        
        let data;
        try {
            data = getProgressData(project, month, field);
        } catch (e) {
            console.warn('⚠️ ProjectProgressTracker: Error getting progress data:', e);
            data = null;
        }
        
        const safeMonth = String(month || '');
        const monthIdx = months.indexOf(safeMonth);
        const isWorking = Array.isArray(workingMonths) && workingMonths.includes(monthIdx) && selectedYear === currentYear;
        
        if (field === 'comments') {
            // Handle comments - can be array, string, or object
            let comments = [];
            if (Array.isArray(data)) {
                comments = data;
            } else if (typeof data === 'string' && data.trim()) {
                comments = [data];
            } else if (data && typeof data === 'object') {
                // If it's an object, try to extract text or use the object itself
                if (data.text) {
                    comments = Array.isArray(data.text) ? data.text : [data.text];
                } else {
                    comments = [JSON.stringify(data)];
                }
            }
            
            return React.createElement('td', {
                key: project.id + '-' + safeMonth + '-' + field,
                className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '')
            }, React.createElement('div', {
                className: 'flex flex-col gap-0.5'
            }, comments.length > 0 ? comments.map((comment, idx) => 
                React.createElement('span', {
                    key: idx,
                    className: 'text-[10px] text-gray-600'
                }, String(comment || ''))
            ) : React.createElement('span', {
                className: 'text-gray-400 text-[10px]'
            }, '-')));
        }
        
        if (!data) {
            return React.createElement('td', {
                key: project.id + '-' + safeMonth + '-' + field,
                className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '')
            }, React.createElement('span', { className: 'text-gray-400 text-[10px]' }, '-'));
        }
        
        // Handle simple string values (like person names or simple status)
        if (typeof data === 'string') {
            if (field === 'compliance') {
                // If it's a simple string for compliance, show it as a badge
                const statusLower = data.toLowerCase().trim();
                const config = getStatusConfig(statusLower === 'active' ? 'checked' : statusLower);
                return React.createElement('td', {
                    key: project.id + '-' + safeMonth + '-' + field,
                    className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '')
                }, React.createElement('span', {
                    className: String(config.color || 'bg-gray-100 text-gray-800') + ' px-1.5 py-0.5 rounded text-[9px] font-medium'
                }, String(data)));
            } else {
                // For data field, just show the string
                return React.createElement('td', {
                    key: project.id + '-' + safeMonth + '-' + field,
                    className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '')
                }, React.createElement('span', {
                    className: 'text-gray-700 text-[10px]'
                }, String(data)));
            }
        }
        
        // Handle complex object structure (existing format)
        if (typeof data === 'object' && !Array.isArray(data)) {
            const status = data.status && typeof data.status === 'string' ? data.status : String(data.status || '');
            const config = getStatusConfig(status);
            const text = data.text && typeof data.text === 'string' ? data.text : String(data.text || '');
            const link = data.link && typeof data.link === 'string' ? data.link : '';
            const date = data.date ? String(data.date) : '';
            
            return React.createElement('td', {
                key: project.id + '-' + safeMonth + '-' + field,
                className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '') + ' ' + String(config.cellColor || '')
            }, React.createElement('div', { className: 'flex flex-col gap-0.5' },
                status ? React.createElement('span', { className: String(config.color || '') + ' px-1.5 py-0.5 rounded text-[9px] font-medium' }, String(config.label || '')) : null,
                text ? React.createElement('span', { className: 'text-gray-700 text-[10px]' }, String(text)) : null,
                link ? React.createElement('a', {
                    href: String(link),
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    className: 'text-primary-600 hover:text-primary-700 text-[10px]'
                }, 'View') : null,
                date ? React.createElement('span', { className: 'text-gray-500 text-[9px]' }, String(date)) : null
            ));
        }
        
        // Fallback for unexpected data types
        return React.createElement('td', {
            key: project.id + '-' + safeMonth + '-' + field,
            className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '')
        }, React.createElement('span', { className: 'text-gray-400 text-[10px]' }, '-'));
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
    return React.createElement('div', { className: 'space-y-3' },
        // Header
        React.createElement('div', { className: 'flex items-center justify-between' },
            React.createElement('div', { className: 'flex items-center gap-2' },
                React.createElement('button', {
                    onClick: onBack,
                    className: 'p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'
                }, React.createElement('i', { className: 'fas fa-arrow-left' })),
                React.createElement('div', null,
                    React.createElement('h1', { className: 'text-lg font-semibold text-gray-900' }, 'Project Progress Tracker'),
                    React.createElement('p', { className: 'text-xs text-gray-500' }, 'Track monthly progress in arrears')
                )
            ),
            React.createElement('div', { className: 'flex items-center gap-2' },
                React.createElement('label', { className: 'text-[10px] font-medium text-gray-600' }, 'Year:'),
                React.createElement('select', {
                    value: String(safeYear),
                    onChange: (e) => {
                        const newYear = parseInt(e.target.value);
                        if (!isNaN(newYear)) setSelectedYear(newYear);
                    },
                    className: 'px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white text-gray-700'
                }, Array.isArray(yearOptions) && yearOptions.map(y => 
                    React.createElement('option', { key: String(y), value: String(y) }, String(y) + (y === currentYear ? ' (Current)' : ''))
                ))
            )
        ),
        // Error state
        loadError ? React.createElement('div', { className: 'bg-red-50 border border-red-200 rounded-lg p-4' },
            React.createElement('p', { className: 'text-red-800' }, 'Error: ' + String(loadError)),
            React.createElement('button', {
                onClick: () => window.location.reload(),
                className: 'mt-2 px-3 py-1.5 bg-red-600 text-white rounded text-xs'
            }, 'Reload')
        ) : null,
        // Table
        React.createElement('div', { ref: tableRef, className: 'overflow-x-auto border border-gray-200 rounded-lg' },
            React.createElement('table', { className: 'w-full text-left' },
                React.createElement('thead', { className: 'bg-gray-50' },
                    React.createElement('tr', null,
                        React.createElement('th', { className: 'px-2.5 py-1.5 text-left text-[10px] font-semibold sticky left-0 bg-gray-50 z-10 border-r' }, 'Project'),
                        Array.isArray(months) && months.map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeYear === currentYear;
                            return React.createElement(React.Fragment, { key: safeMonth },
                                React.createElement('th', {
                                    colSpan: 3,
                                    className: 'px-1.5 py-1.5 text-center text-[10px] font-semibold border-l' + (isWorking ? ' bg-primary-50 text-primary-700' : '')
                                }, safeMonth.slice(0, 3) + " '" + String(safeYear).slice(-2)),
                                React.createElement('th', { className: 'px-1.5 py-1 text-left text-[9px] border-l' + (isWorking ? ' bg-primary-50' : '') }, 'Compliance'),
                                React.createElement('th', { className: 'px-1.5 py-1 text-left text-[9px] border-l' + (isWorking ? ' bg-primary-50' : '') }, 'Data'),
                                React.createElement('th', { className: 'px-1.5 py-1 text-left text-[9px] border-l' + (isWorking ? ' bg-primary-50' : '') }, 'Comments')
                            );
                        }),
                        React.createElement('th', { className: 'px-2.5 py-1.5 text-[10px] border-l' }, 'PM'),
                        React.createElement('th', { className: 'px-2.5 py-1.5 text-[10px]' }, 'Type'),
                        React.createElement('th', { className: 'px-2.5 py-1.5 text-[10px]' }, 'Status')
                    )
                ),
                React.createElement('tbody', null,
                    safeProjects.length === 0 ? React.createElement('tr', null,
                        React.createElement('td', { colSpan: months.length * 3 + 4, className: 'px-4 py-8 text-center text-gray-500' }, 
                            loadError 
                                ? React.createElement('div', { className: 'flex flex-col items-center gap-2' },
                                    React.createElement('i', { className: 'fas fa-exclamation-triangle text-yellow-500 text-2xl' }),
                                    React.createElement('span', { className: 'text-red-600 font-medium' }, 'Error loading projects'),
                                    React.createElement('span', { className: 'text-xs text-gray-400' }, loadError)
                                )
                                    : projects.length === 0
                                    ? React.createElement('div', { className: 'flex flex-col items-center gap-2' },
                                        React.createElement('i', { className: 'fas fa-filter text-gray-400 text-2xl' }),
                                        React.createElement('span', null, 'No projects with monthly progress found'),
                                        React.createElement('span', { className: 'text-xs text-gray-400' }, 'Projects need monthly progress data or MONTHLY type to appear here')
                                    )
                                    : React.createElement('div', { className: 'flex flex-col items-center gap-2' },
                                        React.createElement('i', { className: 'fas fa-info-circle text-gray-400 text-2xl' }),
                                        React.createElement('span', null, 'No valid MONTHLY projects to display'),
                                        React.createElement('span', { className: 'text-xs text-gray-400' }, 'Projects may be missing required fields')
                                    )
                        )
                    ) : (Array.isArray(safeProjects) && safeProjects.length > 0 ? safeProjects.map(project => {
                        // Double-check project is valid before rendering
                        if (!project || !project.id) {
                            console.warn('⚠️ ProjectProgressTracker: Invalid project in map:', project);
                            return null;
                        }
                        
                        return React.createElement('tr', { key: String(project.id), className: 'border-b border-gray-100 hover:bg-gray-50' },
                            React.createElement('td', { className: 'px-2.5 py-1.5 text-[10px] sticky left-0 bg-white z-10 border-r' },
                                React.createElement('div', { className: 'flex flex-col gap-0.5' },
                                    React.createElement('span', { className: 'font-medium text-gray-900' }, String(project.name || 'Unnamed Project')),
                                    project.type && project.type !== '-' && project.type.trim() ? React.createElement('span', { className: 'text-gray-600 text-[9px]' }, String(project.type)) : null,
                                    React.createElement('span', { className: 'text-gray-500 text-[9px]' }, String(project.client || 'No Client'))
                                )
                            ),
                            Array.isArray(months) && months.map(month => {
                                const safeMonth = String(month || '');
                                return React.createElement(React.Fragment, { key: safeMonth },
                                    renderProgressCell(project, safeMonth, 'compliance'),
                                    renderProgressCell(project, safeMonth, 'data'),
                                    renderProgressCell(project, safeMonth, 'comments')
                                );
                            }),
                            React.createElement('td', { className: 'px-2.5 py-1.5 text-[10px] text-gray-600 border-l' }, String(project.manager || '-')),
                            React.createElement('td', { className: 'px-2.5 py-1.5 text-[10px] text-gray-600' }, String(project.type || '-')),
                            React.createElement('td', { className: 'px-2.5 py-1.5 text-[10px]' },
                                React.createElement('span', {
                                    className: 'px-1.5 py-0.5 text-[9px] rounded font-medium bg-gray-100 text-gray-700'
                                }, String(project.status || 'Unknown'))
                            )
                        );
                    }).filter(item => item !== null) : []
                    )
                )
            )
        )
    );
};

// Register globally
try {
    window.ProjectProgressTracker = ProjectProgressTracker;
    console.log('✅ ProjectProgressTracker registered successfully');
} catch (error) {
    console.error('❌ Failed to register ProjectProgressTracker:', error);
    window.ProjectProgressTracker = () => React.createElement('div', { className: 'p-4 bg-red-50' },
        React.createElement('p', { className: 'text-red-800' }, 'Component registration failed')
    );
}
