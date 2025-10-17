// Get React hooks from window
const { useState } = React;

const TimeModal = ({ entry, projects, onSave, onClose }) => {
    const [formData, setFormData] = useState(entry || {
        date: new Date().toISOString().split('T')[0],
        hours: '',
        project: '',
        task: '',
        description: '',
        billable: true
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.hours || parseFloat(formData.hours) <= 0) {
            alert('Please enter valid hours (greater than 0)');
            return;
        }
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-xl">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">
                        {entry ? 'Edit Time Entry' : 'Log Time Entry'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
                            <input 
                                type="date" 
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Hours</label>
                            <input 
                                type="number" 
                                step="0.25" 
                                value={formData.hours}
                                onChange={(e) => setFormData({...formData, hours: e.target.value})}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                placeholder="0.00"
                                required
                                min="0.25"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Project</label>
                        <select 
                            value={formData.project}
                            onChange={(e) => setFormData({...formData, project: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            required
                        >
                            <option value="">Select Project</option>
                            {projects && projects.sort((a, b) => a.name.localeCompare(b.name)).map(project => (
                                <option key={project.id} value={project.name}>
                                    {project.name} ({project.client})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Task/Activity</label>
                        <input 
                            type="text" 
                            value={formData.task}
                            onChange={(e) => setFormData({...formData, task: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            placeholder="What did you work on?"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                        <textarea 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                            rows="2" 
                            placeholder="Add notes about your work"
                        ></textarea>
                    </div>
                    <div className="flex items-center">
                        <input 
                            type="checkbox" 
                            id="billable" 
                            checked={formData.billable}
                            onChange={(e) => setFormData({...formData, billable: e.target.checked})}
                            className="mr-2 w-3.5 h-3.5 text-primary-600" 
                        />
                        <label htmlFor="billable" className="text-xs text-gray-700">Billable</label>
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                            Cancel
                        </button>
                        <button type="submit" className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                            {entry ? 'Update Entry' : 'Log Time'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.TimeModal = TimeModal;
