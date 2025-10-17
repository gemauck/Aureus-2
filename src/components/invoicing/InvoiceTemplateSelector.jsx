const { useState } = window;

export const InvoiceTemplateSelector = ({ currentTemplate, onSelect, onClose }) => {
    const templates = [
        {
            id: 'modern',
            name: 'Modern Professional',
            description: 'Clean, contemporary design with blue accents',
            preview: 'Modern layout with bold headers and clean typography'
        },
        {
            id: 'classic',
            name: 'Classic Business',
            description: 'Traditional professional layout',
            preview: 'Timeless design with formal structure'
        },
        {
            id: 'minimal',
            name: 'Minimalist',
            description: 'Simple and elegant design',
            preview: 'Stripped-down, focus on content'
        },
        {
            id: 'creative',
            name: 'Creative Bold',
            description: 'Eye-catching design with vibrant colors',
            preview: 'Stand out with dynamic layout'
        }
    ];

    const [selectedTemplate, setSelectedTemplate] = useState(currentTemplate);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">Choose Invoice Template</h2>
                        <p className="text-gray-600 mt-1">Select a professional design for your invoices</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {templates.map((template) => (
                        <div
                            key={template.id}
                            onClick={() => setSelectedTemplate(template.id)}
                            className={`border-2 rounded-lg p-6 cursor-pointer transition-all hover:shadow-lg ${
                                selectedTemplate === template.id
                                    ? 'border-primary-600 bg-primary-50'
                                    : 'border-gray-200 hover:border-primary-300'
                            }`}
                        >
                            {/* Preview Area */}
                            <div className={`mb-4 p-6 rounded-lg ${
                                template.id === 'modern' ? 'bg-gradient-to-br from-blue-50 to-blue-100' :
                                template.id === 'classic' ? 'bg-gradient-to-br from-gray-50 to-gray-100' :
                                template.id === 'minimal' ? 'bg-white border-2 border-gray-300' :
                                'bg-gradient-to-br from-purple-50 to-pink-50'
                            }`}>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className={`text-2xl font-bold ${
                                                template.id === 'creative' ? 'text-purple-600' : 'text-gray-800'
                                            }`}>
                                                INVOICE
                                            </div>
                                            <div className="text-xs text-gray-600 mt-1">#INV-0001</div>
                                        </div>
                                        <div className={`w-12 h-12 rounded ${
                                            template.id === 'modern' ? 'bg-blue-600' :
                                            template.id === 'classic' ? 'bg-gray-700' :
                                            template.id === 'minimal' ? 'bg-black' :
                                            'bg-gradient-to-br from-purple-600 to-pink-600'
                                        }`}></div>
                                    </div>
                                    <div className="h-16 bg-white bg-opacity-70 rounded p-2">
                                        <div className="h-2 bg-gray-300 rounded w-3/4 mb-2"></div>
                                        <div className="h-2 bg-gray-300 rounded w-1/2"></div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="h-1 bg-gray-300 rounded w-full"></div>
                                        <div className="h-1 bg-gray-300 rounded w-full"></div>
                                        <div className="h-1 bg-gray-300 rounded w-3/4"></div>
                                    </div>
                                </div>
                            </div>

                            {/* Template Info */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-gray-800">{template.name}</h3>
                                    {selectedTemplate === template.id && (
                                        <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                                            <i className="fas fa-check text-white text-xs"></i>
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-gray-600">{template.description}</p>
                                <p className="text-xs text-gray-500 italic">{template.preview}</p>
                            </div>

                            {/* Features */}
                            <div className="mt-4 pt-4 border-t">
                                <div className="flex items-center text-xs text-gray-600">
                                    <i className="fas fa-check text-green-600 mr-2"></i>
                                    <span>Professional layout</span>
                                </div>
                                <div className="flex items-center text-xs text-gray-600 mt-1">
                                    <i className="fas fa-check text-green-600 mr-2"></i>
                                    <span>Print-optimized</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Custom Template Coming Soon */}
                <div className="p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg text-center">
                    <i className="fas fa-magic text-gray-400 text-2xl mb-2"></i>
                    <div className="font-medium text-gray-700">Custom Template Designer</div>
                    <div className="text-sm text-gray-500">Coming Soon - Create your own branded template</div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between items-center mt-6 pt-6 border-t">
                    <div className="text-sm text-gray-600">
                        Current template: <span className="font-medium">{templates.find(t => t.id === currentTemplate)?.name}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSelect(selectedTemplate)}
                            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                            <i className="fas fa-check mr-2"></i>
                            Apply Template
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceTemplateSelector;
