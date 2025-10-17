// Get React hooks from window
const { useState } = React;

const SubtaskModal = ({ task, onAddSubtask, onToggleSubtask, onDeleteSubtask, onClose }) => {
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [expandedSubtasks, setExpandedSubtasks] = useState({});
    const [addingToSubtask, setAddingToSubtask] = useState(null);
    const [newSubSubtaskTitle, setNewSubSubtaskTitle] = useState('');

    const handleAddSubtask = (e) => {
        e.preventDefault();
        if (newSubtaskTitle.trim()) {
            onAddSubtask(task.id, newSubtaskTitle.trim());
            setNewSubtaskTitle('');
        }
    };

    const handleAddSubSubtask = (e, parentSubtaskId) => {
        e.preventDefault();
        if (newSubSubtaskTitle.trim()) {
            onAddSubtask(task.id, newSubSubtaskTitle.trim(), parentSubtaskId);
            setNewSubSubtaskTitle('');
            setAddingToSubtask(null);
        }
    };

    const toggleExpand = (subtaskId) => {
        setExpandedSubtasks(prev => ({
            ...prev,
            [subtaskId]: !prev[subtaskId]
        }));
    };

    // Calculate total subtasks including nested ones
    const countAllSubtasks = (subtasks) => {
        let count = subtasks.length;
        subtasks.forEach(st => {
            if (st.subtasks && st.subtasks.length > 0) {
                count += countAllSubtasks(st.subtasks);
            }
        });
        return count;
    };

    // Calculate completed subtasks including nested ones
    const countCompletedSubtasks = (subtasks) => {
        let count = subtasks.filter(st => st.completed).length;
        subtasks.forEach(st => {
            if (st.subtasks && st.subtasks.length > 0) {
                count += countCompletedSubtasks(st.subtasks);
            }
        });
        return count;
    };

    const totalSubtasks = task.subtasks && task.subtasks.length > 0 ? countAllSubtasks(task.subtasks) : 0;
    const completedSubtasks = task.subtasks && task.subtasks.length > 0 ? countCompletedSubtasks(task.subtasks) : 0;
    const subtaskProgress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

    // Recursive component to render subtasks and their nested children
    const SubtaskItem = ({ subtask, parentId = null, depth = 0 }) => {
        const hasChildren = subtask.subtasks && subtask.subtasks.length > 0;
        const isExpanded = expandedSubtasks[subtask.id];
        const isAddingHere = addingToSubtask === subtask.id;

        return (
            <div className="mb-2">
                <div 
                    className={`flex items-center gap-2 p-3 rounded-lg hover:bg-gray-100 transition`}
                    style={{ marginLeft: `${depth * 24}px`, backgroundColor: depth > 0 ? '#f9fafb' : '#f3f4f6' }}
                >
                    {/* Expand/Collapse button */}
                    {hasChildren ? (
                        <button
                            onClick={() => toggleExpand(subtask.id)}
                            className="flex-shrink-0 w-5 h-5 flex items-center justify-center hover:bg-gray-200 rounded"
                        >
                            <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-xs text-gray-600`}></i>
                        </button>
                    ) : (
                        <div className="w-5"></div>
                    )}

                    {/* Complete checkbox */}
                    <button
                        onClick={() => onToggleSubtask(task.id, subtask.id, parentId)}
                        className="flex-shrink-0"
                    >
                        <i className={`fas fa-${subtask.completed ? 'check-circle text-green-600' : 'circle text-gray-400'} text-xl`}></i>
                    </button>

                    {/* Subtask title */}
                    <span className={`flex-1 ${subtask.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                        {subtask.title}
                    </span>

                    {/* Child count badge */}
                    {hasChildren && (
                        <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full">
                            {subtask.subtasks.length}
                        </span>
                    )}

                    {/* Add sub-subtask button */}
                    <button
                        onClick={() => setAddingToSubtask(isAddingHere ? null : subtask.id)}
                        className="text-primary-600 hover:text-primary-800 text-sm"
                        title="Add nested subtask"
                    >
                        <i className="fas fa-plus"></i>
                    </button>

                    {/* Delete button */}
                    <button
                        onClick={() => onDeleteSubtask(task.id, subtask.id, parentId)}
                        className="text-red-600 hover:text-red-800 text-sm"
                    >
                        <i className="fas fa-trash"></i>
                    </button>
                </div>

                {/* Add sub-subtask form */}
                {isAddingHere && (
                    <form 
                        onSubmit={(e) => handleAddSubSubtask(e, subtask.id)} 
                        className="flex gap-2 mt-2"
                        style={{ marginLeft: `${(depth + 1) * 24 + 8}px` }}
                    >
                        <input 
                            type="text" 
                            value={newSubSubtaskTitle}
                            onChange={(e) => setNewSubSubtaskTitle(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" 
                            placeholder="Add nested subtask..."
                            autoFocus
                        />
                        <button 
                            type="submit"
                            className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
                        >
                            Add
                        </button>
                        <button 
                            type="button"
                            onClick={() => {
                                setAddingToSubtask(null);
                                setNewSubSubtaskTitle('');
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                        >
                            Cancel
                        </button>
                    </form>
                )}

                {/* Render nested subtasks */}
                {hasChildren && isExpanded && (
                    <div className="mt-1">
                        {subtask.subtasks.map((child) => (
                            <SubtaskItem 
                                key={child.id} 
                                subtask={child} 
                                parentId={subtask.id}
                                depth={depth + 1}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Manage Subtasks</h2>
                        <p className="text-sm text-gray-600">{task.title}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Progress */}
                {totalSubtasks > 0 && (
                    <div className="mb-6">
                        <div className="flex justify-between text-sm text-gray-600 mb-2">
                            <span>Progress</span>
                            <span>{completedSubtasks} of {totalSubtasks} completed</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                            <div 
                                className="bg-green-600 h-3 rounded-full transition-all" 
                                style={{width: `${subtaskProgress}%`}}
                            ></div>
                        </div>
                    </div>
                )}

                {/* Info box */}
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                        <i className="fas fa-info-circle text-blue-600 mt-0.5"></i>
                        <div className="text-sm text-blue-800">
                            <p className="font-medium mb-1">Hierarchical Subtasks</p>
                            <p>Create nested subtasks by clicking the <i className="fas fa-plus"></i> icon next to any subtask. Build unlimited levels of task hierarchy.</p>
                        </div>
                    </div>
                </div>

                {/* Add New Top-Level Subtask */}
                <form onSubmit={handleAddSubtask} className="mb-6">
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={newSubtaskTitle}
                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" 
                            placeholder="Add a new subtask..."
                        />
                        <button 
                            type="submit"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                            <i className="fas fa-plus"></i>
                        </button>
                    </div>
                </form>

                {/* Subtasks List */}
                <div className="space-y-1 max-h-96 overflow-y-auto">
                    {task.subtasks && task.subtasks.length > 0 ? (
                        task.subtasks.map((subtask) => (
                            <SubtaskItem 
                                key={subtask.id} 
                                subtask={subtask}
                                depth={0}
                            />
                        ))
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-tasks text-3xl mb-2"></i>
                            <p>No subtasks yet. Add one above!</p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end mt-6 pt-4 border-t">
                    <button onClick={onClose} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.SubtaskModal = SubtaskModal;
