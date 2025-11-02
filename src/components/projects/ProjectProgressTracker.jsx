// Get React hooks from window
const { useState, useEffect, useRef } = React;
const storage = window.storage;

const ProjectProgressTracker = ({ onBack }) => {
    // DEBUG: Log component entry
    console.log('🔍 ProjectProgressTracker: Component function called');
    
    // Safety check for required dependencies
    if (!onBack || typeof onBack !== 'function') {
        console.warn('⚠️ ProjectProgressTracker: onBack prop is missing or invalid');
    }
    
    try {
        // Validate all constants immediately and ensure they're safe
        const currentYear = typeof new Date().getFullYear() === 'number' ? new Date().getFullYear() : 2025;
        const currentMonth = typeof new Date().getMonth() === 'number' ? new Date().getMonth() : 0; // 0-11
    
    // Calculate working months (2 months in arrears from current month)
    // Example: If current month is October, working months are August and September
    const getWorkingMonths = () => {
        const twoMonthsBack = currentMonth - 2 < 0 ? currentMonth - 2 + 12 : currentMonth - 2;
        const oneMonthBack = currentMonth - 1 < 0 ? currentMonth - 1 + 12 : currentMonth - 1;
        return [Number(twoMonthsBack), Number(oneMonthBack)];
    };
    
    const workingMonths = getWorkingMonths();
    // Validate workingMonths is array of numbers
    if (!Array.isArray(workingMonths) || workingMonths.some(m => typeof m !== 'number')) {
        console.error('❌ ProjectProgressTracker: Invalid workingMonths:', workingMonths);
    }
    // Default scroll position: first working month (2 months back from current)
    const scrollToMonth = typeof workingMonths[0] === 'number' ? workingMonths[0] : 0;
    
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedField, setSelectedField] = useState(null); // 'compliance', 'data', or 'comments'
    const [selectedYear, setSelectedYear] = useState(Number(currentYear));
    const [draggedProject, setDraggedProject] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null); // Track which cell's popup is open
    const [quickComment, setQuickComment] = useState(''); // For quick comment input
    const [loadError, setLoadError] = useState(null); // Track loading errors
    
    console.log('🔍 ProjectProgressTracker: Hooks initialized successfully');
    
    const tableRef = useRef(null);
    const monthRefs = useRef({});

    // Ensure months is always a valid array of strings
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ].filter(m => typeof m === 'string');

    // Generate year options (current year ± 5 years) - ensure all are numbers
    const yearOptions = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        if (typeof i === 'number' && !isNaN(i)) {
            yearOptions.push(Number(i));
        }
    }

    // Status options with color progression from red to green
    // Ensure all properties are strings to prevent React error #300
    const statusOptions = [
        { value: String('not-started'), label: String('Not Started'), color: String('bg-red-100 text-red-800'), cellColor: String('bg-red-50'), selectColor: String('bg-red-100 text-red-800 border-red-300') },
        { value: String('data-received'), label: String('Data Received'), color: String('bg-orange-100 text-orange-800'), cellColor: String('bg-orange-50'), selectColor: String('bg-orange-100 text-orange-800 border-orange-300') },
        { value: String('in-progress'), label: String('In Progress'), color: String('bg-yellow-100 text-yellow-800'), cellColor: String('bg-yellow-50'), selectColor: String('bg-yellow-100 text-yellow-800 border-yellow-300') },
        { value: String('ready-checking'), label: String('Ready for Checking'), color: String('bg-lime-100 text-lime-800'), cellColor: String('bg-lime-50'), selectColor: String('bg-lime-100 text-lime-800 border-lime-300') },
        { value: String('checked'), label: String('Checked'), color: String('bg-cyan-100 text-cyan-800'), cellColor: String('bg-cyan-50'), selectColor: String('bg-cyan-100 text-cyan-800 border-cyan-300') },
        { value: String('reports-prepared'), label: String('Reports Prepared'), color: String('bg-blue-100 text-blue-800'), cellColor: String('bg-blue-50'), selectColor: String('bg-blue-100 text-blue-800 border-blue-300') },
        { value: String('done'), label: String('Done'), color: String('bg-green-100 text-green-800'), cellColor: String('bg-green-50'), selectColor: String('bg-green-100 text-green-800 border-green-300') }
    ];
    
    // Validate statusOptions array structure
    if (!Array.isArray(statusOptions)) {
        console.error('❌ ProjectProgressTracker: statusOptions is not an array');
        return React.createElement('div', { className: 'p-4 bg-red-50 border border-red-200 rounded-lg' },
            React.createElement('p', { className: 'text-red-800' }, 'Error: Invalid statusOptions configuration')
        );
    }

    useEffect(() => {
        loadProjects();
    }, []);

    useEffect(() => {
        // Scroll to working months after data loads
        const projectsLength = Array.isArray(projects) ? projects.length : 0;
        const safeYear = typeof selectedYear === 'number' && !isNaN(selectedYear) ? selectedYear : currentYear;
        if (projectsLength > 0 && tableRef.current && safeYear === currentYear) {
            setTimeout(() => {
                scrollToWorkingMonths();
            }, 100);
        }
    }, [projects, selectedYear, currentYear]);

    // Close comment popup on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (hoverCommentCell && !event.target.closest('.comment-popup') && !event.target.closest('[data-comment-cell]')) {
                setHoverCommentCell(null);
                setQuickComment('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [hoverCommentCell]);

    const scrollToWorkingMonths = () => {
        const firstWorkingMonthName = months[workingMonths[0]];
        const firstMonthElement = monthRefs.current[firstWorkingMonthName];
        
        if (firstMonthElement && tableRef.current) {
            const container = tableRef.current;
            const containerWidth = container.clientWidth;
            const elementLeft = firstMonthElement.offsetLeft;
            
            // Calculate the width of project column (sticky left column)
            const projectColumnWidth = 200; // Approximate width of the project info column
            
            // Scroll to show the first working month with enough padding
            // Position it after the sticky project column with some breathing room
            const scrollPosition = elementLeft - projectColumnWidth - 100;
            
            container.scrollTo({
                left: Math.max(0, scrollPosition),
                behavior: 'smooth'
            });
        }
    };

    const loadProjects = async () => {
        try {
            setLoadError(null);
            
            // Try to load from database API first
            const token = window.storage?.getToken?.();
            if (token && window.DatabaseAPI?.getProjects) {
                console.log('🔄 ProjectProgressTracker: Loading projects from database');
                try {
                    const response = await window.DatabaseAPI.getProjects();
                    
                    // Handle different response structures
                    let apiProjects = [];
                    if (response?.data?.projects && Array.isArray(response.data.projects)) {
                        apiProjects = response.data.projects;
                    } else if (response?.projects && Array.isArray(response.projects)) {
                        apiProjects = response.projects;
                    } else if (Array.isArray(response?.data)) {
                        apiProjects = response.data;
                    } else if (Array.isArray(response)) {
                        apiProjects = response;
                    }
                    
                    console.log('✅ ProjectProgressTracker: Loaded', apiProjects.length, 'projects from database');
                    
                    // Parse monthlyProgress if it's stored as JSON string
                    const projectsWithProgress = (apiProjects || []).map(project => {
                        if (!project) return null;
                        
                        let monthlyProgress = project.monthlyProgress || {};
                        
                        // If monthlyProgress is a string, parse it
                        if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                            try {
                                monthlyProgress = JSON.parse(monthlyProgress);
                            } catch (e) {
                                console.warn('Failed to parse monthlyProgress for project', project.id, e);
                                monthlyProgress = {};
                            }
                        }
                        
                        return {
                            ...project,
                            monthlyProgress: monthlyProgress || {}
                        };
                    }).filter(Boolean); // Remove any null entries
                    
                    setProjects(projectsWithProgress);
                    
                    // Also update localStorage for consistency
                    if (window.dataService && typeof window.dataService.setProjects === 'function') {
                        try {
                            await window.dataService.setProjects(projectsWithProgress);
                        } catch (e) {
                            console.warn('Failed to update localStorage:', e);
                        }
                    }
                    return;
                } catch (dbError) {
                    console.error('❌ DatabaseAPI.getProjects failed:', dbError);
                    // Fall through to localStorage fallback
                }
            }
            
            // Fallback to localStorage/dataService
            try {
                const savedProjects = (window.dataService && typeof window.dataService.getProjects === 'function') 
                    ? await window.dataService.getProjects() || [] 
                    : [];
                // Initialize progress tracking structure for each project if not exists
                const projectsWithProgress = (savedProjects || []).map(project => ({
                    ...project,
                    monthlyProgress: project.monthlyProgress || {}
                }));
                setProjects(projectsWithProgress);
                console.log('⚠️ ProjectProgressTracker: Loaded', projectsWithProgress.length, 'projects from localStorage (fallback)');
            } catch (storageError) {
                console.error('❌ Failed to load from localStorage:', storageError);
                setLoadError('Failed to load projects from both database and local storage');
                setProjects([]);
            }
        } catch (error) {
            console.error('❌ Error loading projects:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                response: error.response
            });
            setLoadError(error.message || 'Unknown error occurred while loading projects');
            setProjects([]);
        }
    };

    const handleAddProgress = (project, month, field) => {
        setSelectedProject(project);
        setSelectedMonth(month);
        setSelectedField(field);
        setShowProgressModal(true);
    };

    const handleSaveProgress = async (progressData) => {
        if (!selectedProject || !selectedMonth || !selectedField) {
            console.error('❌ Cannot save progress: missing required data');
            return;
        }

        try {
            const updatedProjects = projects.map(p => {
                if (p && p.id === selectedProject.id) {
                    const safeYear = typeof selectedYear === 'number' && !isNaN(selectedYear) ? selectedYear : currentYear;
                    const monthKey = `${String(selectedMonth || '')}-${safeYear}`;
                    const currentProgress = p.monthlyProgress || {};
                    const monthProgress = currentProgress[monthKey] || {};
                    
                    return {
                        ...p,
                        monthlyProgress: {
                            ...currentProgress,
                            [monthKey]: {
                                ...monthProgress,
                                [selectedField]: progressData
                            }
                        }
                    };
                }
                return p;
            });

            setProjects(updatedProjects);
            
            // Save to database first
            try {
                const updatedProject = updatedProjects.find(p => p && p.id === selectedProject.id);
                if (updatedProject && window.DatabaseAPI?.updateProject) {
                    console.log('💾 ProjectProgressTracker: Saving progress to database');
                    const monthlyProgressToSave = updatedProject.monthlyProgress || {};
                    const updatePayload = {
                        monthlyProgress: typeof monthlyProgressToSave === 'string' 
                            ? monthlyProgressToSave 
                            : JSON.stringify(monthlyProgressToSave)
                    };
                    await window.DatabaseAPI.updateProject(selectedProject.id, updatePayload);
                    console.log('✅ ProjectProgressTracker: Progress saved to database');
                }
            } catch (error) {
                console.error('❌ Error saving progress to database:', error);
                console.error('❌ Error details:', {
                    message: error.message,
                    stack: error.stack,
                    response: error.response
                });
                // Continue anyway - at least save to localStorage
            }
            
            // Also update localStorage for consistency
            if (storage && typeof storage.setProjects === 'function') {
                try {
                    storage.setProjects(updatedProjects);
                } catch (error) {
                    console.warn('Failed to update localStorage:', error);
                }
            } else {
                console.warn('Storage not available or setProjects method not found');
            }
            
            setShowProgressModal(false);
            setSelectedProject(null);
            setSelectedMonth(null);
            setSelectedField(null);
        } catch (error) {
            console.error('❌ Error in handleSaveProgress:', error);
            alert('Failed to save progress. Please try again.');
        }
    };

    const getProgressData = (project, month, field) => {
        try {
            // Validate inputs
            if (!project || !month || !field) return null;
            if (typeof month !== 'string') return null;
            
            const safeYear = typeof selectedYear === 'number' && !isNaN(selectedYear) ? selectedYear : currentYear;
            const monthKey = `${String(month || '')}-${safeYear}`;
            
            // Safely access nested data
            const monthlyProgress = project.monthlyProgress;
            if (!monthlyProgress || typeof monthlyProgress !== 'object') return null;
            
            const monthData = monthlyProgress[monthKey];
            if (!monthData || typeof monthData !== 'object') return null;
            
            const fieldData = monthData[field];
            // Return null if fieldData is an object (shouldn't happen, but be safe)
            if (fieldData && typeof fieldData === 'object' && !Array.isArray(fieldData) && !(fieldData instanceof Date)) {
                console.warn('⚠️ getProgressData: fieldData is an object, returning null', { field, month, fieldData });
                return null;
            }
            
            return fieldData || null;
        } catch (error) {
            console.error('❌ getProgressData error:', error);
            return null;
        }
    };

    const handleDeleteProgress = async (project, month, field) => {
        if (!project || !month || !field) {
            console.error('❌ Cannot delete progress: missing required data');
            return;
        }

        if (!confirm(`Delete this entry for ${month}?`)) return;

        try {
            const updatedProjects = projects.map(p => {
                if (p && p.id === project.id) {
                    const safeYear = typeof selectedYear === 'number' && !isNaN(selectedYear) ? selectedYear : currentYear;
                    const monthKey = `${String(month || '')}-${safeYear}`;
                    const currentProgress = p.monthlyProgress || {};
                    const monthProgress = currentProgress[monthKey] || {};
                    const updatedMonthProgress = { ...monthProgress };
                    delete updatedMonthProgress[field];
                    
                    return {
                        ...p,
                        monthlyProgress: {
                            ...currentProgress,
                            [monthKey]: updatedMonthProgress
                        }
                    };
                }
                return p;
            });

            setProjects(updatedProjects);
            
            // Save to database first
            try {
                const updatedProject = updatedProjects.find(p => p && p.id === project.id);
                if (updatedProject && window.DatabaseAPI?.updateProject) {
                    console.log('💾 ProjectProgressTracker: Saving progress deletion to database');
                    const monthlyProgressToSave = updatedProject.monthlyProgress || {};
                    const updatePayload = {
                        monthlyProgress: typeof monthlyProgressToSave === 'string' 
                            ? monthlyProgressToSave 
                            : JSON.stringify(monthlyProgressToSave)
                    };
                    await window.DatabaseAPI.updateProject(project.id, updatePayload);
                    console.log('✅ ProjectProgressTracker: Progress deletion saved to database');
                }
            } catch (error) {
                console.error('❌ Error saving progress deletion to database:', error);
                console.error('❌ Error details:', {
                    message: error.message,
                    stack: error.stack,
                    response: error.response
                });
            }
            
            // Also update localStorage for consistency
            if (storage && typeof storage.setProjects === 'function') {
                try {
                    storage.setProjects(updatedProjects);
                } catch (error) {
                    console.warn('Failed to update localStorage:', error);
                }
            } else {
                console.warn('Storage not available or setProjects method not found');
            }
        } catch (error) {
            console.error('❌ Error in handleDeleteProgress:', error);
            alert('Failed to delete progress. Please try again.');
        }
    };

    const handleQuickComment = async (project, month) => {
        if (!quickComment.trim()) return;
        if (!project || !month) {
            console.error('❌ Cannot add comment: missing required data');
            return;
        }

        try {
            // Get current user info
            const currentUser = window.storage?.getUserInfo() || { name: 'User', email: 'user', id: 'user', role: 'User' };

            const monthKey = `${month}-${selectedYear}`;
            const currentProgress = project.monthlyProgress || {};
            const monthProgress = currentProgress[monthKey] || {};
            const existingData = monthProgress.comments;
            const existingComments = existingData && Array.isArray(existingData) ? existingData : (existingData ? [existingData] : []);
            
            const updatedComments = [
                ...existingComments,
                {
                    id: Date.now(),
                    text: quickComment,
                    date: new Date().toISOString(),
                    timestamp: new Date().toISOString(),
                    author: currentUser.name,
                    authorEmail: currentUser.email,
                    authorId: currentUser.id,
                    authorRole: currentUser.role
                }
            ];

            const updatedProjects = projects.map(p => {
                if (p && p.id === project.id) {
                    return {
                        ...p,
                        monthlyProgress: {
                            ...currentProgress,
                            [monthKey]: {
                                ...monthProgress,
                                comments: updatedComments
                            }
                        }
                    };
                }
                return p;
            });

            setProjects(updatedProjects);
            
            // Save to database first
            try {
                const updatedProject = updatedProjects.find(p => p && p.id === project.id);
                if (updatedProject && window.DatabaseAPI?.updateProject) {
                    console.log('💾 ProjectProgressTracker: Saving quick comment to database');
                    const monthlyProgressToSave = updatedProject.monthlyProgress || {};
                    const updatePayload = {
                        monthlyProgress: typeof monthlyProgressToSave === 'string' 
                            ? monthlyProgressToSave 
                            : JSON.stringify(monthlyProgressToSave)
                    };
                    await window.DatabaseAPI.updateProject(project.id, updatePayload);
                    console.log('✅ ProjectProgressTracker: Quick comment saved to database');
                }
            } catch (error) {
                console.error('❌ Error saving quick comment to database:', error);
                console.error('❌ Error details:', {
                    message: error.message,
                    stack: error.stack,
                    response: error.response
                });
            }
            
            // Also update localStorage for consistency
            if (storage && typeof storage.setProjects === 'function') {
                try {
                    storage.setProjects(updatedProjects);
                } catch (error) {
                    console.warn('Failed to update localStorage:', error);
                }
            } else {
                console.warn('Storage not available or setProjects method not found');
            }
            
            setQuickComment('');
        } catch (error) {
            console.error('❌ Error in handleQuickComment:', error);
            alert('Failed to add comment. Please try again.');
        }
    };

    const handleMoveProject = async (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;

        const newProjects = [...projects];
        const [movedProject] = newProjects.splice(fromIndex, 1);
        newProjects.splice(toIndex, 0, movedProject);

        setProjects(newProjects);
        
        // Note: Project order is typically not saved to database, only to localStorage
        // If you want to persist order, you'd need to add an "order" field to the Project model
        if (storage && typeof storage.setProjects === 'function') {
            try {
                storage.setProjects(newProjects);
            } catch (error) {
                console.warn('Failed to update localStorage:', error);
            }
        } else {
            console.warn('Storage not available or setProjects method not found');
        }
    };

    const handleDragStart = (e, project, index) => {
        setDraggedProject({ project, index });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget);
        // Add a slight opacity to the dragged row
        setTimeout(() => {
            e.currentTarget.style.opacity = '0.5';
        }, 0);
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedProject(null);
        setDragOverIndex(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnter = (e, index) => {
        e.preventDefault();
        if (draggedProject && draggedProject.index !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = (e) => {
        // Only clear if leaving the row entirely
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverIndex(null);
        }
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedProject && draggedProject.index !== dropIndex) {
            handleMoveProject(draggedProject.index, dropIndex);
        }
        setDragOverIndex(null);
    };

    const handleExportToExcel = async () => {
        setIsExporting(true);
        try {
            // Check if XLSX is already loaded
            let XLSX = window.XLSX;
            
            // If not loaded, dynamically load it
            if (!XLSX) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                XLSX = window.XLSX;
            }
        
        // Prepare data for Excel
        const excelData = [];
        
        // Add header rows
        const headerRow1 = ['Project', 'Client'];
        const headerRow2 = ['', ''];
        
        // Add month headers (3 columns per month: Compliance, Data, Comments)
        const safeYear = typeof selectedYear === 'number' && !isNaN(selectedYear) ? selectedYear : currentYear;
        months.forEach(month => {
            const monthYear = `${String(month || '').slice(0, 3)} '${String(safeYear).slice(-2)}`;
            headerRow1.push(monthYear, '', '');
            headerRow2.push('Compliance', 'Data', 'Comments');
        });
        
        // Add metadata columns
        headerRow1.push('PM', 'Type', 'Status');
        headerRow2.push('', '', '');
        
        excelData.push(headerRow1);
        excelData.push(headerRow2);
        
        // Add project data rows
        projects.forEach(project => {
            const row = [
                project.name,
                project.client
            ];
            
            // Add monthly progress data
            const safeYear = typeof selectedYear === 'number' && !isNaN(selectedYear) ? selectedYear : currentYear;
            months.forEach(month => {
                const monthKey = `${String(month || '')}-${safeYear}`;
                const monthProgress = project.monthlyProgress?.[monthKey] || {};
                
                // Compliance
                const compliance = monthProgress.compliance;
                if (compliance) {
                    const statusLabel = statusOptions.find(s => s.value === compliance.status)?.label || '';
                    const complianceText = `[${statusLabel}] ${compliance.text}${compliance.link ? ' | Link: ' + compliance.link : ''} | ${compliance.date}`;
                    row.push(complianceText);
                } else {
                    row.push('');
                }
                
                // Data
                const data = monthProgress.data;
                if (data) {
                    const statusLabel = statusOptions.find(s => s.value === data.status)?.label || '';
                    const dataText = `[${statusLabel}] ${data.text}${data.link ? ' | Link: ' + data.link : ''} | ${data.date}`;
                    row.push(dataText);
                } else {
                    row.push('');
                }
                
                // Comments
                const comments = monthProgress.comments;
                if (comments) {
                    // Handle comments as array
                    const commentArray = Array.isArray(comments) ? comments : [comments];
                    
                    // Format all comments chronologically
                    const commentsText = commentArray.map((comment, idx) => {
                        const date = new Date(comment.date || comment.timestamp || comment.createdAt).toLocaleString('en-ZA', {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        const authorName = comment.author || comment.createdBy || 'User';
                        const authorEmail = comment.authorEmail || comment.createdByEmail;
                        const authorInfo = authorEmail 
                            ? `${authorName} (${authorEmail})`
                            : authorName;
                        return `[${date}] ${authorInfo}: ${comment.text}`;
                    }).join('\n\n');
                    
                    row.push(commentsText);
                } else {
                    row.push('');
                }
            });
            
            // Add metadata
            row.push(
                project.manager || '',
                project.type || '',
                project.status || ''
            );
            
            excelData.push(row);
        });
        
        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        // Set column widths
        const colWidths = [
            { wch: 25 }, // Project
            { wch: 20 }, // Client
        ];
        
        // Add widths for each month (3 columns per month)
        for (let i = 0; i < 12; i++) {
            colWidths.push(
                { wch: 30 }, // Compliance
                { wch: 30 }, // Data
                { wch: 50 }  // Comments - wider for multiple entries
            );
        }
        
        // Add widths for metadata
        colWidths.push(
            { wch: 15 }, // PM
            { wch: 15 }, // Type
            { wch: 12 }  // Status
        );
        
        ws['!cols'] = colWidths;
        
        // Enable text wrapping for all cells with comments (every 3rd data column starting from column index 4)
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r + 2; R <= range.e.r; ++R) { // Start from data rows (skip 2 header rows)
            for (let i = 0; i < 12; i++) {
                const commentsColIdx = 2 + (i * 3) + 2; // Project(0) + Client(1) + (months*3) + comments column
                const cellRef = XLSX.utils.encode_cell({ r: R, c: commentsColIdx });
                if (ws[cellRef]) {
                    if (!ws[cellRef].s) ws[cellRef].s = {};
                    ws[cellRef].s.alignment = { wrapText: true, vertical: 'top' };
                }
            }
        }
        
        // Merge cells for month headers
        const merges = [];
        for (let i = 0; i < 12; i++) {
            const startCol = 2 + (i * 3);
            merges.push({
                s: { r: 0, c: startCol },
                e: { r: 0, c: startCol + 2 }
            });
        }
        ws['!merges'] = merges;
        
        // Add worksheet to workbook
        const safeYear = typeof selectedYear === 'number' && !isNaN(selectedYear) ? selectedYear : currentYear;
        XLSX.utils.book_append_sheet(wb, ws, `Progress ${safeYear}`);
        
        // Generate filename
        const filename = `Project_Progress_Tracker_${safeYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Write file
        XLSX.writeFile(wb, filename);
        
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('Failed to export to Excel. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const getStatusConfig = (status) => {
        if (!status || typeof status !== 'string') {
            return statusOptions[0];
        }
        return statusOptions.find(opt => opt.value === status) || statusOptions[0];
    };

    const ProgressModal = () => {
        const existingData = getProgressData(selectedProject, selectedMonth, selectedField);
        
        // For comments, handle as array; for others, as single entry
        const isCommentsField = selectedField === 'comments';
        const existingComments = isCommentsField && existingData ? (Array.isArray(existingData) ? existingData : [existingData]) : [];
        
        const [formData, setFormData] = useState({
            text: !isCommentsField && existingData ? existingData.text : '',
            link: !isCommentsField && existingData ? existingData.link : '',
            date: !isCommentsField && existingData ? existingData.date : new Date().toISOString().split('T')[0],
            status: !isCommentsField && existingData ? existingData.status : 'not-started'
        });
        
        // For new comment
        const [newComment, setNewComment] = useState('');

        const handleSubmit = (e) => {
            e.preventDefault();
            
            if (isCommentsField) {
                // For comments, add new comment to array
                if (!newComment.trim()) {
                    alert('Please enter a comment');
                    return;
                }
                
                // Get current user info
                const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system', role: 'System' };
                
                const updatedComments = [
                    ...existingComments,
                    {
                        id: Date.now(),
                        text: newComment,
                        date: new Date().toISOString(),
                        timestamp: new Date().toISOString(),
                        author: currentUser.name,
                        authorEmail: currentUser.email,
                        authorId: currentUser.id,
                        authorRole: currentUser.role
                    }
                ];
                
                // Log to audit trail
                if (window.AuditLogger) {
                    window.AuditLogger.log(
                        'comment',
                        'projects',
                        {
                            action: 'Progress Comment Added',
                            projectId: selectedProject?.id,
                            projectName: selectedProject?.name,
                            field: selectedField,
                            month: selectedMonth,
                            commentPreview: newComment.substring(0, 50) + (newComment.length > 50 ? '...' : '')
                        },
                        currentUser
                    );
                }
                handleSaveProgress(updatedComments);
            } else {
                // For compliance and data reviews
                handleSaveProgress(formData);
            }
        };

        const getFieldTitle = () => {
            switch(selectedField) {
                case 'compliance': return 'Compliance Review';
                case 'data': return 'Data Review';
                case 'comments': return 'Comments';
                default: return '';
            }
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-xl">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">
                                {getFieldTitle()} - {String(selectedMonth || '')} {String(safeSelectedYear || currentYear)}
                            </h2>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                                {String(selectedProject?.name || '')} • {String(selectedProject?.client || '')}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button  
                                onClick={() => setShowProgressModal(false)} 
                                className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                            >
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        {isCommentsField ? (
                            // Comments Section
                            <>
                                {/* Previous Comments */}
                                {existingComments.length > 0 && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Previous Comments
                                        </label>
                                        <div className="max-h-48 overflow-y-auto space-y-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
                                            {existingComments.map((comment, idx) => {
                                                // Ensure all values are strings to prevent React error #300
                                                const commentText = typeof comment.text === 'string' 
                                                    ? comment.text 
                                                    : typeof comment.text === 'object' 
                                                        ? JSON.stringify(comment.text) 
                                                        : String(comment.text || '');
                                                const authorName = String(comment.author || comment.createdBy || 'User');
                                                const authorEmail = comment.authorEmail || comment.createdByEmail;
                                                const authorDisplay = authorEmail ? `${authorName} (${String(authorEmail)})` : authorName;
                                                
                                                return (
                                                    <div key={idx} className="bg-white rounded p-2 border border-gray-100">
                                                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{commentText}</p>
                                                        <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                            <span className="font-medium">{authorDisplay}</span>
                                                            <span>{new Date(comment.date || comment.timestamp || comment.createdAt).toLocaleString('en-ZA', { 
                                                                year: 'numeric',
                                                                month: 'short', 
                                                                day: '2-digit',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* New Comment */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Add New Comment
                                    </label>
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows="3"
                                        placeholder="Enter your comment..."
                                        required
                                    ></textarea>
                                </div>
                            </>
                        ) : (
                            // Compliance and Data Review Sections
                            <>
                                {/* Status Selection */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Status
                                    </label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-medium ${
                                            getStatusConfig(formData.status)?.selectColor || 'bg-white border-gray-300'
                                        }`}
                                    >
                                        {statusOptions.map(option => (
                                            <option 
                                                key={option.value} 
                                                value={option.value}
                                                className="font-medium py-1"
                                            >
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-gray-500 mt-1">Progression: Red → Orange → Yellow → Lime → Cyan → Blue → Green</p>
                                </div>

                                {/* Link field for reviews */}
                                {(selectedField === 'compliance' || selectedField === 'data') && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Document Link (Optional)
                                        </label>
                                        <input
                                            type="url"
                                            value={formData.link}
                                            onChange={(e) => setFormData({...formData, link: e.target.value})}
                                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            placeholder="https://drive.google.com/..."
                                        />
                                    </div>
                                )}

                                {/* Notes/Description */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Notes/Description (Optional)
                                    </label>
                                    <textarea
                                        value={formData.text}
                                        onChange={(e) => setFormData({...formData, text: e.target.value})}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows="3"
                                        placeholder="Enter review notes, findings, or comments..."
                                    ></textarea>
                                </div>

                                {/* Date */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Date
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    />
                                </div>
                            </>
                        )}

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowProgressModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                            >
                                {isCommentsField ? 'Add Comment' : 'Save Entry'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    const renderProgressCell = (project, month, field) => {
        if (!project || !month || !field) {
            console.warn('❌ renderProgressCell: missing required parameters');
            return <td className="px-2 py-1 text-xs border-l border-gray-100"></td>;
        }

        // Ensure project and month are valid
        if (!project || typeof month !== 'string') {
            console.warn('❌ renderProgressCell: invalid project or month', { project, month, field });
            return <td className="px-2 py-1 text-xs border-l border-gray-100"></td>;
        }
        
        const data = getProgressData(project, month, field);
        
        // Handle comments as array
        if (field === 'comments') {
            // Ensure data is properly formatted
            let comments = [];
            if (data) {
                if (Array.isArray(data)) {
                    comments = data;
                } else if (typeof data === 'object') {
                    // If it's an object, try to extract comments from it
                    comments = data.comments ? (Array.isArray(data.comments) ? data.comments : [data.comments]) : [data];
                } else {
                    comments = [data];
                }
            }
            const cellKey = `${project.id}-${month}`;
            const isPopupOpen = hoverCommentCell === cellKey;
            
            // Ensure workingMonths is an array and month index is valid
            const monthIndex = Array.isArray(months) ? months.indexOf(month) : -1;
            const isWorkingMonth = Array.isArray(workingMonths) && monthIndex >= 0 && workingMonths.includes(monthIndex) && safeSelectedYear === currentYear;
            
            return (
                <td 
                className={`px-2 py-1 text-xs border-l border-gray-100 ${
                isWorkingMonth
                ? 'bg-primary-50 bg-opacity-30'
                : ''
                }`}
                >
                    <div className="min-w-[140px] max-w-[200px] relative">
                        {comments.length > 0 ? (
                            <div 
                                className="space-y-1"
                                data-comment-cell
                                onMouseEnter={() => setHoverCommentCell(cellKey)}
                                onMouseLeave={(e) => {
                                    // Don't close if hovering over the popup
                                    if (!e.relatedTarget?.closest('.comment-popup')) {
                                        setHoverCommentCell(null);
                                        setQuickComment('');
                                    }
                                }}
                            >
                                {/* Comment count badge - clickable */}
                                <div>
                                    <button
                                        onClick={() => handleAddProgress(project, month, field)}
                                        className="px-1.5 py-0.5 text-[10px] rounded font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                    >
                                        {comments.length} comment{comments.length !== 1 ? 's' : ''}
                                    </button>
                                </div>
                                
                                {/* Hover Popup */}
                                {isPopupOpen && (
                                    <div 
                                        className="comment-popup absolute left-0 top-full mt-1 w-72 bg-white border border-gray-300 rounded-lg shadow-xl p-3 z-50"
                                        onMouseLeave={() => {
                                            setHoverCommentCell(null);
                                            setQuickComment('');
                                        }}
                                    >
                                        {/* Previous Comments */}
                                        <div className="mb-3">
                                            <div className="text-[10px] font-semibold text-gray-600 mb-1.5">Previous Comments</div>
                                            <div className="max-h-32 overflow-y-auto space-y-2 mb-2">
                                                {Array.isArray(comments) && comments.map((comment, idx) => {
                                                    // Validate comment is an object
                                                    if (!comment || typeof comment !== 'object') {
                                                        console.warn('❌ Invalid comment:', comment);
                                                        return null;
                                                    }
                                                    
                                                    // Ensure all values are strings to prevent React error #300
                                                    const commentText = typeof comment.text === 'string' 
                                                        ? comment.text 
                                                        : typeof comment.text === 'object' 
                                                            ? JSON.stringify(comment.text) 
                                                            : String(comment.text || '');
                                                    const authorName = String(comment.author || comment.createdBy || 'User');
                                                    const authorEmail = comment.authorEmail || comment.createdByEmail || '';
                                                    const authorDisplay = authorEmail ? `${authorName} (${String(authorEmail)})` : authorName;
                                                    
                                                    // Ensure date is valid
                                                    let dateObj;
                                                    try {
                                                        const dateValue = comment.date || comment.timestamp || comment.createdAt || Date.now();
                                                        dateObj = dateValue instanceof Date ? dateValue : new Date(dateValue);
                                                        if (isNaN(dateObj.getTime())) {
                                                            dateObj = new Date();
                                                        }
                                                    } catch (e) {
                                                        dateObj = new Date();
                                                    }
                                                    
                                                    const formattedDate = dateObj.toLocaleString('en-ZA', { 
                                                        month: 'short', 
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        year: 'numeric'
                                                    });
                                                    
                                                    // Use a safe key
                                                    const safeKey = typeof comment.id === 'string' || typeof comment.id === 'number' 
                                                        ? String(comment.id) 
                                                        : `comment-${idx}`;
                                                    
                                                    return (
                                                        <div key={safeKey} className="pb-2 border-b last:border-b-0 bg-gray-50 rounded p-1.5">
                                                            <p className="text-xs text-gray-700 whitespace-pre-wrap">{commentText}</p>
                                                            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                                <span className="font-medium">{authorDisplay}</span>
                                                                <span>{formattedDate}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }).filter(Boolean)}
                                            </div>
                                        </div>
                                        
                                        {/* Quick Comment Input */}
                                        <div>
                                            <div className="text-[10px] font-semibold text-gray-600 mb-1">Add Comment</div>
                                            <textarea
                                                value={quickComment}
                                                onChange={(e) => setQuickComment(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && e.ctrlKey) {
                                                        handleQuickComment(project, month);
                                                    }
                                                }}
                                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                rows="2"
                                                placeholder="Type comment... (Ctrl+Enter to submit)"
                                            />
                                            <button
                                                onClick={() => handleQuickComment(project, month)}
                                                disabled={!quickComment.trim()}
                                                className="mt-1.5 w-full px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Add Comment
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => handleAddProgress(project, month, field)}
                                className="text-gray-400 hover:text-primary-600 text-[10px] w-full text-left py-0.5 transition-colors"
                            >
                                <i className="fas fa-plus mr-1 text-[9px]"></i>
                                Add
                            </button>
                        )}
                    </div>
                </td>
            );
        }
        
        // Handle compliance and data as before
        // Ensure data.status is a string before passing to getStatusConfig
        const dataStatus = data && data.status && typeof data.status === 'string' ? data.status : (data && typeof data.status !== 'object' ? String(data.status || '') : '');
        const statusConfig = data && dataStatus ? getStatusConfig(dataStatus) : null;

        // Ensure workingMonths is an array and month index is valid
        const monthIndex = Array.isArray(months) ? months.indexOf(month) : -1;
        const isWorkingMonth = Array.isArray(workingMonths) && monthIndex >= 0 && workingMonths.includes(monthIndex) && selectedYear === currentYear;
        
        return (
            <td 
            className={`px-2 py-1 text-xs border-l border-gray-100 ${
            isWorkingMonth
            ? 'bg-primary-50 bg-opacity-30'
            : ''
            } ${statusConfig ? String(statusConfig.cellColor || '') : ''}`}
            >
                <div className="min-w-[140px] max-w-[200px]">
                    {data ? (
                        <div className="space-y-1">
                            {/* Status Badge and Link in same row */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleAddProgress(project, month, field)}
                                    className={`px-1.5 py-0.5 text-[10px] rounded font-medium transition-opacity hover:opacity-80 flex-shrink-0 ${statusConfig ? statusConfig.color : ''}`}
                                >
                                    {statusConfig && statusConfig.label ? String(statusConfig.label) : 'Unknown'}
                                </button>
                                
                                {/* Link if exists */}
                                {data.link && typeof data.link === 'string' && (
                                    <a
                                        href={String(data.link)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary-600 hover:text-primary-700 text-[10px] flex-shrink-0"
                                        title={String(data.link)}
                                    >
                                        <i className="fas fa-link mr-1"></i>
                                        View
                                    </a>
                                )}
                            </div>
                            
                            {/* Text */}
                            {data.text && (
                                <div className="text-gray-700 whitespace-pre-wrap break-words text-[10px] leading-tight">
                                    {typeof data.text === 'string' ? data.text : typeof data.text === 'object' ? JSON.stringify(data.text) : String(data.text || '')}
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => handleAddProgress(project, month, field)}
                            className="text-gray-400 hover:text-primary-600 text-[10px] w-full text-left py-0.5 transition-colors"
                        >
                            <i className="fas fa-plus mr-1 text-[9px]"></i>
                            Add
                        </button>
                    )}
                </div>
            </td>
        );
    };

    // Ensure projects array is safe before rendering
    const safeProjects = Array.isArray(projects) 
        ? projects.filter(p => {
            if (!p || typeof p !== 'object') return false;
            if (!p.id || typeof p.id !== 'string') return false;
            // Ensure all properties that will be rendered are not objects
            if (p.name && typeof p.name === 'object') return false;
            if (p.client && typeof p.client === 'object') return false;
            if (p.manager && typeof p.manager === 'object') return false;
            if (p.type && typeof p.type === 'object') return false;
            if (p.status && typeof p.status === 'object') return false;
            return true;
        })
        : [];
    
    // Validate all constants before render
    if (!Array.isArray(months)) {
        console.error('❌ ProjectProgressTracker: months is not an array:', months);
        return React.createElement('div', { className: 'p-4 bg-red-50 border border-red-200 rounded-lg' },
            React.createElement('p', { className: 'text-red-800' }, 'Error: Invalid months configuration')
        );
    }
    
    // Validate selectedYear is a number
    const safeSelectedYear = typeof selectedYear === 'number' && !isNaN(selectedYear) ? selectedYear : currentYear;
    
    // Log what we're about to render for debugging
    console.log('🔍 ProjectProgressTracker: About to render', {
        projectsCount: Array.isArray(projects) ? projects.length : 'invalid',
        safeProjectsCount: safeProjects.length,
        monthsIsArray: Array.isArray(months),
        monthsLength: Array.isArray(months) ? months.length : 'N/A',
        statusOptionsIsArray: Array.isArray(statusOptions),
        statusOptionsLength: Array.isArray(statusOptions) ? statusOptions.length : 'N/A',
        safeSelectedYear,
        currentYear,
        selectedYear
    });
    
    // Wrap entire render in try-catch to catch any rendering errors
    try {
        // Validate that safeProjects doesn't contain any objects that could be rendered
        const hasInvalidProjects = safeProjects.some(p => {
            if (!p || typeof p !== 'object') return true;
            // Check if any property that will be rendered is an object
            if (p.name && typeof p.name === 'object') return true;
            if (p.client && typeof p.client === 'object') return true;
            if (p.manager && typeof p.manager === 'object') return true;
            if (p.type && typeof p.type === 'object') return true;
            if (p.status && typeof p.status === 'object') return true;
            return false;
        });
        
        if (hasInvalidProjects) {
            console.error('❌ ProjectProgressTracker: Invalid projects detected');
            return React.createElement('div', { className: 'p-4 bg-red-50 border border-red-200 rounded-lg' },
                React.createElement('p', { className: 'text-red-800' }, 'Error: Invalid project data detected')
            );
        }
        
        return (
            <div className="space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onBack} 
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Project Progress Tracker</h1>
                        <p className="text-xs text-gray-500">Track monthly progress in arrears - highlighted working months (2 months back) • Drag rows to reorder</p>
                    </div>
                </div>
                
                {/* Year Selector and Actions */}
                <div className="flex items-center gap-2">
                    <label className="text-[10px] font-medium text-gray-600">Year:</label>
                    <select
                        value={String(safeSelectedYear || currentYear)}
                        onChange={(e) => {
                            const newYear = parseInt(e.target.value);
                            if (!isNaN(newYear)) {
                                setSelectedYear(newYear);
                            }
                        }}
                        className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        {Array.isArray(yearOptions) && yearOptions.map(year => {
                            const safeYear = typeof year === 'number' ? year : parseInt(String(year || currentYear));
                            const isCurrent = safeYear === currentYear;
                            return (
                                <option key={safeYear} value={safeYear}>
                                    {String(safeYear)}{isCurrent ? ' (Current)' : ''}
                                </option>
                            );
                        })}
                    </select>
                    {safeSelectedYear === currentYear && (
                        <button
                            onClick={scrollToWorkingMonths}
                            className="px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors text-[10px] font-medium"
                            title="Scroll to working months"
                        >
                            <i className="fas fa-crosshairs mr-1"></i>
                            Working Months
                        </button>
                    )}
                    <button
                        onClick={handleExportToExcel}
                        disabled={isExporting}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-[10px] font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download as Excel"
                    >
                        {isExporting ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                Exporting...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-file-excel"></i>
                                Export to Excel
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
                <div className="space-y-1.5">
                    {/* Working Months Info */}
                    <div className="flex items-center gap-2 pb-1.5 border-b border-gray-100">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-medium">
                            <i className="fas fa-calendar-check mr-1 text-[10px]"></i>
                            Working Months
                        </span>
                        <span className="text-[10px] text-gray-500">
                            Highlighted columns show current focus months (2 months in arrears)
                        </span>
                    </div>
                    
                    {/* Status Legend with Color Progression */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-medium text-gray-600">Status Progression:</span>
                        {Array.isArray(statusOptions) && statusOptions.map((option, idx) => {
                            // Ensure option is valid object with required properties
                            if (!option || typeof option !== 'object') return null;
                            const safeOption = {
                                value: String(option.value || ''),
                                label: String(option.label || ''),
                                cellColor: String(option.cellColor || '')
                            };
                            return (
                                <div key={safeOption.value} className="flex items-center gap-1">
                                    <div className={`w-3 h-3 rounded ${safeOption.cellColor} border border-gray-400`}></div>
                                    <span className="text-[10px] text-gray-600">{safeOption.label}</span>
                                    {idx < statusOptions.length - 1 && (
                                        <i className="fas fa-arrow-right text-[8px] text-gray-400 ml-1"></i>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {loadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <div className="flex items-start">
                        <i className="fas fa-exclamation-triangle text-red-600 mt-0.5 mr-2"></i>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-red-800 mb-1">Error Loading Projects</h3>
                            <p className="text-xs text-red-700">{String(loadError || 'Unknown error')}</p>
                            <button
                                onClick={loadProjects}
                                className="mt-2 px-2 py-1 bg-red-600 text-white rounded text-[10px] font-medium hover:bg-red-700 transition-colors"
                            >
                                <i className="fas fa-redo mr-1"></i>
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress Tracker Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto" ref={tableRef}>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                {/* Project Info Column */}
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                                    Project
                                </th>
                                {/* Month Columns */}
                                {Array.isArray(months) && months.map((month, idx) => {
                                    const safeMonth = String(month || '');
                                    const safeMonthAbbr = safeMonth.slice(0, 3);
                                    const safeYear = String(safeSelectedYear || '').slice(-2);
                                    const isWorkingMonth = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeSelectedYear === currentYear;
                                    return (
                                        <th 
                                            key={safeMonth} 
                                            ref={el => { if (el) monthRefs.current[safeMonth] = el; }}
                                            colSpan="3"
                                            className={`px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide border-l border-gray-200 ${
                                                isWorkingMonth
                                                    ? 'bg-primary-50 text-primary-700'
                                                    : 'text-gray-600'
                                            }`}
                                        >
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span>{safeMonthAbbr} '{safeYear}</span>
                                                {isWorkingMonth && (
                                                    <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-primary-100 text-primary-700">
                                                        <i className="fas fa-calendar-check mr-0.5"></i>
                                                        Working
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                                {/* Metadata Columns */}
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide border-l border-gray-200">
                                    PM
                                </th>
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">
                                    Type
                                </th>
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide">
                                    Status
                                </th>
                            </tr>
                            <tr className="bg-gray-50 border-t border-gray-200">
                                <th className="px-2.5 py-1 sticky left-0 bg-gray-50 z-10 border-r border-gray-200"></th>
                                {Array.isArray(months) && months.map((month, idx) => {
                                    const safeMonth = String(month || '');
                                    const isWorkingMonth = Array.isArray(workingMonths) && workingMonths.includes(idx) && safeSelectedYear === currentYear;
                                    return (
                                        <React.Fragment key={`${safeMonth}-headers`}>
                                            <th className={`px-1.5 py-1 text-left text-[9px] font-medium text-gray-500 border-l border-gray-100 ${
                                                isWorkingMonth
                                                    ? 'bg-primary-50'
                                                    : 'bg-gray-50'
                                            }`}>
                                                Compliance
                                            </th>
                                            <th className={`px-1.5 py-1 text-left text-[9px] font-medium text-gray-500 border-l border-gray-100 ${
                                                isWorkingMonth
                                                    ? 'bg-primary-50'
                                                    : 'bg-gray-50'
                                            }`}>
                                                Data
                                            </th>
                                            <th className={`px-1.5 py-1 text-left text-[9px] font-medium text-gray-500 border-l border-gray-100 ${
                                                isWorkingMonth
                                                    ? 'bg-primary-50'
                                                    : 'bg-gray-50'
                                            }`}>
                                                Comments
                                            </th>
                                        </React.Fragment>
                                    );
                                })}
                                <th className="px-2.5 py-1 border-l border-gray-200"></th>
                                <th className="px-2.5 py-1"></th>
                                <th className="px-2.5 py-1"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {safeProjects.length === 0 ? (
                                <tr>
                                    <td colSpan={39} className="px-6 py-6 text-center text-gray-400">
                                        <i className="fas fa-folder-open text-2xl mb-1.5 opacity-50"></i>
                                        <p className="text-xs">No projects found</p>
                                        <p className="text-[10px] mt-0.5">Create projects first to track their progress</p>
                                    </td>
                                </tr>
                            ) : (
                                safeProjects.map((project, index) => {
                                        // Double-check and sanitize project data before rendering
                                        // Only include safe properties - explicitly exclude monthlyProgress to prevent React error
                                        const safeProject = {
                                            id: String(project.id || ''),
                                            name: project.name && typeof project.name !== 'object' ? String(project.name || '') : '',
                                            client: project.client && typeof project.client !== 'object' ? String(project.client || '') : '',
                                            manager: project.manager && typeof project.manager !== 'object' ? String(project.manager || '-') : '-',
                                            type: project.type && typeof project.type !== 'object' ? String(project.type || '-') : '-',
                                            status: project.status && typeof project.status !== 'object' ? String(project.status || 'Unknown') : 'Unknown',
                                            // Include monthlyProgress but only pass it to functions that need it, never render it directly
                                            monthlyProgress: project.monthlyProgress || {}
                                        };
                                        
                                        return (
                                            <tr 
                                                key={safeProject.id} 
                                                draggable="true"
                                                onDragStart={(e) => handleDragStart(e, safeProject, index)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={handleDragOver}
                                                onDragEnter={(e) => handleDragEnter(e, index)}
                                                onDragLeave={handleDragLeave}
                                                onDrop={(e) => handleDrop(e, index)}
                                                className={`transition-colors cursor-grab active:cursor-grabbing ${
                                                    dragOverIndex === index 
                                                        ? 'border-t-2 border-primary-500 bg-primary-50' 
                                                        : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                {/* Project Info */}
                                                <td className={`px-2.5 py-1.5 sticky left-0 z-10 border-r border-gray-200 transition-colors ${
                                                    dragOverIndex === index ? 'bg-primary-50' : 'bg-white'
                                                }`}>
                                                    <div className="min-w-[180px] flex items-center gap-1.5">
                                                        <div className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing" title="Drag to reorder">
                                                            <i className="fas fa-grip-vertical text-xs"></i>
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="font-medium text-gray-900 text-xs">{safeProject.name}</div>
                                                            <div className="text-[10px] text-gray-500">{safeProject.client}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Monthly Progress Cells */}
                                                {Array.isArray(months) && months.map(month => {
                                                    // Ensure month is a string
                                                    const safeMonth = String(month || '');
                                                    return (
                                                        <React.Fragment key={`${safeProject.id}-${safeMonth}`}>
                                                            {renderProgressCell(safeProject, safeMonth, 'compliance')}
                                                            {renderProgressCell(safeProject, safeMonth, 'data')}
                                                            {renderProgressCell(safeProject, safeMonth, 'comments')}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                {/* Metadata Cells */}
                                                <td className="px-2.5 py-1.5 text-[10px] text-gray-600 border-l border-gray-200">
                                                    {safeProject.manager}
                                                </td>
                                                <td className="px-2.5 py-1.5 text-[10px] text-gray-600">
                                                    {safeProject.type}
                                                </td>
                                                <td className="px-2.5 py-1.5 text-[10px]">
                                                    <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium ${
                                                        safeProject.status === 'active' || safeProject.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                        safeProject.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                                        safeProject.status === 'on-hold' || safeProject.status === 'On Hold' ? 'bg-yellow-100 text-yellow-700' :
                                                        safeProject.status === 'completed' || safeProject.status === 'Completed' ? 'bg-purple-100 text-purple-700' :
                                                        safeProject.status === 'cancelled' || safeProject.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {safeProject.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

                {/* Modal */}
                {showProgressModal && <ProgressModal />}
            </div>
        );
    } catch (renderError) {
        console.error('❌ Fatal error in ProjectProgressTracker render:', renderError);
        console.error('❌ Error details:', {
            message: renderError.message,
            stack: renderError.stack,
            name: renderError.name
        });
        
        // Return a safe fallback UI
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <button 
                        onClick={onBack} 
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
                            <p className="text-xs text-red-700 mb-2">
                                An error occurred while rendering the Progress Tracker: {String(renderError.message || 'Unknown error')}
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
    } catch (outerError) {
        // Catch any errors in hooks, state initialization, or constant definitions
        console.error('❌ ProjectProgressTracker: Component initialization error:', outerError);
        console.error('❌ Error details:', {
            message: outerError?.message,
            stack: outerError?.stack,
            name: outerError?.name
        });
        return React.createElement('div', { className: 'p-4 bg-red-50 border border-red-200 rounded-lg' },
            React.createElement('p', { className: 'text-red-800' }, 'Error initializing progress tracker. Please refresh the page.'),
            React.createElement('p', { className: 'text-red-600 text-xs mt-1' }, String(outerError?.message || outerError || 'Unknown error'))
        );
    }
};

// Make available globally with error handling
try {
    window.ProjectProgressTracker = ProjectProgressTracker;
    console.log('✅ ProjectProgressTracker registered successfully');
} catch (error) {
    console.error('❌ Failed to register ProjectProgressTracker:', error);
    // Create a fallback component
    window.ProjectProgressTracker = () => {
        return React.createElement('div', { className: 'p-4 bg-red-50 border border-red-200 rounded-lg' },
            React.createElement('h3', { className: 'text-red-800 font-semibold mb-2' }, 'Error: Component registration failed'),
            React.createElement('p', { className: 'text-red-700 text-sm' }, 'Please refresh the page.')
        );
    };
}
