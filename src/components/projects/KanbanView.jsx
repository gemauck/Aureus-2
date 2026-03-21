// Kanban Board View Component
// This component is used by ProjectDetail to show tasks in a Kanban board layout

const KanbanView = ({ 
    tasks, 
    statusColumns = [], // Array of { value, label } objects (value = list id when groupByList)
    groupByList = false, // When true, columns are lists and tasks are grouped by task.listId
    onViewTaskDetail,
    onAddTask,
    onDeleteTask,
    onUpdateTaskStatus, // Function to update task status/list when dragged (receives column label)
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
        { value: 'done', label: 'Done' },
        { value: 'archived', label: 'Archived' }
    ];
    
    const columns = statusColumns.length > 0 ? statusColumns : defaultStatusColumns;
    
    // Default color mapping
    const getDefaultStatusColor = (statusLabel) => {
        const statusLower = String(statusLabel || '').toLowerCase();
        if (statusLower.includes('archived')) return 'bg-gray-200 text-gray-600 border-gray-400';
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

    // Normalize status string for better matching (handles variations like "todo" vs "to do", "in-progress" vs "in progress")
    const normalizeStatus = (status) => {
        if (!status) return '';
        return String(status)
            .toLowerCase()
            .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
            .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
            .trim();
    };

    // Match task status to column with flexible matching
    const matchTaskToColumn = (taskStatus, columnValue, columnLabel) => {
        const normalizedTask = normalizeStatus(taskStatus);
        const normalizedValue = normalizeStatus(columnValue);
        const normalizedLabel = normalizeStatus(columnLabel);
        
        // Exact match
        if (normalizedTask === normalizedValue || normalizedTask === normalizedLabel) {
            return true;
        }
        
        // Partial match for common variations
        // e.g., "todo" matches "to do", "inprogress" matches "in progress"
        if (normalizedTask.replace(/\s/g, '') === normalizedValue.replace(/\s/g, '') ||
            normalizedTask.replace(/\s/g, '') === normalizedLabel.replace(/\s/g, '')) {
            return true;
        }
        
        // Contains match for statuses with extra text (e.g., "To Do - High Priority")
        if (normalizedValue && normalizedTask.includes(normalizedValue)) {
            return true;
        }
        if (normalizedLabel && normalizedTask.includes(normalizedLabel)) {
            return true;
        }
        
        return false;
    };

    // Group tasks: by list (task.listId) when groupByList, else by status
    const taskAssignments = new Map(); // Track which tasks have been assigned
    const tasksByStatus = columns.map(column => {
        let columnTasks;
        if (groupByList) {
            const columnListId = column.value != null ? String(column.value) : '';
            columnTasks = tasks.filter(t => {
                const taskListId = t.listId != null ? String(t.listId) : '';
                return taskListId === columnListId;
            });
            columnTasks.forEach(t => taskAssignments.set(t.id, true));
        } else {
            columnTasks = tasks.filter(t => {
                if (taskAssignments.has(t.id)) return false;
                const taskStatus = String(t.status || 'To Do');
                const columnValue = String(column.value || '');
                const columnLabel = String(column.label || '');
                if (matchTaskToColumn(taskStatus, columnValue, columnLabel)) {
                    taskAssignments.set(t.id, true);
                    return true;
                }
                return false;
            });
        }
        return {
            column,
            tasks: columnTasks
        };
    });

    // Add unmatched tasks to first column (list mode) or "To Do" column (status mode)
    if (groupByList) {
        const unmatchedTasks = tasks.filter(t => !taskAssignments.has(t.id));
        if (unmatchedTasks.length > 0 && tasksByStatus.length > 0) {
            tasksByStatus[0].tasks.push(...unmatchedTasks);
        }
    } else {
        const todoColumnIndex = tasksByStatus.findIndex(({ column }) => {
            const normalized = normalizeStatus(column.value || column.label || '');
            return normalized === 'to do' || normalized === 'todo';
        });
        if (todoColumnIndex >= 0) {
            const unmatchedTasks = tasks.filter(t => !taskAssignments.has(t.id));
            if (unmatchedTasks.length > 0) {
                tasksByStatus[todoColumnIndex].tasks.push(...unmatchedTasks);
                console.warn(`KanbanView: ${unmatchedTasks.length} task(s) with unmatched status added to "To Do" column. Task statuses:`,
                    unmatchedTasks.map(t => t.status || 'undefined'));
            }
        }
    }

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
        <div
            className="flex w-full min-w-0 gap-2 overflow-x-auto pb-3"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            {tasksByStatus.map(({ column, tasks: statusTasks }) => {
                const statusColorClass = statusColorFn(column.label);
                
                return (
                    <div 
                        key={column.value} 
                        className="flex min-w-[200px] flex-1 basis-0 flex-col"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, column.label)}
                    >
                        {/* Column Header */}
                        <div className={`${statusColorClass} rounded-t-lg px-2 py-1.5 border-b-2`}>
                            <div className="flex items-center justify-between">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-75"></div>
                                    <h3 className="truncate text-xs font-semibold">{column.label}</h3>
                                    <span className="flex-shrink-0 rounded-full bg-white/50 px-1 py-0 text-[9px] font-medium">
                                        {statusTasks.length}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Task Cards */}
                        <div className="min-h-[220px] flex-1 space-y-1 rounded-b-lg border-2 border-t-0 border-gray-200 bg-gray-50 p-1.5">
                            {statusTasks.length === 0 ? (
                                <div className="py-4 text-center text-gray-400">
                                    <i className="fas fa-inbox mb-0.5 text-lg"></i>
                                    <p className="text-[10px]">No tasks</p>
                                </div>
                            ) : (
                                statusTasks.map(task => {
                                    const dueMeta = dueDateMetaFn(task.dueDate);
                                    return (
                                        <div
                                            key={task.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, task)}
                                            className="cursor-move rounded-md border border-gray-200 bg-white px-2 py-1.5 transition-shadow hover:border-primary-300 hover:shadow-sm"
                                            onClick={() => onViewTaskDetail && onViewTaskDetail(task)}
                                        >
                                            {/* Task Title */}
                                            <div className="text-xs font-medium leading-snug text-gray-900 line-clamp-2">{task.title || 'Untitled'}</div>

                                            {/* Task Description (truncated; strip HTML so pasted images don't show raw markup) */}
                                            {task.description && (
                                                <p className="mt-0.5 line-clamp-1 text-[10px] leading-tight text-gray-600">
                                                    {typeof task.description === 'string' && task.description.includes('<')
                                                        ? task.description.replace(/<[^>]*>/g, '').trim() || null
                                                        : task.description}
                                                </p>
                                            )}

                                            {/* Task Metadata — single compact row where possible */}
                                            <div className="mt-1 space-y-0.5">
                                                <div className="flex flex-wrap items-center gap-1">
                                                    {task.priority && (
                                                        <span className={`rounded px-1 py-0 text-[9px] font-medium ${priorityColorFn(task.priority)}`}>
                                                            {task.priority}
                                                        </span>
                                                    )}
                                                    {task.startDate && (() => {
                                                        const d = new Date(task.startDate);
                                                        return !Number.isNaN(d.getTime()) ? (
                                                            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0 text-[9px] font-medium text-emerald-700">
                                                                <i className="fas fa-play-circle text-[8px]"></i>
                                                                {d.toLocaleDateString()}
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                    <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0 text-[9px] ${dueMeta.pillClass}`}>
                                                        <i className="fas fa-calendar text-[8px]"></i>
                                                        {dueMeta.label}
                                                    </span>
                                                </div>

                                                {(task.assignee || (task.subtasks && task.subtasks.length > 0)) && (
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-gray-500">
                                                        {task.assignee && (
                                                            <span className="inline-flex min-w-0 items-center gap-1">
                                                                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-[8px] font-semibold text-white">
                                                                    {String(task.assignee).charAt(0).toUpperCase()}
                                                                </span>
                                                                <span className="truncate text-gray-600">{task.assignee}</span>
                                                            </span>
                                                        )}
                                                        {task.subtasks && task.subtasks.length > 0 && (
                                                            <span className="inline-flex items-center gap-0.5">
                                                                <i className="fas fa-tasks text-[8px]"></i>
                                                                {task.subtasks.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-1">
                                                <div className="text-[9px] text-gray-400">
                                                    <i className="fas fa-clock mr-0.5"></i>
                                                    {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : '—'}
                                                </div>
                                                {onDeleteTask && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeleteTask(task.id);
                                                        }}
                                                        className="p-0.5 text-gray-400 transition hover:text-red-600"
                                                        title="Delete Task"
                                                    >
                                                        <i className="fas fa-trash text-[10px]"></i>
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
                                    className="w-full rounded-md border border-dashed border-gray-300 py-1 text-[10px] font-medium text-gray-500 transition hover:border-primary-400 hover:bg-white hover:text-primary-600"
                                >
                                    <i className="fas fa-plus mr-1"></i>
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
