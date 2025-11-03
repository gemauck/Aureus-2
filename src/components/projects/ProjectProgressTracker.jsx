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
    
    // Save progress data
    const saveProgressData = async (project, month, field, value) => {
        try {
            setSaving(true);
            const safeYear = Number(selectedYear) || currentYear;
            const key = String(month) + '-' + String(safeYear);
            
            // Get current monthlyProgress or create new
            const currentProgress = project.monthlyProgress || {};
            const currentMonthData = currentProgress[key] || {};
            
            // Update the field
            const updatedMonthData = {
                ...currentMonthData,
                [field]: value || ''
            };
            
            const updatedProgress = {
                ...currentProgress,
                [key]: updatedMonthData
            };
            
            // Update project via API
            // Convert monthlyProgress to JSON string for database storage
            const updatePayload = {
                monthlyProgress: typeof updatedProgress === 'string' ? updatedProgress : JSON.stringify(updatedProgress)
            };
            
            if (window.DatabaseAPI && window.DatabaseAPI.updateProject) {
                await window.DatabaseAPI.updateProject(project.id, updatePayload);
            } else if (window.api && window.api.updateProject) {
                await window.api.updateProject(project.id, updatePayload);
            } else {
                console.error('❌ ProjectProgressTracker: No updateProject method available');
                throw new Error('Update API not available');
            }
            
            // Update local state
            setProjects(prevProjects => prevProjects.map(p => 
                p.id === project.id 
                    ? { ...p, monthlyProgress: updatedProgress }
                    : p
            ));
            
            // Clear editing state
            setEditingCell(null);
            const cellKey = `${project.id}-${month}-${field}`;
            setCellValues(prev => {
                const updated = { ...prev };
                delete updated[cellKey];
                return updated;
            });
        } catch (e) {
            console.error('❌ ProjectProgressTracker: Error saving progress data:', e);
            alert('Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };
    
    // Render progress cell - editable input fields
    const renderProgressCell = (project, month, field) => {
        // Validate inputs
        if (!project || !project.id || !month || !field) {
            return React.createElement('td', {
                key: (project?.id || 'unknown') + '-' + String(month) + '-' + String(field),
                className: 'px-2 py-1 text-xs border-l border-gray-100'
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
        
        const baseClassName = 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '');
        
        // Render editable cell
        if (isEditing || !currentValue) {
            // For comments, use textarea; for compliance/data, use input
            if (field === 'comments') {
                return React.createElement('td', {
                    key: cellKey,
                    className: baseClassName
                }, React.createElement('textarea', {
                    value: displayValue || '',
                    onChange: handleChange,
                    onBlur: handleBlur,
                    onKeyDown: handleKeyDown,
                    placeholder: 'Enter comments...',
                    className: 'w-full px-1.5 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500',
                    rows: 2,
                    autoFocus: true
                }));
            } else {
                // For compliance and data - input field for pasting links
                return React.createElement('td', {
                    key: cellKey,
                    className: baseClassName
                }, React.createElement('input', {
                    type: 'text',
                    value: displayValue || '',
                    onChange: handleChange,
                    onBlur: handleBlur,
                    onKeyDown: handleKeyDown,
                    placeholder: field === 'compliance' ? 'Paste compliance link...' : 'Paste data link...',
                    className: 'w-full px-1.5 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500',
                    autoFocus: true
                }));
            }
        }
        
        // Display mode - click to edit
        const displayContent = currentValue ? (
            field === 'comments' ? (
                React.createElement('div', {
                    className: 'text-[10px] text-gray-600 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded',
                    onClick: handleStartEdit,
                    title: 'Click to edit'
                }, String(currentValue))
            ) : (
                React.createElement('div', {
                    className: 'flex items-center gap-1'
                },
                    currentValue.startsWith('http') ? React.createElement('a', {
                        href: currentValue,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        onClick: (e) => e.stopPropagation(),
                        className: 'text-primary-600 hover:text-primary-700 text-[10px] underline truncate max-w-[150px]',
                        title: currentValue
                    }, 'Link') : React.createElement('span', {
                        className: 'text-gray-700 text-[10px] truncate max-w-[150px]',
                        title: currentValue
                    }, String(currentValue)),
                    React.createElement('button', {
                        onClick: (e) => {
                            e.stopPropagation();
                            handleStartEdit();
                        },
                        className: 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 ml-1',
                        title: 'Click to edit'
                    }, React.createElement('i', { className: 'fas fa-edit text-[9px]' }))
                )
            )
        ) : (
            React.createElement('div', {
                className: 'text-gray-400 text-[10px] cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded',
                onClick: handleStartEdit,
                title: 'Click to add'
            }, '-')
        );
        
        return React.createElement('td', {
            key: cellKey,
            className: baseClassName + ' group'
        }, displayContent);
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
                    // First row: Month headers
                    React.createElement('tr', null,
                        React.createElement('th', { 
                            rowSpan: 2,
                            className: 'px-2.5 py-1.5 text-left text-[10px] font-semibold sticky left-0 bg-gray-50 z-10 border-r' 
                        }, 'Project'),
                        Array.isArray(months) && months.map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeYear === currentYear;
                            return React.createElement('th', {
                                key: safeMonth + '-header',
                                colSpan: 3,
                                className: 'px-1.5 py-1.5 text-center text-[10px] font-semibold border-l' + (isWorking ? ' bg-primary-50 text-primary-700' : '')
                            }, safeMonth.slice(0, 3) + " '" + String(safeYear).slice(-2));
                        }),
                        React.createElement('th', { 
                            rowSpan: 2,
                            className: 'px-2.5 py-1.5 text-[10px] border-l' 
                        }, 'PM'),
                        React.createElement('th', { 
                            rowSpan: 2,
                            className: 'px-2.5 py-1.5 text-[10px]' 
                        }, 'Type'),
                        React.createElement('th', { 
                            rowSpan: 2,
                            className: 'px-2.5 py-1.5 text-[10px]' 
                        }, 'Status')
                    ),
                    // Second row: Sub-headers (Compliance, Data, Comments) for each month
                    React.createElement('tr', null,
                        Array.isArray(months) && months.map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeYear === currentYear;
                            return React.createElement(React.Fragment, { key: safeMonth + '-subheaders' },
                                React.createElement('th', { 
                                    className: 'px-1.5 py-1 text-left text-[9px] border-l' + (isWorking ? ' bg-primary-50' : '') 
                                }, 'Compliance'),
                                React.createElement('th', { 
                                    className: 'px-1.5 py-1 text-left text-[9px] border-l' + (isWorking ? ' bg-primary-50' : '') 
                                }, 'Data'),
                                React.createElement('th', { 
                                    className: 'px-1.5 py-1 text-left text-[9px] border-l' + (isWorking ? ' bg-primary-50' : '') 
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
