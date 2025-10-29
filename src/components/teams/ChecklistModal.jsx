// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const ChecklistModal = ({ isOpen, onClose, team, checklist, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        category: 'Onboarding',
        description: '',
        items: [],
        frequency: 'One-time',
        tags: []
    });
    const [tagInput, setTagInput] = useState('');
    const [itemInput, setItemInput] = useState('');

    useEffect(() => {
        if (checklist) {
            setFormData(checklist);
        } else {
            setFormData({
                title: '',
                category: 'Onboarding',
                description: '',
                items: [],
                frequency: 'One-time',
                tags: []
            });
        }
    }, [checklist]);

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

    const handleAddItem = () => {
        if (itemInput.trim()) {
            setFormData(prev => ({
                ...prev,
                items: [...prev.items, {
                    id: Date.now().toString(),
                    text: itemInput.trim(),
                    required: true
                }]
            }));
            setItemInput('');
        }
    };

    const handleRemoveItem = (id) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    const handleToggleRequired = (id) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item => 
                item.id === id ? { ...item, required: !item.required } : item
            )
        }));
    };

    const handleMoveItem = (index, direction) => {
        const newItems = [...formData.items];
        const newIndex = index + direction;
        
        if (newIndex >= 0 && newIndex < newItems.length) {
            [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
            setFormData(prev => ({
                ...prev,
                items: newItems
            }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (formData.items.length === 0) {
            alert('Please add at least one checklist item');
            return;
        }

        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
        const checklistData = {
            ...formData,
            id: checklist?.id || Date.now().toString(),
            team: team.id,
            createdAt: checklist?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: currentUser.name,
            createdByEmail: currentUser.email,
            createdById: currentUser.id
        };

        onSave(checklistData);
        onClose();
    };

    if (!isOpen) return null;

    const categories = ['Onboarding', 'Offboarding', 'Compliance', 'Safety', 'Quality', 'Audit', 'Other'];
    const frequencies = ['One-time', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between dark:bg-slate-800 dark:border-slate-700">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                            {checklist ? 'Edit Checklist' : 'Create New Checklist'}
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
                            Checklist Title *
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="e.g., New Employee Onboarding"
                        />
                    </div>

                    {/* Category and Frequency */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Category
                            </label>
                            <select
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Frequency
                            </label>
                            <select
                                name="frequency"
                                value={formData.frequency}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                {frequencies.map(freq => (
                                    <option key={freq} value={freq}>{freq}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Description
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                            placeholder="Brief description of the checklist purpose..."
                        />
                    </div>

                    {/* Checklist Items */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                            Checklist Items ({formData.items.length})
                        </label>
                        
                        {/* Add Item Input */}
                        <div className="flex gap-2 mb-3">
                            <input
                                type="text"
                                value={itemInput}
                                onChange={(e) => setItemInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="Enter checklist item and press Enter..."
                            />
                            <button
                                type="button"
                                onClick={handleAddItem}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                            >
                                <i className="fas fa-plus mr-1"></i>
                                Add
                            </button>
                        </div>

                        {/* Items List */}
                        {formData.items.length > 0 ? (
                            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                                {formData.items.map((item, index) => (
                                    <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition">
                                        <div className="flex flex-col gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handleMoveItem(index, -1)}
                                                disabled={index === 0}
                                                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <i className="fas fa-chevron-up text-xs"></i>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleMoveItem(index, 1)}
                                                disabled={index === formData.items.length - 1}
                                                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <i className="fas fa-chevron-down text-xs"></i>
                                            </button>
                                        </div>
                                        
                                        <div className="w-6 h-6 bg-white rounded flex items-center justify-center flex-shrink-0 border border-gray-300">
                                            <span className="text-xs text-gray-600">{index + 1}</span>
                                        </div>
                                        
                                        <button
                                            type="button"
                                            onClick={() => handleToggleRequired(item.id)}
                                            className={`p-1 rounded transition ${
                                                item.required 
                                                    ? 'text-red-600 hover:text-red-700' 
                                                    : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                            title={item.required ? 'Required' : 'Optional'}
                                        >
                                            <i className={`fas ${item.required ? 'fa-asterisk' : 'fa-circle'} text-xs`}></i>
                                        </button>
                                        
                                        <span className="flex-1 text-sm text-gray-900">{item.text}</span>
                                        
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveItem(item.id)}
                                            className="p-1 text-gray-400 hover:text-red-600 transition"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                                <i className="fas fa-tasks text-3xl text-gray-300 mb-2"></i>
                                <p className="text-sm text-gray-500">No items added yet</p>
                            </div>
                        )}
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
                            {checklist ? 'Update Checklist' : 'Create Checklist'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.ChecklistModal = ChecklistModal;
