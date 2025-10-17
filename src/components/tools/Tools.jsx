// Use React from window
const { useState } = React;

const Tools = () => {
    const [currentTool, setCurrentTool] = useState(null);

    // Get tool components from window
    const PDFToWordConverter = window.PDFToWordConverter;
    const HandwritingToWord = window.HandwritingToWord;
    const UnitConverter = window.UnitConverter;
    const TankSizeCalculator = window.TankSizeCalculator;

    const tools = [
        {
            id: 'tank-calculator',
            name: 'Tank Size Calculator',
            description: 'Calculate tank volumes, fuel weights, and generate calibration charts',
            icon: 'fa-gas-pump',
            color: 'blue',
            component: TankSizeCalculator
        },
        {
            id: 'unit-converter',
            name: 'Unit Converter',
            description: 'Convert between different units of measurement',
            icon: 'fa-exchange-alt',
            color: 'orange',
            component: UnitConverter
        },
        {
            id: 'pdf-to-word',
            name: 'PDF to RTF',
            description: 'Extract text from PDF documents and save as RTF format',
            icon: 'fa-file-pdf',
            color: 'red',
            component: PDFToWordConverter
        },
        {
            id: 'handwriting-to-word',
            name: 'Handwriting to Text',
            description: 'Convert handwritten text images to editable RTF documents using OCR',
            icon: 'fa-pen-fancy',
            color: 'purple',
            component: HandwritingToWord
        }
    ];

    const renderToolContent = () => {
        if (!currentTool) {
            return (
                <div className="max-w-6xl mx-auto">
                    <div className="mb-4">
                        <h1 className="text-lg font-bold text-gray-900">Staff Tools</h1>
                        <p className="text-xs text-gray-600 mt-0.5">Productivity tools and utilities for daily tasks</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {tools.map(tool => (
                            <button
                                key={tool.id}
                                onClick={() => !tool.comingSoon && setCurrentTool(tool)}
                                disabled={tool.comingSoon}
                                className={`bg-white rounded-lg border border-gray-200 p-4 text-left transition-all hover:shadow-md ${
                                    tool.comingSoon 
                                        ? 'opacity-60 cursor-not-allowed' 
                                        : 'hover:border-gray-300 cursor-pointer'
                                }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className={`w-10 h-10 rounded-lg bg-${tool.color}-100 flex items-center justify-center`}>
                                        <i className={`fas ${tool.icon} text-${tool.color}-600 text-base`}></i>
                                    </div>
                                    {tool.comingSoon && (
                                        <span className="text-[9px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-medium">
                                            Coming Soon
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-1">{tool.name}</h3>
                                <p className="text-xs text-gray-600 leading-relaxed">{tool.description}</p>
                            </button>
                        ))}
                    </div>

                    {/* Quick Stats */}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] text-gray-600 mb-0.5">Tools Available</p>
                                    <p className="text-lg font-bold text-gray-900">{tools.filter(t => !t.comingSoon).length}</p>
                                </div>
                                <i className="fas fa-tools text-primary-600 text-lg"></i>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] text-gray-600 mb-0.5">Coming Soon</p>
                                    <p className="text-lg font-bold text-gray-900">{tools.filter(t => t.comingSoon).length}</p>
                                </div>
                                <i className="fas fa-clock text-orange-600 text-lg"></i>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] text-gray-600 mb-0.5">Total Tools</p>
                                    <p className="text-lg font-bold text-gray-900">{tools.length}</p>
                                </div>
                                <i className="fas fa-layer-group text-green-600 text-lg"></i>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        const ToolComponent = currentTool.component;
        
        return (
            <div className="max-w-6xl mx-auto">
                <div className="mb-3 flex items-center">
                    <button
                        onClick={() => setCurrentTool(null)}
                        className="text-xs text-gray-600 hover:text-gray-900 flex items-center"
                    >
                        <i className="fas fa-arrow-left mr-1.5 text-[10px]"></i>
                        Back to Tools
                    </button>
                    <div className="ml-3 pl-3 border-l border-gray-300">
                        <h2 className="text-sm font-semibold text-gray-900">{currentTool.name}</h2>
                        <p className="text-[10px] text-gray-600">{currentTool.description}</p>
                    </div>
                </div>
                {ToolComponent ? <ToolComponent /> : <div>Tool loading...</div>}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {renderToolContent()}
        </div>
    );
};

// Make available globally
window.Tools = Tools;
