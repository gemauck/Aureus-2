// Get React hooks from window
const { useState, useEffect, useRef, useCallback } = React;
const storage = window.storage;
const STICKY_COLUMN_SHADOW = '4px 0 12px rgba(15, 23, 42, 0.08)';

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
    const saveTimeoutRef = useRef(null);
    const isSavingRef = useRef(false);
    const previousProjectIdRef = useRef(project?.id);
    const hasLoadedInitialDataRef = useRef(false);
    const sectionsRef = useRef({});
    const lastSavedSnapshotRef = useRef('{}');
    const apiRef = useRef(window.DocumentCollectionAPI || null);
    
    const getSnapshotKey = (projectId) => projectId ? `documentCollectionSnapshot_${projectId}` : null;

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Year selection with persistence
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
    
    // Parse documentSections safely (legacy flat array support)
    const parseSections = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        
        try {
            if (typeof data === 'string') {
                let cleaned = data.trim();
                if (!cleaned) return [];
                
                let attempts = 0;
                while (attempts < 10) {
                    try {
                        const parsed = JSON.parse(cleaned);
                        if (Array.isArray(parsed)) return parsed;
                        if (typeof parsed === 'string') {
                            cleaned = parsed;
                            attempts++;
                            continue;
                        }
                        return [];
                    } catch (parseError) {
                        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                            cleaned = cleaned.slice(1, -1);
                        }
                        cleaned = cleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        attempts++;
                        if (attempts >= 10) {
                            console.warn('Failed to parse documentSections after', attempts, 'attempts');
                            return [];
                        }
                    }
                }
                return [];
            }
        } catch (e) {
            console.warn('Failed to parse documentSections:', e);
            return [];
        }
        return [];
    };

    // Snapshot serializer for any documentSections shape (array or year map)
    const serializeSections = (data) => {
        try {
            return JSON.stringify(data ?? {});
        } catch (error) {
            console.warn('Failed to serialize documentSections snapshot:', error);
            return '{}';
        }
    };

    const cloneSectionsArray = (sections) => {
        try {
            return JSON.parse(JSON.stringify(Array.isArray(sections) ? sections : []));
        } catch {
            return Array.isArray(sections) ? [...sections] : [];
        }
    };

    const inferYearsFromSections = (sections) => {
        const years = new Set();
        (sections || []).forEach(section => {
            (section.documents || []).forEach(doc => {
                const keys = [
                    ...Object.keys(doc.collectionStatus || {}),
                    ...Object.keys(doc.comments || {})
                ];
                keys.forEach(key => {
                    if (!key) return;
                    const parts = String(key).split('-');
                    const maybeYear = parseInt(parts[parts.length - 1], 10);
                    if (!Number.isNaN(maybeYear) && maybeYear > 1900 && maybeYear < 3000) {
                        years.add(maybeYear);
                    }
                });
            });
        });
        return Array.from(years).sort();
    };

    const normalizeSectionsByYear = (rawValue, fallbackYear) => {
        if (!rawValue) return {};

        let parsedValue = rawValue;

        if (typeof rawValue === 'string') {
            const trimmed = rawValue.trim();
            if (!trimmed) return {};
            try {
                parsedValue = JSON.parse(trimmed);
            } catch {
                parsedValue = parseSections(rawValue);
            }
        }

        if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
            const result = {};
            Object.keys(parsedValue).forEach(yearKey => {
                const value = parsedValue[yearKey];
                result[yearKey] = Array.isArray(value) ? value : parseSections(value);
            });
            return result;
        }

        const baseSections = Array.isArray(parsedValue) ? parsedValue : parseSections(parsedValue);
        const inferredYears = inferYearsFromSections(baseSections);
        const targetYears = inferredYears.length > 0
            ? inferredYears
            : (fallbackYear ? [fallbackYear] : []);

        if (targetYears.length === 0) {
            return {};
        }

        const map = {};
        targetYears.forEach(year => {
            map[year] = cloneSectionsArray(baseSections);
        });
        return map;
    };
    
    // ============================================================
    // SIMPLIFIED STATE MANAGEMENT - Single source of truth
    // ============================================================
    
    // Main data state - loaded from database, stored per year
    const [sectionsByYear, setSectionsByYear] = useState({});
    
    // View model for the currently selected year only
    // This ensures that edits (adding sections, documents, comments, etc.)
    // are scoped to a single year instead of affecting every year.
    const sections = React.useMemo(
        () => sectionsByYear[selectedYear] || [],
        [sectionsByYear, selectedYear]
    );

    // Year‑scoped setter: only updates the array for the active year
    const setSections = (updater) => {
        setSectionsByYear(prev => {
            const prevForYear = prev[selectedYear] || [];
            const nextForYear = typeof updater === 'function'
                ? updater(prevForYear)
                : (updater || []);
            
            return {
                ...prev,
                [selectedYear]: nextForYear
            };
        });
    };

    const [isLoading, setIsLoading] = useState(true);
    
    // Keep refs in sync with latest state
    useEffect(() => {
        sectionsRef.current = sectionsByYear;
    }, [sectionsByYear]);
    
    useEffect(() => {
        // Always prefer singleton instance created by DocumentCollectionAPI service
        if (window.DocumentCollectionAPI) {
            apiRef.current = window.DocumentCollectionAPI;
        }
    }, []);
    
    // Templates state
    const [templates, setTemplates] = useState([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    
    // UI state
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
    const [showTemplateList, setShowTemplateList] = useState(true);
    const [editingSection, setEditingSection] = useState(null);
    const [editingDocument, setEditingDocument] = useState(null);
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [draggedSection, setDraggedSection] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedDocument, setDraggedDocument] = useState(null);
    const [dragOverDocumentIndex, setDragOverDocumentIndex] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null);
    const [quickComment, setQuickComment] = useState('');
    const [commentPopupPosition, setCommentPopupPosition] = useState({ top: 0, left: 0 });
    const commentPopupContainerRef = useRef(null);
    
    // ============================================================
    // LOAD DATA FROM PROJECT PROP + REFRESH FROM DATABASE
    // ============================================================
    // ⚠️ IMPORTANT: Only load on initial mount or when project ID actually changes
    
    const loadFromProjectProp = useCallback(() => {
        if (!project?.id) return;
        
        setIsLoading(true);
        try {
            const snapshotKey = getSnapshotKey(project.id);
            const normalizedFromProp = normalizeSectionsByYear(project.documentSections, selectedYear);
            let normalized = normalizedFromProp;
            
            const yearKeys = Object.keys(normalizedFromProp || {});
            console.log('✅ Loaded sections map from project prop.', {
                years: yearKeys,
                selectedYear,
                hasDataForSelectedYear: Array.isArray(normalizedFromProp?.[selectedYear]) && normalizedFromProp[selectedYear].length > 0
            });
            
            // If prop has no data but we have a local snapshot, restore from snapshot
            if ((!normalizedFromProp || yearKeys.length === 0) && snapshotKey && window.localStorage) {
                try {
                    const snapshotString = window.localStorage.getItem(snapshotKey);
                    if (snapshotString) {
                        const snapshotParsed = JSON.parse(snapshotString);
                        const snapshotMap = normalizeSectionsByYear(snapshotParsed, selectedYear);
                        const snapshotYears = Object.keys(snapshotMap || {});
                        if (snapshotYears.length > 0) {
                            console.log('🩹 Restoring document sections from local snapshot.', {
                                snapshotYears,
                                selectedYear
                            });
                            normalized = snapshotMap;
                        }
                    }
                } catch (snapshotError) {
                    console.warn('⚠️ Failed to restore document collection snapshot from localStorage:', snapshotError);
                }
            }
            
            // If the currently selected year has no data but another year does, default to the first year with data
            if ((!normalized[selectedYear] || normalized[selectedYear].length === 0) && yearKeys.length > 0) {
                const fallbackYear = parseInt(yearKeys[0], 10);
                if (!Number.isNaN(fallbackYear) && fallbackYear !== selectedYear) {
                    console.log('🔄 Adjusting selectedYear to first year with data:', fallbackYear);
                    setSelectedYear(fallbackYear);
                }
            }
            
            setSectionsByYear(normalized);
            lastSavedSnapshotRef.current = serializeSections(normalized);
        } catch (error) {
            console.error('❌ Error loading sections from prop:', error);
            setSectionsByYear({});
            lastSavedSnapshotRef.current = '{}';
        } finally {
            hasLoadedInitialDataRef.current = true;
            setIsLoading(false);
        }
    }, [project?.documentSections, project?.id, selectedYear]);
    
    const refreshFromDatabase = useCallback(async () => {
        if (!project?.id || !apiRef.current) return;
        
        try {
            const freshProject = await apiRef.current.fetchProject(project.id);
            const snapshotKey = getSnapshotKey(project.id);
            const normalizedFromDb = normalizeSectionsByYear(freshProject?.documentSections, selectedYear);
            let normalized = normalizedFromDb;
            const yearKeys = Object.keys(normalizedFromDb || {});
            const currentSnapshot = serializeSections(sectionsRef.current);
            const freshSnapshot = serializeSections(normalized);
            
            // If DB has no data but we have a local snapshot, treat snapshot as source of truth
            if ((!normalizedFromDb || yearKeys.length === 0) && snapshotKey && window.localStorage) {
                try {
                    const snapshotString = window.localStorage.getItem(snapshotKey);
                    if (snapshotString) {
                        const snapshotParsed = JSON.parse(snapshotString);
                        const snapshotMap = normalizeSectionsByYear(snapshotParsed, selectedYear);
                        const snapshotYears = Object.keys(snapshotMap || {});
                        if (snapshotYears.length > 0) {
                            console.log('🩹 DB returned empty documentSections. Restoring from local snapshot and re‑applying.');
                            normalized = snapshotMap;
                        }
                    }
                } catch (snapshotError) {
                    console.warn('⚠️ Failed to apply document collection snapshot as DB fallback:', snapshotError);
                }
            }
            
            // If selectedYear has no data in fresh payload but other years do, adjust selection
            if ((!normalized[selectedYear] || normalized[selectedYear].length === 0) && yearKeys.length > 0) {
                const fallbackYear = parseInt(yearKeys[0], 10);
                if (!Number.isNaN(fallbackYear) && fallbackYear !== selectedYear) {
                    console.log('🔄 Adjusting selectedYear (from fresh DB) to first year with data:', fallbackYear);
                    setSelectedYear(fallbackYear);
                }
            }
            
            if (freshSnapshot !== currentSnapshot) {
                console.log('🔄 Updating sections map from fresh database data. Years:', yearKeys);
                setSectionsByYear(normalized);
                lastSavedSnapshotRef.current = freshSnapshot;
            }
        } catch (error) {
            console.error('❌ Error fetching fresh project data:', error);
        }
    }, [project?.id, selectedYear]);
    
    useEffect(() => {
        if (!project?.id) return;
        
        const isNewProject = previousProjectIdRef.current !== project.id;
        if (isNewProject) {
            previousProjectIdRef.current = project.id;
            hasLoadedInitialDataRef.current = false;
        }
        
        const hasUnsavedChanges = serializeSections(sectionsRef.current) !== lastSavedSnapshotRef.current;
        if (isNewProject || !hasUnsavedChanges) {
            console.log('📋 Loading document sections from prop for project:', project.id);
            loadFromProjectProp();
        } else {
            console.log('⏸️ Skipping prop load due to unsaved changes');
        }
        
        refreshFromDatabase();
    }, [project?.id, project?.documentSections, loadFromProjectProp, refreshFromDatabase]);
    
    // ============================================================
    // SIMPLE AUTO-SAVE - Debounced, saves entire state
    // ============================================================
    //
    // NOTE:
    // This is intentionally wired to a hoisted function declaration (`saveToDatabase`)
    // instead of a `const saveToDatabase = async () => {}` binding.
    // In production builds, some bundlers/minifiers can reorder or rename such
    // bindings (e.g. to `const Fe = ...`) in a way that results in
    // "Cannot access 'Fe' before initialization" when the function is referenced
    // from hooks declared earlier in the component.
    //
    // Using a function declaration avoids that temporal‑dead‑zone issue while
    // remaining safe because mutable state lives in refs and React state.
    useEffect(() => {
        if (isLoading || !project?.id) return;
        
        // Clear any pending save
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
    }, [sectionsByYear, isLoading, project?.id]);
    
    async function saveToDatabase(options = {}) {
        if (isSavingRef.current) {
            console.log('⏭️ Save already in progress, skipping');
            return;
        }
        if (!project?.id) {
            console.warn('⚠️ Cannot save: No project ID');
            return;
        }
        if (isLoading) {
            console.log('⏭️ Still loading data, skipping save');
            return;
        }
        
        const payload = sectionsRef.current || {};
        
        // Guard against wiping data with an all‑empty payload
        const hasAnySections = Object.values(payload || {}).some(
            (yearSections) => Array.isArray(yearSections) && yearSections.length > 0
        );
        if (!hasAnySections) {
            console.log('⏭️ Skipping save: sections payload is empty for all years – avoiding overwrite');
            return;
        }
        
        isSavingRef.current = true;
        
        try {
            console.log('💾 Saving sections map to database. Years:', Object.keys(payload));
            
            if (apiRef.current && typeof apiRef.current.saveDocumentSections === 'function') {
                await apiRef.current.saveDocumentSections(project.id, payload, options.skipParentUpdate);
            } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                const updatePayload = {
                    documentSections: serializeSections(payload)
                };
                await window.DatabaseAPI.updateProject(project.id, updatePayload);
            } else {
                throw new Error('No available API for saving document sections');
            }
            
            const serialized = serializeSections(payload);
            lastSavedSnapshotRef.current = serialized;
            
            // Persist a snapshot locally so navigation issues cannot lose user data
            const snapshotKey = getSnapshotKey(project.id);
            if (snapshotKey && window.localStorage) {
                try {
                    window.localStorage.setItem(snapshotKey, serialized);
                    console.log('🧷 Document collection snapshot saved locally for resilience.');
                } catch (storageError) {
                    console.warn('⚠️ Failed to save document collection snapshot to localStorage:', storageError);
                }
            }
            console.log('✅ Save successful');
        } catch (error) {
            console.error('❌ Error saving to database:', error);
            // Don't throw - allow user to continue working; auto‑save will retry on next change
        } finally {
            isSavingRef.current = false;
        }
    };
    
    // Save pending changes on hard refresh / tab close
    useEffect(() => {
        if (!project?.id) return;
        
        const handleBeforeUnload = (event) => {
            const hasUnsavedChanges = serializeSections(sectionsRef.current) !== lastSavedSnapshotRef.current;
            if (hasUnsavedChanges && !isSavingRef.current) {
                // Fire-and-forget save; we can't await during beforeunload
                saveToDatabase({ skipParentUpdate: true });
                event.preventDefault();
                event.returnValue = '';
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [project?.id]);

    // Ensure pending changes are saved when the component unmounts (e.g. user navigates away)
    useEffect(() => {
        if (!project?.id) return;

        return () => {
            const hasUnsavedChanges = serializeSections(sectionsRef.current) !== lastSavedSnapshotRef.current;
            if (hasUnsavedChanges && !isSavingRef.current) {
                console.log('💾 Component unmount: flushing pending document collection changes to database');
                // Fire-and-forget save on unmount; parent update is optional here
                saveToDatabase({ skipParentUpdate: true });
            }
        };
    }, [project?.id]);
    
    // ============================================================
    // TEMPLATE MANAGEMENT - Database storage only
    // ============================================================
    
    const loadTemplates = async () => {
        console.log('📂 Loading templates from database...');
        setIsLoadingTemplates(true);
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ No auth token, cannot load templates');
                setTemplates([]);
                setIsLoadingTemplates(false);
                return;
            }
            
            const response = await fetch('/api/document-collection-templates', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load templates: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            // API wraps response in { data: { templates: [...] } }
            const apiTemplates = data?.data?.templates || data?.templates || [];
            
            // Ensure sections are parsed for each template
            const parsedTemplates = apiTemplates.map(t => ({
                ...t,
                sections: parseSections(t.sections)
            }));
            
            console.log('✅ Loaded', parsedTemplates.length, 'templates from database');
            setTemplates(parsedTemplates);
        } catch (error) {
            console.error('❌ Error loading templates:', error);
            alert('Failed to load templates: ' + error.message);
            setTemplates([]);
        } finally {
            setIsLoadingTemplates(false);
        }
    };
    
    // Load templates when modal opens
    useEffect(() => {
        if (showTemplateModal || showApplyTemplateModal) {
            loadTemplates();
        }
    }, [showTemplateModal, showApplyTemplateModal]);
    
    const saveTemplate = async (templateData) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                throw new Error('Authentication required to save templates');
            }
            
            const currentUser = getCurrentUser();
            
            if (editingTemplate) {
                // Update existing template in database
                const response = await fetch(`/api/document-collection-templates/${editingTemplate.id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ...templateData,
                        updatedBy: currentUser.name || currentUser.email
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to update template');
                }
                
                console.log('✅ Template updated in database');
            } else {
                // Create new template in database
                const response = await fetch('/api/document-collection-templates', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ...templateData,
                        createdBy: currentUser.name || currentUser.email,
                        updatedBy: currentUser.name || currentUser.email
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to create template');
                }
                
                console.log('✅ Template created in database');
            }
            
            // Reload templates from database to get fresh data
            await loadTemplates();
            
            console.log('✅ Template saved successfully');
            setEditingTemplate(null);
            setShowTemplateList(true);
            
        } catch (error) {
            console.error('❌ Error saving template:', error);
            alert('Failed to save template: ' + error.message);
        }
    };
    
    const deleteTemplate = async (templateId) => {
        if (!confirm('Delete this template? This action cannot be undone.')) {
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                throw new Error('Authentication required to delete templates');
            }
            
            const template = templates.find(t => String(t.id) === String(templateId));
            if (!template) {
                throw new Error(`Template not found. ID: ${templateId}`);
            }
            
            // Delete from database
            const response = await fetch(`/api/document-collection-templates/${encodeURIComponent(templateId)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `Failed to delete template: ${response.status}`;
                throw new Error(errorMessage);
            }
            
            console.log('✅ Template deleted from database');
            
            // Reload templates from database
            await loadTemplates();
            
            console.log('✅ Template deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting template:', error);
            alert('Failed to delete template: ' + error.message);
        }
    };
    
    const applyTemplate = async (template, targetYear) => {
        if (!template || !Array.isArray(template.sections) || template.sections.length === 0) {
            alert('Template is empty or invalid');
            return;
        }
        
        console.log('🎨 Applying template:', template.name);
        
        // Create new sections from template
        const newSections = template.sections.map(section => ({
            id: Date.now() + Math.random(),
            name: section.name,
            description: section.description || '',
            documents: Array.isArray(section.documents) ? section.documents.map(doc => ({
                id: Date.now() + Math.random(),
                name: doc.name,
                description: doc.description || '',
                collectionStatus: {},
                comments: {}
            })) : []
        }));
        
        // Merge with existing sections
        setSections(prev => [...prev, ...newSections]);
        
        console.log('✅ Template applied:', newSections.length, 'sections added');
        setShowApplyTemplateModal(false);
        
        // Save will happen automatically via useEffect
    };
    
    // ============================================================
    // USER INFO HELPER
    // ============================================================
    
    const getCurrentUser = () => {
        const defaultUser = { name: 'System', email: 'system', id: 'system', role: 'System' };
        
        try {
            const userData = localStorage.getItem('abcotronics_user');
            if (userData && userData !== 'null' && userData !== 'undefined') {
                const parsed = JSON.parse(userData);
                const user = parsed.user || parsed;
                
                if (user && (user.name || user.email)) {
                    return {
                        name: user.name || user.email || 'System',
                        email: user.email || 'system',
                        id: user.id || user._id || user.email || 'system',
                        role: user.role || 'System'
                    };
                }
            }
        } catch (error) {
            console.warn('Failed to get user:', error);
        }
        
        return defaultUser;
    };
    
    // ============================================================
    // YEAR SELECTION
    // ============================================================
    
    const handleYearChange = useCallback((year) => {
        if (!year || isNaN(year)) {
            console.warn('Invalid year provided:', year);
            return;
        }
        
        console.log(`📅 Year changed to: ${year}`);
        setSelectedYear(year);
        if (project?.id && typeof window !== 'undefined') {
            localStorage.setItem(`${YEAR_STORAGE_PREFIX}${project.id}`, String(year));
        }
    }, [project?.id]);
    
    const MIN_YEAR = 2015;
    const FUTURE_YEAR_BUFFER = 5;
    const yearOptions = [];
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
    
    // ============================================================
    // STATUS OPTIONS
    // ============================================================
    
    const statusOptions = [
        { value: 'not-collected', label: 'Not Collected', color: 'bg-red-400 text-white font-semibold', cellColor: 'bg-red-400 border-l-4 border-red-700 shadow-sm' },
        { value: 'ongoing', label: 'Collection Ongoing', color: 'bg-yellow-400 text-white font-semibold', cellColor: 'bg-yellow-400 border-l-4 border-yellow-700 shadow-sm' },
        { value: 'collected', label: 'Collected', color: 'bg-green-500 text-white font-semibold', cellColor: 'bg-green-500 border-l-4 border-green-700 shadow-sm' },
        { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-400 text-white font-semibold', cellColor: 'bg-gray-400 border-l-4 border-gray-700 shadow-sm' }
    ];
    
    const getStatusConfig = (status) => {
        return statusOptions.find(opt => opt.value === status) || statusOptions[0];
    };
    
    // ============================================================
    // SECTION CRUD
    // ============================================================
    
    const handleAddSection = () => {
        setEditingSection(null);
        setShowSectionModal(true);
    };
    
    const handleEditSection = (section) => {
        setEditingSection(section);
        setShowSectionModal(true);
    };
    
    const handleSaveSection = (sectionData) => {
        if (editingSection) {
            setSections(prev => prev.map(s => 
                s.id === editingSection.id ? { ...s, ...sectionData } : s
            ));
            console.log('📝 Updated section:', sectionData.name);
        } else {
            const newSection = {
                id: Date.now(),
                ...sectionData,
                documents: []
            };
            setSections(prev => [...prev, newSection]);
            console.log('➕ Added section:', sectionData.name);
        }
        
        setShowSectionModal(false);
        setEditingSection(null);
    };
    
    const handleDeleteSection = (sectionId) => {
        // Normalize IDs to strings for comparison
        const normalizedSectionId = String(sectionId);
        const section = sections.find(s => String(s.id) === normalizedSectionId);
        
        if (!section) {
            console.error('❌ Section not found for deletion. ID:', sectionId, 'Available sections:', sections.map(s => ({ id: s.id, name: s.name })));
            alert(`Error: Section not found. Cannot delete.`);
            return;
        }
        
        if (!confirm(`Delete section "${section.name}" and all its documents?`)) {
            return;
        }
        
        setSections(prev => {
            const filtered = prev.filter(s => String(s.id) !== normalizedSectionId);
            console.log('🗑️ Deleted section:', section.name, 'Remaining sections:', filtered.length);
            return filtered;
        });
    };
    
    // ============================================================
    // DOCUMENT CRUD
    // ============================================================
    
    const handleAddDocument = (sectionId) => {
        if (!sectionId) {
            alert('Error: Cannot add document. Section ID is missing.');
            return;
        }
        setEditingSectionId(sectionId);
        setEditingDocument(null);
        setShowDocumentModal(true);
    };
    
    const handleEditDocument = (section, document) => {
        setEditingSectionId(section.id);
        setEditingDocument(document);
        setShowDocumentModal(true);
    };
    
    const handleSaveDocument = (documentData) => {
        if (!editingSectionId) {
            alert('Error: No section selected.');
            return;
        }
        
        setSections(prev => prev.map(section => {
            if (section.id === editingSectionId) {
                if (editingDocument) {
                    // Update existing document
                    return {
                        ...section,
                        documents: section.documents.map(doc => 
                            doc.id === editingDocument.id 
                                ? { ...doc, ...documentData }
                                : doc
                        )
                    };
                } else {
                    // Add new document
                    const newDocument = {
                        id: Date.now(),
                        ...documentData,
                        collectionStatus: documentData.collectionStatus || {},
                        comments: documentData.comments || {}
                    };
                    return {
                        ...section,
                        documents: [...section.documents, newDocument]
                    };
                }
            }
            return section;
        }));
        
        setShowDocumentModal(false);
        setEditingDocument(null);
        setEditingSectionId(null);
    };
    
    const handleDeleteDocument = (sectionId, documentId) => {
        // Normalize IDs to strings for comparison
        const normalizedSectionId = String(sectionId);
        const normalizedDocumentId = String(documentId);
        
        const section = sections.find(s => String(s.id) === normalizedSectionId);
        if (!section) {
            console.error('❌ Section not found for document deletion. Section ID:', sectionId);
            alert(`Error: Section not found. Cannot delete document.`);
            return;
        }
        
        const document = section.documents.find(d => String(d.id) === normalizedDocumentId);
        if (!document) {
            console.error('❌ Document not found for deletion. Document ID:', documentId, 'Section:', section.name);
            alert(`Error: Document not found. Cannot delete.`);
            return;
        }
        
        if (!confirm(`Delete document "${document.name}"?`)) {
            return;
        }
        
        setSections(prev => prev.map(section => {
            if (String(section.id) === normalizedSectionId) {
                const filteredDocuments = section.documents.filter(doc => String(doc.id) !== normalizedDocumentId);
                console.log('🗑️ Deleted document:', document.name, 'from section:', section.name, 'Remaining documents:', filteredDocuments.length);
                return {
                    ...section,
                    documents: filteredDocuments
                };
            }
            return section;
        }));
    };
    
    // ============================================================
    // STATUS AND COMMENTS
    // ============================================================
    
    const handleUpdateStatus = useCallback((sectionId, documentId, month, status) => {
        setSections(prev => {
            // Use functional update to ensure we're working with latest state
            const updated = prev.map(section => {
                if (section.id === sectionId) {
                    return {
                        ...section,
                        documents: section.documents.map(doc => {
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
                return section;
            });
            
            // Log status change for debugging
            console.log(`📝 Status updated: ${documentId} - ${month} ${selectedYear} = ${status}`);
            
            return updated;
        });
    }, [selectedYear]);
    
    const handleAddComment = (sectionId, documentId, month, commentText) => {
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
        
        setSections(prev => prev.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
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
            return section;
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
                         currentUser.role === 'Administrator';
        
        if (!canDelete) {
            alert('You can only delete your own comments or need admin privileges.');
            return;
        }
        
        if (!confirm('Delete this comment?')) return;
        
        setSections(prev => prev.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
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
            return section;
        }));
    };
    
    const getDocumentStatus = (document, month) => {
        return getStatusForYear(document.collectionStatus, month, selectedYear);
    };
    
    const getDocumentComments = (document, month) => {
        return getCommentsForYear(document.comments, month, selectedYear);
    };
    
    // ============================================================
    // DRAG AND DROP
    // ============================================================
    
    const handleSectionDragStart = (e, section, index) => {
        setDraggedSection({ section, index });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => e.currentTarget.style.opacity = '0.5', 0);
    };
    
    const handleSectionDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedSection(null);
        setDragOverIndex(null);
    };
    
    const handleSectionDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedSection && draggedSection.index !== dropIndex) {
            setSections(prev => {
                const reordered = [...prev];
                const [removed] = reordered.splice(draggedSection.index, 1);
                reordered.splice(dropIndex, 0, removed);
                return reordered;
            });
        }
        setDragOverIndex(null);
    };
    
    // ============================================================
    // EXCEL EXPORT
    // ============================================================
    
    const handleExportToExcel = async () => {
        setIsExporting(true);
        try {
            let XLSX = window.XLSX;
            
            // Wait for XLSX to load
            if (!XLSX || !XLSX.utils) {
                for (let i = 0; i < 30 && (!XLSX || !XLSX.utils); i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    XLSX = window.XLSX;
                }
            }
            
            if (!XLSX || !XLSX.utils) {
                throw new Error('XLSX library not available. Please refresh the page.');
            }
            
            // Prepare data
            const excelData = [];
            const headerRow1 = ['Section / Document'];
            const headerRow2 = [''];
            
            months.forEach(month => {
                const monthYear = `${month.slice(0, 3)} '${String(selectedYear).slice(-2)}`;
                headerRow1.push(monthYear, '');
                headerRow2.push('Status', 'Comments');
            });
            
            excelData.push(headerRow1, headerRow2);
            
            sections.forEach(section => {
                const sectionRow = [section.name];
                for (let i = 0; i < 24; i++) sectionRow.push('');
                excelData.push(sectionRow);
                
                section.documents.forEach(document => {
                    const row = [`  ${document.name}${document.description ? ' - ' + document.description : ''}`];
                    
                    months.forEach(month => {
                        const status = getStatusForYear(document.collectionStatus, month, selectedYear);
                        const statusLabel = status ? statusOptions.find(s => s.value === status)?.label : '';
                        row.push(statusLabel || '');
                        
                        const comments = getCommentsForYear(document.comments, month, selectedYear);
                        const commentsText = comments.map(c => {
                            const date = new Date(c.date).toLocaleString('en-ZA', {
                                year: 'numeric', month: 'short', day: '2-digit',
                                hour: '2-digit', minute: '2-digit'
                            });
                            return `[${date}] ${c.author}: ${c.text}`;
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
            
            XLSX.utils.book_append_sheet(wb, ws, `Doc Collection ${selectedYear}`);
            
            const filename = `${project.name}_Document_Collection_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, filename);
            
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Failed to export: ' + error.message);
        } finally {
            setIsExporting(false);
        }
    };
    
    // ============================================================
    // SCROLL TO WORKING MONTHS
    // ============================================================
    
    useEffect(() => {
        if (!hasInitialScrolled.current && sections.length > 0 && tableRef.current && selectedYear === currentYear) {
            setTimeout(() => {
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
                hasInitialScrolled.current = true;
            }, 100);
        }
    }, [sections, selectedYear]);
    
    // ============================================================
    // COMMENT POPUP MANAGEMENT
    // ============================================================
    
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
    
    // ============================================================
    // RENDER STATUS CELL
    // ============================================================
    
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
            <td className={`px-2 py-1 text-xs border-l border-gray-100 ${cellBackgroundClass} relative`}>
                <div className="min-w-[160px] relative">
                    <select
                        value={status || ''}
                        onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const newStatus = e.target.value;
                            handleUpdateStatus(section.id, document.id, month, newStatus);
                        }}
                        onBlur={(e) => {
                            // Ensure state is saved on blur
                            const newStatus = e.target.value;
                            if (newStatus !== status) {
                                handleUpdateStatus(section.id, document.id, month, newStatus);
                            }
                        }}
                        aria-label={`Status for ${document.name || 'document'} in ${month} ${selectedYear}`}
                        role="combobox"
                        aria-haspopup="listbox"
                        data-section-id={section.id}
                        data-document-id={document.id}
                        data-month={month}
                        data-year={selectedYear}
                        className={`w-full px-1.5 py-0.5 text-[10px] rounded font-medium border-0 cursor-pointer appearance-none bg-transparent ${textColorClass} hover:opacity-80`}
                    >
                        <option value="">Select Status</option>
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    
                    <div className="absolute top-1/2 right-0.5 -translate-y-1/2 z-10">
                        <button
                            data-comment-cell={cellKey}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                if (isPopupOpen) {
                                    setHoverCommentCell(null);
                                } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setCommentPopupPosition({
                                        top: rect.bottom + 5,
                                        left: rect.right - 288
                                    });
                                    setHoverCommentCell(cellKey);
                                }
                            }}
                            className="text-gray-500 hover:text-gray-700 transition-colors relative p-1"
                            title={hasComments ? `${comments.length} comment(s)` : 'Add comment'}
                            type="button"
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
    
    // ============================================================
    // MODALS
    // ============================================================
    
    const SectionModal = () => {
        const [formData, setFormData] = useState({
            name: editingSection?.name || '',
            description: editingSection?.description || ''
        });
        
        const handleSubmit = (e) => {
            e.preventDefault();
            if (!formData.name.trim()) {
                alert('Please enter a section name');
                return;
            }
            handleSaveSection(formData);
        };
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingSection ? 'Edit Section' : 'Add New Section'}
                        </h2>
                        <button onClick={() => setShowSectionModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Section Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                placeholder="e.g., Financial Documents"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                rows="2"
                                placeholder="Brief description..."
                            ></textarea>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowSectionModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                            >
                                {editingSection ? 'Update' : 'Add'} Section
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };
    
    const DocumentModal = () => {
        const [formData, setFormData] = useState({
            name: editingDocument?.name || '',
            description: editingDocument?.description || '',
            attachments: editingDocument?.attachments || []
        });
        
        useEffect(() => {
            setFormData({
                name: editingDocument?.name || '',
                description: editingDocument?.description || '',
                attachments: editingDocument?.attachments || []
            });
        }, [editingDocument]);
        
        const handleSubmit = (e) => {
            e.preventDefault();
            if (!formData.name.trim()) {
                alert('Please enter a document name');
                return;
            }
            handleSaveDocument(formData);
        };
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingDocument ? 'Edit Document' : 'Add Document'}
                        </h2>
                        <button onClick={() => setShowDocumentModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Document Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                placeholder="e.g., Bank Statements"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                rows="2"
                                placeholder="Additional details..."
                            ></textarea>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowDocumentModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                            >
                                {editingDocument ? 'Update' : 'Add'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };
    
    const TemplateModal = () => {
        const [formData, setFormData] = useState({
            name: editingTemplate?.name || '',
            description: editingTemplate?.description || '',
            sections: editingTemplate ? parseSections(editingTemplate.sections) : []
        });
        
        useEffect(() => {
            if (editingTemplate) {
                setFormData({
                    name: editingTemplate.name || '',
                    description: editingTemplate.description || '',
                    sections: parseSections(editingTemplate.sections)
                });
            }
        }, [editingTemplate]);
        
        const handleSubmit = (e) => {
            e.preventDefault();
            if (!formData.name.trim()) {
                alert('Please enter a template name');
                return;
            }
            if (formData.sections.length === 0) {
                alert('Please add at least one section');
                return;
            }
            saveTemplate(formData);
        };
        
        if (showTemplateList) {
            return (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                            <h2 className="text-base font-semibold text-gray-900">Template Management</h2>
                            <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-xs text-gray-600">Manage your document collection templates</p>
                                <button
                                    onClick={() => {
                                        setEditingTemplate(null);
                                        setShowTemplateList(false);
                                    }}
                                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                >
                                    <i className="fas fa-plus mr-1"></i>
                                    Create New Template
                                </button>
                            </div>
                            
                            {isLoadingTemplates ? (
                                <div className="text-center py-8">
                                    <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                                    <p className="text-sm text-gray-600 mt-2">Loading templates...</p>
                                </div>
                            ) : templates.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <i className="fas fa-layer-group text-3xl mb-2 opacity-50"></i>
                                    <p className="text-sm">No templates yet</p>
                                    <p className="text-xs mt-1">Create your first template to get started</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {templates.map(template => (
                                        <div key={template.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{template.name}</h3>
                                                    {template.description && (
                                                        <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-4 text-[10px] text-gray-500">
                                                        <span><i className="fas fa-folder mr-1"></i>{Array.isArray(template.sections) ? template.sections.length : 0} sections</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 ml-3">
                                                    <button
                                                        onClick={() => {
                                                            setEditingTemplate(template);
                                                            setShowTemplateList(false);
                                                        }}
                                                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    {!template.isDefault && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                console.log('🗑️ Delete button clicked for template:', template.id);
                                                                deleteTemplate(template.id);
                                                            }}
                                                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                                                            title="Delete template"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    )}
                                                    {template.isDefault && (
                                                        <span className="px-2 py-1 text-xs text-gray-400" title="Default template">
                                                            <i className="fas fa-lock"></i>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingTemplate ? 'Edit Template' : 'Create Template'}
                        </h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setEditingTemplate(null);
                                    setShowTemplateList(true);
                                }}
                                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                            >
                                <i className="fas fa-arrow-left mr-1"></i>
                                Back
                            </button>
                            <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Template Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                placeholder="e.g., Standard Monthly Checklist"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                rows="2"
                                placeholder="Brief description..."
                            ></textarea>
                        </div>
                        
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-medium text-gray-700">Sections *</label>
                                <button
                                    type="button"
                                    onClick={() => setFormData({
                                        ...formData,
                                        sections: [...formData.sections, { name: '', description: '', documents: [] }]
                                    })}
                                    className="px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium"
                                >
                                    <i className="fas fa-plus mr-1"></i>
                                    Add Section
                                </button>
                            </div>
                            
                            <div className="space-y-3">
                                {formData.sections.map((section, idx) => (
                                    <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-start justify-between mb-2">
                                            <input
                                                type="text"
                                                value={section.name}
                                                onChange={(e) => {
                                                    const newSections = [...formData.sections];
                                                    newSections[idx].name = e.target.value;
                                                    setFormData({...formData, sections: newSections});
                                                }}
                                                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                                                placeholder="Section name *"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newSections = formData.sections.filter((_, i) => i !== idx);
                                                    setFormData({...formData, sections: newSections});
                                                }}
                                                className="ml-2 text-red-600 hover:text-red-800 p-1"
                                            >
                                                <i className="fas fa-trash text-xs"></i>
                                            </button>
                                        </div>
                                        
                                        <div className="flex justify-between items-center mt-2">
                                            <label className="text-[10px] font-medium text-gray-600">Documents:</label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newSections = [...formData.sections];
                                                    if (!newSections[idx].documents) newSections[idx].documents = [];
                                                    newSections[idx].documents.push({ name: '', description: '' });
                                                    setFormData({...formData, sections: newSections});
                                                }}
                                                className="px-1.5 py-0.5 bg-gray-600 text-white rounded text-[9px] font-medium"
                                            >
                                                <i className="fas fa-plus mr-0.5"></i>
                                                Add
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-1 mt-1">
                                            {(section.documents || []).map((doc, docIdx) => (
                                                <div key={docIdx} className="flex items-center gap-1 bg-white p-1.5 rounded border border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={doc.name}
                                                        onChange={(e) => {
                                                            const newSections = [...formData.sections];
                                                            newSections[idx].documents[docIdx].name = e.target.value;
                                                            setFormData({...formData, sections: newSections});
                                                        }}
                                                        className="flex-1 px-1.5 py-0.5 text-[10px] border border-gray-300 rounded"
                                                        placeholder="Document name *"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newSections = [...formData.sections];
                                                            newSections[idx].documents = newSections[idx].documents.filter((_, i) => i !== docIdx);
                                                            setFormData({...formData, sections: newSections});
                                                        }}
                                                        className="text-red-600 hover:text-red-800 p-0.5"
                                                    >
                                                        <i className="fas fa-times text-[9px]"></i>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowTemplateModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                            >
                                {editingTemplate ? 'Update' : 'Create'} Template
                            </button>
                        </div>
                    </form>
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
            const template = templates.find(t => String(t.id) === String(selectedTemplateId));
            if (!template) {
                alert('Template not found');
                return;
            }
            applyTemplate(template, targetYear);
        };
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">Apply Template</h2>
                        <button onClick={() => setShowApplyTemplateModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>
                    
                    <div className="p-4 space-y-4">
                        {isLoadingTemplates ? (
                            <div className="text-center py-4">
                                <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                                <p className="text-sm text-gray-600 mt-2">Loading templates...</p>
                            </div>
                        ) : templates.length === 0 ? (
                            <div className="text-center py-4">
                                <p className="text-sm text-gray-600 mb-3">No templates available</p>
                                <button
                                    onClick={() => {
                                        setShowApplyTemplateModal(false);
                                        setShowTemplateModal(true);
                                    }}
                                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                >
                                    Create Template
                                </button>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Select Template *</label>
                                    <select
                                        value={selectedTemplateId || ''}
                                        onChange={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setSelectedTemplateId(e.target.value);
                                        }}
                                        onBlur={(e) => {
                                            // Ensure selection is saved on blur
                                            const newValue = e.target.value;
                                            if (newValue !== selectedTemplateId) {
                                                setSelectedTemplateId(newValue);
                                            }
                                        }}
                                        aria-label="Select template to apply"
                                        role="combobox"
                                        aria-haspopup="listbox"
                                        data-testid="template-selector"
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                    >
                                        <option value="">-- Select a template --</option>
                                        {templates.map(template => (
                                            <option key={template.id} value={template.id}>
                                                {template.name} ({Array.isArray(template.sections) ? template.sections.length : 0} sections)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Target Year</label>
                                    <select
                                        value={targetYear}
                                        onChange={(e) => setTargetYear(parseInt(e.target.value))}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                    >
                                        {yearOptions.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => setShowApplyTemplateModal(false)}
                                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleApply}
                                        disabled={!selectedTemplateId}
                                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
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
    
    // ============================================================
    // MAIN RENDER
    // ============================================================
    
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-3"></i>
                    <p className="text-sm text-gray-600">Loading document collection tracker...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-3">
            {/* Comment Popup */}
            {hoverCommentCell && (() => {
                // IMPORTANT: Section/document IDs can be strings (e.g. "file3", "file3-doc1")
                // Never parseInt them – always compare as strings to ensure we find the right row.
                const [rawSectionId, rawDocumentId, month] = hoverCommentCell.split('-');
                const section = sections.find(s => String(s.id) === String(rawSectionId));
                const document = section?.documents.find(d => String(d.id) === String(rawDocumentId));
                const comments = document ? getDocumentComments(document, month) : [];
                
                return (
                    <div 
                        className="comment-popup fixed w-72 bg-white border border-gray-300 rounded-lg shadow-xl p-3 z-[999]"
                        style={{ top: `${commentPopupPosition.top}px`, left: `${commentPopupPosition.left}px` }}
                    >
                        {comments.length > 0 && (
                            <div className="mb-3">
                                <div className="text-[10px] font-semibold text-gray-600 mb-1.5">Comments</div>
                                <div ref={commentPopupContainerRef} className="max-h-32 overflow-y-auto space-y-2 mb-2">
                                    {comments.map((comment, idx) => (
                                        <div key={comment.id || idx} className="pb-2 border-b last:border-b-0 bg-gray-50 rounded p-1.5 relative group">
                                            <p className="text-xs text-gray-700 whitespace-pre-wrap pr-6">{comment.text}</p>
                                            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                <span className="font-medium">{comment.author}</span>
                                                <span>{new Date(comment.date).toLocaleString('en-ZA', { 
                                                    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                                })}</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (!section || !document) return;
                                                    handleDeleteComment(section.id, document.id, month, comment.id);
                                                }}
                                                className="absolute top-1 right-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                                                type="button"
                                            >
                                                <i className="fas fa-trash text-[10px]"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <div className="text-[10px] font-semibold text-gray-600 mb-1">Add Comment</div>
                            <textarea
                                value={quickComment}
                                onChange={(e) => setQuickComment(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.ctrlKey && section && document) {
                                        handleAddComment(section.id, document.id, month, quickComment);
                                    }
                                }}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                rows="2"
                                placeholder="Type comment... (Ctrl+Enter to submit)"
                                autoFocus
                            />
                            <button
                                onClick={() => {
                                    if (!section || !document) return;
                                    handleAddComment(section.id, document.id, month, quickComment);
                                }}
                                disabled={!quickComment.trim()}
                                className="mt-1.5 w-full px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 disabled:opacity-50"
                            >
                                Add Comment
                            </button>
                        </div>
                    </div>
                );
            })()}
            
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
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
                        onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const newYear = parseInt(e.target.value, 10);
                            if (!isNaN(newYear)) {
                                handleYearChange(newYear);
                            }
                        }}
                        onBlur={(e) => {
                            const newYear = parseInt(e.target.value, 10);
                            if (!isNaN(newYear) && newYear !== selectedYear) {
                                handleYearChange(newYear);
                            }
                        }}
                        aria-label="Select year for document collection tracker"
                        role="combobox"
                        aria-haspopup="listbox"
                        data-testid="year-selector"
                        className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500"
                    >
                        {yearOptions.map(year => (
                            <option key={year} value={year}>{year}{year === currentYear && ' (Current)'}</option>
                        ))}
                    </select>
                    
                    <button
                        onClick={handleExportToExcel}
                        disabled={isExporting || sections.length === 0}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-[10px] font-medium disabled:opacity-50"
                    >
                        {isExporting ? (
                            <><i className="fas fa-spinner fa-spin mr-1"></i>Exporting...</>
                        ) : (
                            <><i className="fas fa-file-excel mr-1"></i>Export</>
                        )}
                    </button>
                    
                    <button
                        onClick={handleAddSection}
                        className="px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-[10px] font-medium"
                    >
                        <i className="fas fa-plus mr-1"></i>Add Section
                    </button>
                    
                    <div className="flex items-center gap-1 border-l border-gray-300 pl-2 ml-2">
                        <button
                            onClick={() => setShowApplyTemplateModal(true)}
                            className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-[10px] font-medium"
                        >
                            <i className="fas fa-magic mr-1"></i>Apply Template
                        </button>
                        <button
                            onClick={() => setShowTemplateModal(true)}
                            className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-[10px] font-medium"
                        >
                            <i className="fas fa-layer-group mr-1"></i>Templates
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Legend */}
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-medium text-gray-600">Status:</span>
                    {statusOptions.slice(0, 3).map((option, idx) => (
                        <React.Fragment key={option.value}>
                            <div className="flex items-center gap-1">
                                <div className={`w-3 h-3 rounded ${option.cellColor}`}></div>
                                <span className="text-[10px] text-gray-600">{option.label}</span>
                            </div>
                            {idx < 2 && <i className="fas fa-arrow-right text-[8px] text-gray-400"></i>}
                        </React.Fragment>
                    ))}
                    <span className="text-gray-300 mx-1">|</span>
                    <div className="flex items-center gap-1">
                        <div className={`w-3 h-3 rounded ${statusOptions[3].cellColor}`}></div>
                        <span className="text-[10px] text-gray-600">{statusOptions[3].label}</span>
                    </div>
                </div>
            </div>
            
            {/* Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="relative overflow-x-auto" ref={tableRef}>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th 
                                    className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase sticky left-0 bg-gray-50 z-50 border-r border-gray-200"
                                    style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                >
                                    Document / Data
                                </th>
                                {months.map((month, idx) => (
                                    <th 
                                        key={month}
                                        ref={el => monthRefs.current[month] = el}
                                        className={`px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase border-l border-gray-200 ${
                                            workingMonths.includes(idx) && selectedYear === currentYear
                                                ? 'bg-primary-50 text-primary-700'
                                                : 'text-gray-600'
                                        }`}
                                    >
                                        {month.slice(0, 3)} '{String(selectedYear).slice(-2)}
                                    </th>
                                ))}
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase border-l border-gray-200">
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
                                            <i className="fas fa-plus mr-1"></i>Add First Section
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                sections.map((section, sectionIndex) => (
                                    <React.Fragment key={section.id}>
                                        <tr 
                                            draggable="true"
                                            onDragStart={(e) => handleSectionDragStart(e, section, sectionIndex)}
                                            onDragEnd={handleSectionDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleSectionDrop(e, sectionIndex)}
                                            className="bg-gray-100 cursor-grab active:cursor-grabbing"
                                        >
                                            <td 
                                                className="px-2.5 py-2 sticky left-0 bg-gray-100 z-50 border-r border-gray-200"
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
                                                            className="mt-2 px-2 py-0.5 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700"
                                                        >
                                                            <i className="fas fa-plus mr-1"></i>Add Document
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td colSpan={12} className="px-2 py-2"></td>
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
                                                    <p className="text-xs">No documents in this section</p>
                                                    <button
                                                        onClick={() => handleAddDocument(section.id)}
                                                        className="mt-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                                    >
                                                        <i className="fas fa-plus mr-1"></i>Add Document
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : (
                                            section.documents.map((document, documentIndex) => (
                                                <tr key={document.id} className="hover:bg-gray-50">
                                                    <td 
                                                        className="px-4 py-1.5 sticky left-0 bg-white z-50 border-r border-gray-200"
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                                    >
                                                        <div className="min-w-[200px]">
                                                            <div className="text-xs font-medium text-gray-900">{document.name}</div>
                                                            {document.description && (
                                                                <div className="text-[10px] text-gray-500">{document.description}</div>
                                                            )}
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
            
            {/* Modals */}
            {showSectionModal && <SectionModal />}
            {showDocumentModal && <DocumentModal />}
            {showTemplateModal && <TemplateModal />}
            {showApplyTemplateModal && <ApplyTemplateModal />}
        </div>
    );
};

// Make available globally
window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
console.log('✅ MonthlyDocumentCollectionTracker component loaded (OVERHAULED VERSION)');
