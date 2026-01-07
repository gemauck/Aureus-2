// Use React from window
const { useState, useEffect, useMemo } = React;

const Tools = () => {
    const [currentTool, setCurrentTool] = useState(null);
    const [toolComponents, setToolComponents] = useState({
        PDFToWordConverter: null,
        HandwritingToWord: null,
        UnitConverter: null,
        TankSizeCalculator: null,
        DieselRefundEvidenceEvaluator: null
    });

    // Wait for tool components to load from window
    useEffect(() => {
        let timeoutId = null;
        let retryCount = 0;
        const maxRetries = 200; // Stop after 20 seconds (200 * 100ms)
        let isChecking = true;
        
        const checkComponents = () => {
            const components = {
                PDFToWordConverter: window.PDFToWordConverter,
                HandwritingToWord: window.HandwritingToWord,
                UnitConverter: window.UnitConverter,
                TankSizeCalculator: window.TankSizeCalculator,
                DieselRefundEvidenceEvaluator: window.DieselRefundEvidenceEvaluator
            };
            
            // Always update toolComponents state (even if not all loaded) so UI can show available tools
            setToolComponents(prev => {
                // Only update if something changed
                const hasChanged = Object.keys(components).some(key => 
                    !!components[key] !== !!prev[key]
                );
                return hasChanged ? components : prev;
            });
            
            // Check if any component is missing
            const allLoaded = Object.values(components).every(comp => comp !== undefined && comp !== null);
            
            if (!allLoaded && retryCount < maxRetries && isChecking) {
                // Components not loaded yet, wait a bit and check again
                retryCount++;
                timeoutId = setTimeout(checkComponents, 100);
            } else if (!allLoaded && retryCount >= maxRetries) {
                // Max retries reached - log which components are missing
                console.warn('⚠️ Tools: Some tool components failed to load after maximum retries', {
                    TankSizeCalculator: !!components.TankSizeCalculator,
                    UnitConverter: !!components.UnitConverter,
                    PDFToWordConverter: !!components.PDFToWordConverter,
                    HandwritingToWord: !!components.HandwritingToWord,
                    DieselRefundEvidenceEvaluator: !!components.DieselRefundEvidenceEvaluator
                });
                isChecking = false;
            }
        };
        
        // Initial check
        checkComponents();
        
        // Also listen for window load events
        window.addEventListener('load', checkComponents);
        
        // Also check when scripts are loaded
        if (document.readyState === 'complete') {
            checkComponents();
        } else {
            window.addEventListener('load', checkComponents);
        }
        
        // Continue checking periodically even after max retries (in case components load late)
        const periodicCheck = setInterval(() => {
            const components = {
                PDFToWordConverter: window.PDFToWordConverter,
                HandwritingToWord: window.HandwritingToWord,
                UnitConverter: window.UnitConverter,
                TankSizeCalculator: window.TankSizeCalculator,
                DieselRefundEvidenceEvaluator: window.DieselRefundEvidenceEvaluator
            };
            setToolComponents(prev => {
                const hasChanged = Object.keys(components).some(key => 
                    !!components[key] !== !!prev[key]
                );
                // Always return new components if changed, otherwise return prev to avoid unnecessary re-renders
                return hasChanged ? components : prev;
            });
        }, 2000); // Check every 2 seconds
        
        // Cleanup
        return () => {
            isChecking = false;
            if (timeoutId) clearTimeout(timeoutId);
            clearInterval(periodicCheck);
            window.removeEventListener('load', checkComponents);
        };
    }, []);

    // Build tools array with components - use useMemo to recalculate when toolComponents changes
    const tools = useMemo(() => [
        {
            id: 'tank-calculator',
            name: 'Tank Size Calculator',
            description: 'Calculate tank volumes, fuel weights, and generate calibration charts',
            icon: 'fa-gas-pump',
            color: 'blue',
            component: toolComponents.TankSizeCalculator
        },
        {
            id: 'unit-converter',
            name: 'Unit Converter',
            description: 'Convert between different units of measurement',
            icon: 'fa-exchange-alt',
            color: 'orange',
            component: toolComponents.UnitConverter
        },
        {
            id: 'pdf-to-word',
            name: 'PDF to RTF',
            description: 'Extract text from PDF documents and save as RTF format',
            icon: 'fa-file-pdf',
            color: 'red',
            component: toolComponents.PDFToWordConverter
        },
        {
            id: 'handwriting-to-word',
            name: 'Handwriting to Text',
            description: 'Convert handwritten text images to editable RTF documents using OCR',
            icon: 'fa-pen-fancy',
            color: 'purple',
            component: toolComponents.HandwritingToWord
        },
        {
            id: 'diesel-refund-evaluator',
            name: 'Diesel Refund Evidence Evaluator',
            description: 'Evaluate any data to determine if it qualifies as evidence for diesel refund claims',
            icon: 'fa-file-invoice-dollar',
            color: 'green',
            component: toolComponents.DieselRefundEvidenceEvaluator
        }
    ], [toolComponents]);

    const renderToolContent = () => {
        if (!currentTool) {
            return (
                <div className="max-w-6xl mx-auto">
                    <div className="mb-4">
                        <h1 className="text-lg font-bold text-gray-900">Staff Tools</h1>
                        <p className="text-xs text-gray-600 mt-0.5">Productivity tools and utilities for daily tasks</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {tools.map(tool => {
                            const hasComponent = tool.component !== null && tool.component !== undefined;
                            return (
                            <button
                                key={tool.id}
                                onClick={() => hasComponent && !tool.comingSoon && setCurrentTool(tool)}
                                disabled={tool.comingSoon || !hasComponent}
                                className={`bg-white rounded-lg border border-gray-200 p-4 text-left transition-all hover:shadow-md ${
                                    tool.comingSoon || !hasComponent
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
                                {!hasComponent && (
                                    <p className="text-[10px] text-gray-400 mt-1 italic">Loading...</p>
                                )}
                            </button>
                            );
                        })}
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

        // Get the current component from the tools array (in case it was loaded after tool selection)
        const currentToolWithComponent = tools.find(t => t.id === currentTool.id);
        const ToolComponent = currentToolWithComponent?.component;
        
        // If component is not loaded yet, show loading state
        if (!ToolComponent) {
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
                    <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-gray-400 mb-4"></i>
                        <p className="text-gray-500">Loading {currentTool.name}...</p>
                        <p className="text-xs text-gray-400 mt-2">Please wait while the tool component loads</p>
                    </div>
                </div>
            );
        }
        
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
                <ToolComponent />
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
