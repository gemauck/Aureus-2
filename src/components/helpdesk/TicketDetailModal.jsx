// Get React hooks from window
const { useState, useEffect, useRef } = React;
const CommentInputWithMentions = window.CommentInputWithMentions;

const TicketDetailModal = ({ 
    ticket, 
    onSave, 
    onClose,
    onDelete
}) => {
    const isCreating = !ticket || !ticket.id;
    
    const [activeTab, setActiveTab] = useState('overview');
    const [isEditing, setIsEditing] = useState(isCreating);
    const [isSaving, setIsSaving] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        title: ticket?.title || '',
        description: ticket?.description || '',
        status: ticket?.status || 'open',
        priority: ticket?.priority || 'medium',
        category: ticket?.category || 'general',
        type: ticket?.type || 'internal',
        assignedToId: ticket?.assignedToId || null,
        clientId: ticket?.clientId || null,
        projectId: ticket?.projectId || null,
        dueDate: ticket?.dueDate || null,
        tags: ticket?.tags || []
    });

    // Comments state
    const [comments, setComments] = useState(ticket?.comments || []);
    const [newComment, setNewComment] = useState('');

    // Activity log state
    const [activityLog, setActivityLog] = useState(ticket?.activityLog || []);

    // Load full ticket data if we have an ID
    useEffect(() => {
        if (ticket?.id && !isCreating) {
            loadTicketDetails();
        }
    }, [ticket?.id]);

    const loadTicketDetails = async () => {
        try {
            if (!window.DatabaseAPI) return;
            
            const response = await window.DatabaseAPI.get(`/api/helpdesk/${ticket.id}`);
            if (response?.ticket) {
                const t = response.ticket;
                setFormData({
                    title: t.title || '',
                    description: t.description || '',
                    status: t.status || 'open',
                    priority: t.priority || 'medium',
                    category: t.category || 'general',
                    type: t.type || 'internal',
                    assignedToId: t.assignedToId || null,
                    clientId: t.clientId || null,
                    projectId: t.projectId || null,
                    dueDate: t.dueDate || null,
                    tags: t.tags || []
                });
                setComments(t.comments || []);
                setActivityLog(t.activityLog || []);
            }
        } catch (error) {
            console.error('Error loading ticket details:', error);
        }
    };

    // Handle form change
    const handleChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // Handle save
    const handleSave = async () => {
        if (!formData.title.trim()) {
            alert('Title is required');
            return;
        }

        setIsSaving(true);
        try {
            const ticketData = {
                ...formData,
                id: ticket?.id
            };
            
            if (onSave) {
                await onSave(ticketData);
            }
        } catch (error) {
            console.error('Error saving ticket:', error);
            alert(`Failed to save ticket: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Handle add comment
    const handleAddComment = async () => {
        if (!newComment.trim()) return;

        try {
            if (!window.DatabaseAPI) {
                throw new Error('DatabaseAPI not available');
            }

            const comment = {
                message: newComment,
                userId: window.useAuth?.()?.user?.id,
                userName: window.useAuth?.()?.user?.name || window.useAuth?.()?.user?.email,
                timestamp: new Date().toISOString(),
                isInternal: false
            };

            // Add comment via API
            if (ticket?.id) {
                await window.DatabaseAPI.post(`/api/helpdesk/${ticket.id}/comments`, { message: newComment });
            }

            // Update local state
            setComments(prev => [...prev, comment]);
            setNewComment('');

            // Reload ticket to get updated data
            if (ticket?.id) {
                await loadTicketDetails();
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            alert(`Failed to add comment: ${error.message}`);
        }
    };

    // Status color mapping
    const getStatusColorClasses = (status) => {
        const statusMap = {
            'open': 'bg-blue-100 text-blue-700 border-blue-200',
            'in-progress': 'bg-yellow-100 text-yellow-700 border-yellow-200',
            'resolved': 'bg-green-100 text-green-700 border-green-200',
            'closed': 'bg-gray-100 text-gray-700 border-gray-200',
            'cancelled': 'bg-red-100 text-red-700 border-red-200'
        };
        return statusMap[status] || 'bg-gray-100 text-gray-700 border-gray-200';
    };

    // Priority color mapping
    const getPriorityColorClasses = (priority) => {
        const priorityMap = {
            'low': 'bg-gray-100 text-gray-600',
            'medium': 'bg-blue-100 text-blue-600',
            'high': 'bg-orange-100 text-orange-600',
            'urgent': 'bg-red-100 text-red-600',
            'critical': 'bg-purple-100 text-purple-600'
        };
        return priorityMap[priority] || 'bg-gray-100 text-gray-600';
    };

    // Load users for assignment
    const [users, setUsers] = useState([]);
    const [clients, setClients] = useState([]);
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        loadUsers();
        if (formData.clientId) {
            loadProjectsForClient(formData.clientId);
        }
    }, []);

    const loadUsers = async () => {
        try {
            if (window.DatabaseAPI) {
                const response = await window.DatabaseAPI.get('/api/users');
                if (response?.users) {
                    setUsers(response.users);
                }
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    const loadProjectsForClient = async (clientId) => {
        try {
            if (window.DatabaseAPI && clientId) {
                const response = await window.DatabaseAPI.get(`/api/projects?clientId=${clientId}`);
                if (response?.projects) {
                    setProjects(response.projects);
                }
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    };

    const loadClients = async () => {
        try {
            if (window.DatabaseAPI) {
                const response = await window.DatabaseAPI.get('/api/clients');
                if (response?.clients) {
                    setClients(response.clients);
                }
            }
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    };

    useEffect(() => {
        loadClients();
    }, []);

    useEffect(() => {
        if (formData.clientId) {
            loadProjectsForClient(formData.clientId);
        } else {
            setProjects([]);
        }
    }, [formData.clientId]);

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <div 
                    className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75"
                    onClick={onClose}
                ></div>

                {/* Modal panel */}
                <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
                    {/* Header */}
                    <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    {isCreating ? 'Create Ticket' : ticket?.ticketNumber || 'Ticket Details'}
                                </h3>
                                {!isCreating && ticket?.title && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {ticket.title}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center space-x-2">
                                {!isCreating && !isEditing && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Edit
                                    </button>
                                )}
                                {isEditing && (
                                    <>
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                if (!isCreating) {
                                                    loadTicketDetails();
                                                }
                                            }}
                                            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {isSaving ? 'Saving...' : 'Save'}
                                        </button>
                                    </>
                                )}
                                {onDelete && !isCreating && (
                                    <button
                                        onClick={() => {
                                            if (confirm('Are you sure you want to delete this ticket?')) {
                                                onDelete();
                                            }
                                        }}
                                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                    >
                                        Delete
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200 dark:border-gray-600">
                        <nav className="flex -mb-px">
                            {['overview', 'comments', 'timeline'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                                        activeTab === tab
                                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-4 max-h-[calc(100vh-300px)] overflow-y-auto">
                        {activeTab === 'overview' && (
                            <div className="space-y-4">
                                {/* Title */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Title *
                                    </label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => handleChange('title', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                            placeholder="Enter ticket title"
                                        />
                                    ) : (
                                        <p className="text-gray-900 dark:text-white">{formData.title || '-'}</p>
                                    )}
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Description
                                    </label>
                                    {isEditing ? (
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => handleChange('description', e.target.value)}
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                            placeholder="Enter ticket description"
                                        />
                                    ) : (
                                        <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{formData.description || '-'}</p>
                                    )}
                                </div>

                                {/* Status, Priority, Category */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Status
                                        </label>
                                        {isEditing ? (
                                            <select
                                                value={formData.status}
                                                onChange={(e) => handleChange('status', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="open">Open</option>
                                                <option value="in-progress">In Progress</option>
                                                <option value="resolved">Resolved</option>
                                                <option value="closed">Closed</option>
                                                <option value="cancelled">Cancelled</option>
                                            </select>
                                        ) : (
                                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColorClasses(formData.status)}`}>
                                                {formData.status}
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Priority
                                        </label>
                                        {isEditing ? (
                                            <select
                                                value={formData.priority}
                                                onChange={(e) => handleChange('priority', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                                <option value="urgent">Urgent</option>
                                                <option value="critical">Critical</option>
                                            </select>
                                        ) : (
                                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColorClasses(formData.priority)}`}>
                                                {formData.priority}
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Category
                                        </label>
                                        {isEditing ? (
                                            <select
                                                value={formData.category}
                                                onChange={(e) => handleChange('category', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="general">General</option>
                                                <option value="technical">Technical</option>
                                                <option value="billing">Billing</option>
                                                <option value="support">Support</option>
                                                <option value="feature-request">Feature Request</option>
                                                <option value="bug">Bug</option>
                                            </select>
                                        ) : (
                                            <p className="text-gray-900 dark:text-white">{formData.category}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Assignment */}
                                {isEditing && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Assign To
                                        </label>
                                        <select
                                            value={formData.assignedToId || ''}
                                            onChange={(e) => handleChange('assignedToId', e.target.value || null)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Unassigned</option>
                                            {users.map(user => (
                                                <option key={user.id} value={user.id}>
                                                    {user.name || user.email}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Client & Project */}
                                {isEditing && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Client
                                            </label>
                                            <select
                                                value={formData.clientId || ''}
                                                onChange={(e) => {
                                                    handleChange('clientId', e.target.value || null);
                                                    handleChange('projectId', null);
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="">No Client</option>
                                                {clients.map(client => (
                                                    <option key={client.id} value={client.id}>
                                                        {client.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Project
                                            </label>
                                            <select
                                                value={formData.projectId || ''}
                                                onChange={(e) => handleChange('projectId', e.target.value || null)}
                                                disabled={!formData.clientId}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                            >
                                                <option value="">No Project</option>
                                                {projects.map(project => (
                                                    <option key={project.id} value={project.id}>
                                                        {project.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {/* Due Date */}
                                {isEditing && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Due Date
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.dueDate ? new Date(formData.dueDate).toISOString().split('T')[0] : ''}
                                            onChange={(e) => handleChange('dueDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'comments' && (
                            <div className="space-y-4">
                                {/* Comments List */}
                                <div className="space-y-4">
                                    {comments.length === 0 ? (
                                        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                                            No comments yet
                                        </p>
                                    ) : (
                                        comments.map((comment, index) => (
                                            <div key={index} className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                                <div className="flex items-start space-x-3">
                                                    <div className="flex-shrink-0">
                                                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm">
                                                            {comment.userName ? comment.userName.charAt(0).toUpperCase() : 'U'}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="font-medium text-gray-900 dark:text-white">
                                                                {comment.userName || 'Unknown'}
                                                            </span>
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                {comment.timestamp ? new Date(comment.timestamp).toLocaleString() : ''}
                                                            </span>
                                                        </div>
                                                        <p className="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                                                            {comment.message}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Add Comment */}
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        placeholder="Add a comment..."
                                    />
                                    <button
                                        onClick={handleAddComment}
                                        disabled={!newComment.trim()}
                                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Add Comment
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'timeline' && (
                            <div className="space-y-4">
                                {activityLog.length === 0 ? (
                                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                                        No activity yet
                                    </p>
                                ) : (
                                    <div className="space-y-4">
                                        {activityLog.map((activity, index) => (
                                            <div key={index} className="flex items-start space-x-3">
                                                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="font-medium text-gray-900 dark:text-white">
                                                            {activity.action}
                                                        </span>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {activity.timestamp ? new Date(activity.timestamp).toLocaleString() : ''}
                                                        </span>
                                                    </div>
                                                    {activity.userName && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                                            by {activity.userName}
                                                        </p>
                                                    )}
                                                    {activity.from && activity.to && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                                            {activity.from} → {activity.to}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Register component
window.TicketDetailModal = TicketDetailModal;

// Dispatch event
try {
    window.dispatchEvent(new CustomEvent('componentLoaded', { 
        detail: { component: 'TicketDetailModal' } 
    }));
    console.log('✅ TicketDetailModal component registered');
} catch (error) {
    console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
}

