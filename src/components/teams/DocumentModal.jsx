// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const DocumentModal = ({ isOpen, onClose, team, document, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        category: 'SOP',
        description: '',
        content: '',
        version: '1.0',
        tags: [],
        attachments: []
    });
    const [tagInput, setTagInput] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);

    useEffect(() => {
        if (document) {
            setFormData(document);
        } else {
            setFormData({
                title: '',
                category: 'SOP',
                description: '',
                content: '',
                version: '1.0',
                tags: [],
                attachments: []
            });
        }
    }, [document]);

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

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
        const documentData = {
            ...formData,
            id: document?.id || Date.now().toString(),
            team: team.id,
            createdAt: document?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: currentUser.name,
            createdByEmail: currentUser.email,
            createdById: currentUser.id
        };

        // Simulate file attachment
        if (selectedFile) {
            documentData.attachments = [
                ...documentData.attachments,
                {
                    name: selectedFile.name,
                    size: selectedFile.size,
                    type: selectedFile.type,
                    uploadedAt: new Date().toISOString()
                }
            ];
        }

        onSave(documentData);
        onClose();
    };

    if (!isOpen) return null;

    const categories = ['SOP', 'Policy', 'Manual', 'Guide', 'Template', 'Report', 'Other'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            {document ? 'Edit Document' : 'Add New Document'}
                        </h3>
                        <p className="text-xs text-gray-600">{team.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Document Title *
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            placeholder="e.g., Customer Onboarding Process"
                        />
                    </div>

                    {/* Category and Version */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Category
                            </label>
                            <select
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Version
                            </label>
                            <input
                                type="text"
                                name="version"
                                value={formData.version}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="1.0"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Description
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                            placeholder="Brief description of the document..."
                        />
                    </div>

                    {/* Content */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Document Content
                        </label>
                        <textarea
                            name="content"
                            value={formData.content}
                            onChange={handleChange}
                            rows={8}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none font-mono"
                            placeholder="Document content, procedures, guidelines..."
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
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
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                            >
                                Add
                            </button>
                        </div>
                        {formData.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.tags.map(tag => (
                                    <span
                                        key={tag}
                                        className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs flex items-center gap-1"
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

                    {/* File Attachment */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Attachments
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                            <input
                                type="file"
                                id="fileUpload"
                                onChange={handleFileSelect}
                                className="hidden"
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                            />
                            <label
                                htmlFor="fileUpload"
                                className="cursor-pointer"
                            >
                                <i className="fas fa-cloud-upload-alt text-3xl text-gray-400 mb-2"></i>
                                <p className="text-sm text-gray-600">
                                    Click to upload or drag and drop
                                </p>
                                <p className="text-xs text-gray-500">
                                    PDF, Word, Excel, Images (Max 10MB)
                                </p>
                            </label>
                            {selectedFile && (
                                <div className="mt-3 p-2 bg-gray-50 rounded text-left">
                                    <p className="text-xs text-gray-700 font-medium">{selectedFile.name}</p>
                                    <p className="text-xs text-gray-500">
                                        {(selectedFile.size / 1024).toFixed(2)} KB
                                    </p>
                                </div>
                            )}
                        </div>
                        {formData.attachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                                <p className="text-xs font-medium text-gray-700">Existing Attachments:</p>
                                {formData.attachments.map((att, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                                        <span className="text-gray-700">{att.name}</span>
                                        <span className="text-gray-500">{(att.size / 1024).toFixed(2)} KB</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                        >
                            {document ? 'Update Document' : 'Create Document'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.DocumentModal = DocumentModal;
