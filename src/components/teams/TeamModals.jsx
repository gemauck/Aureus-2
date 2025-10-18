// Team Modal Components
const { useState } = React;

// Member Modal
const MemberModal = ({ isOpen, onClose, member, onSave, isDark }) => {
    const [formData, setFormData] = useState(member || {
        name: '',
        email: '',
        role: 'Member'
    });

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.email) {
            alert('Please fill in all required fields');
            return;
        }
        onSave(formData);
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
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            required
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Email *</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            required
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Role</label>
                        <select
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
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
    const [formData, setFormData] = useState(event || {
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
        if (!formData.title || !formData.date || !formData.time) {
            alert('Please fill in all required fields');
            return;
        }
        onSave(formData);
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
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            required
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            rows="3"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={`block text-xs font-medium ${textClass} mb-1`}>Date *</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                                required
                            />
                        </div>

                        <div>
                            <label className={`block text-xs font-medium ${textClass} mb-1`}>Time *</label>
                            <input
                                type="time"
                                value={formData.time}
                                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Location</label>
                        <input
                            type="text"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                            placeholder="Office, Zoom, Teams, etc."
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Event Type</label>
                        <select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
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
    const [formData, setFormData] = useState(task || {
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
        if (!formData.title) {
            alert('Please enter a task title');
            return;
        }
        onSave(formData);
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
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            required
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border ${borderClass} rounded-lg ${isDark ? 'bg-gray-700 text-gray-100' : ''}`}
                            rows="3"
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-medium ${textClass} mb-1`}>Assign To</label>
                        <select
                            value={formData.assignedTo}
                            onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
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
                                value={formData.priority}
                                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
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
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
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
                            value={formData.dueDate}
                            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
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
