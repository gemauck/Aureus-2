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
                            className={`cursor-pointer rounded-lg border-2 p-6 transition-all hover:shadow-lg ${
                                selectedTemplate === template.id
                                    ? 'border-primary-600 bg-primary-50 dark:border-primary-500 dark:bg-primary-950/40'
                                    : 'border-gray-200 hover:border-primary-300 dark:border-gray-600 dark:hover:border-primary-500'
                            }`}
                        >
                            {/* Preview Area */}
                            <div className={`mb-4 rounded-lg p-6 ${
                                template.id === 'modern' ? 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/40' :
                                template.id === 'classic' ? 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900' :
                                template.id === 'minimal' ? 'border-2 border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900' :
                                'bg-gradient-to-br from-primary-50 to-pink-50 dark:from-primary-950/35 dark:to-pink-950/25'
                            }`}>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className={`text-2xl font-bold ${
                                                template.id === 'creative' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-800 dark:text-gray-100'
                                            }`}>
                                                INVOICE
                                            </div>
                                            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">#INV-0001</div>
                                        </div>
                                        <div className={`w-12 h-12 rounded ${
                                            template.id === 'modern' ? 'bg-blue-600' :
                                            template.id === 'classic' ? 'bg-gray-700' :
                                            template.id === 'minimal' ? 'bg-black' :
                                            'bg-gradient-to-br from-primary-600 to-pink-600'
                                        }`}></div>
                                    </div>
                                    <div className="h-16 rounded bg-white/70 p-2 dark:bg-gray-800/80">
                                        <div className="mb-2 h-2 w-3/4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                        <div className="h-2 w-1/2 rounded bg-gray-300 dark:bg-gray-600"></div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="h-1 w-full rounded bg-gray-300 dark:bg-gray-600"></div>
                                        <div className="h-1 w-full rounded bg-gray-300 dark:bg-gray-600"></div>
                                        <div className="h-1 w-3/4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                    </div>
                                </div>
                            </div>

                            {/* Template Info */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{template.name}</h3>
                                    {selectedTemplate === template.id && (
                                        <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                                            <i className="fas fa-check text-white text-xs"></i>
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-300">{template.description}</p>
                                <p className="text-xs italic text-gray-500 dark:text-gray-400">{template.preview}</p>
                            </div>

                            {/* Features */}
                            <div className="mt-4 border-t pt-4 dark:border-gray-700">
                                <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                                    <i className="fas fa-check mr-2 text-green-600 dark:text-green-400"></i>
                                    <span>Professional layout</span>
                                </div>
                                <div className="mt-1 flex items-center text-xs text-gray-600 dark:text-gray-400">
                                    <i className="fas fa-check mr-2 text-green-600 dark:text-green-400"></i>
                                    <span>Print-optimized</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Custom Template Coming Soon */}
                <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center dark:border-gray-600 dark:bg-gray-800/50">
                    <i className="fas fa-magic mb-2 text-2xl text-gray-400 dark:text-gray-500"></i>
                    <div className="font-medium text-gray-700 dark:text-gray-200">Custom Template Designer</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Coming Soon - Create your own branded template</div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex items-center justify-between border-t pt-6 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
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
