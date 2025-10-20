// Team Modal Components
const { useState } = React;

// Member Modal
const MemberModal = ({ isOpen, onClose, member, onSave, isDark }) => {
    const [memberFormData, setMemberFormData] = useState(member || {
        name: '',
        email: '',
        role: 'Member'
    });

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!memberFormData.name || !memberFormData.email) {
            alert('Please fill in all required fields');
            return;
        }
        onSave(memberFormData);
    };

    const bgClass = isDark ? 'bg-gray-800' : 'bg-white';
    const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
    const borderClass = isDark ? 'border-gray-700' : 'border-gray-200';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${bgClass} rounded-lg max-w-md w-full p-4`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-lg font-semibold ${textClass}`}>
                        {member ? 'Edit Member' : 'Add Team Member'}
                    </h3>
                    <button onClick={onClose} className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Name *</label>
                        <input
                            type="text"
                            value={memberFormData.name}
                            onChange={(e) => setMemberFormData({ ...memberFormData, name: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            required
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Email *</label>
                        <input
                            type="email"
                            value={memberFormData.email}
                            onChange={(e) => setMemberFormData({ ...memberFormData, email: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            required
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Role</label>
                        <select
                            value={memberFormData.role}
                            onChange={(e) => setMemberFormData({ ...memberFormData, role: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                        >
                            <option>Member</option>
                            <option>Lead</option>
                            <option>Manager</option>
                            <option>Admin</option>
                        </select>
                    </div>

                    <div className="flex gap-2 pt-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className={`flex-1 px-4 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                            {member ? 'Update' : 'Add'} Member
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Event Modal
const EventModal = ({ isOpen, onClose, event, onSave, isDark }) => {
    const [eventFormData, setEventFormData] = useState(event || {
        title: '',
        description: '',
        date: '',
        time: '',
        location: '',
        type: 'Meeting'
    });

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!eventFormData.title || !eventFormData.date || !eventFormData.time) {
            alert('Please fill in all required fields');
            return;
        }
        onSave(eventFormData);
    };

    const bgClass = isDark ? 'bg-gray-800' : 'bg-white';
    const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
    const borderClass = isDark ? 'border-gray-700' : 'border-gray-200';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${bgClass} rounded-lg max-w-md w-full p-4`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-lg font-semibold ${textClass}`}>
                        {event ? 'Edit Event' : 'Schedule Event'}
                    </h3>
                    <button onClick={onClose} className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Event Title *</label>
                        <input
                            type="text"
                            value={eventFormData.title}
                            onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            required
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Description</label>
                        <textarea
                            value={eventFormData.description}
                            onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            rows="3"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={`block text-xs font-medium ${textClass} mb-1`}>Date *</label>
                            <input
                                type="date"
                                value={eventFormData.date}
                                onChange={(e) => setEventFormData({ ...eventFormData, date: e.target.value })}
                                className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                                required
                            />
                        </div>

                        <div>
                            <label className={`block text-xs font-medium ${textClass} mb-1`}>Time *</label>
                            <input
                                type="time"
                                value={eventFormData.time}
                                onChange={(e) => setEventFormData({ ...eventFormData, time: e.target.value })}
                                className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Location</label>
                        <input
                            type="text"
                            value={eventFormData.location}
                            onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                            placeholder="Office, Zoom, Teams, etc."
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Event Type</label>
                        <select
                            value={eventFormData.type}
                            onChange={(e) => setEventFormData({ ...eventFormData, type: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                        >
                            <option>Meeting</option>
                            <option>Training</option>
                            <option>Workshop</option>
                            <option>Review</option>
                            <option>Social</option>
                            <option>Other</option>
                        </select>
                    </div>

                    <div className="flex gap-2 pt-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className={`flex-1 px-4 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                            {event ? 'Update' : 'Schedule'} Event
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Task Modal
const TaskModal = ({ isOpen, onClose, task, members, onSave, isDark }) => {
    const [taskFormData, setTaskFormData] = useState(task || {
        title: '',
        description: '',
        assignedTo: '',
        priority: 'Medium',
        dueDate: '',
        status: 'To Do'
    });

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!taskFormData.title) {
            alert('Please enter a task title');
            return;
        }
        onSave(taskFormData);
    };

    const bgClass = isDark ? 'bg-gray-800' : 'bg-white';
    const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
    const borderClass = isDark ? 'border-gray-700' : 'border-gray-200';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${bgClass} rounded-lg max-w-md w-full p-4`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-lg font-semibold ${textClass}`}>
                        {task ? 'Edit Task' : 'Create Task'}
                    </h3>
                    <button onClick={onClose} className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Task Title *</label>
                        <input
                            type="text"
                            value={taskFormData.title}
                            onChange={(e) => setTaskFormData({ ...taskFormData, title: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            required
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Description</label>
                        <textarea
                            value={taskFormData.description}
                            onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            rows="3"
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Assign To</label>
                        <select
                            value={taskFormData.assignedTo}
                            onChange={(e) => setTaskFormData({ ...taskFormData, assignedTo: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                        >
                            <option value="">Unassigned</option>
                            {members.map(member => (
                                <option key={member.id} value={member.name}>{member.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={`block text-xs font-medium ${textClass} mb-1`}>Priority</label>
                            <select
                            value={taskFormData.priority}
                            onChange={(e) => setTaskFormData({ ...taskFormData, priority: e.target.value })}
                                className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            >
                                <option>Low</option>
                                <option>Medium</option>
                                <option>High</option>
                                <option>Urgent</option>
                            </select>
                        </div>

                        <div>
                            <label className={`block text-xs font-medium ${textClass} mb-1`}>Status</label>
                            <select
                            value={taskFormData.status}
                            onChange={(e) => setTaskFormData({ ...taskFormData, status: e.target.value })}
                                className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            >
                                <option>To Do</option>
                                <option>In Progress</option>
                                <option>Completed</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Due Date</label>
                        <input
                            type="date"
                            value={taskFormData.dueDate}
                            onChange={(e) => setTaskFormData({ ...taskFormData, dueDate: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                        />
                    </div>

                    <div className="flex gap-2 pt-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className={`flex-1 px-4 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                            {task ? 'Update' : 'Create'} Task
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.MemberModal = MemberModal;
window.EventModal = EventModal;
window.TaskModal = TaskModal;
