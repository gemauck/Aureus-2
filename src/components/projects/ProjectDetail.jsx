// Get dependencies from window
const { useState, useEffect, useRef } = React;
const storage = window.storage;
const ListModal = window.ListModal;
const ProjectModal = window.ProjectModal;
const CustomFieldModal = window.CustomFieldModal;
const TaskDetailModal = window.TaskDetailModal;
const KanbanView = window.KanbanView;
const CommentsPopup = window.CommentsPopup;
const DocumentCollectionModal = window.DocumentCollectionModal;

const ProjectDetail = ({ project, onBack, onDelete }) => {
    console.log('ProjectDetail rendering with project:', project);
    
    // Check if required components are loaded
    const requiredComponents = {
        ListModal: window.ListModal,
        ProjectModal: window.ProjectModal,
        CustomFieldModal: window.CustomFieldModal,
        TaskDetailModal: window.TaskDetailModal,
        KanbanView: window.KanbanView,
        CommentsPopup: window.CommentsPopup,
        DocumentCollectionModal: window.DocumentCollectionModal,
        MonthlyDocumentCollectionTracker: window.MonthlyDocumentCollectionTracker
    };
    
    const missingComponents = Object.entries(requiredComponents)
        .filter(([name, component]) => !component)
        .map(([name]) => name);
    
    if (missingComponents.length > 0) {
        console.error('❌ ProjectDetail: Missing required components:', missingComponents);
        console.error('🔍 Available window components:', Object.keys(window).filter(key => 
            key.includes('Modal') || key.includes('View') || key.includes('Tracker') || key.includes('Popup')
        ));
    } else {
        console.log('✅ ProjectDetail: All required components loaded');
    }
    
    // Tab navigation state - always start with overview when opening a project
    const [activeSection, setActiveSection] = useState('overview');
    
    // Persist activeSection to sessionStorage
    useEffect(() => {
        sessionStorage.setItem(`project-${project.id}-activeSection`, activeSection);
        console.log('🟢 Active section changed to:', activeSection);
    }, [activeSection, project.id]);
    
    // Track if document collection process exists
    const [hasDocumentCollectionProcess, setHasDocumentCollectionProcess] = useState(project.hasDocumentCollectionProcess || false);
    
    // Ref to prevent duplicate saves when manually adding document collection process
    const skipNextSaveRef = useRef(false);
    
    // Document process dropdown
    const [showDocumentProcessDropdown, setShowDocumentProcessDropdown] = useState(false);
    
    const [showListModal, setShowListModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
    const [showCustomFieldModal, setShowCustomFieldModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [editingList, setEditingList] = useState(null);
    const [viewingTask, setViewingTask] = useState(null);
    const [viewingTaskParent, setViewingTaskParent] = useState(null);
    const [creatingTaskForList, setCreatingTaskForList] = useState(null);
    const [creatingTaskWithStatus, setCreatingTaskWithStatus] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'kanban'
    const [editingDocument, setEditingDocument] = useState(null);
    
    // Inline editing state
    const [editingCell, setEditingCell] = useState(null); // {taskId, field}
    const [editValue, setEditValue] = useState('');
    
    // Comments popup state
    const [commentsPopup, setCommentsPopup] = useState(null); // {taskId, task, isSubtask, parentId, position}
    
    // Initialize taskLists with project-specific data
    const [taskLists, setTaskLists] = useState(
        project.taskLists || [
            { id: 1, name: 'To Do', color: 'blue', description: '' }
        ]
    );

    // Initialize tasks with project-specific data
    const [tasks, setTasks] = useState(project.tasks || []);
    
    // Initialize custom field definitions with project-specific data
    const [customFieldDefinitions, setCustomFieldDefinitions] = useState(
        project.customFieldDefinitions || []
    );
    
    // Initialize documents for Document Collection workflow
    const [documents, setDocuments] = useState(project.documents || []);
    
    // Users state for project members and DocumentCollectionModal
    const [users, setUsers] = useState([]);
    
    // Load users on component mount
    useEffect(() => {
        const loadUsers = async () => {
            try {
                if (window.dataService && typeof window.dataService.getUsers === 'function') {
                    const userData = await window.dataService.getUsers() || [];
                    setUsers(userData);
                }
            } catch (error) {
                console.warn('Error loading users:', error);
                setUsers([]);
            }
        };
        loadUsers();
    }, []);
    
    // Save back to project whenever they change
    useEffect(() => {
        // Skip save if this was triggered by manual document collection process addition
        if (skipNextSaveRef.current) {
            console.log('⏭️ Skipping save - manual document collection process save in progress');
            skipNextSaveRef.current = false;
            return;
        }
        
        const saveProjectData = async () => {
            try {
                console.log('💾 ProjectDetail: Saving project data changes...');
                console.log('  - Project ID:', project.id);
                console.log('  - Tasks count:', tasks.length);
                console.log('  - Task lists count:', taskLists.length);
                
                // Prepare the update payload with JSON stringified fields
                const updatePayload = {
                    taskLists: JSON.stringify(taskLists),
                    tasksList: JSON.stringify(tasks),  // Note: backend uses 'tasksList' not 'tasks'
                    customFieldDefinitions: JSON.stringify(customFieldDefinitions),
                    documents: JSON.stringify(documents),
                    hasDocumentCollectionProcess: hasDocumentCollectionProcess,
                    documentSections: JSON.stringify(project.documentSections || [])
                };
                
                console.log('📡 Sending update to database:', updatePayload);
                
                // Save to database first (server-first approach)
                const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
                console.log('✅ Database save successful:', apiResponse);
                
                // Then update localStorage for consistency
                if (window.dataService && typeof window.dataService.getProjects === 'function') {
                    const savedProjects = await window.dataService.getProjects();
                    if (savedProjects) {
                        const updatedProjects = savedProjects.map(p => 
                            p.id === project.id ? { 
                                ...p, 
                                tasks, 
                                taskLists, 
                                customFieldDefinitions, 
                                documents, 
                                hasDocumentCollectionProcess,
                                documentSections: p.documentSections || project.documentSections || []
                            } : p
                        );
                        if (window.dataService && typeof window.dataService.setProjects === 'function') {
                            try {
                                await window.dataService.setProjects(updatedProjects);
                                console.log('✅ localStorage updated for consistency');
                            } catch (saveError) {
                                console.warn('Failed to save projects to dataService:', saveError);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Error saving project data:', error);
                // Show user-friendly error
                alert('Failed to save project changes: ' + error.message);
            }
        };
        
        // Only save if we have actual changes (not on initial render)
        const timeoutId = setTimeout(() => {
            saveProjectData();
        }, 1500); // Increased debounce to 1.5 seconds to avoid excessive API calls
        
        return () => clearTimeout(timeoutId);
    }, [tasks, taskLists, customFieldDefinitions, documents, hasDocumentCollectionProcess]); // Removed project.id from dependencies

    // Get document status color
    const getDocumentStatusColor = (status) => {
        switch(status) {
            case 'Approved': return 'bg-green-100 text-green-800';
            case 'Submitted': return 'bg-blue-100 text-blue-800';
            case 'Under Review': return 'bg-yellow-100 text-yellow-800';
            case 'Rejected': return 'bg-red-100 text-red-800';
            case 'Pending': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // Overview Section
    const OverviewSection = () => {
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === 'Done').length;
        const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const activeUsers = users.filter(u => u.status === 'Active');

        // Calculate days until due
        const today = new Date();
        const dueDate = project.dueDate ? new Date(project.dueDate) : null;
        const daysUntilDue = dueDate ? Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)) : null;

        return (
            <div className="space-y-4">
                {/* Project Info Card */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">Project Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Client</label>
                            <p className="text-sm text-gray-900">{project.client || 'Not assigned'}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Project Type</label>
                            <p className="text-sm text-gray-900">{project.type}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Status</label>
                            <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
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
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Assigned To</label>
                            <p className="text-sm text-gray-900">{project.assignedTo || 'Not assigned'}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Start Date</label>
                            <p className="text-sm text-gray-900">{project.startDate || 'Not set'}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Due Date</label>
                            <p className="text-sm text-gray-900">{project.dueDate || 'Not set'}</p>
                        </div>
                        {project.description && (
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-500 mb-0.5">Description</label>
                                <p className="text-sm text-gray-700">{project.description}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600 mb-0.5">Total Tasks</p>
                                <p className="text-xl font-bold text-gray-900">{totalTasks}</p>
                            </div>
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-tasks text-blue-600"></i>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600 mb-0.5">Completed</p>
                                <p className="text-xl font-bold text-green-600">{completedTasks}</p>
                            </div>
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-check-circle text-green-600"></i>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600 mb-0.5">Completion</p>
                                <p className="text-xl font-bold text-primary-600">{completionPercentage}%</p>
                            </div>
                            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-chart-pie text-primary-600"></i>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600 mb-0.5">Days Until Due</p>
                                <p className={`text-xl font-bold ${
                                    daysUntilDue === null ? 'text-gray-400' :
                                    daysUntilDue < 0 ? 'text-red-600' :
                                    daysUntilDue <= 7 ? 'text-yellow-600' :
                                    'text-gray-900'
                                }`}>
                                    {daysUntilDue === null ? 'N/A' : daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} overdue` : daysUntilDue}
                                </p>
                            </div>
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-calendar-alt text-purple-600"></i>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Documents Section */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
                        <button
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.multiple = true;
                                input.onchange = (e) => {
                                    // Get current user info
                                    const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
                                    
                                    const files = Array.from(e.target.files);
                                    const newDocs = files.map(file => ({
                                        id: Date.now() + Math.random(),
                                        name: file.name,
                                        size: file.size,
                                        type: file.type,
                                        uploadedAt: new Date().toISOString(),
                                        uploadedBy: currentUser.name,
                                        uploadedByEmail: currentUser.email,
                                        uploadedById: currentUser.id
                                    }));
                                    setDocuments(prev => [...prev, ...newDocs]);
                                };
                                input.click();
                            }}
                            className="px-2 py-0.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 transition-colors font-medium flex items-center gap-1"
                        >
                            <i className="fas fa-upload text-[10px]"></i>
                            <span>Upload</span>
                        </button>
                    </div>
                    
                    {documents.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                            <i className="fas fa-file text-3xl mb-2 opacity-50"></i>
                            <p className="text-xs">No documents yet</p>
                            <button
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.multiple = true;
                                    input.onchange = (e) => {
                                        // Get current user info
                                        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
                                        
                                        const files = Array.from(e.target.files);
                                        const newDocs = files.map(file => ({
                                            id: Date.now() + Math.random(),
                                            name: file.name,
                                            size: file.size,
                                            type: file.type,
                                            uploadedAt: new Date().toISOString(),
                                            uploadedBy: currentUser.name,
                                            uploadedByEmail: currentUser.email,
                                            uploadedById: currentUser.id
                                        }));
                                        setDocuments(prev => [...prev, ...newDocs]);
                                    };
                                    input.click();
                                }}
                                className="mt-2 px-2 py-0.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 font-medium flex items-center gap-1 mx-auto"
                            >
                                <i className="fas fa-upload text-[10px]"></i>
                                <span>Upload Documents</span>
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {documents.map(doc => {
                                const fileIcon = doc.type?.includes('pdf') ? 'fa-file-pdf text-red-600' :
                                               doc.type?.includes('word') || doc.type?.includes('document') ? 'fa-file-word text-blue-600' :
                                               doc.type?.includes('excel') || doc.type?.includes('spreadsheet') ? 'fa-file-excel text-green-600' :
                                               doc.type?.includes('image') ? 'fa-file-image text-purple-600' :
                                               'fa-file text-gray-600';
                                const fileSize = doc.size ? (doc.size / 1024).toFixed(1) + ' KB' : 'Unknown size';
                                
                                return (
                                    <div key={doc.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
                                        <i className={`fas ${fileIcon} text-xl`}></i>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-gray-900 truncate">{doc.name}</p>
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                                <span>{fileSize}</span>
                                                <span>•</span>
                                                <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                                <span>•</span>
                                                <span>{doc.uploadedBy}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                className="text-primary-600 hover:text-primary-800 p-1"
                                                title="Download"
                                            >
                                                <i className="fas fa-download text-xs"></i>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Team Members */}
                {activeUsers.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h2 className="text-sm font-semibold text-gray-900 mb-3">Team Members</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {activeUsers.map(user => (
                                <div key={user.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm">
                                        {user.name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                                        <p className="text-xs text-gray-500">{user.role} • {user.department}</p>
                                    </div>
                                    <a href={`mailto:${user.email}`} className="text-primary-600 hover:text-primary-700 text-xs">
                                        <i className="fas fa-envelope"></i>
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Document Collection Section (for Document Collection Process)
    const DocumentCollectionProcessSection = () => {
        console.log('🔵 DocumentCollectionProcessSection rendering...');
        console.log('  - hasDocumentCollectionProcess:', hasDocumentCollectionProcess);
        console.log('  - activeSection:', activeSection);
        
        const MonthlyDocumentCollectionTracker = window.MonthlyDocumentCollectionTracker;
        console.log('  - MonthlyDocumentCollectionTracker:', typeof MonthlyDocumentCollectionTracker);
        
        // Check if component is loaded
        if (!MonthlyDocumentCollectionTracker) {
            return (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                    <i className="fas fa-exclamation-triangle text-3xl text-yellow-500 mb-3"></i>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Component Not Loaded</h3>
                    <p className="text-sm text-gray-600 mb-4">
                        The Monthly Document Collection Tracker component is still loading or failed to load.
                    </p>
                    <div className="flex gap-2 justify-center">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                        >
                            <i className="fas fa-sync-alt mr-2"></i>
                            Reload Page
                        </button>
                        <button
                            onClick={() => setActiveSection('overview')}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                        >
                            <i className="fas fa-arrow-left mr-2"></i>
                            Back to Overview
                        </button>
                    </div>
                    <div className="mt-4 text-xs text-gray-500">
                        <p>Debug Info: window.MonthlyDocumentCollectionTracker = {String(typeof MonthlyDocumentCollectionTracker)}</p>
                    </div>
                </div>
            );
        }
        
        return (
            <MonthlyDocumentCollectionTracker
                project={project}
                onBack={() => setActiveSection('overview')}
            />
        );
    };

    // Inline editing functions
    const startEditing = (taskId, field, currentValue, isSubtask = false, parentId = null) => {
        setEditingCell({ taskId, field, isSubtask, parentId });
        setEditValue(currentValue || '');
    };

    const saveInlineEdit = () => {
        if (!editingCell) return;

        const { taskId, field, isSubtask, parentId } = editingCell;

        if (isSubtask) {
            // Update subtask
            setTasks(tasks.map(t => {
                if (t.id === parentId) {
                    return {
                        ...t,
                        subtasks: (t.subtasks || []).map(st =>
                            st.id === taskId ? { ...st, [field]: editValue } : st
                        )
                    };
                }
                return t;
            }));
        } else {
            // Update main task
            setTasks(tasks.map(t =>
                t.id === taskId ? { ...t, [field]: editValue } : t
            ));
        }

        setEditingCell(null);
        setEditValue('');
    };

    const cancelInlineEdit = () => {
        setEditingCell(null);
        setEditValue('');
    };

    // Comment handling function
    const handleAddComment = (taskId, commentText, isSubtask, parentId) => {
        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
        const newComment = {
            id: Date.now(),
            text: commentText,
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleString()
        };

        if (isSubtask) {
            setTasks(tasks.map(t => {
                if (t.id === parentId) {
                    return {
                        ...t,
                        subtasks: (t.subtasks || []).map(st =>
                            st.id === taskId 
                                ? { ...st, comments: [...(st.comments || []), newComment] }
                                : st
                        )
                    };
                }
                return t;
            }));
        } else {
            setTasks(tasks.map(t =>
                t.id === taskId 
                    ? { ...t, comments: [...(t.comments || []), newComment] }
                    : t
            ));
        }
    };

    // List Management
    const handleAddList = () => {
        setEditingList(null);
        setShowListModal(true);
    };

    const handleEditList = (list) => {
        setEditingList(list);
        setShowListModal(true);
    };

    const handleSaveList = (listData) => {
        if (editingList) {
            setTaskLists(taskLists.map(l => l.id === editingList.id ? { ...l, ...listData } : l));
        } else {
            const newList = {
                id: Math.max(0, ...taskLists.map(l => l.id)) + 1,
                ...listData
            };
            setTaskLists([...taskLists, newList]);
        }
        setShowListModal(false);
        setEditingList(null);
    };

    const handleAddCustomField = (fieldData) => {
        setCustomFieldDefinitions([...customFieldDefinitions, fieldData]);
        setShowCustomFieldModal(false);
    };

    const handleDeleteList = (listId) => {
        // Prevent deletion if it's the last list
        if (taskLists.length === 1) {
            alert('Cannot delete the last list. Projects must have at least one list.');
            return;
        }

        // Find the first remaining list (that's not the one being deleted)
        const remainingList = taskLists.find(l => l.id !== listId);
        const listToDelete = taskLists.find(l => l.id === listId);
        const tasksInList = tasks.filter(t => t.listId === listId);

        const message = tasksInList.length > 0 
            ? `Delete "${listToDelete.name}"? ${tasksInList.length} task(s) will be moved to "${remainingList.name}".`
            : `Delete "${listToDelete.name}"?`;

        if (confirm(message)) {
            // Move tasks to the first remaining list
            setTasks(tasks.map(t => t.listId === listId ? { ...t, listId: remainingList.id } : t));
            setTaskLists(taskLists.filter(l => l.id !== listId));
        }
    };

    // Task Management - Unified for both creating and editing
    const handleAddTask = (listId, statusName = null) => {
        const newTask = { listId };
        if (statusName) {
            newTask.status = statusName;
            setCreatingTaskWithStatus(statusName);
        }
        setViewingTask(newTask);
        setViewingTaskParent(null);
        setCreatingTaskForList(listId);
        setShowTaskDetailModal(true);
    };

    const handleAddSubtask = (parentTask) => {
        setViewingTask({ listId: parentTask.listId });
        setViewingTaskParent(parentTask);
        setCreatingTaskForList(null);
        setShowTaskDetailModal(true);
    };

    const handleViewTaskDetail = (task, parentTask = null) => {
        setViewingTask(task);
        setViewingTaskParent(parentTask);
        setCreatingTaskForList(null);
        setShowTaskDetailModal(true);
    };

    const handleUpdateTaskFromDetail = async (updatedTaskData) => {
        const isNewTask = !updatedTaskData.id || (!tasks.find(t => t.id === updatedTaskData.id) && 
                                                    !tasks.some(t => (t.subtasks || []).find(st => st.id === updatedTaskData.id)));
        
        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
        // Find the old task to compare assignee changes
        let oldTask = null;
        if (!isNewTask) {
            if (viewingTaskParent) {
                const parentTask = tasks.find(t => t.id === viewingTaskParent.id);
                oldTask = parentTask?.subtasks?.find(st => st.id === updatedTaskData.id);
            } else {
                oldTask = tasks.find(t => t.id === updatedTaskData.id);
            }
        }
        
        // Send notification if assignee changed
        if (!isNewTask && oldTask && updatedTaskData.assignee && updatedTaskData.assignee !== oldTask.assignee) {
            // Find the assignee user
            const assigneeUser = users.find(u => 
                u.name === updatedTaskData.assignee || 
                u.email === updatedTaskData.assignee ||
                u.id === updatedTaskData.assignee
            );
            
            if (assigneeUser && assigneeUser.id !== currentUser.id) {
                try {
                    const projectLink = `/projects/${project.id}`;
                    await window.DatabaseAPI.makeRequest('/notifications', {
                        method: 'POST',
                        body: JSON.stringify({
                            userId: assigneeUser.id,
                            type: 'task',
                            title: `Task assigned: ${updatedTaskData.title || 'Untitled Task'}`,
                            message: `${currentUser.name} assigned you to "${updatedTaskData.title || 'Untitled Task'}" in project "${project.name}"`,
                            link: projectLink,
                            metadata: {
                                taskId: updatedTaskData.id,
                                taskTitle: updatedTaskData.title,
                                projectId: project.id,
                                projectName: project.name,
                                assignedBy: currentUser.name
                            }
                        })
                    });
                    console.log(`✅ Task assignment notification sent to ${assigneeUser.name}`);
                } catch (error) {
                    console.error('❌ Failed to send task assignment notification:', error);
                }
            }
        }
        
        // Send notification if this is a new task with an assignee
        if (isNewTask && updatedTaskData.assignee) {
            const assigneeUser = users.find(u => 
                u.name === updatedTaskData.assignee || 
                u.email === updatedTaskData.assignee ||
                u.id === updatedTaskData.assignee
            );
            
            if (assigneeUser && assigneeUser.id !== currentUser.id) {
                try {
                    const projectLink = `/projects/${project.id}`;
                    await window.DatabaseAPI.makeRequest('/notifications', {
                        method: 'POST',
                        body: JSON.stringify({
                            userId: assigneeUser.id,
                            type: 'task',
                            title: `Task assigned: ${updatedTaskData.title || 'Untitled Task'}`,
                            message: `${currentUser.name} assigned you to "${updatedTaskData.title || 'Untitled Task'}" in project "${project.name}"`,
                            link: projectLink,
                            metadata: {
                                taskId: updatedTaskData.id,
                                taskTitle: updatedTaskData.title,
                                projectId: project.id,
                                projectName: project.name,
                                assignedBy: currentUser.name
                            }
                        })
                    });
                    console.log(`✅ Task assignment notification sent to ${assigneeUser.name}`);
                } catch (error) {
                    console.error('❌ Failed to send task assignment notification:', error);
                }
            }
        }
        
        if (isNewTask) {
            if (viewingTaskParent) {
                const newSubtask = {
                    ...updatedTaskData,
                    id: Date.now(),
                    isSubtask: true,
                    subtasks: [],
                    status: updatedTaskData.status || 'To Do'
                };
                setTasks(tasks.map(t => {
                    if (t.id === viewingTaskParent.id) {
                        return {
                            ...t,
                            subtasks: [...(t.subtasks || []), newSubtask]
                        };
                    }
                    return t;
                }));
            } else {
                const newTask = {
                    ...updatedTaskData,
                    id: Date.now(),
                    subtasks: [],
                    status: updatedTaskData.status || 'To Do'
                };
                setTasks([...tasks, newTask]);
            }
        } else {
            if (viewingTaskParent) {
                setTasks(tasks.map(t => {
                    if (t.id === viewingTaskParent.id) {
                        return {
                            ...t,
                            subtasks: (t.subtasks || []).map(st =>
                                st.id === updatedTaskData.id ? updatedTaskData : st
                            )
                        };
                    }
                    return t;
                }));
            } else {
                setTasks(tasks.map(t => t.id === updatedTaskData.id ? updatedTaskData : t));
            }
        }
        
        setShowTaskDetailModal(false);
        setViewingTask(null);
        setViewingTaskParent(null);
        setCreatingTaskForList(null);
    };

    const handleDeleteTask = (taskId) => {
        if (confirm('Delete this task and all its subtasks?')) {
            setTasks(tasks.filter(t => t.id !== taskId));
        }
    };

    const handleDeleteSubtask = (parentTaskId, subtaskId) => {
        if (confirm('Delete this subtask?')) {
            setTasks(tasks.map(t => {
                if (t.id === parentTaskId) {
                    return {
                        ...t,
                        subtasks: (t.subtasks || []).filter(st => st.id !== subtaskId)
                    };
                }
                return t;
            }));
        }
    };

    // Document Collection Management
    const handleAddDocument = () => {
        setEditingDocument(null);
        setShowDocumentModal(true);
    };

    const handleAddDocumentCollectionProcess = async () => {
        console.log('🔄 Adding Document Collection Process...');
        console.log('  - MonthlyDocumentCollectionTracker loaded:', typeof window.MonthlyDocumentCollectionTracker);
        console.log('  - Project ID:', project.id);
        console.log('  - Current hasDocumentCollectionProcess:', hasDocumentCollectionProcess);
        
        try {
            // Set flag to skip the useEffect save to prevent duplicates
            skipNextSaveRef.current = true;
            
            // Update state first
            setHasDocumentCollectionProcess(true);
            setActiveSection('documentCollection');
            setShowDocumentProcessDropdown(false);
            
            // Immediately save to database to ensure persistence
            const updatePayload = {
                hasDocumentCollectionProcess: true,
                documentSections: JSON.stringify(project.documentSections || [])
            };
            
            console.log('💾 Immediately saving document collection process to database...');
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            console.log('✅ Database save successful:', apiResponse);
            
            // Also update localStorage for consistency
            if (window.dataService && typeof window.dataService.getProjects === 'function') {
                const savedProjects = await window.dataService.getProjects();
                if (savedProjects) {
                    const updatedProjects = savedProjects.map(p => 
                        p.id === project.id ? { 
                            ...p, 
                            hasDocumentCollectionProcess: true,
                            documentSections: p.documentSections || project.documentSections || []
                        } : p
                    );
                    if (window.dataService && typeof window.dataService.setProjects === 'function') {
                        try {
                            await window.dataService.setProjects(updatedProjects);
                            console.log('✅ localStorage updated for consistency');
                        } catch (saveError) {
                            console.warn('Failed to save projects to dataService:', saveError);
                        }
                    }
                }
            }
            
            console.log('✅ Document Collection Process setup complete and persisted');
            
            // Reset flag after a short delay to allow any pending useEffect to complete
            setTimeout(() => {
                skipNextSaveRef.current = false;
            }, 2000);
        } catch (error) {
            console.error('❌ Error saving document collection process:', error);
            alert('Failed to save document collection process: ' + error.message);
            // Revert state on error
            setHasDocumentCollectionProcess(false);
            skipNextSaveRef.current = false;
        }
    };

    const handleAddMonthlyDataProcess = () => {
        // Pre-populate with monthly data process defaults
        setEditingDocument({
            name: 'Monthly Data Report',
            category: 'Reports',
            description: 'Monthly data collection and reporting',
            priority: 'High',
            dueDate: '',
            requiredFrom: ''
        });
        setShowDocumentModal(true);
        setShowDocumentProcessDropdown(false);
    };

    const handleEditDocument = (doc) => {
        setEditingDocument(doc);
        setShowDocumentModal(true);
    };

    const handleSaveDocument = (docData) => {
        if (editingDocument) {
            setDocuments(documents.map(d => 
                d.id === editingDocument.id ? { ...d, ...docData } : d
            ));
        } else {
            const newDoc = {
                ...docData,
                id: Date.now(),
                status: 'Pending',
                submittedDate: null,
                submittedBy: null,
                fileUrl: null,
                fileName: null,
                comments: [],
                createdAt: new Date().toISOString()
            };
            setDocuments([...documents, newDoc]);
        }
        setShowDocumentModal(false);
        setEditingDocument(null);
    };

    const handleDeleteDocument = (docId) => {
        if (confirm('Delete this document request?')) {
            setDocuments(documents.filter(d => d.id !== docId));
        }
    };

    const handleUpdateDocumentStatus = (docId, newStatus) => {
        setDocuments(documents.map(d => 
            d.id === docId ? { ...d, status: newStatus } : d
        ));
    };

    const getPriorityColor = (priority) => {
        switch(priority) {
            case 'High': return 'bg-red-100 text-red-800';
            case 'Medium': return 'bg-yellow-100 text-yellow-800';
            case 'Low': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'Done': return 'bg-green-100 text-green-800';
            case 'In Progress': return 'bg-blue-100 text-blue-800';
            case 'To Do': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // Editable Cell Component
    const EditableCell = ({ task, field, value, isSubtask = false, parentId = null }) => {
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === field;

        if (isEditing) {
            if (field === 'assignee') {
                return (
                    <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveInlineEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlineEdit();
                            if (e.key === 'Escape') cancelInlineEdit();
                        }}
                        autoFocus
                        className="w-full px-2 py-1 text-xs border border-primary-500 rounded focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option value="">Unassigned</option>
                        {users.map(user => (
                            <option key={user.id} value={user.name || user.email}>
                                {user.name || user.email}
                            </option>
                        ))}
                    </select>
                );
            } else if (field === 'dueDate') {
                return (
                    <input
                        type="date"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveInlineEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlineEdit();
                            if (e.key === 'Escape') cancelInlineEdit();
                        }}
                        autoFocus
                        className="w-full px-2 py-1 text-xs border border-primary-500 rounded focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                    />
                );
            } else if (field === 'priority') {
                return (
                    <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveInlineEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlineEdit();
                            if (e.key === 'Escape') cancelInlineEdit();
                        }}
                        autoFocus
                        className="w-full px-2 py-1 text-xs border border-primary-500 rounded focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                    </select>
                );
            } else if (field === 'status') {
                return (
                    <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveInlineEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlineEdit();
                            if (e.key === 'Escape') cancelInlineEdit();
                        }}
                        autoFocus
                        className="w-full px-2 py-1 text-xs border border-primary-500 rounded focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option>To Do</option>
                        <option>In Progress</option>
                        <option>Done</option>
                    </select>
                );
            } else {
                return (
                    <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveInlineEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlineEdit();
                            if (e.key === 'Escape') cancelInlineEdit();
                        }}
                        autoFocus
                        className="w-full px-2 py-1 text-xs border border-primary-500 rounded focus:ring-2 focus:ring-primary-500 focus:outline-none font-medium"
                        onClick={(e) => e.stopPropagation()}
                    />
                );
            }
        }

        // Display mode
        return (
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    startEditing(task.id, field, value, isSubtask, parentId);
                }}
                className="cursor-text hover:bg-primary-50 px-2 py-1 -mx-2 -my-1 rounded transition-colors"
            >
                {field === 'priority' ? (
                    <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${getPriorityColor(value)}`}>
                        {value || 'Medium'}
                    </span>
                ) : field === 'status' ? (
                    <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${getStatusColor(value)}`}>
                        {value || 'To Do'}
                    </span>
                ) : (
                    <span className={field === 'title' ? 'font-medium text-gray-900' : 'text-gray-600'}>
                        {value || (field === 'dueDate' ? 'No date' : field === 'assignee' ? 'Unassigned' : 'Untitled')}
                    </span>
                )}
            </div>
        );
    };

    // List View Component
    const ListView = () => {
        return (
            <div className="space-y-6">
                {taskLists.map(list => {
                    const listTasks = tasks.filter(t => t.listId === list.id);
                    
                    return (
                        <div key={list.id} className="bg-white rounded-lg border border-gray-200">
                            {/* List Header */}
                            <div className="border-b border-gray-200 px-4 py-3 bg-gray-50 rounded-t-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div 
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: `var(--tw-${list.color}-500, #0284c7)` }}
                                        ></div>
                                        <h3 className="text-sm font-semibold text-gray-900">{list.name}</h3>
                                        <span className="text-xs text-gray-500">({listTasks.length})</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleAddTask(list.id)}
                                            className="px-2 py-1 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 transition-colors font-medium"
                                        >
                                            <i className="fas fa-plus mr-1 text-[10px]"></i>
                                            Add Task
                                        </button>
                                        <button
                                            onClick={() => handleEditList(list)}
                                            className="text-gray-400 hover:text-gray-600 p-1.5 transition-colors"
                                            title="Edit List"
                                        >
                                            <i className="fas fa-edit text-xs"></i>
                                        </button>
                                    </div>
                                </div>
                                {list.description && (
                                    <p className="text-xs text-gray-500 mt-1">{list.description}</p>
                                )}
                            </div>

                            {/* Tasks Table */}
                            {listTasks.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">
                                    <i className="fas fa-inbox text-3xl mb-2 opacity-50"></i>
                                    <p className="text-sm">No tasks in this list yet</p>
                                    <button
                                        onClick={() => handleAddTask(list.id)}
                                        className="mt-3 px-3 py-1.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 font-medium"
                                    >
                                        Add First Task
                                    </button>
                                </div>
                            ) : (
                                <table className="min-w-full">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-1/3">
                                                Task Name
                                            </th>
                                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                                Status
                            </th>
                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                                                Assignee
                                            </th>
                                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                                                Due Date
                                            </th>
                                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                                                Priority
                                            </th>
                                            {customFieldDefinitions.map(field => (
                                                <th key={field.name} className="px-4 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                                                    {field.name}
                                                </th>
                                            ))}
                                            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {listTasks.map(task => (
                                            <React.Fragment key={task.id}>
                                                {/* Main Task Row */}
                                                <tr className="hover:bg-gray-50 transition-colors group">
                                                    <td className="px-4 py-2.5">
                                                        <div>
                                                            <div className="text-xs">
                                                                <EditableCell task={task} field="title" value={task.title} />
                                                            </div>
                                                            {task.description && (
                                                                <div 
                                                                    className="text-[11px] text-gray-500 mt-0.5 line-clamp-1 cursor-pointer"
                                                                    onClick={() => handleViewTaskDetail(task)}
                                                                >
                                                                    {task.description}
                                                                </div>
                                                            )}
                                                            {task.subtasks && task.subtasks.length > 0 && (
                                                                <div className="text-[10px] text-gray-500 mt-0.5">
                                                                    <i className="fas fa-tasks mr-1"></i>
                                                                    {task.subtasks.length} subtask{task.subtasks.length > 1 ? 's' : ''}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                                        <EditableCell task={task} field="status" value={task.status || 'To Do'} />
                                                    </td>
                                                    <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                                                        <EditableCell task={task} field="assignee" value={task.assignee} />
                                                    </td>
                                                    <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                                                        <EditableCell task={task} field="dueDate" value={task.dueDate} />
                                                    </td>
                                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                                        <EditableCell task={task} field="priority" value={task.priority} />
                                                    </td>
                                                    {customFieldDefinitions.map(field => (
                                                        <td key={field.name} className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-600">
                                                            {field.type === 'status' && task.customFields?.[field.name] ? (
                                                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 font-medium">
                                                                    {task.customFields[field.name]}
                                                                </span>
                                                            ) : (
                                                                task.customFields?.[field.name] || '-'
                                                            )}
                                                        </td>
                                                    ))}
                                                    <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setCommentsPopup({
                                                                        taskId: task.id,
                                                                        task: task,
                                                                        isSubtask: false,
                                                                        parentId: null,
                                                                        position: {
                                                                            top: rect.bottom + 5,
                                                                            left: rect.left - 300
                                                                        }
                                                                    });
                                                                }}
                                                                className="text-gray-600 hover:text-primary-600 transition-colors relative"
                                                                title="Comments"
                                                            >
                                                                <i className="fas fa-comment text-[10px]"></i>
                                                                {task.comments && task.comments.length > 0 && (
                                                                    <span className="absolute -top-1 -right-1 bg-primary-600 text-white text-[8px] rounded-full w-3 h-3 flex items-center justify-center">
                                                                        {task.comments.length}
                                                                    </span>
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleViewTaskDetail(task);
                                                                }}
                                                                className="text-primary-600 hover:text-primary-800 transition-colors"
                                                                title="View Details"
                                                            >
                                                                <i className="fas fa-eye text-[10px]"></i>
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAddSubtask(task);
                                                                }}
                                                                className="text-primary-600 hover:text-primary-800 transition-colors"
                                                                title="Add Subtask"
                                                            >
                                                                <i className="fas fa-plus text-[10px]"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Subtask Rows */}
                                                {task.subtasks && task.subtasks.length > 0 && task.subtasks.map(subtask => (
                                                    <tr 
                                                        key={`subtask-${subtask.id}`} 
                                                        className="bg-gray-50 hover:bg-gray-100 transition-colors group"
                                                    >
                                                        <td className="px-4 py-2" style={{ paddingLeft: '40px' }}>
                                                            <div className="flex items-start gap-1.5">
                                                                <i className="fas fa-level-up-alt fa-rotate-90 text-gray-400 text-[10px] mt-1"></i>
                                                                <div className="flex-1">
                                                                    <div className="text-xs">
                                                                        <EditableCell 
                                                                            task={subtask} 
                                                                            field="title" 
                                                                            value={subtask.title}
                                                                            isSubtask={true}
                                                                            parentId={task.id}
                                                                        />
                                                                    </div>
                                                                    {subtask.description && (
                                                                        <div 
                                                                            className="text-[10px] text-gray-500 mt-0.5 line-clamp-1 cursor-pointer"
                                                                            onClick={() => handleViewTaskDetail(subtask, task)}
                                                                        >
                                                                            {subtask.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 whitespace-nowrap">
                                                            <EditableCell 
                                                                task={subtask} 
                                                                field="status" 
                                                                value={subtask.status || 'To Do'}
                                                                isSubtask={true}
                                                                parentId={task.id}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                                                            <EditableCell 
                                                                task={subtask} 
                                                                field="assignee" 
                                                                value={subtask.assignee}
                                                                isSubtask={true}
                                                                parentId={task.id}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                                                            <EditableCell 
                                                                task={subtask} 
                                                                field="dueDate" 
                                                                value={subtask.dueDate}
                                                                isSubtask={true}
                                                                parentId={task.id}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2 whitespace-nowrap">
                                                            <EditableCell 
                                                                task={subtask} 
                                                                field="priority" 
                                                                value={subtask.priority}
                                                                isSubtask={true}
                                                                parentId={task.id}
                                                            />
                                                        </td>
                                                        {customFieldDefinitions.map(field => (
                                                            <td key={field.name} className="px-4 py-2 whitespace-nowrap text-xs text-gray-600">
                                                                {field.type === 'status' && subtask.customFields?.[field.name] ? (
                                                                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 font-medium">
                                                                        {subtask.customFields[field.name]}
                                                                    </span>
                                                                ) : (
                                                                    subtask.customFields?.[field.name] || '-'
                                                                )}
                                                            </td>
                                                        ))}
                                                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                        setCommentsPopup({
                                                                            taskId: subtask.id,
                                                                            task: subtask,
                                                                            isSubtask: true,
                                                                            parentId: task.id,
                                                                            position: {
                                                                                top: rect.bottom + 5,
                                                                                left: rect.left - 300
                                                                            }
                                                                        });
                                                                    }}
                                                                    className="text-gray-600 hover:text-primary-600 transition-colors relative"
                                                                    title="Comments"
                                                                >
                                                                    <i className="fas fa-comment text-[10px]"></i>
                                                                    {subtask.comments && subtask.comments.length > 0 && (
                                                                        <span className="absolute -top-1 -right-1 bg-primary-600 text-white text-[8px] rounded-full w-3 h-3 flex items-center justify-center">
                                                                            {subtask.comments.length}
                                                                        </span>
                                                                    )}
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleViewTaskDetail(subtask, task);
                                                                    }}
                                                                    className="text-primary-600 hover:text-primary-800 transition-colors"
                                                                    title="View Details"
                                                                >
                                                                    <i className="fas fa-eye text-[10px]"></i>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onBack} 
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <i className="fas fa-arrow-left text-lg"></i>
                    </button>
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
                        <p className="text-sm text-gray-500">{project.client} • {project.type}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowProjectModal(true)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center text-xs font-medium"
                    >
                        <i className="fas fa-cog mr-1.5"></i>
                        Settings
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="bg-white rounded-lg border border-gray-200 p-1">
                <div className="flex gap-1">
                    <button
                        onClick={() => setActiveSection('overview')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            activeSection === 'overview'
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        <i className="fas fa-chart-line mr-1.5"></i>
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveSection('tasks')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            activeSection === 'tasks'
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        <i className="fas fa-tasks mr-1.5"></i>
                        Tasks
                    </button>
                    {hasDocumentCollectionProcess && (
                        <button
                            onClick={() => setActiveSection('documentCollection')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'documentCollection'
                                    ? 'bg-primary-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-folder-open mr-1.5"></i>
                            Document Collection
                        </button>
                    )}
                    <div className="relative">
                        <button
                            onClick={() => setShowDocumentProcessDropdown(!showDocumentProcessDropdown)}
                            className="px-2 py-0.5 bg-primary-600 text-white text-xs font-medium rounded hover:bg-primary-700 transition-colors flex items-center gap-1 whitespace-nowrap"
                        >
                            <i className="fas fa-plus text-[10px]"></i>
                            <span>Add a Process</span>
                            <i className="fas fa-chevron-down text-[10px]"></i>
                        </button>
                        
                        {/* Dropdown Menu */}
                        {showDocumentProcessDropdown && (
                            <>
                                {/* Backdrop */}
                                <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={() => setShowDocumentProcessDropdown(false)}
                                ></div>
                                
                                {/* Dropdown */}
                                <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                                    {!hasDocumentCollectionProcess && (
                                        <button
                                            onClick={handleAddDocumentCollectionProcess}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        >
                                            <i className="fas fa-folder-open text-primary-600 w-4"></i>
                                            <div>
                                                <div className="font-medium">Document Collection Process</div>
                                                <div className="text-[10px] text-gray-500">Request specific documents</div>
                                            </div>
                                        </button>
                                    )}
                                    <button
                                        onClick={handleAddMonthlyDataProcess}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                    >
                                        <i className="fas fa-calendar-alt text-primary-600 w-4"></i>
                                        <div>
                                            <div className="font-medium">Monthly Data Process</div>
                                            <div className="text-[10px] text-gray-500">Recurring monthly data collection</div>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Section Content */}
            {(() => {
                console.log('🟢 Rendering section content. activeSection:', activeSection);
                console.log('  - hasDocumentCollectionProcess:', hasDocumentCollectionProcess);
                return null;
            })()}
            
            {activeSection === 'overview' && <OverviewSection />}
            
            {activeSection === 'tasks' && (
                <>
                    {/* Task View Controls */}
                    <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                            {/* View Switcher */}
                            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                        viewMode === 'list'
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <i className="fas fa-list mr-1.5"></i>
                                    List
                                </button>
                                <button
                                    onClick={() => setViewMode('kanban')}
                                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                        viewMode === 'kanban'
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <i className="fas fa-columns mr-1.5"></i>
                                    Kanban
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setShowCustomFieldModal(true)}
                                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center text-xs font-medium"
                            >
                                <i className="fas fa-th mr-1.5"></i>
                                Custom Fields
                            </button>
                            <button 
                                onClick={handleAddList}
                                className="bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors flex items-center text-xs font-medium"
                            >
                                <i className="fas fa-plus mr-1.5"></i>
                                Add List
                            </button>
                        </div>
                    </div>

            {/* List or Kanban View */}
            {viewMode === 'list' ? (
                <ListView />
            ) : (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700">Status Board</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {['To Do', 'In Progress', 'Done'].map(status => {
                            const statusTasks = tasks.filter(t => (t.status || 'To Do') === status);
                            
                            return (
                                <div 
                                    key={status} 
                                    className="bg-white rounded-lg border-2 border-gray-200 p-4"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.add('border-primary-500', 'bg-primary-50');
                                    }}
                                    onDragLeave={(e) => {
                                        e.currentTarget.classList.remove('border-primary-500', 'bg-primary-50');
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('border-primary-500', 'bg-primary-50');
                                        
                                        const taskId = parseInt(e.dataTransfer.getData('taskId'));
                                        const isSubtask = e.dataTransfer.getData('isSubtask') === 'true';
                                        const parentId = parseInt(e.dataTransfer.getData('parentId'));
                                        
                                        if (isSubtask) {
                                            setTasks(tasks.map(t => {
                                                if (t.id === parentId) {
                                                    return {
                                                        ...t,
                                                        subtasks: (t.subtasks || []).map(st =>
                                                            st.id === taskId ? { ...st, status } : st
                                                        )
                                                    };
                                                }
                                                return t;
                                            }));
                                        } else {
                                            setTasks(tasks.map(t =>
                                                t.id === taskId ? { ...t, status } : t
                                            ));
                                        }
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 text-xs rounded font-semibold ${getStatusColor(status)}`}>
                                                {status}
                                            </span>
                                            <span className="text-xs text-gray-500">({statusTasks.length})</span>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2 min-h-[200px]">
                                        {statusTasks.length === 0 ? (
                                            <div className="text-center py-8 text-gray-400">
                                                <i className="fas fa-inbox text-2xl mb-2 opacity-50"></i>
                                                <p className="text-xs">No tasks</p>
                                            </div>
                                        ) : (
                                            statusTasks.map(task => (
                                                <div
                                                    key={task.id}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('taskId', task.id.toString());
                                                        e.dataTransfer.setData('isSubtask', 'false');
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-move"
                                                    onClick={() => handleViewTaskDetail(task)}
                                                >
                                                    <div className="font-medium text-sm text-gray-900 mb-2">{task.title || 'Untitled'}</div>
                                                    {task.description && (
                                                        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                                                    )}
                                                    <div className="flex items-center justify-between text-xs">
                                                        <div className="flex items-center gap-2">
                                                            {task.assignee && (
                                                                <span className="text-gray-600">
                                                                    <i className="fas fa-user mr-1"></i>
                                                                    {task.assignee}
                                                                </span>
                                                            )}
                                                            {task.priority && (
                                                                <span className={`px-1.5 py-0.5 rounded ${getPriorityColor(task.priority)}`}>
                                                                    {task.priority}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {task.dueDate && (
                                                            <span className="text-gray-500">
                                                                <i className="fas fa-calendar mr-1"></i>
                                                                {task.dueDate}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {task.subtasks && task.subtasks.length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                                            <div className="text-[10px] text-gray-500 mb-1">
                                                                <i className="fas fa-tasks mr-1"></i>
                                                                Subtasks ({task.subtasks.length})
                                                            </div>
                                                            <div className="space-y-1">
                                                                {task.subtasks.map(subtask => (
                                                                    <div
                                                                        key={subtask.id}
                                                                        draggable
                                                                        onDragStart={(e) => {
                                                                            e.stopPropagation();
                                                                            e.dataTransfer.setData('taskId', subtask.id.toString());
                                                                            e.dataTransfer.setData('isSubtask', 'true');
                                                                            e.dataTransfer.setData('parentId', task.id.toString());
                                                                            e.dataTransfer.effectAllowed = 'move';
                                                                        }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleViewTaskDetail(subtask, task);
                                                                        }}
                                                                        className="bg-gray-50 border border-gray-200 rounded p-2 text-xs hover:bg-gray-100 transition-colors cursor-move"
                                                                    >
                                                                        <div className="flex items-center gap-1">
                                                                            <i className="fas fa-level-up-alt fa-rotate-90 text-gray-400 text-[10px]"></i>
                                                                            <span className="text-gray-800">{subtask.title || 'Untitled'}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {task.comments && task.comments.length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                                            <span className="text-[10px] text-gray-500">
                                                                <i className="fas fa-comment mr-1"></i>
                                                                {task.comments.length} comment{task.comments.length > 1 ? 's' : ''}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Comments Popup */}
            {commentsPopup && (
                <CommentsPopup
                    task={commentsPopup.task}
                    isSubtask={commentsPopup.isSubtask}
                    parentId={commentsPopup.parentId}
                    onAddComment={handleAddComment}
                    onClose={() => setCommentsPopup(null)}
                    position={commentsPopup.position}
                />
            )}
                </>
            )}

            {activeSection === 'documentCollection' && <DocumentCollectionProcessSection />}

            {/* Modals */}
            {showListModal && (
                <ListModal
                    list={editingList}
                    onSave={handleSaveList}
                    onClose={() => {
                        setShowListModal(false);
                        setEditingList(null);
                    }}
                />
            )}

            {showCustomFieldModal && (
                <CustomFieldModal
                    customFields={customFieldDefinitions}
                    onAdd={handleAddCustomField}
                    onClose={() => setShowCustomFieldModal(false)}
                />
            )}

            {showProjectModal && (
                <ProjectModal
                    project={project}
                    onSave={async (projectData) => {
                        try {
                            if (window.dataService && typeof window.dataService.getProjects === 'function') {
                                const savedProjects = await window.dataService.getProjects();
                                if (savedProjects) {
                                    const updatedProjects = savedProjects.map(p => 
                                        p.id === project.id ? { ...p, ...projectData } : p
                                    );
                                    if (window.dataService && typeof window.dataService.setProjects === 'function') {
                                        try {
                                            await window.dataService.setProjects(updatedProjects);
                                        } catch (saveError) {
                                            console.warn('Failed to save projects to dataService:', saveError);
                                        }
                                    } else {
                                        console.warn('DataService not available or setProjects method not found');
                                    }
                                }
                            } else {
                                console.warn('DataService not available or getProjects method not found');
                            }
                        } catch (error) {
                            console.error('Error saving project:', error);
                        }
                        setShowProjectModal(false);
                    }}
                    onDelete={async (projectId) => {
                        console.log('🗑️ ProjectDetail: Delete requested for project:', projectId);
                        if (onDelete && typeof onDelete === 'function') {
                            console.log('✅ ProjectDetail: Calling parent onDelete handler');
                            await onDelete(projectId);
                            setShowProjectModal(false);
                            onBack();
                        } else {
                            console.error('❌ ProjectDetail: No onDelete handler provided');
                            alert('Delete functionality not available. Please use the projects list to delete.');
                        }
                    }}
                    onClose={() => setShowProjectModal(false)}
                />
            )}

            {showTaskDetailModal && (
                <TaskDetailModal
                    task={viewingTask}
                    parentTask={viewingTaskParent}
                    customFieldDefinitions={customFieldDefinitions}
                    taskLists={taskLists}
                    project={project}
                    users={users}
                    onUpdate={handleUpdateTaskFromDetail}
                    onAddSubtask={handleAddSubtask}
                    onViewSubtask={handleViewTaskDetail}
                    onDeleteSubtask={handleDeleteSubtask}
                    onClose={() => {
                        setShowTaskDetailModal(false);
                        setViewingTask(null);
                        setViewingTaskParent(null);
                        setCreatingTaskForList(null);
                        setCreatingTaskWithStatus(null);
                    }}
                />
            )}

            {showDocumentModal && (
                <DocumentCollectionModal
                    document={editingDocument}
                    onSave={handleSaveDocument}
                    onClose={() => {
                        setShowDocumentModal(false);
                        setEditingDocument(null);
                    }}
                    users={users}
                />
            )}
        </div>
    );
};

// Make available globally
window.ProjectDetail = ProjectDetail;
