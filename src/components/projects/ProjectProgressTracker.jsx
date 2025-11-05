// Get React hooks from window
const { useState, useEffect, useRef, memo } = React;
const storage = window.storage;

// Main component - completely rebuilt for reliability
const ProjectProgressTracker = function ProjectProgressTrackerComponent(props) {
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
    const [editingCell, setEditingCell] = useState(null); // {projectId, month, field}
    const [cellValues, setCellValues] = useState({}); // {[projectId-month-field]: value}
    const [saving, setSaving] = useState(false);
    
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
            
            // Update project via API - only send monthlyProgress field to prevent overwriting other fields
            const updatePayload = {
                monthlyProgress: JSON.stringify(updatedProgress)
            };
            
            let updateSuccess = false;
            let apiError = null;
            
            try {
                if (window.DatabaseAPI && window.DatabaseAPI.updateProject) {
                    await window.DatabaseAPI.updateProject(project.id, updatePayload);
                    updateSuccess = true;
                } else if (window.api && window.api.updateProject) {
                    await window.api.updateProject(project.id, updatePayload);
                    updateSuccess = true;
                } else {
                    throw new Error('Update API not available');
                }
            } catch (apiErr) {
                apiError = apiErr;
                console.error('❌ ProjectProgressTracker: API update failed:', apiErr);
                
                // Restore backup on failure
                setProjects(prevProjects => prevProjects.map(p => 
                    p.id === project.id 
                        ? { ...p, monthlyProgress: backupProgress }
                        : p
                ));
                
                throw apiErr;
            }
            
            if (updateSuccess) {
                // Only update local state after successful API call
                setProjects(prevProjects => prevProjects.map(p => 
                    p.id === project.id 
                        ? { ...p, monthlyProgress: updatedProgress }
                        : p
                ));
                
                // Clear editing state only after successful save
                setEditingCell(null);
                const cellKey = `${project.id}-${month}-${field}`;
                setCellValues(prev => {
                    const updated = { ...prev };
                    delete updated[cellKey];
                    return updated;
                });
            }
        } catch (e) {
            console.error('❌ ProjectProgressTracker: Error saving progress data:', e);
            const errorMessage = e.message || 'Failed to save. Please try again.';
            alert(`Save failed: ${errorMessage}`);
            
            // Reset cell value to original on error
            const cellKey = `${project.id}-${month}-${field}`;
            setCellValues(prev => {
                const updated = { ...prev };
                const originalValue = getProgressData(project, month, field);
                updated[cellKey] = originalValue;
                return updated;
            });
        } finally {
            setSaving(false);
        }
    };
    
    // Render progress cell - editable input fields
    const renderProgressCell = (project, month, field, rowBgColor = '#ffffff') => {
        // Validate inputs
        if (!project || !project.id || !month || !field) {
            const defaultBgColor = rowBgColor === '#ffffff' ? '#ffffff' : '#f3f4f6';
            return React.createElement('td', {
                key: (project?.id || 'unknown') + '-' + String(month) + '-' + String(field),
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
        const isEditing = editingCell && editingCell.projectId === project.id && editingCell.month === safeMonth && editingCell.field === field;
        
        // Get current value
        const currentValue = getProgressData(project, safeMonth, field);
        const displayValue = cellValues[cellKey] !== undefined ? cellValues[cellKey] : currentValue;
        
        // Handle edit start
        const handleStartEdit = () => {
            setEditingCell({ projectId: project.id, month: safeMonth, field: field });
            setCellValues(prev => ({ ...prev, [cellKey]: currentValue }));
        };
        
        // Handle input change
        const handleChange = (e) => {
            setCellValues(prev => ({ ...prev, [cellKey]: e.target.value }));
        };
        
        // Handle save
        const handleBlur = () => {
            const newValue = cellValues[cellKey] !== undefined ? cellValues[cellKey] : displayValue;
            if (newValue !== currentValue) {
                saveProgressData(project, safeMonth, field, newValue);
            } else {
                setEditingCell(null);
                setCellValues(prev => {
                    const updated = { ...prev };
                    delete updated[cellKey];
                    return updated;
                });
            }
        };
        
        // Handle key press
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleBlur();
            } else if (e.key === 'Escape') {
                setEditingCell(null);
                setCellValues(prev => {
                    const updated = { ...prev };
                    delete updated[cellKey];
                    return updated;
                });
            }
        };
        
        // Spreadsheet-style cell with borders
        // Use more visible alternate color
        const defaultBgColor = rowBgColor === '#ffffff' ? '#ffffff' : '#f3f4f6';
        const cellStyle = {
            padding: '2px 8px',
            border: '1px solid #d1d5db',
            backgroundColor: isWorking ? '#f0f9ff' : defaultBgColor,
            minHeight: field === 'comments' ? '40px' : '24px',
            verticalAlign: 'top',
            width: field === 'comments' ? '150px' : field === 'compliance' ? '120px' : '120px',
            minWidth: field === 'comments' ? '150px' : field === 'compliance' ? '120px' : '120px'
        };
        
        // Always show input boxes (spreadsheet style)
        if (field === 'comments') {
            return React.createElement('td', {
                key: cellKey,
                style: cellStyle,
                className: 'relative'
            }, React.createElement('textarea', {
                value: displayValue || '',
                onChange: handleChange,
                onFocus: handleStartEdit,
                onBlur: handleBlur,
                onKeyDown: handleKeyDown,
                placeholder: 'Enter comments...',
                style: {
                    width: '100%',
                    height: '100%',
                    minHeight: '36px',
                    padding: '2px 6px',
                    fontSize: '11px',
                    fontFamily: 'inherit',
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    resize: 'none',
                    lineHeight: '1.3'
                },
                className: isEditing ? 'ring-1 ring-blue-500' : ''
            }));
        } else {
            // For compliance and data - always show input box
            return React.createElement('td', {
                key: cellKey,
                style: cellStyle
            }, React.createElement('input', {
                type: 'text',
                value: displayValue || '',
                onChange: handleChange,
                onFocus: handleStartEdit,
                onBlur: handleBlur,
                onKeyDown: handleKeyDown,
                placeholder: field === 'compliance' ? 'Link...' : 'Link...',
                style: {
                    width: '100%',
                    height: '20px',
                    padding: '1px 4px',
                    fontSize: '11px',
                    fontFamily: 'inherit',
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent'
                },
                className: isEditing ? 'ring-1 ring-blue-500' : ''
            }));
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
        // Working Months Info - aligned with PROJECT column
        React.createElement('div', { 
            className: 'mb-2',
            style: { 
                paddingLeft: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }
        },
            React.createElement('button', {
                className: 'px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors',
                style: { 
                    width: '320px',
                    textAlign: 'left',
                    flexShrink: 0
                }
            }, 'Working Months'),
            React.createElement('span', { 
                className: 'text-xs text-gray-600'
            }, 'Highlighted columns show current focus months (2 months in arrears).')
        ),
        // Table - Spreadsheet style
        React.createElement('div', { ref: tableRef, className: 'overflow-x-auto bg-white border border-gray-300 shadow-sm' },
            React.createElement('table', { 
                className: 'text-left border-collapse',
                style: { borderSpacing: 0, tableLayout: 'auto' }
            },
                React.createElement('thead', { className: 'bg-gray-100 border-b-2 border-gray-400' },
                    // First row: Month headers
                    React.createElement('tr', null,
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '6px 10px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #9ca3af',
                                borderRight: '2px solid #6b7280',
                                position: 'sticky',
                                left: 0,
                                zIndex: 10,
                                minWidth: '320px',
                                width: '320px'
                            },
                            className: 'text-left sticky left-0 z-10'
                        }, 'Project'),
                        Array.isArray(months) && months.map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeYear === currentYear;
                            return React.createElement('th', {
                                key: safeMonth + '-header',
                                colSpan: 3,
                                style: {
                                    padding: '6px 10px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    textAlign: 'center',
                                    backgroundColor: isWorking ? '#eff6ff' : '#f3f4f6',
                                    border: '1px solid #9ca3af',
                                    borderLeft: idx === 0 ? '2px solid #6b7280' : '1px solid #9ca3af',
                                    minWidth: '390px',
                                    width: '390px'
                                }
                            }, safeMonth.slice(0, 3) + " '" + String(safeYear).slice(-2));
                        }),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '6px 10px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #9ca3af',
                                borderLeft: '2px solid #6b7280',
                                minWidth: '100px',
                                width: '100px'
                            }
                        }, 'PM'),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '6px 10px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #9ca3af',
                                minWidth: '120px',
                                width: '120px'
                            }
                        }, 'Type'),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '6px 10px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #9ca3af',
                                minWidth: '100px',
                                width: '100px'
                            }
                        }, 'Status')
                    ),
                    // Second row: Sub-headers (Compliance, Data, Comments) for each month
                    React.createElement('tr', null,
                        Array.isArray(months) && months.map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeYear === currentYear;
                            return React.createElement(React.Fragment, { key: safeMonth + '-subheaders' },
                                React.createElement('th', { 
                                    style: {
                                        padding: '4px 8px',
                                        fontSize: '10px',
                                        fontWeight: '500',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? '#eff6ff' : '#f9fafb',
                                        border: '1px solid #d1d5db',
                                        borderTop: 'none',
                                        borderLeft: idx === 0 ? '2px solid #6b7280' : '1px solid #d1d5db',
                                        minWidth: '120px',
                                        width: '120px'
                                    }
                                }, 'Compliance'),
                                React.createElement('th', { 
                                    style: {
                                        padding: '4px 8px',
                                        fontSize: '10px',
                                        fontWeight: '500',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? '#eff6ff' : '#f9fafb',
                                        border: '1px solid #d1d5db',
                                        borderTop: 'none',
                                        minWidth: '120px',
                                        width: '120px'
                                    }
                                }, 'Data'),
                                React.createElement('th', {
                                    style: {
                                        padding: '4px 8px',
                                        fontSize: '10px',
                                        fontWeight: '500',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? '#eff6ff' : '#f9fafb',
                                        border: '1px solid #d1d5db',
                                        borderTop: 'none',
                                        minWidth: '150px',
                                        width: '150px'
                                    }
                                }, 'Comments')
                            );
                        })
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
                    ) : (Array.isArray(safeProjects) && safeProjects.length > 0 ? safeProjects.map((project, rowIndex) => {
                        // Double-check project is valid before rendering
                        if (!project || !project.id) {
                            console.warn('⚠️ ProjectProgressTracker: Invalid project in map:', project);
                            return null;
                        }
                        
                        // Alternate row colors - more visible
                        const isEvenRow = rowIndex % 2 === 0;
                        const rowBgColor = isEvenRow ? '#ffffff' : '#f3f4f6';
                        
                        return React.createElement('tr', { 
                            key: String(project.id),
                            style: {
                                borderBottom: '1px solid #d1d5db',
                                backgroundColor: rowBgColor
                            },
                            onMouseEnter: (e) => {
                                e.currentTarget.style.backgroundColor = '#f9fafb';
                            },
                            onMouseLeave: (e) => {
                                e.currentTarget.style.backgroundColor = rowBgColor;
                            }
                        },
                            React.createElement('td', { 
                                style: {
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    backgroundColor: rowBgColor,
                                    border: '1px solid #d1d5db',
                                    borderRight: '2px solid #6b7280',
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 9,
                                    minWidth: '320px',
                                    width: '320px'
                                },
                                className: 'sticky left-0 z-10'
                            },
                                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
                                    React.createElement('span', { style: { fontWeight: '600', color: '#111827', fontSize: '11px' } }, String(project.name || 'Unnamed Project')),
                                    project.type && project.type !== '-' && project.type.trim() ? React.createElement('span', { style: { color: '#4b5563', fontSize: '10px' } }, String(project.type)) : null,
                                    React.createElement('span', { style: { color: '#6b7280', fontSize: '10px' } }, String(project.client || 'No Client'))
                                )
                            ),
                            Array.isArray(months) && months.map(month => {
                                const safeMonth = String(month || '');
                                return React.createElement(React.Fragment, { key: safeMonth },
                                    renderProgressCell(project, safeMonth, 'compliance', rowBgColor),
                                    renderProgressCell(project, safeMonth, 'data', rowBgColor),
                                    renderProgressCell(project, safeMonth, 'comments', rowBgColor)
                                );
                            }),
                            React.createElement('td', { 
                                style: {
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    border: '1px solid #d1d5db',
                                    borderLeft: '2px solid #6b7280',
                                    backgroundColor: rowBgColor,
                                    color: '#4b5563',
                                    minWidth: '100px',
                                    width: '100px'
                                }
                            }, String(project.manager || '-')),
                            React.createElement('td', { 
                                style: {
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: rowBgColor,
                                    color: '#4b5563',
                                    minWidth: '120px',
                                    width: '120px'
                                }
                            }, String(project.type || '-')),
                            React.createElement('td', { 
                                style: {
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: rowBgColor,
                                    minWidth: '100px',
                                    width: '100px'
                                }
                            },
                                React.createElement('span', {
                                    style: {
                                        padding: '1px 6px',
                                        fontSize: '10px',
                                        borderRadius: '4px',
                                        fontWeight: '500',
                                        backgroundColor: '#f3f4f6',
                                        color: '#374151'
                                    }
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
