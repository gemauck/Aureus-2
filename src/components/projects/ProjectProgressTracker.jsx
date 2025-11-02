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
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // State
    const [projects, setProjects] = useState([]);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [loadError, setLoadError] = useState(null);
    
    // Refs
    const tableRef = useRef(null);
    
    // Load projects
    useEffect(() => {
        const load = async () => {
            try {
                if (window.DatabaseAPI && window.DatabaseAPI.getProjects) {
                    const response = await window.DatabaseAPI.getProjects();
                    let projs = [];
                    if (response?.data?.projects && Array.isArray(response.data.projects)) {
                        projs = response.data.projects;
                    } else if (Array.isArray(response?.data)) {
                        projs = response.data;
                    } else if (Array.isArray(response)) {
                        projs = response;
                    }
                    setProjects(Array.isArray(projs) ? projs : []);
                }
            } catch (err) {
                console.error('Load error:', err);
                setLoadError(String(err?.message || 'Failed to load'));
            }
        };
        load();
    }, []);
    
    // Validate projects before render
    const safeProjects = Array.isArray(projects) ? projects.filter(p => {
        return p && typeof p === 'object' && typeof p.id === 'string' && 
               typeof p.name === 'string' && typeof p.client === 'string';
    }).map(p => ({
        id: String(p.id || ''),
        name: String(p.name || ''),
        client: String(p.client || ''),
        manager: String(p.manager || '-'),
        type: String(p.type || '-'),
        status: String(p.status || 'Unknown'),
        monthlyProgress: p.monthlyProgress && typeof p.monthlyProgress === 'object' ? p.monthlyProgress : {}
    })) : [];
    
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
    
    // Get progress data safely
    const getProgressData = (project, month, field) => {
        if (!project || !month || !field) return null;
        const safeYear = Number(selectedYear) || currentYear;
        const key = String(month || '') + '-' + String(safeYear);
        const progress = project.monthlyProgress;
        if (!progress || typeof progress !== 'object') return null;
        const monthData = progress[key];
        if (!monthData || typeof monthData !== 'object') return null;
        const fieldData = monthData[field];
        if (fieldData && typeof fieldData === 'object' && !Array.isArray(fieldData) && !(fieldData instanceof Date)) {
            return null;
        }
        return fieldData || null;
    };
    
    // Render progress cell
    const renderProgressCell = (project, month, field) => {
        const data = getProgressData(project, month, field);
        const safeMonth = String(month || '');
        const monthIdx = months.indexOf(safeMonth);
        const isWorking = Array.isArray(workingMonths) && workingMonths.includes(monthIdx) && selectedYear === currentYear;
        
        if (field === 'comments') {
            const comments = Array.isArray(data) ? data : (data ? [data] : []);
            return React.createElement('td', {
                key: project.id + '-' + safeMonth + '-' + field,
                className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '')
            }, React.createElement('div', {
                className: 'flex flex-col gap-0.5'
            }, comments.length > 0 ? React.createElement('span', {
                className: 'text-[10px] text-gray-600'
            }, String(comments.length) + ' comment' + (comments.length !== 1 ? 's' : '')) : React.createElement('span', {
                className: 'text-gray-400 text-[10px]'
            }, '-')));
        }
        
        if (!data) {
            return React.createElement('td', {
                key: project.id + '-' + safeMonth + '-' + field,
                className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '')
            }, React.createElement('span', { className: 'text-gray-400 text-[10px]' }, '-'));
        }
        
        const status = data.status && typeof data.status === 'string' ? data.status : String(data.status || '');
        const config = getStatusConfig(status);
        const text = data.text && typeof data.text === 'string' ? data.text : String(data.text || '');
        const link = data.link && typeof data.link === 'string' ? data.link : '';
        const date = data.date ? String(data.date) : '';
        
        return React.createElement('td', {
            key: project.id + '-' + safeMonth + '-' + field,
            className: 'px-2 py-1 text-xs border-l border-gray-100' + (isWorking ? ' bg-primary-50 bg-opacity-30' : '') + ' ' + String(config.cellColor || '')
        }, React.createElement('div', { className: 'flex flex-col gap-0.5' },
            React.createElement('span', { className: String(config.color || '') + ' px-1.5 py-0.5 rounded text-[9px] font-medium' }, String(config.label || '')),
            text ? React.createElement('span', { className: 'text-gray-700 text-[10px]' }, String(text)) : null,
            link ? React.createElement('a', {
                href: String(link),
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'text-primary-600 hover:text-primary-700 text-[10px]'
            }, 'View') : null,
            date ? React.createElement('span', { className: 'text-gray-500 text-[9px]' }, String(date)) : null
        ));
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
                        React.createElement('td', { colSpan: months.length * 3 + 4, className: 'px-4 py-8 text-center text-gray-500' }, 'No projects found')
                    ) : safeProjects.map(project =>
                        React.createElement('tr', { key: String(project.id), className: 'border-b border-gray-100 hover:bg-gray-50' },
                            React.createElement('td', { className: 'px-2.5 py-1.5 text-[10px] sticky left-0 bg-white z-10 border-r' },
                                React.createElement('div', { className: 'flex flex-col' },
                                    React.createElement('span', { className: 'font-medium text-gray-900' }, String(project.name)),
                                    React.createElement('span', { className: 'text-gray-500 text-[9px]' }, String(project.client))
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
                            React.createElement('td', { className: 'px-2.5 py-1.5 text-[10px] text-gray-600 border-l' }, String(project.manager)),
                            React.createElement('td', { className: 'px-2.5 py-1.5 text-[10px] text-gray-600' }, String(project.type)),
                            React.createElement('td', { className: 'px-2.5 py-1.5 text-[10px]' },
                                React.createElement('span', {
                                    className: 'px-1.5 py-0.5 text-[9px] rounded font-medium bg-gray-100 text-gray-700'
                                }, String(project.status))
                            )
                        )
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
