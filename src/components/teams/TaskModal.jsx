// Get dependencies from window
const { useState, useEffect } = React;

const TaskModal = ({ isOpen, onClose, team, task, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        status: 'todo',
        priority: 'Medium',
        assigneeId: '',
        dueDate: '',
        tags: []
    });
    const [tagInput, setTagInput] = useState('');
    const [employees, setEmployees] = useState([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [isGoogleCalendarAuthenticated, setIsGoogleCalendarAuthenticated] = useState(false);
    const [isSyncingToGoogle, setIsSyncingToGoogle] = useState(false);
    const [googleEventId, setGoogleEventId] = useState(null);
    const [googleEventUrl, setGoogleEventUrl] = useState(null);

    useEffect(() => {
        if (task) {
            setFormData({
                title: task.title || '',
                description: task.description || '',
                status: task.status || 'todo',
                priority: task.priority || 'Medium',
                assigneeId: task.assigneeId || '',
                dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
                tags: Array.isArray(task.tags) ? task.tags : (typeof task.tags === 'string' ? JSON.parse(task.tags || '[]') : [])
            });
            setGoogleEventId(task.googleEventId || null);
            setGoogleEventUrl(task.googleEventUrl || null);
        } else {
            setFormData({
                title: '',
                description: '',
                status: 'todo',
                priority: 'Medium',
                assigneeId: '',
                dueDate: '',
                tags: []
            });
            setGoogleEventId(null);
            setGoogleEventUrl(null);
        }
    }, [task, isOpen]);

    // Check Google Calendar auth once
    useEffect(() => {
        const checkAuth = async () => {
            try {
                if (window.GoogleCalendarService) {
                    const authed = await window.GoogleCalendarService.checkAuthentication();
                    setIsGoogleCalendarAuthenticated(authed);
                }
            } catch (e) {
                console.warn('Google Calendar auth check failed:', e?.message || e);
            }
        };
        if (isOpen) checkAuth();
    }, [isOpen]);

    // Load employees when modal opens
    useEffect(() => {
        if (isOpen) {
            loadEmployees();
        }
    }, [isOpen]);

    const loadEmployees = async () => {
        try {
            setLoadingEmployees(true);
            const token = window.storage?.getToken?.();
            if (!token) {
                console.error('❌ No token available');
                setEmployees([]);
                setLoadingEmployees(false);
                return;
            }

            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const responseData = await response.json();
                const userData = responseData.data?.users || responseData.users || [];
                console.log('✅ Loaded employees for TaskModal:', userData.length);
                setEmployees(userData);
            } else {
                console.error('❌ Failed to load users:', response);
                setEmployees([]);
            }
        } catch (error) {
            console.error('❌ TaskModal: Error loading employees:', error);
            setEmployees([]);
        } finally {
            setLoadingEmployees(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddTag = () => {
        if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
            setFormData(prev => ({
                ...prev,
                tags: [...prev.tags, tagInput.trim()]
            }));
            setTagInput('');
        }
    };

    const handleRemoveTag = (tag) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t !== tag)
        }));
    };

    const handleGoogleCalendarAuth = async () => {
        setIsSyncingToGoogle(true);
        try {
            if (window.GoogleCalendarService) {
                await window.GoogleCalendarService.openAuthPopup();
                setIsGoogleCalendarAuthenticated(true);
            } else {
                alert('Google Calendar service not available. Please refresh the page.');
            }
        } catch (error) {
            console.error('Google Calendar authentication error:', error);
            alert('Failed to authenticate with Google Calendar.');
        } finally {
            setIsSyncingToGoogle(false);
        }
    };

    const handleSyncToGoogleCalendar = async () => {
        if (!formData.dueDate) {
            alert('Set a due date to sync this task to Google Calendar.');
            return;
        }
        if (!isGoogleCalendarAuthenticated) {
            await handleGoogleCalendarAuth();
            return;
        }
        setIsSyncingToGoogle(true);
        try {
            if (!window.GoogleCalendarService) {
                alert('Google Calendar service not available. Please refresh the page.');
                return;
            }
            const assignee = employees.find(e => String(e.id) === String(formData.assigneeId));
            const eventData = {
                id: task?.id || 'new',
                title: formData.title,
                description: `${formData.description || ''}${team?.name ? `\nTeam: ${team.name}` : ''}${assignee ? `\nAssignee: ${assignee.name || assignee.email}` : ''}`,
                date: formData.dueDate,
                time: '09:00',
                clientName: team?.name || '',
                clientId: team?.id || '',
                type: 'Team Task'
            };
            let googleEvent;
            if (googleEventId) {
                googleEvent = await window.GoogleCalendarService.updateEvent(googleEventId, {
                    summary: eventData.title,
                    description: eventData.description,
                    start: {
                        dateTime: window.GoogleCalendarService.formatDateTime(eventData.date, eventData.time),
                        timeZone: 'Africa/Johannesburg'
                    },
                    end: {
                        dateTime: window.GoogleCalendarService.formatDateTime(
                            eventData.date,
                            window.GoogleCalendarService.getEndTime(eventData.time)
                        ),
                        timeZone: 'Africa/Johannesburg'
                    }
                });
            } else {
                googleEvent = await window.GoogleCalendarService.createEvent(eventData);
            }
            setGoogleEventId(googleEvent.id);
            setGoogleEventUrl(googleEvent.htmlLink || googleEvent.url || null);
        } catch (error) {
            console.error('Failed to sync team task to Google Calendar:', error);
            alert('Failed to sync to Google Calendar.');
        } finally {
            setIsSyncingToGoogle(false);
        }
    };

    const handleRemoveFromGoogleCalendar = async () => {
        if (!googleEventId) return;
        if (!confirm('Remove this task from Google Calendar?')) return;
        setIsSyncingToGoogle(true);
        try {
            if (window.GoogleCalendarService) {
                await window.GoogleCalendarService.deleteEvent(googleEventId);
                setGoogleEventId(null);
                setGoogleEventUrl(null);
            }
        } catch (error) {
            console.error('Failed to remove Google Calendar event:', error);
            alert('Failed to remove from Google Calendar.');
        } finally {
            setIsSyncingToGoogle(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!formData.title.trim()) {
            alert('Please enter a task title');
            return;
        }

        const taskData = {
            ...formData,
            id: task?.id || Date.now().toString(),
            team: team.id,
            tags: typeof formData.tags === 'string' ? formData.tags : JSON.stringify(formData.tags),
            attachments: typeof formData.attachments === 'string' ? formData.attachments : JSON.stringify(formData.attachments || []),
            dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
            googleEventId: googleEventId || null,
            googleEventUrl: googleEventUrl || null,
            createdAt: task?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        onSave(taskData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 dark:bg-slate-800 dark:border-slate-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                        {task ? 'Edit Task' : 'Create New Task'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition dark:hover:text-gray-300"
                    >
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Enter task title"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Description
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows="4"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Enter task description"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Status
                            </label>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="todo">To Do</option>
                                <option value="in-progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="blocked">Blocked</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Priority
                            </label>
                            <select
                                name="priority"
                                value={formData.priority}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                                <option value="Critical">Critical</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Assignee
                            </label>
                            {loadingEmployees ? (
                                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 dark:bg-slate-700 dark:border-slate-600 text-gray-500 dark:text-slate-400 text-sm">
                                    Loading employee details...
                                </div>
                            ) : (
                                <select
                                    name="assigneeId"
                                    value={formData.assigneeId}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                >
                                    <option value="">Select an assignee</option>
                                    {employees.map((employee) => (
                                        <option key={employee.id} value={employee.id}>
                                            {employee.name || employee.email || employee.id}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Due Date
                            </label>
                            <input
                                type="date"
                                name="dueDate"
                                value={formData.dueDate}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Tags
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddTag();
                                    }
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="Add tag and press Enter"
                            />
                            <button
                                type="button"
                                onClick={handleAddTag}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {formData.tags.map((tag, idx) => (
                                <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs dark:bg-primary-900 dark:text-primary-300"
                                >
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTag(tag)}
                                        className="text-primary-700 hover:text-primary-900 dark:text-primary-300 dark:hover:text-primary-100"
                                    >
                                        <i className="fas fa-times text-xs"></i>
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Google Calendar Sync */}
                    <div className="p-3 rounded-lg border border-gray-200 dark:border-slate-700">
                        <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-slate-300">
                            <i className="fab fa-google mr-2"></i>Google Calendar
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                            {googleEventId ? (
                                <>
                                    <span className="text-sm text-green-600 dark:text-green-400">
                                        <i className="fas fa-check-circle mr-1"></i>Synced
                                    </span>
                                    {googleEventUrl && (
                                        <a
                                            href={googleEventUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
                                        >
                                            <i className="fas fa-external-link-alt mr-1"></i>Open
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSyncToGoogleCalendar}
                                        disabled={isSyncingToGoogle || !formData.dueDate}
                                        className="text-sm px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                                    >
                                        <i className={`fas ${isSyncingToGoogle ? 'fa-spinner fa-spin' : 'fa-sync-alt'} mr-1`}></i>
                                        {isSyncingToGoogle ? 'Syncing...' : 'Update'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRemoveFromGoogleCalendar}
                                        disabled={isSyncingToGoogle}
                                        className="text-sm px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
                                    >
                                        <i className="fas fa-trash mr-1"></i>Remove
                                    </button>
                                </>
                            ) : (
                                <>
                                    {!isGoogleCalendarAuthenticated ? (
                                        <button
                                            type="button"
                                            onClick={handleGoogleCalendarAuth}
                                            disabled={isSyncingToGoogle}
                                            className="text-sm px-3 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-600 dark:text-white dark:hover:bg-green-700"
                                        >
                                            <i className={`fab fa-google mr-1 ${isSyncingToGoogle ? 'fa-spinner fa-spin' : ''}`}></i>
                                            {isSyncingToGoogle ? 'Connecting...' : 'Connect Google Calendar'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleSyncToGoogleCalendar}
                                            disabled={isSyncingToGoogle || !formData.dueDate}
                                            className="text-sm px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
                                        >
                                            <i className={`fas ${isSyncingToGoogle ? 'fa-spinner fa-spin' : 'fa-calendar-plus'} mr-1`}></i>
                                            {isSyncingToGoogle ? 'Syncing...' : 'Sync to Google Calendar'}
                                        </button>
                                    )}
                                    {!formData.dueDate && (
                                        <span className="text-xs text-gray-500 dark:text-slate-400">(Set a due date to enable sync)</span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-3 border-t border-gray-200 dark:border-slate-700 pt-3 -mt-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                        >
                            {task ? 'Update Task' : 'Create Task'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.TaskModal = TaskModal;

