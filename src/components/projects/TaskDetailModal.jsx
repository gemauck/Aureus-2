// Get React hooks from window
const { useState } = React;

const TaskDetailModal = ({ 
    task, 
    parentTask, 
    customFieldDefinitions, 
    taskLists,
    onUpdate, 
    onClose,
    onAddSubtask,
    onViewSubtask,
    onDeleteSubtask
}) => {
    const isCreating = !task || !task.id;
    const isSubtask = !!parentTask;
    
    const [activeTab, setActiveTab] = useState('details'); // details, comments, attachments, checklist
    const [editedTask, setEditedTask] = useState(task || {
        title: '',
        description: '',
        assignee: 'Gareth Mauck',
        dueDate: '',
        priority: 'Medium',
        listId: task?.listId || (taskLists && taskLists[0]?.id) || 1,
        customFields: {},
        comments: [],
        attachments: [],
        subtasks: [],
        checklist: [],
        tags: [],
        estimatedHours: '',
        actualHours: '',
        status: 'To Do',
        blockedBy: '',
        dependencies: []
    });
    const [newComment, setNewComment] = useState('');
    const [comments, setComments] = useState(task?.comments || []);
    const [attachments, setAttachments] = useState(task?.attachments || []);
    const [checklist, setChecklist] = useState(task?.checklist || []);
    const [newChecklistItem, setNewChecklistItem] = useState('');
    const [newTag, setNewTag] = useState('');
    const [tags, setTags] = useState(task?.tags || []);

    const handleSave = () => {
        const title = (editedTask && typeof editedTask.title === 'string') ? editedTask.title : '';
        if (!title.trim()) {
            alert('Please enter a task title');
            return;
        }

        onUpdate({
            ...editedTask,
            comments,
            attachments,
            subtasks: editedTask.subtasks || [],
            checklist,
            tags,
            id: editedTask.id || Date.now()
        });
        onClose();
    };

    const handleAddComment = () => {
        if (newComment.trim()) {
            // Get current user info
            const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
            
            const comment = {
                id: Date.now(),
                text: newComment,
                author: currentUser.name,
                authorEmail: currentUser.email,
                authorId: currentUser.id,
                timestamp: new Date().toISOString(),
                date: new Date().toLocaleString()
            };
            setComments([...comments, comment]);
            setNewComment('');
        }
    };

    const handleDeleteComment = (commentId) => {
        if (confirm('Delete this comment?')) {
            setComments(comments.filter(c => c.id !== commentId));
        }
    };

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files);
        const newAttachments = files.map(file => ({
            id: Date.now() + Math.random(),
            name: file.name,
            size: file.size,
            type: file.type,
            uploadDate: new Date().toISOString(),
            url: URL.createObjectURL(file)
        }));
        setAttachments([...attachments, ...newAttachments]);
    };

    const handleDeleteAttachment = (attachmentId) => {
        if (confirm('Delete this attachment?')) {
            setAttachments(attachments.filter(a => a.id !== attachmentId));
        }
    };

    const handleAddChecklistItem = () => {
        if (newChecklistItem.trim()) {
            const item = {
                id: Date.now(),
                text: newChecklistItem,
                completed: false
            };
            setChecklist([...checklist, item]);
            setNewChecklistItem('');
        }
    };

    const handleToggleChecklistItem = (itemId) => {
        setChecklist(checklist.map(item =>
            item.id === itemId ? { ...item, completed: !item.completed } : item
        ));
    };

    const handleDeleteChecklistItem = (itemId) => {
        setChecklist(checklist.filter(item => item.id !== itemId));
    };

    const handleAddTag = () => {
        if (newTag.trim() && !tags.includes(newTag.trim())) {
            setTags([...tags, newTag.trim()]);
            setNewTag('');
        }
    };

    const handleRemoveTag = (tag) => {
        setTags(tags.filter(t => t !== tag));
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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

    const getCompletionPercentage = () => {
        if (checklist.length === 0) return 0;
        const completed = checklist.filter(item => item.completed).length;
        return Math.round((completed / checklist.length) * 100);
    };

    const subtasks = editedTask.subtasks || [];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 px-4 py-3">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            {parentTask && (
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-gray-500">
                                        <i className="fas fa-level-up-alt fa-rotate-90 mr-1"></i>
                                        {isCreating ? 'New Subtask of' : 'Subtask of'}: {parentTask.title}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-2 mb-1.5">
                                <input
                                    type="text"
                                    value={editedTask.title}
                                    onChange={(e) => setEditedTask({...editedTask, title: e.target.value})}
                                    className="text-lg font-semibold text-gray-800 w-full border-0 border-b-2 border-transparent hover:border-gray-300 focus:border-primary-500 outline-none px-2 -mx-2"
                                    placeholder={isCreating ? "Enter task title..." : "Task title..."}
                                    autoFocus={isCreating}
                                />
                            </div>
                            {/* Tags Display */}
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {tags.map((tag, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-medium">
                                            <i className="fas fa-tag"></i>
                                            {tag}
                                            <button
                                                onClick={() => handleRemoveTag(tag)}
                                                className="hover:text-purple-900"
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-3 p-1 hover:bg-gray-100 rounded transition-colors">
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex">
                    {/* Left Side - Main Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {/* Tabs */}
                        <div className="flex gap-3 border-b border-gray-200 mb-4 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`pb-2 px-1.5 text-sm font-medium transition whitespace-nowrap ${
                                    activeTab === 'details'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                <i className="fas fa-info-circle mr-1.5"></i>
                                Details
                            </button>
                            <button
                                onClick={() => setActiveTab('checklist')}
                                className={`pb-2 px-1.5 text-sm font-medium transition whitespace-nowrap ${
                                    activeTab === 'checklist'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                <i className="fas fa-check-square mr-1.5"></i>
                                Checklist ({checklist.filter(i => i.completed).length}/{checklist.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('comments')}
                                className={`pb-2 px-1.5 text-sm font-medium transition whitespace-nowrap ${
                                    activeTab === 'comments'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                <i className="fas fa-comments mr-1.5"></i>
                                Comments ({comments.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('attachments')}
                                className={`pb-2 px-1.5 text-sm font-medium transition whitespace-nowrap ${
                                    activeTab === 'attachments'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                <i className="fas fa-paperclip mr-1.5"></i>
                                Attachments ({attachments.length})
                            </button>
                        </div>

                        {/* Tab Content */}
                        {activeTab === 'details' && (
                            <div className="space-y-4">
                                {/* Description */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        <i className="fas fa-align-left mr-1.5 text-gray-400"></i>
                                        Description
                                    </label>
                                    <textarea
                                        value={editedTask.description || ''}
                                        onChange={(e) => setEditedTask({...editedTask, description: e.target.value})}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg min-h-[120px] focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Add a detailed description..."
                                    ></textarea>
                                </div>

                                {/* Custom Fields */}
                                {customFieldDefinitions && customFieldDefinitions.length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-medium text-gray-700 mb-2">Custom Fields</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {customFieldDefinitions.map(field => (
                                                <div key={field.name}>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                                        {field.name}
                                                    </label>
                                                    {field.type === 'text' && (
                                                        <input
                                                            type="text"
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}
                                                    {field.type === 'number' && (
                                                        <input
                                                            type="number"
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}
                                                    {field.type === 'date' && (
                                                        <input
                                                            type="date"
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}
                                                    {field.type === 'select' && (
                                                        <select
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        >
                                                            <option value="">Select...</option>
                                                            {field.options.map((option, idx) => (
                                                                <option key={idx} value={option}>{option}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    {field.type === 'status' && (
                                                        <select
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        >
                                                            <option value="">Select Status...</option>
                                                            {field.options.map((option, idx) => (
                                                                <option key={idx} value={option}>{option}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Subtasks Section */}
                                {!isCreating && !isSubtask && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xs font-medium text-gray-700">
                                                <i className="fas fa-tasks mr-1.5 text-gray-400"></i>
                                                Subtasks ({subtasks.length})
                                            </h3>
                                            {onAddSubtask && (
                                                <button
                                                    onClick={() => {
                                                        handleSave();
                                                        setTimeout(() => onAddSubtask(editedTask), 100);
                                                    }}
                                                    className="px-2.5 py-1 bg-primary-600 text-white text-[10px] rounded hover:bg-primary-700 transition font-medium"
                                                >
                                                    <i className="fas fa-plus mr-1"></i>
                                                    Add Subtask
                                                </button>
                                            )}
                                        </div>
                                        
                                        {subtasks.length === 0 ? (
                                            <div className="text-center py-6 bg-gray-50 rounded-lg border border-gray-200">
                                                <i className="fas fa-tasks text-2xl text-gray-400 mb-1.5"></i>
                                                <p className="text-gray-500 text-xs">No subtasks yet</p>
                                                {onAddSubtask && (
                                                    <button
                                                        onClick={() => {
                                                            handleSave();
                                                            setTimeout(() => onAddSubtask(editedTask), 100);
                                                        }}
                                                        className="mt-2.5 px-3 py-1.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 font-medium"
                                                    >
                                                        Add First Subtask
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {subtasks.map(subtask => (
                                                    <div 
                                                        key={subtask.id} 
                                                        className="bg-gray-50 rounded-lg p-2.5 border border-gray-200 hover:border-primary-300 transition cursor-pointer"
                                                        onClick={() => {
                                                            if (onViewSubtask) {
                                                                handleSave();
                                                                setTimeout(() => onViewSubtask(subtask, editedTask), 100);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                                    <i className="fas fa-level-up-alt fa-rotate-90 text-gray-400 text-[10px]"></i>
                                                                    <span className="font-medium text-gray-800 text-xs">{subtask.title}</span>
                                                                </div>
                                                                {subtask.description && (
                                                                    <p className="text-[10px] text-gray-500 ml-4 mb-1.5">{subtask.description}</p>
                                                                )}
                                                                <div className="flex items-center gap-2 ml-4 text-[10px] text-gray-500">
                                                                    <span>
                                                                        <i className="fas fa-user mr-0.5"></i>
                                                                        {subtask.assignee}
                                                                    </span>
                                                                    {subtask.dueDate && (
                                                                        <span>
                                                                            <i className="fas fa-calendar mr-0.5"></i>
                                                                            {subtask.dueDate}
                                                                        </span>
                                                                    )}
                                                                    <span className={`px-1.5 py-0.5 rounded ${getPriorityColor(subtask.priority)}`}>
                                                                        {subtask.priority}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {onDeleteSubtask && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (confirm('Delete this subtask?')) {
                                                                            onDeleteSubtask(editedTask.id, subtask.id);
                                                                        }
                                                                    }}
                                                                    className="text-gray-400 hover:text-red-600 p-1"
                                                                    title="Delete Subtask"
                                                                >
                                                                    <i className="fas fa-trash text-xs"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'checklist' && (
                            <div className="space-y-3">
                                {/* Progress Bar */}
                                {checklist.length > 0 && (
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-xs font-medium text-gray-700">Progress</span>
                                            <span className="text-xs font-semibold text-primary-600">{getCompletionPercentage()}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div 
                                                className="bg-primary-600 h-2 rounded-full transition-all" 
                                                style={{width: `${getCompletionPercentage()}%`}}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                {/* Add Checklist Item */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newChecklistItem}
                                        onChange={(e) => setNewChecklistItem(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Add checklist item..."
                                    />
                                    <button
                                        onClick={handleAddChecklistItem}
                                        className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                    >
                                        <i className="fas fa-plus"></i>
                                    </button>
                                </div>

                                {/* Checklist Items */}
                                <div className="space-y-1.5">
                                    {checklist.length === 0 ? (
                                        <div className="text-center py-6 text-gray-500">
                                            <i className="fas fa-check-square text-3xl mb-1.5"></i>
                                            <p className="text-sm">No checklist items yet</p>
                                        </div>
                                    ) : (
                                        checklist.map(item => (
                                            <div key={item.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                                                <input
                                                    type="checkbox"
                                                    checked={item.completed}
                                                    onChange={() => handleToggleChecklistItem(item.id)}
                                                    className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                                                />
                                                <span className={`flex-1 text-sm ${item.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                                                    {item.text}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteChecklistItem(item.id)}
                                                    className="text-gray-400 hover:text-red-600 p-1"
                                                >
                                                    <i className="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'comments' && (
                            <div className="space-y-3">
                                {/* Add Comment */}
                                <div>
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows="3"
                                        placeholder="Add a comment..."
                                    ></textarea>
                                    <div className="mt-1.5 flex justify-end">
                                        <button
                                            onClick={handleAddComment}
                                            className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
                                        >
                                            <i className="fas fa-comment mr-1.5"></i>
                                            Add Comment
                                        </button>
                                    </div>
                                </div>

                                {/* Comments List */}
                                <div className="space-y-2">
                                    {comments.length === 0 ? (
                                        <div className="text-center py-6 text-gray-500">
                                            <i className="fas fa-comments text-3xl mb-1.5"></i>
                                            <p className="text-sm">No comments yet</p>
                                        </div>
                                    ) : (
                                        comments.map(comment => (
                                            <div key={comment.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                                <div className="flex items-start justify-between mb-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-[10px]">
                                                            {comment.author.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-800 text-xs">{comment.author}</div>
                                                            <div className="text-[10px] text-gray-500">{comment.date}</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteComment(comment.id)}
                                                        className="text-gray-400 hover:text-red-600 p-0.5"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                                <p className="text-gray-700 text-xs whitespace-pre-wrap">{comment.text}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'attachments' && (
                            <div className="space-y-3">
                                {/* Upload */}
                                <div>
                                    <label className="block w-full px-3 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition cursor-pointer text-center">
                                        <input
                                            type="file"
                                            multiple
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                        <i className="fas fa-cloud-upload-alt text-3xl text-gray-400 mb-1.5"></i>
                                        <p className="text-sm text-gray-600">Click to upload files or drag and drop</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Any file type supported</p>
                                    </label>
                                </div>

                                {/* Attachments List */}
                                <div className="space-y-1.5">
                                    {attachments.length === 0 ? (
                                        <div className="text-center py-6 text-gray-500">
                                            <i className="fas fa-paperclip text-3xl mb-1.5"></i>
                                            <p className="text-sm">No attachments yet</p>
                                        </div>
                                    ) : (
                                        attachments.map(attachment => (
                                            <div key={attachment.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <div className="w-8 h-8 bg-primary-100 rounded flex items-center justify-center flex-shrink-0">
                                                        <i className="fas fa-file text-primary-600 text-xs"></i>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-gray-800 text-xs truncate">{attachment.name}</div>
                                                        <div className="text-[10px] text-gray-500">{formatFileSize(attachment.size)}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 ml-2">
                                                    <a
                                                        href={attachment.url}
                                                        download={attachment.name}
                                                        className="text-primary-600 hover:text-primary-800 p-1.5"
                                                        title="Download"
                                                    >
                                                        <i className="fas fa-download text-xs"></i>
                                                    </a>
                                                    <button
                                                        onClick={() => handleDeleteAttachment(attachment.id)}
                                                        className="text-red-600 hover:text-red-800 p-1.5"
                                                        title="Delete"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar - Task Properties */}
                    <div className="w-72 border-l border-gray-200 p-4 bg-gray-50 overflow-y-auto">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-800">Task Properties</h3>
                            <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium">
                                <i className="fas fa-pencil-alt mr-0.5"></i>
                                Editable
                            </span>
                        </div>
                        
                        <div className="space-y-3">
                            {/* List Selection */}
                            {isCreating && !parentTask && taskLists && taskLists.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        <i className="fas fa-list mr-1.5 text-gray-400"></i>
                                        List
                                    </label>
                                    <select
                                        value={editedTask.listId}
                                        onChange={(e) => setEditedTask({...editedTask, listId: parseInt(e.target.value)})}
                                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    >
                                        {taskLists.map(list => (
                                            <option key={list.id} value={list.id}>{list.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Status */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    <i className="fas fa-flag mr-1.5 text-gray-400"></i>
                                    Status
                                </label>
                                <select
                                    value={editedTask.status}
                                    onChange={(e) => setEditedTask({...editedTask, status: e.target.value})}
                                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    <option>To Do</option>
                                    <option>In Progress</option>
                                    <option>Done</option>
                                </select>
                                <div className="mt-1.5">
                                    <span className={`px-1.5 py-0.5 text-[10px] rounded ${getStatusColor(editedTask.status)} font-medium`}>
                                        {editedTask.status}
                                    </span>
                                </div>
                            </div>

                            {/* Assignee */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    <i className="fas fa-user mr-1.5 text-gray-400"></i>
                                    Assignee
                                </label>
                                <select
                                    value={editedTask.assignee}
                                    onChange={(e) => setEditedTask({...editedTask, assignee: e.target.value})}
                                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    <option value="">Unassigned</option>
                                    <option>Gareth Mauck</option>
                                    <option>David Buttemer</option>
                                </select>
                            </div>

                            {/* Due Date */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    <i className="fas fa-calendar mr-1.5 text-gray-400"></i>
                                    Due Date
                                </label>
                                <input
                                    type="date"
                                    value={editedTask.dueDate}
                                    onChange={(e) => setEditedTask({...editedTask, dueDate: e.target.value})}
                                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>

                            {/* Priority */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    <i className="fas fa-exclamation-circle mr-1.5 text-gray-400"></i>
                                    Priority
                                </label>
                                <select
                                    value={editedTask.priority}
                                    onChange={(e) => setEditedTask({...editedTask, priority: e.target.value})}
                                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    <option>Low</option>
                                    <option>Medium</option>
                                    <option>High</option>
                                </select>
                                <div className="mt-1.5">
                                    <span className={`px-1.5 py-0.5 text-[10px] rounded ${getPriorityColor(editedTask.priority)} font-medium`}>
                                        {editedTask.priority}
                                    </span>
                                </div>
                            </div>

                            {/* Time Tracking */}
                            <div className="pt-3 border-t border-gray-200">
                                <h4 className="text-xs font-medium text-gray-700 mb-2">
                                    <i className="fas fa-clock mr-1.5 text-gray-400"></i>
                                    Time Tracking
                                </h4>
                                <div className="space-y-2">
                                    <div>
                                        <label className="block text-[10px] text-gray-600 mb-1">Estimated Hours</label>
                                        <input
                                            type="number"
                                            value={editedTask.estimatedHours}
                                            onChange={(e) => setEditedTask({...editedTask, estimatedHours: e.target.value})}
                                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            placeholder="0"
                                            step="0.5"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-600 mb-1">Actual Hours</label>
                                        <input
                                            type="number"
                                            value={editedTask.actualHours}
                                            onChange={(e) => setEditedTask({...editedTask, actualHours: e.target.value})}
                                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            placeholder="0"
                                            step="0.5"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="pt-3 border-t border-gray-200">
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    <i className="fas fa-tags mr-1.5 text-gray-400"></i>
                                    Tags
                                </label>
                                <div className="flex gap-1 mb-2">
                                    <input
                                        type="text"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                                        className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Add tag..."
                                    />
                                    <button
                                        onClick={handleAddTag}
                                        className="px-2.5 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs"
                                    >
                                        <i className="fas fa-plus"></i>
                                    </button>
                                </div>
                            </div>

                            {/* Blocked By */}
                            <div className="pt-3 border-t border-gray-200">
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    <i className="fas fa-ban mr-1.5 text-gray-400"></i>
                                    Blocked By
                                </label>
                                <input
                                    type="text"
                                    value={editedTask.blockedBy}
                                    onChange={(e) => setEditedTask({...editedTask, blockedBy: e.target.value})}
                                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="What's blocking this?"
                                />
                            </div>

                            {/* Dates Info */}
                            {!isCreating && (
                                <div className="pt-3 border-t border-gray-200">
                                    <div className="text-[10px] text-gray-500 space-y-0.5">
                                        <div>
                                            <i className="fas fa-plus-circle mr-1"></i>
                                            Created: {new Date(task.id).toLocaleDateString()}
                                        </div>
                                        <div>
                                            <i className="fas fa-edit mr-1"></i>
                                            Last Updated: {new Date().toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-4 py-2.5 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                    >
                        <i className={`fas ${isCreating ? 'fa-plus' : 'fa-save'} mr-1.5`}></i>
                        {isCreating ? 'Create Task' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.TaskDetailModal = TaskDetailModal;
