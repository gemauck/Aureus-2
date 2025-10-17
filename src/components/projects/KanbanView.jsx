// Kanban Board View Component
// This component is used by ProjectDetail to show tasks in a Kanban board layout

const KanbanView = ({ 
    list, 
    tasks, 
    customFieldDefinitions,
    onViewTaskDetail,
    onAddTask,
    onDeleteTask 
}) => {
    // Find status field from custom fields
    const statusField = customFieldDefinitions.find(f => f.type === 'status');
    const statuses = statusField ? statusField.options.map((name, index) => ({
        id: index + 1,
        name: name,
        color: index === 0 ? 'gray' : index === 1 ? 'blue' : index === 2 ? 'green' : 'purple'
    })) : [];

    // If no status field defined, return a message
    if (!statusField) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <i className="fas fa-info-circle text-3xl text-gray-300 mb-2"></i>
                <p className="text-sm text-gray-600 mb-1">No status field defined for Kanban view</p>
                <p className="text-xs text-gray-500">Add a "Status" type custom field to use Kanban board</p>
            </div>
        );
    }
    const getPriorityColor = (priority) => {
        switch(priority) {
            case 'High': return 'bg-red-100 text-red-800';
            case 'Medium': return 'bg-yellow-100 text-yellow-800';
            case 'Low': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusColor = (statusName) => {
        const status = statuses.find(s => s.name === statusName);
        return status ? status.color : 'gray';
    };

    // Group tasks by status
    const tasksByStatus = statuses.map(status => ({
        status,
        tasks: tasks.filter(t => t.customFields?.[statusField.name] === status.name)
    }));

    return (
        <div className="flex gap-3 overflow-x-auto pb-4">
            {tasksByStatus.map(({ status, tasks: statusTasks }) => (
                <div key={status.id} className="flex-shrink-0 w-72">
                    {/* Column Header */}
                    <div className={`bg-${status.color}-100 rounded-t-lg px-3 py-2.5 border-b-2 border-${status.color}-500`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full bg-${status.color}-500`}></div>
                                <h3 className={`text-sm font-semibold text-${status.color}-900`}>{status.name}</h3>
                                <span className={`px-1.5 py-0.5 text-[10px] rounded-full bg-${status.color}-200 text-${status.color}-800 font-medium`}>
                                    {statusTasks.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Task Cards */}
                    <div className="bg-gray-50 rounded-b-lg p-2 min-h-[400px] space-y-2">
                        {statusTasks.length === 0 ? (
                            <div className="text-center py-6 text-gray-400">
                                <i className="fas fa-inbox text-2xl mb-1"></i>
                                <p className="text-xs">No tasks</p>
                            </div>
                        ) : (
                            statusTasks.map(task => (
                                <div
                                    key={task.id}
                                    className="bg-white rounded-lg p-3 hover:shadow-sm transition cursor-pointer border border-gray-200 hover:border-primary-300"
                                    onClick={() => onViewTaskDetail(task)}
                                >
                                    {/* Task Title */}
                                    <div className="text-sm font-medium text-gray-900 mb-1.5">{task.title}</div>

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
                                            <span className={`px-1.5 py-0.5 text-[10px] rounded ${getPriorityColor(task.priority)} font-medium`}>
                                                {task.priority}
                                            </span>
                                            {task.dueDate && (
                                                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                                    <i className="fas fa-calendar"></i>
                                                    {task.dueDate}
                                                </span>
                                            )}
                                        </div>

                                        {/* Assignee */}
                                        {task.assignee && (
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center text-white text-[10px] font-semibold">
                                                    {task.assignee.charAt(0)}
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

                                        {/* Custom Fields (first 2) */}
                                        {customFieldDefinitions && customFieldDefinitions.slice(0, 2).map(field => {
                                            const value = task.customFields?.[field.name];
                                            return value ? (
                                                <div key={field.name} className="text-[10px] text-gray-500">
                                                    <span className="font-medium">{field.name}:</span> {value}
                                                </div>
                                            ) : null;
                                        })}
                                    </div>

                                    {/* Actions */}
                                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                                        <div className="text-[10px] text-gray-400">
                                            <i className="fas fa-clock mr-0.5"></i>
                                            {new Date(task.id).toLocaleDateString()}
                                        </div>
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
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Add Task Button */}
                        <button
                            onClick={() => onAddTask(list.id, status.name)}
                            className="w-full py-2 border border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-white transition text-gray-500 hover:text-primary-600 text-xs font-medium"
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            Add Task
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

// Make available globally
window.KanbanView = KanbanView;
