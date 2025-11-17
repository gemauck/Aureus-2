// Get React hooks from window
const { useState, useEffect, useRef } = React;
const storage = window.storage;

const DocumentCollectionChecklist = ({ project, onBack }) => {
    // Define the checklist structure
    const defaultChecklist = [
        {
            id: 'file1',
            name: 'File 1',
            documents: [
                { id: 'file1-doc1', name: 'Mining Right', completed: false },
                { id: 'file1-doc2', name: 'CIPC Documents', completed: false },
                { id: 'file1-doc3', name: 'Diesel Refund Registration', completed: false },
                { id: 'file1-doc4', name: 'VAT Registration', completed: false },
                { id: 'file1-doc5', name: 'Title Deed / Lease Agreement', completed: false },
                { id: 'file1-doc6', name: 'Environmental Authorisations', completed: false },
                { id: 'file1-doc7', name: 'Summary of Operations and Activities', completed: false },
                { id: 'file1-doc8', name: 'Descriptions of Specialised Data Systems', completed: false },
                { id: 'file1-doc9', name: 'File 1 Explanation', completed: false }
            ]
        },
        {
            id: 'file2',
            name: 'File 2',
            documents: [
                { id: 'file2-doc1', name: 'Fuel Supply Contract', completed: false },
                { id: 'file2-doc2', name: 'Mining Contractors Contracts', completed: false },
                { id: 'file2-doc3', name: 'Sale of Product Contracts', completed: false },
                { id: 'file2-doc4', name: 'File 2 Explanation', completed: false }
            ]
        },
        {
            id: 'file3',
            name: 'File 3',
            documents: [
                { id: 'file3-doc1', name: 'Tank and Pump Configuration', completed: false },
                { id: 'file3-doc2', name: 'Diagram of Fuel System', completed: false },
                { id: 'file3-doc3', name: 'Photos of meter', completed: false },
                { id: 'file3-doc4', name: 'Delivery Notes', completed: false },
                { id: 'file3-doc5', name: 'Invoices', completed: false },
                { id: 'file3-doc6', name: 'Remittance Advices', completed: false },
                { id: 'file3-doc7', name: 'Proof of payments', completed: false },
                { id: 'file3-doc8', name: 'Tank Reconcilliations', completed: false },
                { id: 'file3-doc9', name: 'Photos of Meter Readings', completed: false },
                { id: 'file3-doc10', name: 'Meter Readings', completed: false },
                { id: 'file3-doc11', name: 'Calibration Certificates', completed: false },
                { id: 'file3-doc12', name: 'Document', completed: false }
            ]
        },
        {
            id: 'file4',
            name: 'File 4',
            documents: [
                { id: 'file4-doc1', name: 'Asset Register - Combined Assets', completed: false },
                { id: 'file4-doc2', name: 'Asset Register - Mining Assets', completed: false },
                { id: 'file4-doc3', name: 'Asset Register - Non Mining Assets', completed: false },
                { id: 'file4-doc4', name: 'Driver List', completed: false },
                { id: 'file4-doc5', name: 'File 4 Explanation', completed: false }
            ]
        },
        {
            id: 'file5',
            name: 'File 5',
            documents: [
                { id: 'file5-doc1', name: 'Description and Literature of FMS', completed: false },
                { id: 'file5-doc2', name: 'FMS Raw Data', completed: false },
                { id: 'file5-doc3', name: 'Detailed Fuel Refund Report', completed: false },
                { id: 'file5-doc4', name: 'Fuel Refund Logbook Per Asset', completed: false },
                { id: 'file5-doc5', name: 'Claim Comparison [if applicable]', completed: false },
                { id: 'file5-doc6', name: 'File 5 Explanation', completed: false }
            ]
        },
        {
            id: 'file6',
            name: 'File 6',
            documents: [
                { id: 'file6-doc1', name: 'Monthly Survey Reports', completed: false },
                { id: 'file6-doc2', name: 'Production Reports', completed: false },
                { id: 'file6-doc3', name: 'Asset Activity Reports', completed: false },
                { id: 'file6-doc4', name: 'Asset Tagging Reports', completed: false },
                { id: 'file6-doc5', name: 'Diesel Cost Component', completed: false },
                { id: 'file6-doc6', name: 'Sales of Coal', completed: false },
                { id: 'file6-doc7', name: 'Weighbridge Data', completed: false },
                { id: 'file6-doc8', name: 'Contractor Invoices', completed: false },
                { id: 'file6-doc9', name: 'Contractor Remittances', completed: false },
                { id: 'file6-doc10', name: 'Contractor Proof of payment', completed: false },
                { id: 'file6-doc11', name: 'File 6 Explanation', completed: false }
            ]
        },
        {
            id: 'file7',
            name: 'File 7',
            documents: [
                { id: 'file7-doc1', name: 'Annual Financial Statements', completed: false },
                { id: 'file7-doc2', name: 'Management Accounts', completed: false },
                { id: 'file7-doc3', name: 'Any deviations (theft, loss etc)', completed: false },
                { id: 'file7-doc4', name: 'Fuel Caps Exceeded', completed: false },
                { id: 'file7-doc5', name: 'VAT 201 - Monthly', completed: false },
                { id: 'file7-doc6', name: 'File 7 Explanation', completed: false }
            ]
        }
    ];

    const getStorageKey = () => `documentChecklist_${project?.id}`;
    
    // Parse checklist from project prop or localStorage
    const parseChecklist = (data) => {
        if (!data) return null;
        if (Array.isArray(data)) return data;
        
        try {
            if (typeof data === 'string') {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Failed to parse checklist:', e);
        }
        
        return null;
    };
    
    // Initialize checklist from project prop, localStorage, or default
    const [checklist, setChecklist] = useState(() => {
        if (!project?.id) return defaultChecklist;
        
        // First, try to load from project prop (database)
        const projectChecklist = parseChecklist(project.documentChecklist);
        if (projectChecklist) {
            console.log('📋 Loaded checklist from project prop:', projectChecklist.length, 'sections');
            return projectChecklist;
        }
        
        // Fallback to localStorage
        try {
            const storageKey = getStorageKey();
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const parsed = JSON.parse(savedData);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    console.log('📋 Loaded checklist from localStorage:', parsed.length, 'sections');
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Failed to load checklist from storage:', e);
        }
        
        console.log('📋 Using default checklist');
        return defaultChecklist;
    });
    
    // Sync checklist when project prop changes
    useEffect(() => {
        if (!project?.id) return;
        
        const projectChecklist = parseChecklist(project.documentChecklist);
        if (projectChecklist && JSON.stringify(projectChecklist) !== JSON.stringify(checklist)) {
            console.log('🔄 Syncing checklist from project prop');
            setChecklist(projectChecklist);
        }
    }, [project?.documentChecklist, project?.id]);

    // Save checklist to localStorage whenever it changes
    useEffect(() => {
        if (!project?.id) return;
        
        const storageKey = getStorageKey();
        try {
            localStorage.setItem(storageKey, JSON.stringify(checklist));
        } catch (e) {
            console.warn('Failed to save checklist to storage:', e);
        }
    }, [checklist, project?.id]);

    // Save to database
    const saveToDatabase = async (updatedChecklist) => {
        if (!project?.id) return;
        
        try {
            const token = storage?.getToken?.() || '';
            const response = await fetch(`/api/projects/${project.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    documentChecklist: typeof updatedChecklist === 'string' 
                        ? updatedChecklist 
                        : JSON.stringify(updatedChecklist)
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save checklist to database');
            }
            
            console.log('✅ Checklist saved to database');
        } catch (error) {
            console.error('Error saving checklist to database:', error);
        }
    };

    // Toggle document completion
    const toggleDocument = (sectionId, documentId) => {
        const updatedChecklist = checklist.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    documents: section.documents.map(doc => 
                        doc.id === documentId 
                            ? { ...doc, completed: !doc.completed }
                            : doc
                    )
                };
            }
            return section;
        });
        
        setChecklist(updatedChecklist);
        saveToDatabase(updatedChecklist);
    };

    // Toggle all documents in a section
    const toggleSection = (sectionId) => {
        const section = checklist.find(s => s.id === sectionId);
        if (!section) return;
        
        const allCompleted = section.documents.every(doc => doc.completed);
        const updatedChecklist = checklist.map(s => {
            if (s.id === sectionId) {
                return {
                    ...s,
                    documents: s.documents.map(doc => ({
                        ...doc,
                        completed: !allCompleted
                    }))
                };
            }
            return s;
        });
        
        setChecklist(updatedChecklist);
        saveToDatabase(updatedChecklist);
    };

    // Calculate progress
    const calculateProgress = () => {
        let totalDocs = 0;
        let completedDocs = 0;
        
        checklist.forEach(section => {
            section.documents.forEach(doc => {
                totalDocs++;
                if (doc.completed) completedDocs++;
            });
        });
        
        return totalDocs > 0 ? Math.round((completedDocs / totalDocs) * 100) : 0;
    };

    const progress = calculateProgress();
    const [expandedSections, setExpandedSections] = useState(new Set(checklist.map(s => s.id)));

    const toggleSectionExpansion = (sectionId) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                    )}
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">Document Collection Checklist</h2>
                        <p className="text-sm text-gray-600 mt-0.5">Track required documents for this project</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-sm text-gray-600">Progress</div>
                        <div className="text-2xl font-bold text-primary-600">{progress}%</div>
                    </div>
                    <div className="w-16 h-16 rounded-full border-4 border-gray-200 flex items-center justify-center"
                         style={{
                             background: `conic-gradient(from 0deg, #3b82f6 0% ${progress}%, #e5e7eb ${progress}% 100%)`
                         }}>
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                            <i className="fas fa-check text-primary-600"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                    className="bg-primary-600 h-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                ></div>
            </div>

            {/* Checklist Sections */}
            <div className="space-y-3">
                {checklist.map((section) => {
                    const sectionCompleted = section.documents.every(doc => doc.completed);
                    const sectionProgress = section.documents.filter(doc => doc.completed).length;
                    const sectionTotal = section.documents.length;
                    const isExpanded = expandedSections.has(section.id);

                    return (
                        <div key={section.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            {/* Section Header */}
                            <div className="p-4 bg-gray-50 border-b border-gray-200">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1">
                                        <button
                                            onClick={() => toggleSectionExpansion(section.id)}
                                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                        >
                                            <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-xs`}></i>
                                        </button>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={sectionCompleted}
                                                onChange={() => toggleSection(section.id)}
                                                className="w-5 h-5 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                                            />
                                            <h3 className="text-base font-semibold text-gray-900">{section.name}</h3>
                                        </div>
                                        <span className="text-xs text-gray-500 ml-2">
                                            ({sectionProgress}/{sectionTotal})
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Section Documents */}
                            {isExpanded && (
                                <div className="p-4 space-y-2">
                                    {section.documents.map((document) => (
                                        <div 
                                            key={document.id}
                                            className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={document.completed}
                                                onChange={() => toggleDocument(section.id, document.id)}
                                                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                                            />
                                            <label 
                                                className={`flex-1 cursor-pointer ${
                                                    document.completed 
                                                        ? 'text-gray-500 line-through' 
                                                        : 'text-gray-900'
                                                }`}
                                                onClick={() => toggleDocument(section.id, document.id)}
                                            >
                                                {document.name}
                                            </label>
                                            {document.completed && (
                                                <i className="fas fa-check-circle text-green-500"></i>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Register component on window
if (typeof window !== 'undefined') {
    window.DocumentCollectionChecklist = DocumentCollectionChecklist;
    console.log('✅ DocumentCollectionChecklist component registered');
}

