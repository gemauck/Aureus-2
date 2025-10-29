// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const NoticeModal = ({ isOpen, onClose, team, notice, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        priority: 'Normal',
        expiryDate: '',
        tags: []
    });
    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        if (notice) {
            setFormData(notice);
        } else {
            setFormData({
                title: '',
                content: '',
                priority: 'Normal',
                expiryDate: '',
                tags: []
            });
        }
    }, [notice]);

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
        
        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
        const noticeData = {
            ...formData,
            id: notice?.id || Date.now().toString(),
            team: team.id,
            date: notice?.date || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id
        };

        onSave(noticeData);
        onClose();
    };

    if (!isOpen) return null;

    const priorities = ['Low', 'Normal', 'Medium', 'High', 'Critical'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between dark:bg-slate-800 dark:border-slate-700">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                            {notice ? 'Edit Notice' : 'Post New Notice'}
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-slate-400">{team.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition dark:text-slate-400 dark:hover:text-slate-200"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Notice Title *
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="e.g., System Maintenance Scheduled"
                        />
                    </div>

                    {/* Priority and Expiry Date */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Priority
                            </label>
                            <select
                                name="priority"
                                value={formData.priority}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                {priorities.map(priority => (
                                    <option key={priority} value={priority}>{priority}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Expiry Date (Optional)
                            </label>
                            <input
                                type="date"
                                name="expiryDate"
                                value={formData.expiryDate}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    {/* Content */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Notice Content *
                        </label>
                        <textarea
                            name="content"
                            value={formData.content}
                            onChange={handleChange}
                            required
                            rows={8}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                            placeholder="Enter the detailed notice content..."
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {formData.content.length} characters
                        </p>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Tags
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="Add tag and press Enter"
                            />
                            <button
                                type="button"
                                onClick={handleAddTag}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                            >
                                Add
                            </button>
                        </div>
                        {formData.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.tags.map(tag => (
                                    <span
                                        key={tag}
                                        className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs flex items-center gap-1 dark:bg-primary-900/50 dark:text-primary-300"
                                    >
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTag(tag)}
                                            className="hover:text-primary-900"
                                        >
                                            <i className="fas fa-times text-xs"></i>
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    <div className="border-t border-gray-200 pt-4">
                        <p className="text-xs font-medium text-gray-700 mb-2">Preview</p>
                        <div className={`border-l-4 rounded-lg p-3 ${
                            formData.priority === 'Critical' || formData.priority === 'High' ? 'border-red-500 bg-red-50' :
                            formData.priority === 'Medium' ? 'border-yellow-500 bg-yellow-50' :
                            'border-blue-500 bg-blue-50'
                        }`}>
                            <div className="flex items-center gap-2 mb-2">
                                <i className={`fas fa-bullhorn ${
                                    formData.priority === 'Critical' || formData.priority === 'High' ? 'text-red-600' :
                                    formData.priority === 'Medium' ? 'text-yellow-600' :
                                    'text-blue-600'
                                }`}></i>
                                <h4 className="font-semibold text-gray-900 text-sm">
                                    {formData.title || 'Notice Title'}
                                </h4>
                                <span className={`ml-auto px-2 py-1 text-xs rounded font-medium ${
                                    formData.priority === 'Critical' || formData.priority === 'High' ? 'bg-red-100 text-red-700' :
                                    formData.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-blue-100 text-blue-700'
                                }`}>
                                    {formData.priority}
                                </span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                {formData.content || 'Notice content will appear here...'}
                            </p>
                            {formData.expiryDate && (
                                <p className="text-xs text-gray-600 mt-2">
                                    <i className="fas fa-clock mr-1"></i>
                                    Expires: {new Date(formData.expiryDate).toLocaleDateString('en-ZA', { 
                                        month: 'short', 
                                        day: 'numeric', 
                                        year: 'numeric' 
                                    })}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                        >
                            {notice ? 'Update Notice' : 'Post Notice'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.NoticeModal = NoticeModal;
