// Get React hooks from window
const { useState } = React;

const TaskModal = ({ task, customFieldDefinitions, taskLists, onSave, onClose }) => {
    const [formData, setFormData] = useState(task || {
        title: '',
        description: '',
        assignee: 'Sarah Johnson',
        dueDate: '',
        priority: 'Medium',
        listId: task?.listId || 1,
        customFields: {}
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const handleCustomFieldChange = (fieldName, value) => {
        setFormData({
            ...formData,
            customFields: {
                ...formData.customFields,
                [fieldName]: value
            }
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">
                        {task ? 'Edit Task' : 'Create New Task'}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Task Title</label>
                        <input 
                            type="text" 
                            value={formData.title}
                            onChange={(e) => setFormData({...formData, title: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg" 
                            placeholder="Enter task title"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                        <textarea 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg" 
                            rows="3"
                            placeholder="Add task description..."
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Assignee</label>
                            <select 
                                value={formData.assignee}
                                onChange={(e) => setFormData({...formData, assignee: e.target.value})}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            >
                                <option>Sarah Johnson</option>
                                <option>Mike Chen</option>
                                <option>Emily Davis</option>
                                <option>John Smith</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                            <input 
                                type="date"
                                value={formData.dueDate}
                                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg" 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                            <select 
                                value={formData.priority}
                                onChange={(e) => setFormData({...formData, priority: e.target.value})}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            >
                                <option>Low</option>
                                <option>Medium</option>
                                <option>High</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">List</label>
                            <select 
                                value={formData.listId}
                                onChange={(e) => setFormData({...formData, listId: parseInt(e.target.value)})}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                disabled={!!task}
                            >
                                {taskLists && taskLists.map(list => (
                                    <option key={list.id} value={list.id}>{list.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Custom Fields */}
                    {customFieldDefinitions && customFieldDefinitions.length > 0 && (
                        <div className="border-t pt-4 mt-4">
                            <h3 className="text-sm font-medium text-gray-700 mb-3">Custom Fields</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {customFieldDefinitions.map(field => (
                                    <div key={field.id}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {field.name}
                                        </label>
                                        {field.type === 'text' && (
                                            <input 
                                                type="text"
                                                value={formData.customFields?.[field.name] || ''}
                                                onChange={(e) => handleCustomFieldChange(field.name, e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                            />
                                        )}
                                        {field.type === 'number' && (
                                            <input 
                                                type="number"
                                                value={formData.customFields?.[field.name] || ''}
                                                onChange={(e) => handleCustomFieldChange(field.name, e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                            />
                                        )}
                                        {field.type === 'date' && (
                                            <input 
                                                type="date"
                                                value={formData.customFields?.[field.name] || ''}
                                                onChange={(e) => handleCustomFieldChange(field.name, e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                            />
                                        )}
                                        {field.type === 'select' && (
                                            <select
                                                value={formData.customFields?.[field.name] || ''}
                                                onChange={(e) => handleCustomFieldChange(field.name, e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                            >
                                                <option value="">Select...</option>
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

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                            Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                            {task?.id ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.TaskModal = TaskModal;
