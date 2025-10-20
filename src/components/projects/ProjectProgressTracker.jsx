// Get React hooks from window
const { useState, useEffect, useRef } = React;
const storage = window.storage;

const ProjectProgressTracker = ({ onBack }) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    
    // Calculate working months (2 months in arrears from current month)
    // Example: If current month is October, working months are August and September
    const getWorkingMonths = () => {
        const twoMonthsBack = currentMonth - 2 < 0 ? currentMonth - 2 + 12 : currentMonth - 2;
        const oneMonthBack = currentMonth - 1 < 0 ? currentMonth - 1 + 12 : currentMonth - 1;
        return [twoMonthsBack, oneMonthBack];
    };
    
    const workingMonths = getWorkingMonths();
    // Default scroll position: first working month (2 months back from current)
    const scrollToMonth = workingMonths[0];
    
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedField, setSelectedField] = useState(null); // 'compliance', 'data', or 'comments'
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [draggedProject, setDraggedProject] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null); // Track which cell's popup is open
    const [quickComment, setQuickComment] = useState(''); // For quick comment input
    
    const tableRef = useRef(null);
    const monthRefs = useRef({});

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Generate year options (current year ± 5 years)
    const yearOptions = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        yearOptions.push(i);
    }

    // Status options with color progression from red to green
    const statusOptions = [
        { value: 'not-started', label: 'Not Started', color: 'bg-red-100 text-red-800', cellColor: 'bg-red-50', selectColor: 'bg-red-100 text-red-800 border-red-300' },
        { value: 'data-received', label: 'Data Received', color: 'bg-orange-100 text-orange-800', cellColor: 'bg-orange-50', selectColor: 'bg-orange-100 text-orange-800 border-orange-300' },
        { value: 'in-progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800', cellColor: 'bg-yellow-50', selectColor: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
        { value: 'ready-checking', label: 'Ready for Checking', color: 'bg-lime-100 text-lime-800', cellColor: 'bg-lime-50', selectColor: 'bg-lime-100 text-lime-800 border-lime-300' },
        { value: 'checked', label: 'Checked', color: 'bg-cyan-100 text-cyan-800', cellColor: 'bg-cyan-50', selectColor: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
        { value: 'reports-prepared', label: 'Reports Prepared', color: 'bg-blue-100 text-blue-800', cellColor: 'bg-blue-50', selectColor: 'bg-blue-100 text-blue-800 border-blue-300' },
        { value: 'done', label: 'Done', color: 'bg-green-100 text-green-800', cellColor: 'bg-green-50', selectColor: 'bg-green-100 text-green-800 border-green-300' }
    ];

    useEffect(() => {
        loadProjects();
    }, []);

    useEffect(() => {
        // Scroll to working months after data loads
        if (projects.length > 0 && tableRef.current && selectedYear === currentYear) {
            setTimeout(() => {
                scrollToWorkingMonths();
            }, 100);
        }
    }, [projects, selectedYear]);

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
            const savedProjects = (window.dataService && typeof window.dataService.getProjects === 'function') 
                ? await window.dataService.getProjects() || [] 
                : [];
            // Initialize progress tracking structure for each project if not exists
            const projectsWithProgress = savedProjects.map(project => ({
                ...project,
                monthlyProgress: project.monthlyProgress || {}
            }));
            setProjects(projectsWithProgress);
        } catch (error) {
            console.error('Error loading projects:', error);
            setProjects([]);
        }
    };

    const handleAddProgress = (project, month, field) => {
        setSelectedProject(project);
        setSelectedMonth(month);
        setSelectedField(field);
        setShowProgressModal(true);
    };

    const handleSaveProgress = (progressData) => {
        const updatedProjects = projects.map(p => {
            if (p.id === selectedProject.id) {
                const monthKey = `${selectedMonth}-${selectedYear}`;
                return {
                    ...p,
                    monthlyProgress: {
                        ...p.monthlyProgress,
                        [monthKey]: {
                            ...p.monthlyProgress[monthKey],
                            [selectedField]: progressData
                        }
                    }
                };
            }
            return p;
        });

        setProjects(updatedProjects);
        if (storage && typeof storage.setProjects === 'function') {
            storage.setProjects(updatedProjects);
        } else {
            console.warn('Storage not available or setProjects method not found');
        }
        setShowProgressModal(false);
        setSelectedProject(null);
        setSelectedMonth(null);
        setSelectedField(null);
    };

    const getProgressData = (project, month, field) => {
        const monthKey = `${month}-${selectedYear}`;
        return project.monthlyProgress?.[monthKey]?.[field] || null;
    };

    const handleDeleteProgress = (project, month, field) => {
        if (!confirm(`Delete this entry for ${month}?`)) return;

        const updatedProjects = projects.map(p => {
            if (p.id === project.id) {
                const monthKey = `${month}-${selectedYear}`;
                const updatedMonthProgress = { ...p.monthlyProgress[monthKey] };
                delete updatedMonthProgress[field];
                
                return {
                    ...p,
                    monthlyProgress: {
                        ...p.monthlyProgress,
                        [monthKey]: updatedMonthProgress
                    }
                };
            }
            return p;
        });

        setProjects(updatedProjects);
        if (storage && typeof storage.setProjects === 'function') {
            storage.setProjects(updatedProjects);
        } else {
            console.warn('Storage not available or setProjects method not found');
        }
    };

    const handleQuickComment = (project, month) => {
        if (!quickComment.trim()) return;

        const monthKey = `${month}-${selectedYear}`;
        const existingData = project.monthlyProgress?.[monthKey]?.comments;
        const existingComments = existingData && Array.isArray(existingData) ? existingData : (existingData ? [existingData] : []);
        
        const updatedComments = [
            ...existingComments,
            {
                text: quickComment,
                date: new Date().toISOString(),
                author: 'User'
            }
        ];

        const updatedProjects = projects.map(p => {
            if (p.id === project.id) {
                return {
                    ...p,
                    monthlyProgress: {
                        ...p.monthlyProgress,
                        [monthKey]: {
                            ...p.monthlyProgress[monthKey],
                            comments: updatedComments
                        }
                    }
                };
            }
            return p;
        });

        setProjects(updatedProjects);
        if (storage && typeof storage.setProjects === 'function') {
            storage.setProjects(updatedProjects);
        } else {
            console.warn('Storage not available or setProjects method not found');
        }
        setQuickComment('');
    };

    const handleMoveProject = (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;

        const newProjects = [...projects];
        const [movedProject] = newProjects.splice(fromIndex, 1);
        newProjects.splice(toIndex, 0, movedProject);

        setProjects(newProjects);
        if (storage && typeof storage.setProjects === 'function') {
            storage.setProjects(newProjects);
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
        months.forEach(month => {
            const monthYear = `${month.slice(0, 3)} '${String(selectedYear).slice(-2)}`;
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
            months.forEach(month => {
                const monthKey = `${month}-${selectedYear}`;
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
                        const date = new Date(comment.date).toLocaleString('en-ZA', {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        return `[${date}] ${comment.author || 'User'}: ${comment.text}`;
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
        XLSX.utils.book_append_sheet(wb, ws, `Progress ${selectedYear}`);
        
        // Generate filename
        const filename = `Project_Progress_Tracker_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
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
                
                const updatedComments = [
                    ...existingComments,
                    {
                        text: newComment,
                        date: new Date().toISOString(),
                        author: 'User' // You can get this from logged-in user
                    }
                ];
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
                                {getFieldTitle()} - {selectedMonth} {selectedYear}
                            </h2>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                                {selectedProject?.name} • {selectedProject?.client}
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
                                            {existingComments.map((comment, idx) => (
                                                <div key={idx} className="bg-white rounded p-2 border border-gray-100">
                                                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{comment.text}</p>
                                                    <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                        <span>{comment.author || 'User'}</span>
                                                        <span>{new Date(comment.date).toLocaleString('en-ZA', { 
                                                            year: 'numeric',
                                                            month: 'short', 
                                                            day: '2-digit',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}</span>
                                                    </div>
                                                </div>
                                            ))}
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
        const data = getProgressData(project, month, field);
        
        // Handle comments as array
        if (field === 'comments') {
            const comments = data && Array.isArray(data) ? data : (data ? [data] : []);
            const cellKey = `${project.id}-${month}`;
            const isPopupOpen = hoverCommentCell === cellKey;
            
            return (
                <td 
                className={`px-2 py-1 text-xs border-l border-gray-100 ${
                workingMonths.includes(months.indexOf(month)) && selectedYear === currentYear
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
                                                {comments.map((comment, idx) => (
                                                    <div key={idx} className="pb-2 border-b last:border-b-0 bg-gray-50 rounded p-1.5">
                                                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{comment.text}</p>
                                                        <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                            <span>{comment.author || 'User'}</span>
                                                            <span>{new Date(comment.date).toLocaleString('en-ZA', { 
                                                                month: 'short', 
                                                                day: '2-digit',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}</span>
                                                        </div>
                                                    </div>
                                                ))}
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
        const statusConfig = data ? getStatusConfig(data.status) : null;

        return (
            <td 
            className={`px-2 py-1 text-xs border-l border-gray-100 ${
            workingMonths.includes(months.indexOf(month)) && selectedYear === currentYear
            ? 'bg-primary-50 bg-opacity-30'
            : ''
            } ${statusConfig ? statusConfig.cellColor : ''}`}
            >
                <div className="min-w-[140px] max-w-[200px]">
                    {data ? (
                        <div className="space-y-1">
                            {/* Status Badge and Link in same row */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleAddProgress(project, month, field)}
                                    className={`px-1.5 py-0.5 text-[10px] rounded font-medium transition-opacity hover:opacity-80 flex-shrink-0 ${statusConfig.color}`}
                                >
                                    {statusConfig.label}
                                </button>
                                
                                {/* Link if exists */}
                                {data.link && (
                                    <a
                                        href={data.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary-600 hover:text-primary-700 text-[10px] flex-shrink-0"
                                        title={data.link}
                                    >
                                        <i className="fas fa-link mr-1"></i>
                                        View
                                    </a>
                                )}
                            </div>
                            
                            {/* Text */}
                            {data.text && (
                                <div className="text-gray-700 whitespace-pre-wrap break-words text-[10px] leading-tight">
                                    {data.text}
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
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        {yearOptions.map(year => (
                            <option key={year} value={year}>
                                {year}
                                {year === currentYear && ' (Current)'}
                            </option>
                        ))}
                    </select>
                    {selectedYear === currentYear && (
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
                        {statusOptions.map((option, idx) => (
                            <div key={option.value} className="flex items-center gap-1">
                                <div className={`w-3 h-3 rounded ${option.cellColor} border border-gray-400`}></div>
                                <span className="text-[10px] text-gray-600">{option.label}</span>
                                {idx < statusOptions.length - 1 && (
                                    <i className="fas fa-arrow-right text-[8px] text-gray-400 ml-1"></i>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

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
                                {months.map((month, idx) => (
                                    <th 
                                        key={month} 
                                        ref={el => monthRefs.current[month] = el}
                                        colSpan="3"
                                        className={`px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide border-l border-gray-200 ${
                                            workingMonths.includes(idx) && selectedYear === currentYear
                                                ? 'bg-primary-50 text-primary-700'
                                                : 'text-gray-600'
                                        }`}
                                    >
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span>{month.slice(0, 3)} '{String(selectedYear).slice(-2)}</span>
                                            {workingMonths.includes(idx) && selectedYear === currentYear && (
                                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-primary-100 text-primary-700">
                                                    <i className="fas fa-calendar-check mr-0.5"></i>
                                                    Working
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                ))}
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
                                {months.map((month, idx) => (
                                    <React.Fragment key={`${month}-headers`}>
                                        <th className={`px-1.5 py-1 text-left text-[9px] font-medium text-gray-500 border-l border-gray-100 ${
                                            workingMonths.includes(idx) && selectedYear === currentYear
                                                ? 'bg-primary-50'
                                                : 'bg-gray-50'
                                        }`}>
                                            Compliance
                                        </th>
                                        <th className={`px-1.5 py-1 text-left text-[9px] font-medium text-gray-500 border-l border-gray-100 ${
                                            workingMonths.includes(idx) && selectedYear === currentYear
                                                ? 'bg-primary-50'
                                                : 'bg-gray-50'
                                        }`}>
                                            Data
                                        </th>
                                        <th className={`px-1.5 py-1 text-left text-[9px] font-medium text-gray-500 border-l border-gray-100 ${
                                            workingMonths.includes(idx) && selectedYear === currentYear
                                                ? 'bg-primary-50'
                                                : 'bg-gray-50'
                                        }`}>
                                            Comments
                                        </th>
                                    </React.Fragment>
                                ))}
                                <th className="px-2.5 py-1 border-l border-gray-200"></th>
                                <th className="px-2.5 py-1"></th>
                                <th className="px-2.5 py-1"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {projects.length === 0 ? (
                                <tr>
                                    <td colSpan={39} className="px-6 py-6 text-center text-gray-400">
                                        <i className="fas fa-folder-open text-2xl mb-1.5 opacity-50"></i>
                                        <p className="text-xs">No projects found</p>
                                        <p className="text-[10px] mt-0.5">Create projects first to track their progress</p>
                                    </td>
                                </tr>
                            ) : (
                                projects.map((project, index) => (
                                    <tr 
                                        key={project.id} 
                                        draggable="true"
                                        onDragStart={(e) => handleDragStart(e, project, index)}
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
                                                    <div className="font-medium text-gray-900 text-xs">{project.name}</div>
                                                    <div className="text-[10px] text-gray-500">{project.client}</div>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Monthly Progress Cells */}
                                        {months.map(month => (
                                            <React.Fragment key={`${project.id}-${month}`}>
                                                {renderProgressCell(project, month, 'compliance')}
                                                {renderProgressCell(project, month, 'data')}
                                                {renderProgressCell(project, month, 'comments')}
                                            </React.Fragment>
                                        ))}
                                        {/* Metadata Cells */}
                                        <td className="px-2.5 py-1.5 text-[10px] text-gray-600 border-l border-gray-200">
                                            {project.manager || '-'}
                                        </td>
                                        <td className="px-2.5 py-1.5 text-[10px] text-gray-600">
                                            {project.type || '-'}
                                        </td>
                                        <td className="px-2.5 py-1.5 text-[10px]">
                                            <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium ${
                                                project.status === 'active' || project.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                                project.status === 'on-hold' || project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-700' :
                                                project.status === 'completed' || project.status === 'Completed' ? 'bg-purple-100 text-purple-700' :
                                                project.status === 'cancelled' || project.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
                                                {project.status || 'Unknown'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showProgressModal && <ProgressModal />}
        </div>
    );
};

// Make available globally
window.ProjectProgressTracker = ProjectProgressTracker;
