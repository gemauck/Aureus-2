/**
 * REFACTORED VERSION - Simplified Document Collection Tracker
 * 
 * Best Practices:
 * 1. Single Source of Truth: Database
 * 2. Simple State Management: React state + minimal refs
 * 3. Clear Data Flow: Load → Edit → Save → Reload
 * 4. Optimistic Updates: Update UI immediately, sync with server
 * 5. Proper Error Handling: Clear error states
 */

const { useState, useEffect, useRef, useCallback } = React;

const MonthlyDocumentCollectionTracker = ({ project, onBack }) => {
    // ============================================================
    // SIMPLE STATE MANAGEMENT
    // ============================================================
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(() => {
        // Simple year persistence
        if (project?.id && typeof window !== 'undefined') {
            const stored = localStorage.getItem(`docCollectionYear_${project.id}`);
            return stored ? parseInt(stored, 10) : currentYear;
        }
        return currentYear;
    });
    
    const [sectionsByYear, setSectionsByYear] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    
    // Minimal refs - only for things that don't trigger re-renders
    const saveTimeoutRef = useRef(null);
    const apiRef = useRef(window.DocumentCollectionAPI || null);
    
    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    // Normalize data from database (handles year-based or legacy array format)
    const normalizeSections = useCallback((data) => {
        if (!data) return {};
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch {
                return {};
            }
        }
        
        // If already year-based object, return as-is
        if (typeof data === 'object' && !Array.isArray(data)) {
            return data;
        }
        
        // Legacy array format - convert to year-based
        if (Array.isArray(data)) {
            return { [selectedYear]: data };
        }
        
        return {};
    }, [selectedYear]);
    
    // Serialize for saving
    const serializeSections = useCallback((data) => {
        return JSON.stringify(data || {});
    }, []);
    
    // ============================================================
    // LOAD DATA FROM DATABASE
    // ============================================================
    const loadFromDatabase = useCallback(async () => {
        if (!project?.id || !apiRef.current) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const freshProject = await apiRef.current.fetchProject(project.id);
            const normalized = normalizeSections(freshProject?.documentSections);
            setSectionsByYear(normalized);
        } catch (err) {
            console.error('Failed to load document sections:', err);
            setError('Failed to load data. Please refresh the page.');
        } finally {
            setIsLoading(false);
        }
    }, [project?.id, normalizeSections]);
    
    // ============================================================
    // SAVE DATA TO DATABASE
    // ============================================================
    const saveToDatabase = useCallback(async () => {
        if (!project?.id || !apiRef.current || isSaving) return;
        
        setIsSaving(true);
        setError(null);
        
        try {
            const payload = sectionsByYear;
            await apiRef.current.saveDocumentSections(project.id, payload, true);
            
            // Reload from database after save to get any server-side transformations
            await loadFromDatabase();
        } catch (err) {
            console.error('Failed to save document sections:', err);
            setError('Failed to save changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }, [project?.id, sectionsByYear, isSaving, loadFromDatabase]);
    
    // ============================================================
    // DEBOUNCED SAVE
    // ============================================================
    useEffect(() => {
        if (isLoading || !project?.id) return;
        
        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        // Debounce save by 1 second
        saveTimeoutRef.current = setTimeout(() => {
            saveToDatabase();
        }, 1000);
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [sectionsByYear, isLoading, project?.id, saveToDatabase]);
    
    // ============================================================
    // INITIAL LOAD
    // ============================================================
    useEffect(() => {
        if (project?.id) {
            loadFromDatabase();
        }
    }, [project?.id, loadFromDatabase]);
    
    // ============================================================
    // YEAR PERSISTENCE
    // ============================================================
    useEffect(() => {
        if (project?.id && typeof window !== 'undefined') {
            localStorage.setItem(`docCollectionYear_${project.id}`, selectedYear.toString());
        }
    }, [selectedYear, project?.id]);
    
    // ============================================================
    // HANDLERS - Simple and direct
    // ============================================================
    const handleAddSection = useCallback((name, description) => {
        setSectionsByYear(prev => {
            const yearSections = prev[selectedYear] || [];
            const newSection = {
                id: Date.now(),
                name,
                description: description || '',
                documents: []
            };
            return {
                ...prev,
                [selectedYear]: [...yearSections, newSection]
            };
        });
    }, [selectedYear]);
    
    const handleAddDocument = useCallback((sectionId, name, description) => {
        setSectionsByYear(prev => {
            const yearSections = prev[selectedYear] || [];
            return {
                ...prev,
                [selectedYear]: yearSections.map(section => {
                    if (section.id === sectionId) {
                        const newDocument = {
                            id: Date.now(),
                            name,
                            description: description || '',
                            statuses: {},
                            comments: {}
                        };
                        return {
                            ...section,
                            documents: [...(section.documents || []), newDocument]
                        };
                    }
                    return section;
                })
            };
        });
    }, [selectedYear]);
    
    const handleUpdateStatus = useCallback((sectionId, documentId, month, status) => {
        setSectionsByYear(prev => {
            const yearSections = prev[selectedYear] || [];
            return {
                ...prev,
                [selectedYear]: yearSections.map(section => {
                    if (section.id === sectionId) {
                        return {
                            ...section,
                            documents: (section.documents || []).map(doc => {
                                if (doc.id === documentId) {
                                    return {
                                        ...doc,
                                        statuses: {
                                            ...(doc.statuses || {}),
                                            [month.toLowerCase()]: status
                                        }
                                    };
                                }
                                return doc;
                            })
                        };
                    }
                    return section;
                })
            };
        });
    }, [selectedYear]);
    
    const handleAddComment = useCallback((sectionId, documentId, month, commentText) => {
        if (!commentText.trim()) return;
        
        const currentUser = getCurrentUser();
        const newComment = {
            id: Date.now(),
            text: commentText,
            date: new Date().toISOString(),
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id
        };
        
        setSectionsByYear(prev => {
            const yearSections = prev[selectedYear] || [];
            return {
                ...prev,
                [selectedYear]: yearSections.map(section => {
                    if (section.id === sectionId) {
                        return {
                            ...section,
                            documents: (section.documents || []).map(doc => {
                                if (doc.id === documentId) {
                                    const monthKey = month.toLowerCase();
                                    const existingComments = doc.comments?.[monthKey] || [];
                                    return {
                                        ...doc,
                                        comments: {
                                            ...(doc.comments || {}),
                                            [monthKey]: [...existingComments, newComment]
                                        }
                                    };
                                }
                                return doc;
                            })
                        };
                    }
                    return section;
                })
            };
        });
    }, [selectedYear]);
    
    const handleDeleteSection = useCallback((sectionId) => {
        if (!confirm('Delete this section and all its documents?')) return;
        
        setSectionsByYear(prev => {
            const yearSections = prev[selectedYear] || [];
            return {
                ...prev,
                [selectedYear]: yearSections.filter(s => s.id !== sectionId)
            };
        });
    }, [selectedYear]);
    
    const handleDeleteDocument = useCallback((sectionId, documentId) => {
        if (!confirm('Delete this document?')) return;
        
        setSectionsByYear(prev => {
            const yearSections = prev[selectedYear] || [];
            return {
                ...prev,
                [selectedYear]: yearSections.map(section => {
                    if (section.id === sectionId) {
                        return {
                            ...section,
                            documents: (section.documents || []).filter(d => d.id !== documentId)
                        };
                    }
                    return section;
                })
            };
        });
    }, [selectedYear]);
    
    // ============================================================
    // RENDER
    // ============================================================
    const currentSections = sectionsByYear[selectedYear] || [];
    
    if (isLoading) {
        return <div>Loading document collection...</div>;
    }
    
    if (error) {
        return (
            <div>
                <div style={{ color: 'red' }}>{error}</div>
                <button onClick={loadFromDatabase}>Retry</button>
            </div>
        );
    }
    
    // Render UI here - simplified version
    return (
        <div>
            <h1>Monthly Document Collection Tracker</h1>
            {isSaving && <div>Saving...</div>}
            
            <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            >
                {Array.from({ length: 20 }, (_, i) => currentYear - 10 + i).map(year => (
                    <option key={year} value={year}>{year}</option>
                ))}
            </select>
            
            <button onClick={() => {
                const name = prompt('Section name:');
                if (name) handleAddSection(name);
            }}>
                Add Section
            </button>
            
            {currentSections.map(section => (
                <div key={section.id}>
                    <h3>{section.name}</h3>
                    <button onClick={() => handleDeleteSection(section.id)}>Delete</button>
                    
                    {section.documents?.map(doc => (
                        <div key={doc.id}>
                            <strong>{doc.name}</strong>
                            {months.map((month, idx) => (
                                <div key={idx}>
                                    {month}:
                                    <button onClick={() => handleUpdateStatus(section.id, doc.id, month, 'collected')}>
                                        {doc.statuses?.[month.toLowerCase()] || 'Not Collected'}
                                    </button>
                                    <button onClick={() => {
                                        const comment = prompt('Add comment:');
                                        if (comment) handleAddComment(section.id, doc.id, month, comment);
                                    }}>
                                        Comment
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

// Export for use
if (typeof window !== 'undefined') {
    window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
}


