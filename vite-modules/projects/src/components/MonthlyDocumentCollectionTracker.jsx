// Get React hooks from window
const { useState, useEffect, useRef, useCallback } = React;
const storage = window.storage;
const STICKY_COLUMN_SHADOW = '4px 0 12px rgba(15, 23, 42, 0.08)';

// Initialize API service
// Note: The API service is imported in ProjectsModule.jsx to ensure it's bundled
// If it's not available, we use the fallback implementation below
const getAPI = () => {
    if (!window.DocumentCollectionAPI) {
        console.warn('⚠️ DocumentCollectionAPI not loaded, initializing fallback...');
        // Fallback: create minimal API wrapper that matches the service interface
        window.DocumentCollectionAPI = {
            updateToken: () => {},
            saveDocumentSections: async (projectId, sections, skipParentUpdate = false) => {
                const result = await window.DatabaseAPI.updateProject(projectId, {
                    documentSections: JSON.stringify(sections)
                });
                // Update parent component's project prop if available and not skipping
                // Skip parent update for auto-saves to prevent refresh issues
                if (!skipParentUpdate && window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                    const updatedProject = result?.data?.project || result?.project || result?.data;
                    if (updatedProject) {
                        window.updateViewingProject({
                            ...updatedProject,
                            documentSections: JSON.stringify(sections)
                        });
                    }
                }
                return result;
            },
            fetchProject: async (projectId) => {
                const result = await window.DatabaseAPI.getProject(projectId);
                return result?.data?.project || result?.project || result?.data || result;
            },
            getTemplates: async () => {
                try {
                    const token = window.storage?.getToken?.();
                    if (!token) {
                        console.warn('⚠️ No auth token available for fetching templates');
                        return [];
                    }
                    const response = await fetch('/api/document-collection-templates', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        const templates = data?.data?.templates || data?.templates || [];
                        console.log('📋 API returned templates:', templates.length);
                        if (templates.length > 0) {
                            console.log('First template structure:', {
                                id: templates[0].id,
                                name: templates[0].name,
                                hasSections: !!templates[0].sections,
                                sectionsType: typeof templates[0].sections,
                                sectionsLength: Array.isArray(templates[0].sections) ? templates[0].sections.length : 'not array'
                            });
                        }
                        return templates;
                    } else {
                        const errorText = await response.text();
                        console.error('❌ API error response:', response.status, errorText);
                        return [];
                    }
                } catch (error) {
                    console.error('❌ Error fetching templates:', error);
                    return [];
                }
            },
            getTemplate: async () => null,
            createTemplate: async (templateData) => {
                try {
                    const token = window.storage?.getToken?.();
                    if (!token) throw new Error('No auth token');
                    const response = await fetch('/api/document-collection-templates', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(templateData)
                    });
                    if (!response.ok) throw new Error(`API returned ${response.status}`);
                    const data = await response.json();
                    return data?.data?.template || data?.template;
                } catch (error) {
                    console.error('❌ Error creating template:', error);
                    throw error;
                }
            },
            updateTemplate: async (templateId, templateData) => {
                try {
                    const token = window.storage?.getToken?.();
                    if (!token) throw new Error('No auth token');
                    const response = await fetch(`/api/document-collection-templates/${encodeURIComponent(templateId)}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(templateData)
                    });
                    if (!response.ok) throw new Error(`API returned ${response.status}`);
                    const data = await response.json();
                    return data?.data?.template || data?.template;
                } catch (error) {
                    console.error('❌ Error updating template:', error);
                    throw error;
                }
            },
            deleteTemplate: async (templateId) => {
                try {
                    const token = window.storage?.getToken?.();
                    if (!token) throw new Error('No auth token');
                    const response = await fetch(`/api/document-collection-templates/${encodeURIComponent(templateId)}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (!response.ok) throw new Error(`API returned ${response.status}`);
                    return true;
                } catch (error) {
                    console.error('❌ Error deleting template:', error);
                    throw error;
                }
            },
        };
    }
    return window.DocumentCollectionAPI;
};

const MonthlyDocumentCollectionTracker = ({ project, onBack }) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    
    // Calculate working months (2 months in arrears from current month)
    const getWorkingMonths = () => {
        const twoMonthsBack = currentMonth - 2 < 0 ? currentMonth - 2 + 12 : currentMonth - 2;
        const oneMonthBack = currentMonth - 1 < 0 ? currentMonth - 1 + 12 : currentMonth - 1;
        return [twoMonthsBack, oneMonthBack];
    };
    
    const workingMonths = getWorkingMonths();
    const tableRef = useRef(null);
    const monthRefs = useRef({});
    const hasInitialScrolled = useRef(false);

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const YEAR_STORAGE_PREFIX = 'documentCollectionSelectedYear_';
    const getInitialSelectedYear = () => {
        if (typeof window !== 'undefined' && project?.id) {
            const storedYear = localStorage.getItem(`${YEAR_STORAGE_PREFIX}${project.id}`);
            const parsedYear = storedYear ? parseInt(storedYear, 10) : NaN;
            if (!Number.isNaN(parsedYear)) {
                return parsedYear;
            }
        }
        return currentYear;
    };
    const [selectedYear, setSelectedYear] = useState(getInitialSelectedYear);
    
    // ✅ NEW SIMPLE ARCHITECTURE: Database as single source of truth
    // Store sections organized by year: { [year]: sections[] }
    const [sectionsByYear, setSectionsByYear] = useState({});
    // Current year's sections (derived from sectionsByYear[selectedYear])
    const sections = sectionsByYear[selectedYear] || [];
    
    // Modal state storage key (persists across remounts) - use ref to avoid dependency issues
    const modalStateKeyRef = useRef(`docCollectionModalState_${project?.id || 'default'}`);
    
    // Update modal state key when project ID changes
    useEffect(() => {
        if (previousProjectIdRef.current !== project?.id) {
            // Clear old project's modal state
            if (previousProjectIdRef.current) {
                try {
                    sessionStorage.removeItem(`docCollectionModalState_${previousProjectIdRef.current}`);
                } catch (e) {
                    console.warn('Failed to clear old modal state:', e);
                }
            }
            previousProjectIdRef.current = project?.id;
            modalStateKeyRef.current = `docCollectionModalState_${project?.id || 'default'}`;
        }
    }, [project?.id]);
    
    // Restore modal state from sessionStorage on mount (persists across remounts)
    const getStoredModalState = (projectId) => {
        const key = `docCollectionModalState_${projectId || 'default'}`;
        try {
            const stored = sessionStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored);
                return {
                    showSectionModal: parsed.showSectionModal || false,
                    showDocumentModal: parsed.showDocumentModal || false,
                    showTemplateModal: parsed.showTemplateModal || false,
                    showApplyTemplateModal: parsed.showApplyTemplateModal || false
                };
            }
        } catch (e) {
            console.warn('Failed to parse stored modal state:', e);
        }
        return {
            showSectionModal: false,
            showDocumentModal: false,
            showTemplateModal: false,
            showApplyTemplateModal: false
        };
    };
    
    const initialModalState = getStoredModalState(project?.id);
    const [showSectionModal, setShowSectionModal] = useState(initialModalState.showSectionModal);
    const [showDocumentModal, setShowDocumentModal] = useState(initialModalState.showDocumentModal);
    const [showTemplateModal, setShowTemplateModal] = useState(initialModalState.showTemplateModal);
    const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(initialModalState.showApplyTemplateModal);
    
    // Persist modal state to sessionStorage whenever it changes
    useEffect(() => {
        try {
            sessionStorage.setItem(modalStateKeyRef.current, JSON.stringify({
                showSectionModal,
                showDocumentModal,
                showTemplateModal,
                showApplyTemplateModal
            }));
        } catch (e) {
            console.warn('Failed to store modal state:', e);
        }
    }, [showSectionModal, showDocumentModal, showTemplateModal, showApplyTemplateModal]);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [showTemplateList, setShowTemplateList] = useState(true);
    const [editingSection, setEditingSection] = useState(null);
    const [editingDocument, setEditingDocument] = useState(null);
    const [editingSectionId, setEditingSectionId] = useState(null);
    const editingSectionIdRef = useRef(null);
    const [draggedSection, setDraggedSection] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedDocument, setDraggedDocument] = useState(null);
    const [dragOverDocumentIndex, setDragOverDocumentIndex] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null);
    const [quickComment, setQuickComment] = useState('');
    const [commentPopupPosition, setCommentPopupPosition] = useState({ top: 0, left: 0 });
    const commentPopupContainerRef = useRef(null);
    const previousProjectIdRef = useRef(project?.id);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const saveTimeoutRef = useRef(null);
    const pendingSaveRef = useRef(null);
    const lastSavedSnapshotRef = useRef(null);
    const lastProjectDocumentSectionsRef = useRef(null); // Track last documentSections to prevent unnecessary reloads
    
    // Refs to track modal/form state for auto-save (always have latest values)
    const modalsOpenRef = useRef(false);
    const hasLoadedInitialDataRef = useRef(false);

    // Get API service instance
    const api = getAPI();
    const normalizeSections = useCallback((value) => (Array.isArray(value) ? value : []), []);
    const serializeSections = useCallback((value) => JSON.stringify(normalizeSections(value)), [normalizeSections]);
    
    // Helper to organize sections by year from flat array
    const organizeSectionsByYear = useCallback((flatSections) => {
        const organized = {};
        const allYears = new Set();
        
        // First, collect all years from existing month keys
        flatSections.forEach(section => {
            section.documents?.forEach(doc => {
                if (doc.collectionStatus) {
                    Object.keys(doc.collectionStatus).forEach(key => {
                        const match = key.match(/-(\d{4})$/);
                        if (match) allYears.add(parseInt(match[1]));
                    });
                }
                if (doc.comments) {
                    Object.keys(doc.comments).forEach(key => {
                        const match = key.match(/-(\d{4})$/);
                        if (match) allYears.add(parseInt(match[1]));
                    });
                }
            });
        });
        
        // Always include current year and selected year
        allYears.add(currentYear);
        if (selectedYear !== currentYear) {
            allYears.add(selectedYear);
        }
        
        // If no year data found, at least have current year
        if (allYears.size === 0) {
            allYears.add(currentYear);
        }
        
        // For each year, create a copy of sections with only that year's data
        allYears.forEach(year => {
            organized[year] = flatSections.map(section => ({
                ...section,
                documents: section.documents?.map(doc => {
                    const yearCollectionStatus = {};
                    const yearComments = {};
                    
                    // Filter collectionStatus for this year
                    if (doc.collectionStatus) {
                        Object.keys(doc.collectionStatus).forEach(key => {
                            if (key.endsWith(`-${year}`)) {
                                yearCollectionStatus[key] = doc.collectionStatus[key];
                            }
                        });
                    }
                    
                    // Filter comments for this year
                    if (doc.comments) {
                        Object.keys(doc.comments).forEach(key => {
                            if (key.endsWith(`-${year}`)) {
                                yearComments[key] = doc.comments[key];
                            }
                        });
                    }
                    
                    return {
                        ...doc,
                        collectionStatus: yearCollectionStatus,
                        comments: yearComments
                    };
                }) || []
            }));
        });
        
        return organized;
    }, [currentYear, selectedYear]);
    
    // Helper to merge sectionsByYear back into flat array for saving
    const mergeSectionsByYear = useCallback((sectionsByYearObj) => {
        const allSections = {};
        const allYears = Object.keys(sectionsByYearObj).map(y => parseInt(y));
        
        // For each year's sections, merge the data
        allYears.forEach(year => {
            const yearSections = sectionsByYearObj[year] || [];
            yearSections.forEach((section, sectionIdx) => {
                const sectionKey = section.id || `section-${sectionIdx}`;
                if (!allSections[sectionKey]) {
                    // Initialize section structure
                    allSections[sectionKey] = {
                        ...section,
                        documents: {}
                    };
                }
                
                // Merge documents
                section.documents?.forEach((doc, docIdx) => {
                    const docKey = doc.id || `doc-${docIdx}`;
                    if (!allSections[sectionKey].documents[docKey]) {
                        allSections[sectionKey].documents[docKey] = {
                            ...doc,
                            collectionStatus: {},
                            comments: {}
                        };
                    }
                    
                    // Merge collectionStatus
                    if (doc.collectionStatus) {
                        Object.keys(doc.collectionStatus).forEach(key => {
                            allSections[sectionKey].documents[docKey].collectionStatus[key] = doc.collectionStatus[key];
                        });
                    }
                    
                    // Merge comments
                    if (doc.comments) {
                        Object.keys(doc.comments).forEach(key => {
                            if (!allSections[sectionKey].documents[docKey].comments[key]) {
                                allSections[sectionKey].documents[docKey].comments[key] = [];
                            }
                            allSections[sectionKey].documents[docKey].comments[key] = doc.comments[key];
                        });
                    }
                });
            });
        });
        
        // Convert back to array format
        return Object.values(allSections).map(section => ({
            ...section,
            documents: Object.values(section.documents)
        }));
    }, []);

    // ✅ LOAD DATA FROM DATABASE ON MOUNT - Fetch fresh data
    // ⚠️ IMPORTANT: Only load on initial mount or when project ID actually changes (not on every prop update)
    useEffect(() => {
        if (!project?.id) return;
        
        // Check if this is a new project (project ID actually changed)
        const isNewProject = previousProjectIdRef.current !== project.id;
        
        // Also check if documentSections actually changed (not just prop reference)
        const currentDocumentSections = typeof project.documentSections === 'string' 
            ? project.documentSections 
            : JSON.stringify(project.documentSections || []);
        const lastDocumentSections = lastProjectDocumentSectionsRef.current;
        const documentSectionsChanged = currentDocumentSections !== lastDocumentSections;
        
        // Reset initial load flag when project ID changes
        if (isNewProject) {
            hasLoadedInitialDataRef.current = false;
            previousProjectIdRef.current = project.id;
            lastProjectDocumentSectionsRef.current = currentDocumentSections;
        }
        
        // Only load data if:
        // 1. This is the initial load (hasn't loaded data yet)
        // 2. OR this is a new project (project ID changed)
        // 3. OR documentSections actually changed (not just prop reference)
        if (!isNewProject && hasLoadedInitialDataRef.current && !documentSectionsChanged) {
            // Already loaded data for this project and data hasn't changed, don't reload
            console.log('⏭️ Skipping reload: project data unchanged');
            return;
        }
        
        // Update the ref to track current documentSections
        if (!isNewProject && documentSectionsChanged) {
            console.log('🔄 DocumentSections changed, will reload data');
            lastProjectDocumentSectionsRef.current = currentDocumentSections;
        }
        
        // Update ref with current modal state before checking
        const isAnyModalOpen = showSectionModal || showDocumentModal || showTemplateModal || showApplyTemplateModal;
        const isCommentPopupOpen = hoverCommentCell !== null;
        const isCurrentlyExporting = isExporting;
        const isCurrentlyEditing = editingSection !== null || editingDocument !== null || editingTemplate !== null;
        modalsOpenRef.current = isAnyModalOpen || isCommentPopupOpen || isCurrentlyExporting || isCurrentlyEditing;
        
        // ⚠️ CRITICAL: Don't reload if user has unsaved changes (prevents overwriting comments in progress)
        const currentSectionsSnapshot = serializeSections(mergeSectionsByYear(sectionsByYear));
        const hasUnsavedChanges = currentSectionsSnapshot !== lastSavedSnapshotRef.current;
        
        // Don't reload data if:
        // 1. Any modal/form is open (prevents form from closing)
        // 2. User has unsaved changes (prevents overwriting comments/text in progress)
        // But allow initial load if we haven't loaded data yet
        if (hasLoadedInitialDataRef.current) {
            if (modalsOpenRef.current) {
                console.log('⏸️ Data reload skipped: modal/form is open');
                return;
            }
            if (hasUnsavedChanges) {
                console.log('⏸️ Data reload skipped: user has unsaved changes (prevents overwriting comments)');
                return;
            }
        }
        
        const loadData = async () => {
            setIsLoading(true);
            try {
                // First, try to load from prop (fast initial render)
                let parsed = [];
                if (project?.documentSections) {
                    try {
                        if (typeof project.documentSections === 'string') {
                            parsed = JSON.parse(project.documentSections);
                        } else if (Array.isArray(project.documentSections)) {
                            parsed = project.documentSections;
                        }
                    } catch (e) {
                        console.warn('Failed to parse documentSections from prop:', e);
                    }
                }
                
                // Set initial state from prop (even if empty) and sync snapshot baseline
                const initialSections = normalizeSections(parsed);
                const organizedByYear = organizeSectionsByYear(initialSections);
                setSectionsByYear(organizedByYear);
                // Create snapshot from merged data for comparison
                const mergedForSnapshot = mergeSectionsByYear(organizedByYear);
                lastSavedSnapshotRef.current = serializeSections(mergedForSnapshot);
                
                // Then fetch fresh data from database to ensure we have latest
                // Only on initial load or when project changes
                try {
                    const freshProject = await api.fetchProject(project.id);
                    if (freshProject?.documentSections) {
                        let freshParsed = [];
                        try {
                            if (typeof freshProject.documentSections === 'string') {
                                freshParsed = JSON.parse(freshProject.documentSections);
                            } else if (Array.isArray(freshProject.documentSections)) {
                                freshParsed = freshProject.documentSections;
                            }
                        } catch (e) {
                            console.warn('Failed to parse fresh documentSections:', e);
                        }
                        
                        const normalizedFresh = normalizeSections(freshParsed);
                        const organizedFresh = organizeSectionsByYear(normalizedFresh);
                        // Only update if different (avoid unnecessary re-renders)
                        // ⚠️ CRITICAL: Don't overwrite local changes - check if we have unsaved changes first
                        const currentMerged = mergeSectionsByYear(sectionsByYear);
                        const freshMerged = mergeSectionsByYear(organizedFresh);
                        const currentSnapshot = serializeSections(currentMerged);
                        const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;
                        
                        if (JSON.stringify(freshMerged) !== JSON.stringify(currentMerged)) {
                            if (hasUnsavedChanges) {
                                // Don't overwrite user's unsaved changes!
                                console.log('⏸️ Skipping database update: user has unsaved changes');
                            } else {
                                console.log('🔄 Updating sections from fresh database data');
                                setSectionsByYear(organizedFresh);
                                lastSavedSnapshotRef.current = serializeSections(freshMerged);
                            }
                        } else {
                            // Data is the same, just update snapshot if needed
                            lastSavedSnapshotRef.current = serializeSections(freshMerged);
                        }
                    } else {
                        lastSavedSnapshotRef.current = serializeSections(mergedForSnapshot);
                    }
                } catch (error) {
                    console.warn('⚠️ Could not fetch fresh project data, using prop data:', error);
                    // Continue with prop data if fetch fails
                }
            } finally {
                setIsLoading(false);
                hasLoadedInitialDataRef.current = true;
            }
        };
        
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]); // ⚠️ FIXED: Only depend on project ID to prevent unnecessary reloads
    // Removed normalizeSections, serializeSections, api, organizeSectionsByYear, mergeSectionsByYear from dependencies
    // These are stable callbacks and don't need to trigger reloads. Using them inside the effect is safe.

    // Keep the modal/interaction state ref up to date without re-running auto-save
    useEffect(() => {
        const isAnyModalOpen = showSectionModal || showDocumentModal || showTemplateModal || showApplyTemplateModal;
        const isCommentPopupOpen = hoverCommentCell !== null;
        const isCurrentlyExporting = isExporting;
        const isCurrentlyEditing = editingSection !== null || editingDocument !== null || editingTemplate !== null;
        modalsOpenRef.current = isAnyModalOpen || isCommentPopupOpen || isCurrentlyExporting || isCurrentlyEditing;
    }, [
        showSectionModal,
        showDocumentModal,
        showTemplateModal,
        showApplyTemplateModal,
        hoverCommentCell,
        isExporting,
        editingSection,
        editingDocument,
        editingTemplate
    ]);
    
    // ✅ AUTO-SAVE TO DATABASE AFTER 1 SECOND OF INACTIVITY
    // ⚠️ IMPORTANT: Don't auto-save while modals, forms, or popups are open to prevent them from closing
    useEffect(() => {
        if (!project?.id || !hasLoadedInitialDataRef.current) return;
        
        // Merge all years' data for snapshot comparison
        const mergedSections = mergeSectionsByYear(sectionsByYear);
        const currentSnapshot = serializeSections(mergedSections);
        if (currentSnapshot === lastSavedSnapshotRef.current) {
            // Nothing new to save; clear pending state if any
            if (pendingSaveRef.current) {
                console.log('⏭️ Skipping auto-save: data unchanged (snapshot matches)');
                pendingSaveRef.current = null;
            }
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }
        
        // Only schedule save if snapshot actually changed
        const previousSnapshot = pendingSaveRef.current?.snapshot;
        if (previousSnapshot === currentSnapshot) {
            // Already have this snapshot scheduled, don't reschedule
            return;
        }
        
        console.log('📝 Data changed, scheduling auto-save...');
        pendingSaveRef.current = {
            sections: normalizeSections(mergedSections),
            snapshot: currentSnapshot
        };
        
        const scheduleSave = () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            
            saveTimeoutRef.current = setTimeout(async () => {
                if (!pendingSaveRef.current) return;
                
                // Double-check snapshot hasn't changed while waiting
                const latestMerged = mergeSectionsByYear(sectionsByYear);
                const latestSnapshot = serializeSections(latestMerged);
                if (latestSnapshot !== pendingSaveRef.current.snapshot) {
                    console.log('⏭️ Skipping auto-save: data changed during debounce, rescheduling...');
                    pendingSaveRef.current = {
                        sections: normalizeSections(latestMerged),
                        snapshot: latestSnapshot
                    };
                    scheduleSave();
                    return;
                }
                
                if (modalsOpenRef.current) {
                    console.log('⏸️ Auto-save deferred: modal/form is open');
                    scheduleSave();
                    return;
                }
                
                setIsSaving(true);
                setSaveError(null);
                
                try {
                    console.log('💾 Saving sections to database:', pendingSaveRef.current.sections.length, 'sections');
                    // ⚠️ FIXED: Pass true to skipParentUpdate for auto-saves to prevent refresh issues
                    // Auto-saves should not update the parent project prop to avoid interrupting user input
                    await api.saveDocumentSections(project.id, pendingSaveRef.current.sections, true);
                    console.log('✅ Sections saved successfully');
                    lastSavedSnapshotRef.current = pendingSaveRef.current.snapshot;
                    pendingSaveRef.current = null;
                } catch (error) {
                    console.error('❌ Error saving sections:', error);
                    setSaveError(error.message || 'Failed to save sections');
                    if (window.showNotification) {
                        window.showNotification('Failed to save document sections. Please try again.', 'error');
                    }
                } finally {
                    setIsSaving(false);
                }
            }, 1000);
        };
        
        scheduleSave();
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id, sectionsByYear]); // ⚠️ FIXED: Only depend on project ID and sectionsByYear
    // Removed api, normalizeSections, serializeSections, mergeSectionsByYear - these are stable callbacks
    
    // ✅ SAVE ON PAGE UNLOAD (prevent data loss)
    useEffect(() => {
        const handleBeforeUnload = async (e) => {
            if (!project?.id) return;
            
            // Merge all years' data and save
            const mergedSections = mergeSectionsByYear(sectionsByYear);
            const mergedSnapshot = serializeSections(mergedSections);
            
            // Only save if there are pending changes
            if (mergedSnapshot !== lastSavedSnapshotRef.current) {
                try {
                    await api.saveDocumentSections(project.id, normalizeSections(mergedSections));
                    lastSavedSnapshotRef.current = mergedSnapshot;
                    console.log('✅ Saved pending changes on navigation');
                } catch (error) {
                    console.error('❌ Error saving on navigation:', error);
                }
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id, sectionsByYear]); // ⚠️ FIXED: Only depend on project ID and sectionsByYear
    // Removed mergeSectionsByYear, normalizeSections, serializeSections, api - these are stable callbacks

    // ✅ LOAD TEMPLATES ONLY WHEN MODALS OPEN
    useEffect(() => {
        if (!showTemplateModal && !showApplyTemplateModal) return;
        
        console.log('📂 Loading templates...');
        loadTemplates();
    }, [showTemplateModal, showApplyTemplateModal]);

    const loadTemplates = async () => {
        try {
            // Fetch templates from database only
            const apiTemplates = await api.getTemplates();
            console.log('✅ Loaded templates from database:', apiTemplates.length);
            console.log('📋 Templates:', apiTemplates.map(t => ({ 
                id: t.id, 
                name: t.name, 
                sectionsCount: t.sections?.length || 0,
                hasSections: !!t.sections,
                sectionsType: typeof t.sections
            })));
            setTemplates(apiTemplates);
        } catch (error) {
            console.error('❌ Error loading templates from database:', error);
            alert('Failed to load templates: ' + error.message);
            setTemplates([]);
        }
    };


    // Initialize year when project ID changes
    useEffect(() => {
        if (!project?.id || typeof window === 'undefined') return;
        
        const projectIdChanged = previousProjectIdRef.current !== project.id;
        if (!projectIdChanged && previousProjectIdRef.current !== null) return;
        
        previousProjectIdRef.current = project.id;
        
        const storageKey = `${YEAR_STORAGE_PREFIX}${project.id}`;
        const storedYear = localStorage.getItem(storageKey);
        const parsedYear = storedYear ? parseInt(storedYear, 10) : NaN;
        if (!Number.isNaN(parsedYear)) {
            if (parsedYear !== selectedYear) {
                setSelectedYear(parsedYear);
            }
        }
    }, [project?.id]);

    const handleYearChange = (year) => {
        setSelectedYear(year);
        if (project?.id && typeof window !== 'undefined') {
            localStorage.setItem(`${YEAR_STORAGE_PREFIX}${project.id}`, String(year));
        }
        // Ensure the selected year has sections initialized (copy from current year if needed)
        setSectionsByYear(prev => {
            if (!prev[year] || prev[year].length === 0) {
                // If year doesn't have data, initialize with empty array or copy structure from another year
                const existingYear = Object.keys(prev).find(y => prev[y] && prev[y].length > 0);
                if (existingYear) {
                    // Copy structure but clear year-specific data (status/comments)
                    return {
                        ...prev,
                        [year]: prev[existingYear].map(section => ({
                            ...section,
                            documents: section.documents?.map(doc => ({
                                ...doc,
                                collectionStatus: {},
                                comments: {}
                            })) || []
                        }))
                    };
                } else {
                    // No existing data, just ensure year exists
                    return {
                        ...prev,
                        [year]: []
                    };
                }
            }
            return prev;
        });
    };
    
    // Helper to update sections for the selected year
    const updateSectionsForYear = useCallback((updater, year = selectedYear) => {
        setSectionsByYear(prev => {
            const currentYearSections = prev[year] || [];
            const updated = typeof updater === 'function' ? updater(currentYearSections) : updater;
            return {
                ...prev,
                [year]: updated
            };
        });
    }, [selectedYear]);

    useEffect(() => {
        if (!hasInitialScrolled.current && sections.length > 0 && tableRef.current && selectedYear === currentYear) {
            setTimeout(() => {
                scrollToWorkingMonths();
                hasInitialScrolled.current = true;
            }, 100);
        }
    }, [sections, selectedYear]);

    const scrollToWorkingMonths = () => {
        const firstWorkingMonthName = months[workingMonths[0]];
        const firstMonthElement = monthRefs.current[firstWorkingMonthName];
        
        if (firstMonthElement && tableRef.current) {
            const container = tableRef.current;
            const elementLeft = firstMonthElement.offsetLeft;
            const documentColumnWidth = 250;
            const scrollPosition = elementLeft - documentColumnWidth - 100;
            
            container.scrollTo({
                left: Math.max(0, scrollPosition),
                behavior: 'smooth'
            });
        }
    };

    const yearOptions = [];
    const MIN_YEAR = 2015;
    const FUTURE_YEAR_BUFFER = 5;
    for (let i = MIN_YEAR; i <= currentYear + FUTURE_YEAR_BUFFER; i++) {
        yearOptions.push(i);
    }

    // ============================================================
    // YEAR-BASED DATA HELPERS - Ensure independent lists per year
    // ============================================================
    
    // Create a month key scoped to the selected year
    const getMonthKey = (month, year = selectedYear) => {
        return `${month}-${year}`;
    };
    
    // Get status for a specific month in the selected year only
    const getStatusForYear = (collectionStatus, month, year = selectedYear) => {
        if (!collectionStatus) return null;
        const monthKey = getMonthKey(month, year);
        return collectionStatus[monthKey] || null;
    };
    
    // Get comments for a specific month in the selected year only
    const getCommentsForYear = (comments, month, year = selectedYear) => {
        if (!comments) return [];
        const monthKey = getMonthKey(month, year);
        return comments[monthKey] || [];
    };
    
    // Set status for a specific month in the selected year only
    const setStatusForYear = (collectionStatus, month, status, year = selectedYear) => {
        const monthKey = getMonthKey(month, year);
        return {
            ...collectionStatus,
            [monthKey]: status
        };
    };
    
    // Set comments for a specific month in the selected year only
    const setCommentsForYear = (comments, month, newComments, year = selectedYear) => {
        const monthKey = getMonthKey(month, year);
        return {
            ...comments,
            [monthKey]: newComments
        };
    };

    const statusOptions = [
        { value: 'not-collected', label: 'Not Collected', color: 'bg-red-400 text-white font-semibold', cellColor: 'bg-red-400 border-l-4 border-red-700 shadow-sm' },
        { value: 'ongoing', label: 'Collection Ongoing', color: 'bg-yellow-400 text-white font-semibold', cellColor: 'bg-yellow-400 border-l-4 border-yellow-700 shadow-sm' },
        { value: 'collected', label: 'Collected', color: 'bg-green-500 text-white font-semibold', cellColor: 'bg-green-500 border-l-4 border-green-700 shadow-sm' },
        { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-400 text-white font-semibold', cellColor: 'bg-gray-400 border-l-4 border-gray-700 shadow-sm' }
    ];

    const getStatusConfig = (status) => {
        return statusOptions.find(opt => opt.value === status) || statusOptions[0];
    };

    const getCurrentUser = () => {
        const defaultUser = { name: 'System', email: 'system', id: 'system', role: 'System' };
        
        try {
            const extractUser = (data) => {
                if (!data) return null;
                if (data.user && typeof data.user === 'object') return data.user;
                if (data.name || data.email) return data;
                return null;
            };
            
            try {
                const userData = localStorage.getItem('abcotronics_user');
                if (userData && userData !== 'null' && userData !== 'undefined') {
                    const parsed = JSON.parse(userData);
                    const user = extractUser(parsed);
                    
                    if (user && (user.name || user.email)) {
                        const result = {
                            name: user.name || user.email || 'System',
                            email: user.email || 'system',
                            id: user.id || user._id || user.email || 'system',
                            role: user.role || 'System'
                        };
                        
                        if (result.name !== 'System' && result.email !== 'system') {
                            return result;
                        }
                    }
                }
            } catch (error) {
                console.warn('Failed to parse user from localStorage:', error);
            }
            
            if (window.storage && typeof window.storage.getUserInfo === 'function') {
                try {
                    const userInfo = window.storage.getUserInfo();
                    if (userInfo && ((userInfo.name && userInfo.name !== 'System') || (userInfo.email && userInfo.email !== 'system'))) {
                        return userInfo;
                    }
                } catch (error) {}
            }
            
            if (window.storage && typeof window.storage.getUser === 'function') {
                try {
                    const userRaw = window.storage.getUser();
                    const user = extractUser(userRaw);
                    
                    if (user && (user.name || user.email)) {
                        const result = {
                            name: user.name || user.email || 'System',
                            email: user.email || 'system',
                            id: user.id || user._id || user.email || 'system',
                            role: user.role || 'System'
                        };
                        
                        if (result.name !== 'System' && result.email !== 'system') {
                            return result;
                        }
                    }
                } catch (error) {}
            }
        } catch (error) {
            console.warn('Unexpected error in getCurrentUser:', error);
        }
        
        return defaultUser;
    };

    const handleAddSection = () => {
        setEditingSection(null);
        setShowSectionModal(true);
    };

    const handleEditSection = (section) => {
        setEditingSection(section);
        setShowSectionModal(true);
    };

    const handleSaveSection = (sectionData) => {
        const currentUser = getCurrentUser();

        if (editingSection) {
            updateSectionsForYear(prev => prev.map(s => 
                s.id === editingSection.id ? { ...s, ...sectionData } : s
            ));
            
            if (window.AuditLogger) {
                window.AuditLogger.log('update', 'projects', {
                    action: 'Section Updated',
                    projectId: project.id,
                    projectName: project.name,
                    sectionName: sectionData.name,
                    oldSectionName: editingSection.name
                }, currentUser);
            }
        } else {
            const newSection = {
                id: Date.now(),
                ...sectionData,
                documents: []
            };
            updateSectionsForYear(prev => [...prev, newSection]);
            
            if (window.AuditLogger) {
                window.AuditLogger.log('create', 'projects', {
                    action: 'Section Created',
                    projectId: project.id,
                    projectName: project.name,
                    sectionName: sectionData.name
                }, currentUser);
            }
        }
        
        setShowSectionModal(false);
        setEditingSection(null);
    };

    const handleDeleteSection = (sectionId) => {
        const currentUser = getCurrentUser();
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;
        
        if (!confirm(`Delete section "${section.name}" and all its documents?`)) return;
        
        updateSectionsForYear(prev => prev.filter(s => s.id !== sectionId));
        
        if (window.AuditLogger) {
            window.AuditLogger.log('delete', 'projects', {
                action: 'Section Deleted',
                projectId: project.id,
                projectName: project.name,
                sectionName: section.name,
                documentsCount: section.documents?.length || 0
            }, currentUser);
        }
    };

    const handleCreateTemplate = () => {
        setEditingTemplate(null);
        setShowTemplateModal(true);
    };

    const handleEditTemplate = (template) => {
        setEditingTemplate(template);
        setShowTemplateModal(true);
    };

    const handleDeleteTemplate = async (templateId) => {
        if (!confirm('Delete this template? This action cannot be undone.')) {
            return;
        }
        
        try {
            const template = templates.find(t => String(t.id) === String(templateId));
            if (!template) {
                throw new Error(`Template not found. ID: ${templateId}`);
            }
            
            // Delete from database
            await api.deleteTemplate(templateId);
            console.log('✅ Template deleted from database');
            
            // Reload templates from database
            await loadTemplates();
            
            console.log('✅ Template deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting template:', error);
            alert('Failed to delete template: ' + error.message);
        }
    };

    const handleSaveTemplate = async (templateData) => {
        const currentUser = getCurrentUser();
        
        try {
            if (editingTemplate) {
                // Update existing template in database
                await api.updateTemplate(editingTemplate.id, {
                    ...templateData,
                    updatedBy: currentUser.name || currentUser.email
                });
                console.log('✅ Template updated in database');
            } else {
                // Create new template in database
                await api.createTemplate({
                    ...templateData,
                    createdBy: currentUser.name || currentUser.email,
                    updatedBy: currentUser.name || currentUser.email
                });
                console.log('✅ Template created in database');
            }
            
            // Reload templates from database to get fresh data
            await loadTemplates();
            
            setEditingTemplate(null);
            setShowTemplateList(true);
        } catch (error) {
            console.error('❌ Error saving template:', error);
            alert('Failed to save template: ' + error.message);
        }
    };

    const handleApplyTemplate = (template, targetYear) => {
        if (!template || !template.sections || template.sections.length === 0) {
            alert('Template is empty or invalid');
            console.error('Template validation failed:', { template, hasSections: template?.sections?.length });
            return;
        }

        console.log('📋 Applying template:', template.name, 'to year:', targetYear);
        console.log('Template sections:', template.sections.length);

        const currentUser = getCurrentUser();
        
        const newSections = template.sections.map((section, sectionIdx) => ({
            id: `section-${Date.now()}-${sectionIdx}-${Math.random()}`,
            name: section.name,
            description: section.description || '',
            documents: (section.documents || []).map((doc, docIdx) => ({
                id: `doc-${Date.now()}-${sectionIdx}-${docIdx}-${Math.random()}`,
                name: doc.name,
                description: doc.description || '',
                collectionStatus: {},
                comments: {}
            }))
        }));

        console.log('📋 Created new sections:', newSections.length);
        console.log('Total documents:', newSections.reduce((sum, s) => sum + (s.documents?.length || 0), 0));

        updateSectionsForYear(prev => [...prev, ...newSections], targetYear);

        if (window.AuditLogger) {
            window.AuditLogger.log('create', 'projects', {
                action: 'Template Applied',
                projectId: project.id,
                projectName: project.name,
                templateName: template.name,
                templateId: template.id,
                targetYear: targetYear,
                sectionsAdded: newSections.length
            }, currentUser);
        }

        setShowApplyTemplateModal(false);
    };

    const handleCreateTemplateFromCurrent = () => {
        if (sections.length === 0) {
            alert('No sections to create template from. Please add sections first.');
            return;
        }
        
        const templateData = {
            name: `${project.name} - ${selectedYear}`,
            description: `Template created from ${project.name} for year ${selectedYear}`,
            sections: sections.map(section => ({
                name: section.name,
                description: section.description || '',
                documents: (section.documents || []).map(doc => ({
                    name: doc.name,
                    description: doc.description || ''
                }))
            }))
        };
        
        setEditingTemplate(null);
        setShowTemplateModal(true);
        setTimeout(() => {
            if (window.tempTemplateData) {
                window.tempTemplateData = templateData;
            }
        }, 100);
    };

    const handleAddDocument = (sectionId) => {
        editingSectionIdRef.current = sectionId;
        setEditingSectionId(sectionId);
        setEditingDocument(null);
        setShowDocumentModal(true);
    };

    const handleEditDocument = (section, document) => {
        editingSectionIdRef.current = section.id;
        setEditingSectionId(section.id);
        setEditingDocument(document);
        setShowDocumentModal(true);
    };

    const handleSaveDocument = (documentData) => {
        const currentSectionId = editingSectionIdRef.current || editingSectionId;
        
        if (!currentSectionId) {
            alert('Error: No section selected. Please try again.');
            return;
        }
        
        const currentUser = getCurrentUser();
        
        updateSectionsForYear(prev => prev.map(s => {
            if (s.id === currentSectionId) {
                if (editingDocument) {
                    return {
                        ...s,
                        documents: s.documents.map(doc => 
                            doc.id === editingDocument.id ? { ...doc, ...documentData } : doc
                        )
                    };
                } else {
                    const newDocument = {
                        id: Date.now(),
                        ...documentData,
                        collectionStatus: {},
                        comments: {}
                    };
                    return {
                        ...s,
                        documents: [...s.documents, newDocument]
                    };
                }
            }
            return s;
        }));
        
        setShowDocumentModal(false);
        setEditingDocument(null);
        setEditingSectionId(null);
        editingSectionIdRef.current = null;
    };

    const handleDeleteDocument = (sectionId, documentId) => {
        const section = sections.find(s => s.id === sectionId);
        const document = section?.documents.find(d => d.id === documentId);
        
        if (!section || !document) return;
        
        if (confirm('Delete this document/data item?')) {
            updateSectionsForYear(prev => prev.map(s => {
                if (s.id === sectionId) {
                    return {
                        ...s,
                        documents: s.documents.filter(doc => doc.id !== documentId)
                    };
                }
                return s;
            }));
        }
    };

    const handleUpdateStatus = (sectionId, documentId, month, status) => {
        updateSectionsForYear(prev => prev.map(s => {
            if (s.id === sectionId) {
                return {
                    ...s,
                    documents: s.documents.map(doc => {
                        if (doc.id === documentId) {
                            return {
                                ...doc,
                                collectionStatus: setStatusForYear(doc.collectionStatus || {}, month, status, selectedYear)
                            };
                        }
                        return doc;
                    })
                };
            }
            return s;
        }));
    };

    const handleAddComment = (sectionId, documentId, month, commentText) => {
        if (!commentText.trim()) return;

        const currentUser = getCurrentUser();
        const newComment = {
            id: Date.now(),
            text: commentText,
            date: new Date().toISOString(),
            timestamp: new Date().toISOString(),
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id,
            authorRole: currentUser.role
        };

        updateSectionsForYear(prev => prev.map(s => {
            if (s.id === sectionId) {
                return {
                    ...s,
                    documents: s.documents.map(doc => {
                        if (doc.id === documentId) {
                            const existingComments = getCommentsForYear(doc.comments, month, selectedYear);
                            return {
                                ...doc,
                                comments: setCommentsForYear(doc.comments || {}, month, [...existingComments, newComment], selectedYear)
                            };
                        }
                        return doc;
                    })
                };
            }
            return s;
        }));
        
        setQuickComment('');
    };

    const handleDeleteComment = (sectionId, documentId, month, commentId) => {
        const currentUser = getCurrentUser();
        const section = sections.find(s => s.id === sectionId);
        const document = section?.documents.find(d => d.id === documentId);
        const existingComments = getCommentsForYear(document?.comments, month, selectedYear);
        const comment = existingComments.find(c => c.id === commentId);
        
        const canDelete = comment?.authorId === currentUser.id || 
                         currentUser.role === 'Admin' || 
                         currentUser.role === 'Administrator' ||
                         currentUser.role === 'admin';
        
        if (!canDelete) {
            alert('You can only delete your own comments or you need admin privileges.');
            return;
        }
        
        if (!confirm('Delete this comment?')) return;
        
        updateSectionsForYear(prev => prev.map(s => {
            if (s.id === sectionId) {
                return {
                    ...s,
                    documents: s.documents.map(doc => {
                        if (doc.id === documentId) {
                            const updatedComments = existingComments.filter(c => c.id !== commentId);
                            return {
                                ...doc,
                                comments: setCommentsForYear(doc.comments || {}, month, updatedComments, selectedYear)
                            };
                        }
                        return doc;
                    })
                };
            }
            return s;
        }));
    };

    const getDocumentStatus = (document, month) => {
        return getStatusForYear(document.collectionStatus, month, selectedYear);
    };

    const getDocumentComments = (document, month) => {
        return getCommentsForYear(document.comments, month, selectedYear);
    };

    const handleExportToExcel = async () => {
        setIsExporting(true);
        try {
            let XLSX = window.XLSX;
            
            if (!XLSX || !XLSX.utils) {
                for (let waitAttempt = 0; waitAttempt < 30 && (!XLSX || !XLSX.utils); waitAttempt++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    XLSX = window.XLSX;
                }
            }
            
            if (!XLSX || !XLSX.utils) {
                throw new Error('XLSX library failed to load. Please refresh and try again.');
            }
        
            const excelData = [];
            
            const headerRow1 = ['Section / Document'];
            const headerRow2 = [''];
            
            months.forEach(month => {
                const monthYear = `${month.slice(0, 3)} '${String(selectedYear).slice(-2)}`;
                headerRow1.push(monthYear, '');
                headerRow2.push('Status', 'Comments');
            });
            
            excelData.push(headerRow1);
            excelData.push(headerRow2);
            
            sections.forEach(section => {
                const sectionRow = [section.name];
                for (let i = 0; i < 12 * 2; i++) {
                    sectionRow.push('');
                }
                excelData.push(sectionRow);
                
                section.documents.forEach(document => {
                    const row = [`  ${document.name}${document.description ? ' - ' + document.description : ''}`];
                    
                    months.forEach(month => {
                        const status = getStatusForYear(document.collectionStatus, month, selectedYear);
                        const statusLabel = status ? statusOptions.find(s => s.value === status)?.label : '';
                        row.push(statusLabel || '');
                        
                        const comments = getCommentsForYear(document.comments, month, selectedYear);
                        const commentsText = comments.map((comment, idx) => {
                            const date = new Date(comment.date || comment.timestamp || comment.createdAt).toLocaleString('en-ZA', {
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            const authorName = comment.author || comment.createdBy || 'User';
                            const authorEmail = comment.authorEmail || comment.createdByEmail;
                            const authorInfo = authorEmail 
                                ? `${authorName} (${authorEmail})`
                                : authorName;
                            return `[${date}] ${authorInfo}: ${comment.text}`;
                        }).join('\n\n');
                        row.push(commentsText);
                    });
                    
                    excelData.push(row);
                });
            });
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            
            const colWidths = [{ wch: 40 }];
            for (let i = 0; i < 12; i++) {
                colWidths.push({ wch: 18 }, { wch: 50 });
            }
            ws['!cols'] = colWidths;
            
            const merges = [];
            for (let i = 0; i < 12; i++) {
                const startCol = 1 + (i * 2);
                merges.push({
                    s: { r: 0, c: startCol },
                    e: { r: 0, c: startCol + 1 }
                });
            }
            ws['!merges'] = merges;
            
            XLSX.utils.book_append_sheet(wb, ws, `Doc Collection ${selectedYear}`);
            
            const filename = `${project.name}_Document_Collection_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, filename);
            
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert(`Failed to export to Excel: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleDragStart = (e, section, index) => {
        setDraggedSection({ section, index });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            e.currentTarget.style.opacity = '0.5';
        }, 0);
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedSection(null);
        setDragOverIndex(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnter = (e, index) => {
        e.preventDefault();
        if (draggedSection && draggedSection.index !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverIndex(null);
        }
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedSection && draggedSection.index !== dropIndex) {
            updateSectionsForYear(prev => {
                const reordered = [...prev];
                const [removed] = reordered.splice(draggedSection.index, 1);
                reordered.splice(dropIndex, 0, removed);
                return reordered;
            });
        }
        setDragOverIndex(null);
    };

    const handleDocumentDragStart = (e, document, sectionId, documentIndex) => {
        setDraggedDocument({ document, sectionId, documentIndex });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            e.currentTarget.style.opacity = '0.5';
        }, 0);
    };

    const handleDocumentDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedDocument(null);
        setDragOverDocumentIndex(null);
    };

    const handleDocumentDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDocumentDragEnter = (e, sectionId, documentIndex) => {
        e.preventDefault();
        if (draggedDocument && draggedDocument.sectionId === sectionId && draggedDocument.documentIndex !== documentIndex) {
            setDragOverDocumentIndex({ sectionId, documentIndex });
        }
    };

    const handleDocumentDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverDocumentIndex(null);
        }
    };

    const handleDocumentDrop = (e, sectionId, dropIndex) => {
        e.preventDefault();
        if (draggedDocument && draggedDocument.sectionId === sectionId && draggedDocument.documentIndex !== dropIndex) {
            updateSectionsForYear(prev => prev.map(section => {
                if (section.id === sectionId) {
                    const reordered = [...section.documents];
                    const [removed] = reordered.splice(draggedDocument.documentIndex, 1);
                    reordered.splice(dropIndex, 0, removed);
                    return { ...section, documents: reordered };
                }
                return section;
            }));
        }
        setDragOverDocumentIndex(null);
    };

    useEffect(() => {
        if (hoverCommentCell && commentPopupContainerRef.current) {
            setTimeout(() => {
                if (commentPopupContainerRef.current) {
                    commentPopupContainerRef.current.scrollTop = commentPopupContainerRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [hoverCommentCell, sections]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            const isCommentButton = event.target.closest('[data-comment-cell]');
            const isInsidePopup = event.target.closest('.comment-popup');
            
            if (hoverCommentCell && !isCommentButton && !isInsidePopup) {
                setHoverCommentCell(null);
                setQuickComment('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [hoverCommentCell]);

    const SectionModal = () => {
        const [sectionFormData, setSectionFormData] = useState({
            name: editingSection?.name || '',
            description: editingSection?.description || ''
        });

        const handleSubmit = (e) => {
            e.preventDefault();
            if (!sectionFormData.name.trim()) {
                alert('Please enter a section name');
                return;
            }
            handleSaveSection(sectionFormData);
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingSection ? 'Edit Section' : 'Add New Section'}
                        </h2>
                        <button 
                            onClick={() => setShowSectionModal(false)} 
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Section Name *
                            </label>
                            <input
                                type="text"
                                value={sectionFormData.name}
                                onChange={(e) => setSectionFormData({...sectionFormData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="e.g., Financial Documents, Client Data, etc."
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Description (Optional)
                            </label>
                            <textarea
                                value={sectionFormData.description}
                                onChange={(e) => setSectionFormData({...sectionFormData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows="2"
                                placeholder="Brief description of this section..."
                            ></textarea>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowSectionModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50/50 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                            >
                                {editingSection ? 'Update Section' : 'Add Section'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    const handleCloseDocumentModal = () => {
        setShowDocumentModal(false);
        setEditingDocument(null);
        setEditingSectionId(null);
        editingSectionIdRef.current = null;
    };

    const DocumentModal = () => {
        const [documentFormData, setDocumentFormData] = useState({
            name: editingDocument?.name || '',
            description: editingDocument?.description || '',
            attachments: editingDocument?.attachments || []
        });

        useEffect(() => {
            setDocumentFormData({
                name: editingDocument?.name || '',
                description: editingDocument?.description || '',
                attachments: editingDocument?.attachments || []
            });
        }, [editingDocument]);

        const handleSubmit = (e) => {
            e.preventDefault();
            if (!documentFormData.name.trim()) {
                alert('Please enter a document/data name');
                return;
            }
            handleSaveDocument(documentFormData);
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingDocument ? 'Edit Document/Data' : 'Add Document/Data'}
                        </h2>
                        <button 
                            onClick={handleCloseDocumentModal} 
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Document/Data Name *
                            </label>
                            <input
                                type="text"
                                value={documentFormData.name}
                                onChange={(e) => setDocumentFormData({...documentFormData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="e.g., Bank Statements, Sales Report, etc."
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Description (Optional)
                            </label>
                            <textarea
                                value={documentFormData.description}
                                onChange={(e) => setDocumentFormData({...documentFormData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows="2"
                                placeholder="Additional details..."
                            ></textarea>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={handleCloseDocumentModal}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50/50 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                            >
                                {editingDocument ? 'Update' : 'Add'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    const TemplateModal = ({ showTemplateList = true, setShowTemplateList }) => {
        if (!setShowTemplateList) return null;
        
        useEffect(() => {
            if (editingTemplate) {
                setShowTemplateList(false);
            } else {
                setShowTemplateList(true);
            }
        }, [editingTemplate, setShowTemplateList]);
        
        useEffect(() => {
            if (!showTemplateModal) {
                setShowTemplateList(true);
            }
        }, [showTemplateModal, setShowTemplateList]);
        
        const [templateFormData, setTemplateFormData] = useState(() => {
            const prefill = window.tempTemplateData;
            if (prefill) {
                window.tempTemplateData = null;
                return {
                    name: prefill.name || '',
                    description: prefill.description || '',
                    sections: prefill.sections || []
                };
            }
            return {
                name: editingTemplate?.name || '',
                description: editingTemplate?.description || '',
                sections: editingTemplate?.sections || []
            };
        });

        const handleAddSectionToTemplate = () => {
            setTemplateFormData({
                ...templateFormData,
                sections: [...templateFormData.sections, { name: '', description: '', documents: [] }]
            });
        };

        const handleRemoveSectionFromTemplate = (index) => {
            setTemplateFormData({
                ...templateFormData,
                sections: templateFormData.sections.filter((_, i) => i !== index)
            });
        };

        const handleUpdateSectionInTemplate = (index, sectionData) => {
            const updatedSections = [...templateFormData.sections];
            updatedSections[index] = { ...updatedSections[index], ...sectionData };
            setTemplateFormData({ ...templateFormData, sections: updatedSections });
        };

        const handleAddDocumentToTemplateSection = (sectionIndex) => {
            const updatedSections = [...templateFormData.sections];
            if (!updatedSections[sectionIndex].documents) {
                updatedSections[sectionIndex].documents = [];
            }
            updatedSections[sectionIndex].documents.push({ name: '', description: '' });
            setTemplateFormData({ ...templateFormData, sections: updatedSections });
        };

        const handleRemoveDocumentFromTemplate = (sectionIndex, docIndex) => {
            const updatedSections = [...templateFormData.sections];
            updatedSections[sectionIndex].documents = updatedSections[sectionIndex].documents.filter((_, i) => i !== docIndex);
            setTemplateFormData({ ...templateFormData, sections: updatedSections });
        };

        const handleUpdateDocumentInTemplate = (sectionIndex, docIndex, docData) => {
            const updatedSections = [...templateFormData.sections];
            updatedSections[sectionIndex].documents[docIndex] = { ...updatedSections[sectionIndex].documents[docIndex], ...docData };
            setTemplateFormData({ ...templateFormData, sections: updatedSections });
        };

        const handleSubmit = (e) => {
            e.preventDefault();
            if (!templateFormData.name.trim()) {
                alert('Please enter a template name');
                return;
            }
            if (templateFormData.sections.length === 0) {
                alert('Please add at least one section to the template');
                return;
            }
            handleSaveTemplate(templateFormData);
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {showTemplateList ? 'Template Management' : (editingTemplate ? 'Edit Template' : 'Create Template')}
                        </h2>
                        <div className="flex items-center gap-2">
                            {!showTemplateList && (
                                <button
                                    onClick={() => {
                                        setShowTemplateList(true);
                                        setEditingTemplate(null);
                                        window.tempTemplateData = null;
                                    }}
                                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                                >
                                    <i className="fas fa-arrow-left mr-1"></i>
                                    Back
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    setShowTemplateModal(false);
                                    setEditingTemplate(null);
                                    setShowTemplateList(true);
                                    window.tempTemplateData = null;
                                }} 
                                className="text-gray-400 hover:text-gray-600 p-1"
                            >
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {showTemplateList ? (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center mb-4">
                                    <p className="text-xs text-gray-600">Manage your document collection templates</p>
                                    <button
                                        onClick={() => {
                                            setShowTemplateList(false);
                                            setEditingTemplate(null);
                                            setTemplateFormData({ name: '', description: '', sections: [] });
                                        }}
                                        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                    >
                                        <i className="fas fa-plus mr-1"></i>
                                        Create New Template
                                    </button>
                                </div>
                                
                                {templates.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <i className="fas fa-layer-group text-3xl mb-2 opacity-50"></i>
                                        <p className="text-sm">No templates yet</p>
                                        <p className="text-xs mt-1">Create your first template to get started</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {templates.map(template => {
                                        const totalDocs = template.sections?.reduce((sum, s) => sum + (s.documents?.length || 0), 0) || 0;
                                        return (
                                            <div key={template.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50/30 hover:bg-gray-50/50 transition-colors">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <h3 className="text-sm font-semibold text-gray-900 mb-1">{template.name}</h3>
                                                        {template.description && (
                                                            <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                                                        )}
                                                        <div className="flex items-center gap-4 text-[10px] text-gray-500">
                                                            <span><i className="fas fa-folder mr-1"></i>{template.sections?.length || 0} sections</span>
                                                            <span><i className="fas fa-file mr-1"></i>{totalDocs} documents</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 ml-3">
                                                        <button
                                                            onClick={() => {
                                                                setEditingTemplate(template);
                                                                setShowTemplateList(false);
                                                                setTemplateFormData({
                                                                    name: template.name,
                                                                    description: template.description || '',
                                                                    sections: template.sections || []
                                                                });
                                                            }}
                                                            className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                                                            title={template.isDefault ? "Default templates cannot be edited" : "Edit template"}
                                                            disabled={template.isDefault}
                                                        >
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                console.log('🗑️ Delete button clicked for template:', template.id);
                                                                handleDeleteTemplate(template.id);
                                                            }}
                                                            className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                                                            title={template.isDefault ? "Hide default template (cannot be deleted from database)" : "Delete template"}
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                        {template.isDefault && (
                                                            <span className="px-2 py-1 text-xs text-gray-400" title="Default template">
                                                                <i className="fas fa-lock"></i>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Template Name *
                                </label>
                                <input
                                    type="text"
                                    value={templateFormData.name}
                                    onChange={(e) => setTemplateFormData({...templateFormData, name: e.target.value})}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="e.g., Standard Monthly Checklist"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Description (Optional)
                                </label>
                                <textarea
                                    value={templateFormData.description}
                                    onChange={(e) => setTemplateFormData({...templateFormData, description: e.target.value})}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    rows="2"
                                    placeholder="Brief description..."
                                ></textarea>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-medium text-gray-700">
                                        Sections *
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddSectionToTemplate}
                                        className="px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700"
                                    >
                                        <i className="fas fa-plus mr-1"></i>
                                        Add Section
                                    </button>
                                </div>
                                
                                <div className="space-y-3">
                                    {templateFormData.sections.map((section, sectionIndex) => (
                                        <div key={sectionIndex} className="border border-gray-200 rounded-lg p-3 bg-gray-50/30">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1 space-y-2">
                                                    <input
                                                        type="text"
                                                        value={section.name}
                                                        onChange={(e) => handleUpdateSectionInTemplate(sectionIndex, { name: e.target.value })}
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                                        placeholder="Section name *"
                                                        required
                                                    />
                                                    <textarea
                                                        value={section.description || ''}
                                                        onChange={(e) => handleUpdateSectionInTemplate(sectionIndex, { description: e.target.value })}
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                                        rows="1"
                                                        placeholder="Section description (optional)"
                                                    ></textarea>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSectionFromTemplate(sectionIndex)}
                                                    className="ml-2 text-red-600 hover:text-red-800 p-1"
                                                >
                                                    <i className="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                            
                                            <div className="mt-2">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="text-[10px] font-medium text-gray-600">Documents:</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddDocumentToTemplateSection(sectionIndex)}
                                                        className="px-1.5 py-0.5 bg-gray-600 text-white rounded text-[9px] font-medium hover:bg-gray-700"
                                                    >
                                                        <i className="fas fa-plus mr-0.5"></i>
                                                        Add
                                                    </button>
                                                </div>
                                                <div className="space-y-1">
                                                    {(section.documents || []).map((doc, docIndex) => (
                                                        <div key={docIndex} className="flex items-center gap-1 bg-white p-1.5 rounded border border-gray-200">
                                                            <input
                                                                type="text"
                                                                value={doc.name}
                                                                onChange={(e) => handleUpdateDocumentInTemplate(sectionIndex, docIndex, { name: e.target.value })}
                                                                className="flex-1 px-1.5 py-0.5 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                                                placeholder="Document name *"
                                                                required
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveDocumentFromTemplate(sectionIndex, docIndex)}
                                                                className="text-red-600 hover:text-red-800 p-0.5"
                                                            >
                                                                <i className="fas fa-times text-[9px]"></i>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowTemplateModal(false);
                                        setEditingTemplate(null);
                                        setShowTemplateList(true);
                                        window.tempTemplateData = null;
                                    }}
                                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50/50 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                                >
                                    {editingTemplate ? 'Update Template' : 'Create Template'}
                                </button>
                            </div>
                        </form>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const ApplyTemplateModal = () => {
        const [selectedTemplateId, setSelectedTemplateId] = useState(null);
        const [targetYear, setTargetYear] = useState(selectedYear);

        const handleApply = () => {
            if (!selectedTemplateId) {
                alert('Please select a template');
                return;
            }
            console.log('🔍 Looking for template with ID:', selectedTemplateId);
            console.log('Available templates:', templates.map(t => ({ id: t.id, name: t.name })));
            const template = templates.find(t => String(t.id) === String(selectedTemplateId));
            if (!template) {
                console.error('❌ Template not found. Selected ID:', selectedTemplateId);
                console.error('Available template IDs:', templates.map(t => t.id));
                alert('Template not found. Please check the console for details.');
                return;
            }
            console.log('✅ Found template:', template.name);
            handleApplyTemplate(template, targetYear);
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            Apply Template
                        </h2>
                        <button 
                            onClick={() => setShowApplyTemplateModal(false)} 
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <div className="p-4 space-y-4">
                        {templates.length === 0 ? (
                            <div className="text-center py-4">
                                <p className="text-sm text-gray-600 mb-3">No templates available</p>
                                <button
                                    onClick={() => {
                                        setShowApplyTemplateModal(false);
                                        handleCreateTemplate();
                                    }}
                                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                >
                                    Create Template
                                </button>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Select Template *
                                    </label>
                                    <select
                                        value={selectedTemplateId || ''}
                                        onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    >
                                        <option value="">-- Select a template --</option>
                                        {templates.map(template => (
                                            <option key={template.id} value={template.id}>
                                                {template.name} ({template.sections?.length || 0} sections)
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Target Year
                                    </label>
                                    <select
                                        value={targetYear}
                                        onChange={(e) => setTargetYear(parseInt(e.target.value))}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    >
                                        {yearOptions.map(year => (
                                            <option key={year} value={year}>
                                                {year}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => setShowApplyTemplateModal(false)}
                                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50/50 transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleApply}
                                        disabled={!selectedTemplateId}
                                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Apply Template
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderStatusCell = (section, document, month) => {
        const status = getDocumentStatus(document, month);
        const statusConfig = status ? getStatusConfig(status) : null;
        const comments = getDocumentComments(document, month);
        const hasComments = comments.length > 0;
        const cellKey = `${section.id}-${document.id}-${month}`;
        const isPopupOpen = hoverCommentCell === cellKey;
        
        const isWorkingMonth = workingMonths.includes(months.indexOf(month)) && selectedYear === currentYear;
        const cellBackgroundClass = statusConfig 
            ? statusConfig.cellColor 
            : (isWorkingMonth ? 'bg-primary-50' : '');
        
        const textColorClass = statusConfig && statusConfig.color 
            ? statusConfig.color.split(' ').find(cls => cls.startsWith('text-')) || 'text-gray-900'
            : 'text-gray-400';

        return (
            <td 
                className={`px-2 py-1 text-xs border-l border-gray-100 ${cellBackgroundClass} relative z-0`}
            >
                <div className="min-w-[160px] relative flex items-center gap-1">
                    <select
                        value={status || ''}
                        onChange={(e) => handleUpdateStatus(section.id, document.id, month, e.target.value)}
                        className={`flex-1 px-1.5 py-0.5 text-[10px] rounded font-medium border-0 cursor-pointer appearance-none bg-transparent ${textColorClass} hover:opacity-80 relative z-0`}
                    >
                        <option value="">Select Status</option>
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    
                    <div className="flex-shrink-0 z-10">
                        <button
                            data-comment-cell={cellKey}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                if (isPopupOpen) {
                                    setHoverCommentCell(null);
                                } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const position = {
                                        top: rect.bottom + 5,
                                        left: rect.right - 288
                                    };
                                    setCommentPopupPosition(position);
                                    setHoverCommentCell(cellKey);
                                }
                            }}
                            className="text-gray-500 hover:text-primary-600 transition-colors relative p-1 rounded hover:bg-gray-50/50"
                            type="button"
                            title="Add or view comments"
                        >
                            <i className="fas fa-comment text-base"></i>
                            {hasComments && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                    {comments.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </td>
        );
    };

    return (
        <div className="space-y-3">
            {hoverCommentCell && (() => {
                const [sectionId, documentId, month] = hoverCommentCell.split('-');
                const section = sections.find(s => s.id === parseInt(sectionId));
                const document = section?.documents.find(d => d.id === parseInt(documentId));
                const comments = document ? getDocumentComments(document, month) : [];
                
                return (
                    <div 
                        className="comment-popup fixed w-72 bg-white border border-gray-300 rounded-lg shadow-xl p-3 z-[999]"
                        style={{
                            top: `${commentPopupPosition.top}px`,
                            left: `${commentPopupPosition.left}px`
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {comments.length > 0 && (
                            <div className="mb-3">
                                <div className="text-[10px] font-semibold text-gray-600 mb-1.5">Comments</div>
                                <div ref={commentPopupContainerRef} className="max-h-32 overflow-y-auto space-y-2 mb-2">
                                    {comments.map((comment, idx) => {
                                        const currentUser = getCurrentUser();
                                        const canDelete = comment?.authorId === currentUser.id || 
                                                         comment?.author === currentUser.name ||
                                                         currentUser.role === 'Admin' || 
                                                         currentUser.role === 'Administrator' ||
                                                         currentUser.role === 'admin';
                                        const authorName = comment.author || comment.createdBy || 'User';
                                        const authorEmail = comment.authorEmail || comment.createdByEmail;
                                        
                                        return (
                                            <div key={comment.id || idx} className="pb-2 border-b last:border-b-0 bg-gray-50/30 rounded p-1.5 relative group">
                                                <p className="text-xs text-gray-700 whitespace-pre-wrap pr-6">{comment.text}</p>
                                                <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                    <span className="font-medium">
                                                        {authorName}
                                                        {authorEmail ? ` (${authorEmail})` : ''}
                                                    </span>
                                                    <span>{new Date(comment.date || comment.timestamp || comment.createdAt).toLocaleString('en-ZA', { 
                                                        month: 'short', 
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        year: 'numeric'
                                                    })}</span>
                                                </div>
                                                {canDelete && (
                                                    <button
                                                        onClick={() => handleDeleteComment(parseInt(sectionId), parseInt(documentId), month, comment.id || idx)}
                                                        className="absolute top-1 right-1 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                                        type="button"
                                                    >
                                                        <i className="fas fa-trash text-[10px]"></i>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <div className="text-[10px] font-semibold text-gray-600 mb-1">Add Comment</div>
                            {window.CommentInputWithMentions ? (
                                <window.CommentInputWithMentions
                                    onSubmit={(commentText) => {
                                        handleAddComment(parseInt(sectionId), parseInt(documentId), month, commentText);
                                    }}
                                    placeholder="Type comment... (@mention users, Shift+Enter for new line, Enter to send)"
                                    rows={2}
                                    showButton={true}
                                    autoFocus={true}
                                />
                            ) : (
                                <>
                                    <textarea
                                        value={quickComment}
                                        onChange={(e) => setQuickComment(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.ctrlKey) {
                                                handleAddComment(parseInt(sectionId), parseInt(documentId), month, quickComment);
                                            }
                                        }}
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows="2"
                                        placeholder="Type comment... (Ctrl+Enter to submit, Loading mention support...)"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => {
                                            handleAddComment(parseInt(sectionId), parseInt(documentId), month, quickComment);
                                        }}
                                        disabled={!quickComment.trim()}
                                        className="mt-1.5 w-full px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Add Comment
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onBack} 
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50/50 rounded-lg transition-colors"
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Monthly Document Collection Tracker</h1>
                        <p className="text-xs text-gray-500">{project.name} • {project.client}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <label className="text-[10px] font-medium text-gray-600">Year:</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => handleYearChange(parseInt(e.target.value))}
                        className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        {yearOptions.map(year => (
                            <option key={year} value={year}>
                                {year}
                                {year === currentYear && ' (Current)'}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={handleExportToExcel}
                        disabled={isExporting || sections.length === 0}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-[10px] font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isExporting ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                Exporting...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-file-excel"></i>
                                Export
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleAddSection}
                        className="px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-[10px] font-medium"
                    >
                        <i className="fas fa-plus mr-1"></i>
                        Add Section
                    </button>
                    <button
                        onClick={() => setShowApplyTemplateModal(true)}
                        className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-[10px] font-medium"
                    >
                        <i className="fas fa-magic mr-1"></i>
                        Apply Template
                    </button>
                    <button
                        onClick={handleCreateTemplate}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-[10px] font-medium"
                    >
                        <i className="fas fa-layer-group mr-1"></i>
                        Templates
                    </button>
                    {sections.length > 0 && (
                        <button
                            onClick={handleCreateTemplateFromCurrent}
                            className="px-3 py-1 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-[10px] font-medium"
                        >
                            <i className="fas fa-save mr-1"></i>
                            Save as Template
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-gray-100">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-medium">
                            <i className="fas fa-calendar-check mr-1 text-[10px]"></i>
                            Working Months
                        </span>
                        <span className="text-[10px] text-gray-500">
                            Highlighted columns show current focus months (2 months in arrears)
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-medium text-gray-600">Status Progression:</span>
                        {statusOptions.slice(0, 3).map((option, idx) => (
                            <React.Fragment key={option.value}>
                                <div className="flex items-center gap-1">
                                    <div className={`w-3 h-3 rounded ${option.cellColor} border border-gray-300`}></div>
                                    <span className="text-[10px] text-gray-600">{option.label}</span>
                                </div>
                                {idx < 2 && (
                                    <i className="fas fa-arrow-right text-[8px] text-gray-400"></i>
                                )}
                            </React.Fragment>
                        ))}
                        <span className="text-gray-300 mx-1">|</span>
                        <div className="flex items-center gap-1">
                            <div className={`w-3 h-3 rounded ${statusOptions[3].cellColor} border border-gray-300`}></div>
                            <span className="text-[10px] text-gray-600">{statusOptions[3].label}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="relative overflow-x-auto" ref={tableRef}>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50/30">
                            <tr>
                                <th 
                                    className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide sticky left-0 bg-gray-50/30 z-50 border-r border-gray-200"
                                    style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                >
                                    Document / Data
                                </th>
                                {months.map((month, idx) => (
                                    <th 
                                        key={month}
                                        ref={el => monthRefs.current[month] = el}
                                        className={`px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide border-l border-gray-200 ${
                                            workingMonths.includes(idx) && selectedYear === currentYear
                                                ? 'bg-primary-50 text-primary-700'
                                                : 'text-gray-600'
                                        }`}
                                        >
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span>{month.slice(0, 3)} '{String(selectedYear).slice(-2)}</span>
                                            {workingMonths.includes(idx) && selectedYear === currentYear && (
                                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-primary-100 text-primary-700">
                                                    <i className="fas fa-calendar-check mr-0.5"></i>
                                                    Working
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide border-l border-gray-200">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {sections.length === 0 ? (
                                <tr>
                                    <td colSpan={14} className="px-6 py-8 text-center text-gray-400">
                                        <i className="fas fa-folder-open text-3xl mb-2 opacity-50"></i>
                                        <p className="text-sm">No sections yet</p>
                                        <button
                                            onClick={handleAddSection}
                                            className="mt-3 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                        >
                                            <i className="fas fa-plus mr-1"></i>
                                            Add First Section
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                sections.map((section, sectionIndex) => (
                                    <React.Fragment key={section.id}>
                                        <tr 
                                            draggable="true"
                                            onDragStart={(e) => handleDragStart(e, section, sectionIndex)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={handleDragOver}
                                            onDragEnter={(e) => handleDragEnter(e, sectionIndex)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, sectionIndex)}
                                            className={`bg-gray-50/50 cursor-grab active:cursor-grabbing ${
                                                dragOverIndex === sectionIndex ? 'border-t-2 border-primary-500' : ''
                                            }`}
                                        >
                                                    <td 
                                                        className="px-2.5 py-2 sticky left-0 bg-gray-50/50 z-50 border-r border-gray-200"
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                                    >
                                                <div className="flex items-center gap-2">
                                                    <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                                    <div className="flex-1">
                                                        <div className="font-semibold text-sm text-gray-900">{section.name}</div>
                                                        {section.description && (
                                                            <div className="text-[10px] text-gray-500">{section.description}</div>
                                                        )}
                                                        <button
                                                            onClick={() => handleAddDocument(section.id)}
                                                            className="mt-2 px-2 py-0.5 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 transition-colors"
                                                        >
                                                            <i className="fas fa-plus mr-1"></i>
                                                            Add Document/Data
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td colSpan={12} className="px-2 py-2">
                                            </td>
                                            <td className="px-2.5 py-2 border-l border-gray-200">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleEditSection(section)}
                                                        className="text-gray-600 hover:text-primary-600 p-1"
                                                    >
                                                        <i className="fas fa-edit text-xs"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSection(section.id)}
                                                        className="text-gray-600 hover:text-red-600 p-1"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {section.documents.length === 0 ? (
                                            <tr>
                                                <td colSpan={14} className="px-8 py-4 text-center text-gray-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <i className="fas fa-file-alt text-2xl opacity-50"></i>
                                                        <p className="text-xs">No documents/data in this section</p>
                                                        <button
                                                            onClick={() => handleAddDocument(section.id)}
                                                            className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <i className="fas fa-plus"></i>
                                                            Add Document/Data
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            section.documents.map((document, documentIndex) => (
                                                <tr 
                                                    key={document.id} 
                                                    draggable="true"
                                                    onDragStart={(e) => handleDocumentDragStart(e, document, section.id, documentIndex)}
                                                    onDragEnd={handleDocumentDragEnd}
                                                    onDragOver={handleDocumentDragOver}
                                                    onDragEnter={(e) => handleDocumentDragEnter(e, section.id, documentIndex)}
                                                    onDragLeave={handleDocumentDragLeave}
                                                    onDrop={(e) => handleDocumentDrop(e, section.id, documentIndex)}
                                                    className={`hover:bg-gray-50/30 cursor-grab active:cursor-grabbing ${
                                                        dragOverDocumentIndex?.sectionId === section.id && dragOverDocumentIndex?.documentIndex === documentIndex 
                                                            ? 'border-t-2 border-primary-500' : ''
                                                    }`}
                                                >
                                                    <td 
                                                        className="px-4 py-1.5 sticky left-0 bg-white z-50 border-r border-gray-200"
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                                    >
                                                        <div className="min-w-[200px] flex items-center gap-2">
                                                            <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                                            <div className="flex-1">
                                                                <div className="text-xs font-medium text-gray-900">{document.name}</div>
                                                                {document.description && (
                                                                    <div className="text-[10px] text-gray-500 mt-0.5">{document.description}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    {months.map(month => (
                                                        <React.Fragment key={`${document.id}-${month}`}>
                                                            {renderStatusCell(section, document, month)}
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="px-2.5 py-1.5 border-l border-gray-200">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleEditDocument(section, document)}
                                                                className="text-gray-600 hover:text-primary-600 p-1"
                                                            >
                                                                <i className="fas fa-edit text-xs"></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDocument(section.id, document.id)}
                                                                className="text-gray-600 hover:text-red-600 p-1"
                                                            >
                                                                <i className="fas fa-trash text-xs"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showSectionModal && <SectionModal />}
            {showDocumentModal && <DocumentModal />}
            {showTemplateModal && <TemplateModal showTemplateList={showTemplateList} setShowTemplateList={setShowTemplateList} />}
            {showApplyTemplateModal && <ApplyTemplateModal />}
        </div>
    );
};

window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
console.log('✅ MonthlyDocumentCollectionTracker component loaded (v20250127-refactored-API)');

export default MonthlyDocumentCollectionTracker;
