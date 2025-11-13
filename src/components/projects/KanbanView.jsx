// Kanban Board View Component
// This component is used by ProjectDetail to show tasks in a Kanban board layout

const KanbanView = ({ 
    tasks, 
    statusColumns = [], // Array of { value, label } objects
    onViewTaskDetail,
    onAddTask,
    onDeleteTask,
    onUpdateTaskStatus, // Function to update task status when dragged
    getStatusColor, // Function to get status color class
    getPriorityColor, // Function to get priority color class
    getDueDateMeta // Function to get due date metadata
}) => {
    // Default status columns if not provided
    const defaultStatusColumns = [
        { value: 'to do', label: 'To Do' },
        { value: 'in progress', label: 'In Progress' },
        { value: 'review', label: 'Review' },
        { value: 'blocked', label: 'Blocked' },
        { value: 'done', label: 'Done' }
    ];
    
    const columns = statusColumns.length > 0 ? statusColumns : defaultStatusColumns;
    
    // Default color mapping
    const getDefaultStatusColor = (statusLabel) => {
        const statusLower = String(statusLabel || '').toLowerCase();
        if (statusLower.includes('done') || statusLower.includes('complete')) return 'bg-green-100 text-green-800 border-green-500';
        if (statusLower.includes('progress')) return 'bg-blue-100 text-blue-800 border-blue-500';
        if (statusLower.includes('review')) return 'bg-purple-100 text-purple-800 border-purple-500';
        if (statusLower.includes('blocked')) return 'bg-red-100 text-red-800 border-red-500';
        return 'bg-gray-100 text-gray-800 border-gray-500';
    };
    
    const statusColorFn = getStatusColor || getDefaultStatusColor;
    
    // Default priority color
    const getDefaultPriorityColor = (priority) => {
        switch(String(priority || '').toLowerCase()) {
            case 'high': return 'bg-red-100 text-red-800';
            case 'medium': return 'bg-yellow-100 text-yellow-800';
            case 'low': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };
    
    const priorityColorFn = getPriorityColor || getDefaultPriorityColor;
    
    // Default due date meta
    const getDefaultDueDateMeta = (dueDate) => {
        if (!dueDate) return { label: 'No due date', pillClass: 'bg-gray-100 text-gray-600' };
        const due = new Date(dueDate);
        const now = new Date();
        const diff = due - now;
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        
        if (days < 0) return { label: 'Overdue', pillClass: 'bg-red-100 text-red-700' };
        if (days === 0) return { label: 'Due today', pillClass: 'bg-yellow-100 text-yellow-700' };
        if (days <= 3) return { label: `Due in ${days} days`, pillClass: 'bg-orange-100 text-orange-700' };
        return { label: due.toLocaleDateString(), pillClass: 'bg-gray-100 text-gray-600' };
    };
    
    const dueDateMetaFn = getDueDateMeta || getDefaultDueDateMeta;

    // Group tasks by status - case-insensitive matching with both value and label
    const tasksByStatus = columns.map(column => ({
        column,
        tasks: tasks.filter(t => {
            const taskStatus = String(t.status || 'To Do').toLowerCase().trim();
            const columnValue = String(column.value || '').toLowerCase().trim();
            const columnLabel = String(column.label || '').toLowerCase().trim();
            // Match against both column value and label for flexibility
            return taskStatus === columnValue || taskStatus === columnLabel;
        })
    }));

    const handleDragStart = (e, task) => {
        e.dataTransfer.setData('taskId', task.id.toString());
        e.dataTransfer.setData('isSubtask', 'false');
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.currentTarget.classList.add('border-primary-500', 'bg-primary-50');
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('border-primary-500', 'bg-primary-50');
    };

    const handleDrop = (e, newStatus) => {
        e.preventDefault();
        e.currentTarget.classList.remove('border-primary-500', 'bg-primary-50');

        const taskIdStr = e.dataTransfer.getData('taskId');
        const taskId = taskIdStr ? (isNaN(parseInt(taskIdStr)) ? taskIdStr : parseInt(taskIdStr)) : null;
        const isSubtask = e.dataTransfer.getData('isSubtask') === 'true';
        const parentIdStr = e.dataTransfer.getData('parentId');
        const parentId = parentIdStr ? (isNaN(parseInt(parentIdStr)) ? parentIdStr : parseInt(parentIdStr)) : null;

        if (onUpdateTaskStatus && taskId) {
            // Pass the column label (which is what's displayed) - the handler will normalize it
            onUpdateTaskStatus(taskId, newStatus, { isSubtask, parentId });
        }
    };

    return (
        <div className="flex gap-3 overflow-x-auto pb-4">
            {tasksByStatus.map(({ column, tasks: statusTasks }) => {
                const statusColorClass = statusColorFn(column.label);
                
                return (
                    <div 
                        key={column.value} 
                        className="flex-shrink-0 w-72"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, column.label)}
                    >
                        {/* Column Header */}
                        <div className={`${statusColorClass} rounded-t-lg px-3 py-2.5 border-b-2`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-current opacity-75"></div>
                                    <h3 className="text-sm font-semibold">{column.label}</h3>
                                    <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-white/50 font-medium">
                                        {statusTasks.length}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Task Cards */}
                        <div className="bg-gray-50 rounded-b-lg p-2 min-h-[400px] space-y-2 border-2 border-gray-200">
                            {statusTasks.length === 0 ? (
                                <div className="text-center py-6 text-gray-400">
                                    <i className="fas fa-inbox text-2xl mb-1"></i>
                                    <p className="text-xs">No tasks</p>
                                </div>
                            ) : (
                                statusTasks.map(task => {
                                    const dueMeta = dueDateMetaFn(task.dueDate);
                                    return (
                                        <div
                                            key={task.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, task)}
                                            className="bg-white rounded-lg p-3 hover:shadow-md transition-shadow cursor-move border border-gray-200 hover:border-primary-300"
                                            onClick={() => onViewTaskDetail && onViewTaskDetail(task)}
                                        >
                                            {/* Task Title */}
                                            <div className="text-sm font-medium text-gray-900 mb-1.5">{task.title || 'Untitled'}</div>

                                            {/* Task Description (truncated) */}
                                            {task.description && (
                                                <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                                                    {task.description}
                                                </p>
                                            )}

                                            {/* Task Metadata */}
                                            <div className="space-y-1.5">
                                                {/* Priority & Due Date */}
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {task.priority && (
                                                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${priorityColorFn(task.priority)} font-medium`}>
                                                            {task.priority}
                                                        </span>
                                                    )}
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${dueMeta.pillClass}`}>
                                                        <i className="fas fa-calendar text-[9px]"></i>
                                                        {dueMeta.label}
                                                    </span>
                                                </div>

                                                {/* Assignee */}
                                                {task.assignee && (
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center text-white text-[10px] font-semibold">
                                                            {String(task.assignee).charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-[10px] text-gray-600">{task.assignee}</span>
                                                    </div>
                                                )}

                                                {/* Subtasks count */}
                                                {task.subtasks && task.subtasks.length > 0 && (
                                                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                        <i className="fas fa-tasks"></i>
                                                        {task.subtasks.length} subtask{task.subtasks.length > 1 ? 's' : ''}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                                                <div className="text-[10px] text-gray-400">
                                                    <i className="fas fa-clock mr-0.5"></i>
                                                    {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : 'No date'}
                                                </div>
                                                {onDeleteTask && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeleteTask(task.id);
                                                        }}
                                                        className="text-gray-400 hover:text-red-600 transition p-0.5"
                                                        title="Delete Task"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}

                            {/* Add Task Button */}
                            {onAddTask && (
                                <button
                                    onClick={() => onAddTask(null, column.label)}
                                    className="w-full py-2 border border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-white transition text-gray-500 hover:text-primary-600 text-xs font-medium"
                                >
                                    <i className="fas fa-plus mr-1.5"></i>
                                    Add Task
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// Make available globally
window.KanbanView = KanbanView;
