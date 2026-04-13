// Use React from window
const { useState, useEffect, useMemo, useRef } = React;

/** Emails allowed to see the travel tool card and submit requests. Optional override: window.__TRAVEL_BOOKING_TOOL_EMAILS__ = "a@x.com,b@y.com" */
function travelBookingCreatorEmails() {
    const custom = typeof window !== 'undefined' && window.__TRAVEL_BOOKING_TOOL_EMAILS__;
    if (custom && String(custom).trim()) {
        return String(custom)
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
    }
    return ['garethm@abcotronics.co.za'];
}

function isTravelBookingCreatorUser() {
    const u = window.storage?.getUser?.() || {};
    const email = (u.email || '').trim().toLowerCase();
    return travelBookingCreatorEmails().includes(email);
}

/** Tool id from /tools/{id}, #/tools/{id}, or /tools?tool={id} when RouteState page is tools */
function parseToolIdFromLocation() {
    try {
        const rs = window.RouteState?.getRoute?.();
        if (!rs || rs.page !== 'tools') return null;
        const seg = rs.segments && rs.segments[0];
        if (seg) return decodeURIComponent(String(seg).trim());
        const q =
            rs.search && typeof rs.search.get === 'function'
                ? rs.search.get('tool')
                : new URLSearchParams(window.location.search || '').get('tool');
        return q ? String(q).trim() : null;
    } catch {
        return null;
    }
}

const Tools = () => {
    const { isDark } = window.useTheme?.() || { isDark: false };
    const [currentTool, setCurrentTool] = useState(null);
    const [toolComponents, setToolComponents] = useState({
        PDFToWordConverter: null,
        HandwritingToWord: null,
        UnitConverter: null,
        TankSizeCalculator: null,
        DieselRefundEvidenceEvaluator: null,
        DocumentParser: null,
        SafetyCultureInspections: null,
        DocumentSorter: null,
        ExpenseCaptureTool: null,
        TravelBookingRequests: null
    });
    const [toolsVersion, setToolsVersion] = useState(0); // Force re-render when components change
    const prevUrlToolIdRef = useRef(undefined);

    const goBackToToolsList = () => {
        setCurrentTool(null);
        prevUrlToolIdRef.current = null;
        try {
            window.RouteState?.navigate?.({
                page: 'tools',
                segments: [],
                search: '',
                preserveSearch: false,
                preserveHash: true,
                replace: true
            });
        } catch {
            /* ignore */
        }
    };

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
                DieselRefundEvidenceEvaluator: window.DieselRefundEvidenceEvaluator,
                DocumentParser: window.DocumentParser,
                SafetyCultureInspections: window.SafetyCultureInspections,
                DocumentSorter: window.DocumentSorter,
                ExpenseCaptureTool: window.ExpenseCaptureTool || window.ReceiptCaptureTool,
                TravelBookingRequests: window.TravelBookingRequests
            };
            
            // Always update toolComponents state (even if not all loaded) so UI can show available tools
            setToolComponents(prev => {
                // Check if anything actually changed
                const hasChanged = Object.keys(components).some(key => 
                    !!components[key] !== !!prev[key]
                );
                if (hasChanged) {
                    setToolsVersion(v => v + 1); // Force re-render
                }
                return components;
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
                    DieselRefundEvidenceEvaluator: !!components.DieselRefundEvidenceEvaluator,
                    DocumentParser: !!components.DocumentParser,
                    ExpenseCaptureTool: !!components.ExpenseCaptureTool,
                    TravelBookingRequests: !!components.TravelBookingRequests
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
                DieselRefundEvidenceEvaluator: window.DieselRefundEvidenceEvaluator,
                DocumentParser: window.DocumentParser,
                SafetyCultureInspections: window.SafetyCultureInspections,
                DocumentSorter: window.DocumentSorter,
                ExpenseCaptureTool: window.ExpenseCaptureTool || window.ReceiptCaptureTool,
                TravelBookingRequests: window.TravelBookingRequests
            };
            setToolComponents(prev => {
                const hasChanged = Object.keys(components).some(key => 
                    !!components[key] !== !!prev[key]
                );
                if (hasChanged) {
                    setToolsVersion(v => v + 1); // Force re-render
                }
                return components;
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

    // Full tool list (includes admin-only entries for deep links / assignee notification URLs)
    const allTools = useMemo(() => {
        const toolsArray = [
            {
                id: 'expense-capture',
                name: 'Expense Capture',
                description: 'Snap expense slips (app-style on mobile), AI extraction, allocate to accounts and cost centres, export CSV',
                icon: 'fa-money-bill-wave',
                color: 'emerald',
                component: toolComponents.ExpenseCaptureTool
            },
            {
                id: 'document-parser',
                name: 'Document Parser',
                description: 'Extract all information from documents including handwriting, tables, and structured data',
                icon: 'fa-file-search',
                color: 'sky',
                component: toolComponents.DocumentParser
            },
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
                color: 'primary',
                component: toolComponents.HandwritingToWord
            },
            {
                id: 'diesel-refund-evaluator',
                name: 'Diesel Refund Evidence Evaluator',
                description: 'Evaluate any data to determine if it qualifies as evidence for diesel refund claims',
                icon: 'fa-file-invoice-dollar',
                color: 'green',
                component: toolComponents.DieselRefundEvidenceEvaluator
            },
            {
                id: 'safety-culture-inspections',
                name: 'Safety Culture Inspections',
                description: 'View and manage iAuditor inspections and audit reports from Safety Culture',
                icon: 'fa-clipboard-check',
                color: 'teal',
                component: toolComponents.SafetyCultureInspections
            },
            {
                id: 'document-sorter',
                name: 'Diesel Refund Document Sorter',
                description: 'Upload a large zipped folder (10+ GB) and sort documents into File 1–7 categories',
                icon: 'fa-folder-tree',
                color: 'amber',
                component: toolComponents.DocumentSorter
            },
            {
                id: 'travel-booking-requests',
                name: 'Travel & accommodation requests',
                description: 'Request flights and accommodation with full trip details; notifies your nominated booker',
                icon: 'fa-plane',
                color: 'sky',
                component: toolComponents.TravelBookingRequests
            }
        ];
        // Debug: Log when tools array is recalculated
        console.log('🔧 Tools array recalculated:', {
            totalTools: toolsArray.length,
            dieselRefundComponent: !!toolComponents.DieselRefundEvidenceEvaluator,
            toolsVersion: toolsVersion,
            allComponents: Object.keys(toolComponents).map(k => ({ key: k, exists: !!toolComponents[k] })),
            toolsArray: toolsArray.map(t => ({ id: t.id, name: t.name, hasComponent: !!t.component }))
        });
        return toolsArray;
    }, [toolComponents, toolsVersion]); // Include toolsVersion to force recalculation

    const toolsForGrid = useMemo(() => {
        return allTools.filter((t) => {
            if (t.id === 'travel-booking-requests') return isTravelBookingCreatorUser();
            if (t.adminOnly) {
                const u = window.storage?.getUser?.() || {};
                return typeof window.isAdminRole === 'function' && window.isAdminRole(u.role);
            }
            return true;
        });
    }, [allTools, toolsVersion]);

    // Deep link: open a tool from /tools/{toolId} or /tools?tool={toolId}; must run after `allTools` exists (not in TDZ)
    useEffect(() => {
        const syncFromUrl = () => {
            const toolId = parseToolIdFromLocation();
            const prev = prevUrlToolIdRef.current;
            if (toolId) {
                const found = allTools.find((t) => t.id === toolId);
                if (found) setCurrentTool(found);
                prevUrlToolIdRef.current = toolId;
                return;
            }
            if (prev !== undefined && prev !== null && !toolId) {
                setCurrentTool(null);
            }
            prevUrlToolIdRef.current = toolId;
        };
        syncFromUrl();
        const unsub = window.RouteState?.subscribe?.(syncFromUrl);
        return () => {
            if (typeof unsub === 'function') unsub();
        };
    }, [allTools, toolsVersion]);

    const renderToolContent = () => {
        if (!currentTool) {
            return (
                <div className="max-w-6xl mx-auto">
                    <div className="mb-4">
                        <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Staff Tools</h1>
                        <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Productivity tools and utilities for daily tasks</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {toolsForGrid.map(tool => {
                            const hasComponent = tool.component !== null && tool.component !== undefined;
                            return (
                            <button
                                key={tool.id}
                                onClick={() => {
                                    if (!hasComponent || tool.comingSoon) return;
                                    setCurrentTool(tool);
                                    try {
                                        window.RouteState?.navigate?.({
                                            page: 'tools',
                                            segments: [tool.id],
                                            preserveSearch: false,
                                            preserveHash: true,
                                            replace: false
                                        });
                                    } catch {
                                        /* ignore */
                                    }
                                }}
                                disabled={tool.comingSoon || !hasComponent}
                                className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 text-left transition-all hover:shadow-md ${
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
                                    <p className="text-lg font-bold text-gray-900">{toolsForGrid.filter(t => !t.comingSoon).length}</p>
                                </div>
                                <i className="fas fa-tools text-primary-600 text-lg"></i>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] text-gray-600 mb-0.5">Coming Soon</p>
                                    <p className="text-lg font-bold text-gray-900">{toolsForGrid.filter(t => t.comingSoon).length}</p>
                                </div>
                                <i className="fas fa-clock text-orange-600 text-lg"></i>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] text-gray-600 mb-0.5">Total Tools</p>
                                    <p className="text-lg font-bold text-gray-900">{toolsForGrid.length}</p>
                                </div>
                                <i className="fas fa-layer-group text-green-600 text-lg"></i>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Get the current component from the tools array (in case it was loaded after tool selection)
        const currentToolWithComponent = allTools.find(t => t.id === currentTool.id);
        const ToolComponent = currentToolWithComponent?.component;
        
        // If component is not loaded yet, show loading state
        if (!ToolComponent) {
            return (
                <div className="max-w-6xl mx-auto">
                    <div className="mb-3 flex items-center">
                        <button
                            onClick={goBackToToolsList}
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
                        onClick={goBackToToolsList}
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
        <div className="erp-module-root space-y-4 min-w-0">
            {renderToolContent()}
        </div>
    );
};

// Make available globally
window.Tools = Tools;
