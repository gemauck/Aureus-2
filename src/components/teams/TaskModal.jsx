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
        }
    }, [task, isOpen]);

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

                    <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
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

