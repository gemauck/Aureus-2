const { useState } = window;

export const NotesTemplateModal = ({ templates, onSave, onDelete, onClose }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        content: '',
        category: 'Payment Terms'
    });

    const handleEdit = (template) => {
        setEditingTemplate(template);
        setFormData(template);
        setShowForm(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingTemplate) {
            onSave({ ...formData, id: editingTemplate.id });
        } else {
            onSave(formData);
        }
        setFormData({ name: '', content: '', category: 'Payment Terms' });
        setEditingTemplate(null);
        setShowForm(false);
    };

    const defaultTemplates = [
        {
            name: 'Net 30 Payment Terms',
            content: 'Payment is due within 30 days of invoice date. Late payments may incur interest charges at 2% per month.',
            category: 'Payment Terms'
        },
        {
            name: 'Net 15 Payment Terms',
            content: 'Payment is due within 15 days of invoice date. We appreciate prompt payment.',
            category: 'Payment Terms'
        },
        {
            name: 'Thank You Note',
            content: 'Thank you for your business! We appreciate the opportunity to work with you.',
            category: 'Thank You'
        },
        {
            name: 'Early Payment Discount',
            content: 'Pay within 10 days and receive a 2% discount. Payment due within 30 days otherwise.',
            category: 'Payment Terms'
        },
        {
            name: 'Bank Details',
            content: 'Bank: FNB\nAccount Name: Abcotronics (Pty) Ltd\nAccount Number: 62xxxxx\nBranch Code: 250655',
            category: 'Payment Info'
        }
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Invoice Notes Templates</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start">
                        <i className="fas fa-lightbulb text-blue-600 mt-1 mr-3"></i>
                        <div className="text-sm text-blue-800">
                            <strong>Quick Notes:</strong> Create reusable templates for payment terms, thank you messages, and other invoice notes. Select templates when creating invoices for faster workflow.
                        </div>
                    </div>
                </div>

                {!showForm ? (
                    <>
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={() => setShowForm(true)}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center"
                            >
                                <i className="fas fa-plus mr-2"></i>
                                New Template
                            </button>
                        </div>

                        {/* Default Templates */}
                        {defaultTemplates.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                                    <i className="fas fa-star text-yellow-500 mr-2"></i>
                                    Default Templates
                                </h3>
                                <div className="grid gap-3">
                                    {defaultTemplates.map((template, index) => (
                                        <div key={`default-${index}`} className="border rounded-lg p-4 hover:bg-gray-50">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1">
                                                    <div className="font-medium text-gray-900">{template.name}</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        <span className="px-2 py-1 bg-gray-100 rounded">{template.category}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(template.content);
                                                        alert('Template copied to clipboard!');
                                                    }}
                                                    className="text-primary-600 hover:text-primary-700 text-sm"
                                                >
                                                    <i className="fas fa-copy mr-1"></i>
                                                    Copy
                                                </button>
                                            </div>
                                            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded whitespace-pre-wrap">
                                                {template.content}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* User Templates */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                                Your Custom Templates
                            </h3>
                            {templates.length > 0 ? (
                                <div className="grid gap-3">
                                    {templates.map((template) => (
                                        <div key={template.id} className="border border-primary-200 rounded-lg p-4 hover:bg-primary-50">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1">
                                                    <div className="font-medium text-gray-900">{template.name}</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded">
                                                            {template.category}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleEdit(template)}
                                                        className="text-primary-600 hover:text-primary-700 text-sm"
                                                    >
                                                        <i className="fas fa-edit mr-1"></i>
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (confirm('Delete this template?')) {
                                                                onDelete(template.id);
                                                            }
                                                        }}
                                                        className="text-red-600 hover:text-red-700 text-sm"
                                                    >
                                                        <i className="fas fa-trash mr-1"></i>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="text-sm text-gray-600 bg-white p-3 rounded whitespace-pre-wrap border">
                                                {template.content}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <i className="fas fa-sticky-note text-4xl mb-3"></i>
                                    <p>No custom templates yet</p>
                                    <p className="text-sm mt-1">Create your first template to get started</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* Template Form */
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Template Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                placeholder="e.g., Standard Payment Terms"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Category
                            </label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({...formData, category: e.target.value})}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            >
                                <option>Payment Terms</option>
                                <option>Thank You</option>
                                <option>Payment Info</option>
                                <option>Legal Notice</option>
                                <option>Other</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Template Content <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={formData.content}
                                onChange={(e) => setFormData({...formData, content: e.target.value})}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                                rows="6"
                                placeholder="Enter the template text that will appear on invoices..."
                                required
                            ></textarea>
                            <div className="text-xs text-gray-500 mt-1">
                                Tip: Use line breaks to format your text. This will appear exactly as typed.
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditingTemplate(null);
                                    setFormData({ name: '', content: '', category: 'Payment Terms' });
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                            >
                                {editingTemplate ? 'Update Template' : 'Create Template'}
                            </button>
                        </div>
                    </form>
                )}

                {!showForm && (
                    <div className="flex justify-end mt-6 pt-4 border-t">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotesTemplateModal;
