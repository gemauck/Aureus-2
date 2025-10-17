// Get React hooks from window
const { useState } = React;

const CustomFieldModal = ({ customFields, onAdd, onClose }) => {
    const [fieldData, setFieldData] = useState({
        name: '',
        type: 'text',
        options: []
    });
    const [optionInput, setOptionInput] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        const newField = {
            id: Date.now(),
            ...fieldData
        };
        onAdd(newField);
        setFieldData({ name: '', type: 'text', options: [] });
    };

    const handleAddOption = () => {
        if (optionInput.trim()) {
            setFieldData({
                ...fieldData,
                options: [...fieldData.options, optionInput.trim()]
            });
            setOptionInput('');
        }
    };

    const handleRemoveOption = (index) => {
        setFieldData({
            ...fieldData,
            options: fieldData.options.filter((_, i) => i !== index)
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-semibold text-gray-900">Manage Custom Fields</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                {/* Existing Custom Fields */}
                {customFields && customFields.length > 0 && (
                    <div className="mb-4">
                        <h3 className="text-xs font-medium text-gray-700 mb-2">Current Custom Fields</h3>
                        <div className="space-y-1.5">
                            {customFields.map((field) => (
                                <div key={field.id} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-lg">
                                    <div>
                                        <span className="font-medium text-gray-800 text-xs">{field.name}</span>
                                        <span className="text-[11px] text-gray-500 ml-1.5">({field.type})</span>
                                    </div>
                                    <button className="text-red-600 hover:text-red-800 text-xs transition-colors">
                                        <i className="fas fa-trash text-[10px]"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Add New Field */}
                <form onSubmit={handleSubmit} className="space-y-3 border-t border-gray-200 pt-3">
                    <h3 className="text-xs font-medium text-gray-700">Add New Field</h3>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Field Name</label>
                            <input 
                                type="text" 
                                value={fieldData.name}
                                onChange={(e) => setFieldData({...fieldData, name: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                placeholder="e.g., Priority Level, Department"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Field Type</label>
                            <select 
                                value={fieldData.type}
                                onChange={(e) => setFieldData({...fieldData, type: e.target.value, options: []})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="text">Text</option>
                                <option value="number">Number</option>
                                <option value="date">Date</option>
                                <option value="select">Dropdown</option>
                                <option value="status">Status</option>
                            </select>
                        </div>
                    </div>

                    {(fieldData.type === 'select' || fieldData.type === 'status') && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                {fieldData.type === 'status' ? 'Status Options' : 'Dropdown Options'}
                            </label>
                            <div className="flex gap-2 mb-1.5">
                                <input 
                                    type="text" 
                                    value={optionInput}
                                    onChange={(e) => setOptionInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                    placeholder={fieldData.type === 'status' ? "e.g., In Progress, Completed" : "Add option"}
                                />
                                <button 
                                    type="button"
                                    onClick={handleAddOption}
                                    className="px-3 py-2 text-xs bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors"
                                >
                                    Add
                                </button>
                            </div>
                            {fieldData.type === 'status' && (
                                <p className="text-[10px] text-gray-500 mb-1.5">Add status options like: To Do, In Progress, Review, Completed</p>
                            )}
                            {fieldData.options.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {fieldData.options.map((option, index) => (
                                        <div key={index} className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full text-xs flex items-center gap-1.5 font-medium">
                                            {option}
                                            <button 
                                                type="button"
                                                onClick={() => handleRemoveOption(index)}
                                                className="text-primary-600 hover:text-primary-900 transition-colors"
                                            >
                                                <i className="fas fa-times text-[10px]"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                            Close
                        </button>
                        <button type="submit" className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                            <i className="fas fa-plus mr-1.5 text-[10px]"></i>
                            Add Field
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.CustomFieldModal = CustomFieldModal;
