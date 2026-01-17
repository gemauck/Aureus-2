// Get React hooks from window
const { useState, useEffect, useRef, useCallback } = React;
const storage = window.storage;
const STICKY_COLUMN_SHADOW = '4px 0 12px rgba(15, 23, 42, 0.08)';

// Derive a human‑readable facilities label from the project, handling both
// array and string shapes and falling back gracefully when nothing is set.
const getFacilitiesLabel = (project) => {
    if (!project) return '';

    const candidate =
        project.facilities ??
        project.facility ??
        project.sites ??
        project.siteNames ??
        project.operations ??
        project.operationNames ??
        '';

    if (Array.isArray(candidate)) {
        const cleaned = candidate
            .map((value) => (value == null ? '' : String(value).trim()))
            .filter(Boolean);
        return cleaned.join(', ');
    }

    return String(candidate || '').trim();
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
    const saveTimeoutRef = useRef(null);
    const isSavingRef = useRef(false);
    const previousProjectIdRef = useRef(project?.id);
    const hasLoadedInitialDataRef = useRef(false);
    const lastLoadTimestampRef = useRef(0);
    const sectionsRef = useRef({});
    const lastSavedSnapshotRef = useRef('{}');
    const apiRef = useRef(window.DocumentCollectionAPI || null);
    
    // Window-level cache to persist loaded state across remounts
    // This helps avoid unnecessary reloads when navigating back to the section
    if (!window._documentCollectionLoadCache) {
        window._documentCollectionLoadCache = new Map();
    }
    const loadCache = window._documentCollectionLoadCache;
    const isDeletingRef = useRef(false);
    const deletionTimestampRef = useRef(null); // Track when deletion started
    const deletionSectionIdsRef = useRef(new Set()); // Track which section IDs are being deleted
    const deletionQueueRef = useRef([]); // Queue for consecutive deletions
    const isProcessingDeletionQueueRef = useRef(false); // Track if we're processing the queue
    const lastChangeTimestampRef = useRef(0); // Track when last status change was made
    const refreshTimeoutRef = useRef(null); // Track pending refresh timeout
    const forceSaveTimeoutRef = useRef(null); // Track forced save timeout for rapid changes
    
    const getSnapshotKey = (projectId) => projectId ? `documentCollectionSnapshot_${projectId}` : null;

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const commentInputAvailable = typeof window !== 'undefined' && typeof window.CommentInputWithMentions === 'function';

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
    // OPTIMIZED: Reduced retry attempts and improved early exit conditions
    const parseSections = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        
        try {
            if (typeof data === 'string') {
                let cleaned = data.trim();
                if (!cleaned) return [];
                
                // OPTIMIZATION: Try direct parse first (most common case)
                try {
                    const directParsed = JSON.parse(cleaned);
                    if (Array.isArray(directParsed)) return directParsed;
                    if (typeof directParsed === 'object' && directParsed !== null) {
                        return directParsed; // Could be year-scoped object
                    }
                } catch {
                    // Continue to cleanup attempts
                }
                
                // OPTIMIZATION: Reduced max attempts from 3 to 1 for better performance
                // Most data is already valid JSON, so we don't need multiple retries
                let attempts = 0;
                const maxAttempts = 1;
                
                while (attempts < maxAttempts) {
                    try {
                        // Remove surrounding quotes if present
                        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                            cleaned = cleaned.slice(1, -1);
                        }
                        
                        // Unescape common escape sequences (optimized single pass)
                        cleaned = cleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        
                        const parsed = JSON.parse(cleaned);
                        if (Array.isArray(parsed)) return parsed;
                        if (typeof parsed === 'object' && parsed !== null) {
                            return parsed; // Could be year-scoped object
                        }
                        if (typeof parsed === 'string') {
                            cleaned = parsed;
                            attempts++;
                            continue;
                        }
                        return [];
                    } catch (parseError) {
                        attempts++;
                        if (attempts >= maxAttempts) {
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

    // PERFORMANCE: Memoize normalization results to avoid re-processing
    const normalizationCache = useRef(new Map());
    
    const normalizeSectionsByYear = (rawValue, fallbackYear) => {
        if (!rawValue) return {};

        // PERFORMANCE: Use cache for identical inputs (common when re-rendering)
        const cacheKey = `${typeof rawValue === 'string' ? rawValue.substring(0, 100) : JSON.stringify(rawValue).substring(0, 100)}_${fallbackYear || 'default'}`;
        if (normalizationCache.current.has(cacheKey)) {
            return normalizationCache.current.get(cacheKey);
        }

        let parsedValue = rawValue;

        if (typeof rawValue === 'string') {
            const trimmed = rawValue.trim();
            if (!trimmed) return {};
            try {
                // OPTIMIZATION: Use faster JSON.parse for most cases
                parsedValue = JSON.parse(trimmed);
            } catch {
                // Only use slow parseSections if JSON.parse fails
                parsedValue = parseSections(rawValue);
            }
        }

        if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
            const result = {};
            // OPTIMIZATION: Process in batches to avoid blocking
            const yearKeys = Object.keys(parsedValue);
            for (let i = 0; i < yearKeys.length; i++) {
                const yearKey = yearKeys[i];
                const value = parsedValue[yearKey];
                result[yearKey] = Array.isArray(value) ? value : parseSections(value);
            }
            
            // Cache result
            normalizationCache.current.set(cacheKey, result);
            // Limit cache size to prevent memory issues
            if (normalizationCache.current.size > 50) {
                const firstKey = normalizationCache.current.keys().next().value;
                normalizationCache.current.delete(firstKey);
            }
            
            return result;
        }

        // LEGACY MODE:
        // For flat sections arrays (no per‑year map yet), scope them ONLY to the
        // active/fallback year instead of cloning across all inferred years.
        // Cloning across inferred years caused edits in one year to appear in all years.
        const baseSections = Array.isArray(parsedValue) ? parsedValue : parseSections(parsedValue);
        const targetYear = fallbackYear || new Date().getFullYear();
        if (!targetYear) {
            return {};
        }

        const result = {
            [targetYear]: cloneSectionsArray(baseSections)
        };
        
        // Cache result
        normalizationCache.current.set(cacheKey, result);
        if (normalizationCache.current.size > 50) {
            const firstKey = normalizationCache.current.keys().next().value;
            normalizationCache.current.delete(firstKey);
        }
        
        return result;
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

    const getTemplateDisplayName = (template) => {
        if (!template) return '';
        const EXXARO_DEFAULT_NAME = 'Exxaro Grootegeluk document collection checklist for 2025';
        if (template.name === EXXARO_DEFAULT_NAME || template.isDefault) {
            return 'Default Checklist';
        }
        return template.name;
    };
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
    // When creating a template from the current year's sections, we pre‑seed
    // the modal via this state so that it goes through the "create" code path
    // (POST) instead of trying to update an existing template.
    const [prefilledTemplate, setPrefilledTemplate] = useState(null);
    const [draggedSection, setDraggedSection] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedDocument, setDraggedDocument] = useState(null);
    const [dragOverDocumentIndex, setDragOverDocumentIndex] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null);
    const [quickComment, setQuickComment] = useState('');
    const [commentPopupPosition, setCommentPopupPosition] = useState({ top: 0, left: 0 });
    const commentPopupContainerRef = useRef(null);
    const hasAutoScrolledOnPageLoadRef = useRef(false); // Track if we've auto-scrolled on page load (only once per page reload)
    
    // Multi-select state: Set of cell keys (sectionId-documentId-month)
    const [selectedCells, setSelectedCells] = useState(new Set());
    const selectedCellsRef = useRef(new Set());
    
    // Keep ref in sync with state
    useEffect(() => {
        selectedCellsRef.current = selectedCells;
    }, [selectedCells]);
    
    // ============================================================
    // LOAD DATA FROM PROJECT PROP + REFRESH FROM DATABASE
    // ============================================================
    // ⚠️ IMPORTANT: Only load on initial mount or when project ID actually changes
    
    const loadFromProjectProp = useCallback(() => {
        if (!project?.id) return;
        
        // OPTIMIZATION: Check if we already have data loaded for this project
        // This prevents unnecessary reloading on remount (e.g., second navigation)
        const existingData = sectionsRef.current || {};
        const hasExistingData = Object.keys(existingData).length > 0;
        
        // Check if we recently loaded data for this project (within last 10 seconds)
        // This helps avoid reloading on remount when navigating back to the section
        // Use window-level cache to persist across remounts
        const cacheKey = `load_${project.id}`;
        const cachedLoadInfo = loadCache.get(cacheKey);
        const timeSinceLastLoad = cachedLoadInfo 
            ? Date.now() - (cachedLoadInfo.timestamp || 0)
            : Date.now() - (lastLoadTimestampRef.current || 0);
        const recentlyLoaded = (cachedLoadInfo?.loaded || hasLoadedInitialDataRef.current) && timeSinceLastLoad < 10000;
        
        // If we have existing data and it matches the project prop, skip reloading
        if (hasExistingData && recentlyLoaded) {
            const existingSnapshot = serializeSections(existingData);
            const propSnapshot = project.documentSections 
                ? (typeof project.documentSections === 'string' 
                    ? project.documentSections.trim() 
                    : JSON.stringify(project.documentSections))
                : '';
            
            // Quick check: if snapshots are similar, skip reload
            // This avoids expensive re-processing on remount
            if (propSnapshot && existingSnapshot && 
                (propSnapshot === existingSnapshot || 
                 existingSnapshot.length > 0 && propSnapshot.length > 0)) {
                // Data already loaded and matches, just ensure loading state is false
                setIsLoading(false);
                return;
            }
        }
        
        // Also check localStorage snapshot for quick restore on remount
        // This provides a fast path when component remounts but data was recently loaded
        if (!hasExistingData && recentlyLoaded) {
            const snapshotKey = getSnapshotKey(project.id);
            if (snapshotKey && window.localStorage) {
                try {
                    const snapshotString = window.localStorage.getItem(snapshotKey);
                    if (snapshotString && snapshotString.length > 0) {
                        const snapshotParsed = JSON.parse(snapshotString);
                        const snapshotMap = normalizeSectionsByYear(snapshotParsed);
                        const snapshotYears = Object.keys(snapshotMap || {});
                        if (snapshotYears.length > 0) {
                            // Restore from snapshot quickly without processing prop again
                            setSectionsByYear(snapshotMap);
                            lastSavedSnapshotRef.current = serializeSections(snapshotMap);
                            lastLoadTimestampRef.current = Date.now();
                            hasLoadedInitialDataRef.current = true;
                            // Update window-level cache to persist across remounts
                            loadCache.set(cacheKey, { loaded: true, timestamp: Date.now() });
                            setIsLoading(false);
                            return;
                        }
                    }
                } catch (snapshotError) {
                    // Fall through to normal processing
                }
            }
        }
        
        // OPTIMIZATION: Only show loading if we don't have data yet
        if (!hasExistingData) {
            setIsLoading(true);
        }
        
        // PERFORMANCE: Process data asynchronously to avoid blocking UI
        const processData = () => {
            try {
                const snapshotKey = getSnapshotKey(project.id);
                
                // Quick check: if prop has simple data, process immediately
                const hasSimpleData = project.documentSections && 
                    (Array.isArray(project.documentSections) || 
                     (typeof project.documentSections === 'string' && project.documentSections.length < 1000));
                
                if (hasSimpleData) {
                    // Fast path for small/simple data
                    const normalizedFromProp = normalizeSectionsByYear(project.documentSections);
                    let normalized = normalizedFromProp;
                    
                    const yearKeys = Object.keys(normalizedFromProp || {});
                    
                    // Quick localStorage check for small data
                    if ((!normalizedFromProp || yearKeys.length === 0) && snapshotKey && window.localStorage) {
                        try {
                            const snapshotString = window.localStorage.getItem(snapshotKey);
                            if (snapshotString && snapshotString.length < 50000) { // Only for reasonably sized data
                                const snapshotParsed = JSON.parse(snapshotString);
                                const snapshotMap = normalizeSectionsByYear(snapshotParsed);
                                const snapshotYears = Object.keys(snapshotMap || {});
                                if (snapshotYears.length > 0) {
                                    normalized = snapshotMap;
                                }
                            }
                        } catch (snapshotError) {
                            console.warn('⚠️ Failed to restore document collection snapshot from localStorage:', snapshotError);
                        }
                    }
                    
                    setSectionsByYear(normalized);
                    lastSavedSnapshotRef.current = serializeSections(normalized);
                    lastLoadTimestampRef.current = Date.now();
                    hasLoadedInitialDataRef.current = true;
                    // Update window-level cache to persist across remounts
                    loadCache.set(cacheKey, { loaded: true, timestamp: Date.now() });
                    setIsLoading(false);
                } else {
                    // Slow path for large/complex data - defer to idle time
                    const processLargeData = () => {
                        try {
                            const normalizedFromProp = normalizeSectionsByYear(project.documentSections);
                            let normalized = normalizedFromProp;
                            
                            const yearKeys = Object.keys(normalizedFromProp || {});
                            
                            // If prop has no data but we have a local snapshot, restore from snapshot
                            if ((!normalizedFromProp || yearKeys.length === 0) && snapshotKey && window.localStorage) {
                                try {
                                    const snapshotString = window.localStorage.getItem(snapshotKey);
                                    if (snapshotString) {
                                        const snapshotParsed = JSON.parse(snapshotString);
                                        const snapshotMap = normalizeSectionsByYear(snapshotParsed);
                                        const snapshotYears = Object.keys(snapshotMap || {});
                                        if (snapshotYears.length > 0) {
                                            normalized = snapshotMap;
                                        }
                                    }
                                } catch (snapshotError) {
                                    console.warn('⚠️ Failed to restore document collection snapshot from localStorage:', snapshotError);
                                }
                            }
                            
                            setSectionsByYear(normalized);
                            lastSavedSnapshotRef.current = serializeSections(normalized);
                            lastLoadTimestampRef.current = Date.now();
                            // Update window-level cache to persist across remounts
                            loadCache.set(cacheKey, { loaded: true, timestamp: Date.now() });
                        } catch (error) {
                            console.error('❌ Error loading sections from prop:', error);
                            setSectionsByYear({});
                            lastSavedSnapshotRef.current = '{}';
                        } finally {
                            hasLoadedInitialDataRef.current = true;
                            // Update window-level cache to persist across remounts
                            loadCache.set(cacheKey, { loaded: true, timestamp: Date.now() });
                            setIsLoading(false);
                        }
                    };
                    
                    // Use requestIdleCallback for large data processing, fallback to setTimeout
                    if (typeof requestIdleCallback !== 'undefined') {
                        requestIdleCallback(processLargeData, { timeout: 100 });
                    } else {
                        setTimeout(processLargeData, 0);
                    }
                }
            } catch (error) {
                console.error('❌ Error loading sections from prop:', error);
                setSectionsByYear({});
                lastSavedSnapshotRef.current = '{}';
                hasLoadedInitialDataRef.current = true;
                // Update window-level cache to persist across remounts
                loadCache.set(cacheKey, { loaded: true, timestamp: Date.now() });
                setIsLoading(false);
            }
        };
        
        // Start processing immediately for small data, defer for large data
        processData();
    }, [project?.documentSections, project?.id]);
    
    const refreshFromDatabase = useCallback(async (forceUpdate = false) => {
        if (!project?.id || !apiRef.current) return;
        
        // OPTIMIZATION: Skip refresh if we just loaded from props and haven't made changes
        // This prevents unnecessary full project fetch right after initial load
        if (!forceUpdate && hasLoadedInitialDataRef.current) {
            const timeSinceLoad = Date.now() - (lastLoadTimestampRef.current || 0);
            const hasUnsavedChanges = serializeSections(sectionsRef.current) !== lastSavedSnapshotRef.current;
            
            // If we loaded less than 2 seconds ago and have no unsaved changes, skip refresh
            // This allows the UI to render quickly with prop data
            if (timeSinceLoad < 2000 && !hasUnsavedChanges) {
                return;
            }
        }
        
        // Don't refresh if a save is in progress to avoid race conditions
        if (isSavingRef.current && !forceUpdate) {
            console.log('⏸️ Refresh skipped: save in progress');
            return;
        }
        
        // Don't refresh if user made changes recently (within last 15 seconds)
        // This prevents overwriting rapid consecutive changes
        // BUT: Allow refresh on initial load (forceUpdate) even with recent changes
        const timeSinceLastChange = Date.now() - lastChangeTimestampRef.current;
        if (!forceUpdate && timeSinceLastChange < 15000 && hasLoadedInitialDataRef.current) {
            console.log('⏸️ Refresh skipped: recent changes detected (will not overwrite)', {
                timeSinceLastChange: `${timeSinceLastChange}ms`
            });
            return;
        }
        
        // Also check if there are unsaved changes - don't refresh if user is still editing
        // This provides additional protection even if the timestamp check passes
        const currentSnapshot = serializeSections(sectionsRef.current);
        const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;
        if (!forceUpdate && hasUnsavedChanges && timeSinceLastChange < 20000) {
            console.log('⏸️ Refresh skipped: unsaved changes detected (will not overwrite)', {
                hasUnsavedChanges: true,
                timeSinceLastChange: `${timeSinceLastChange}ms`
            });
            return;
        }
        
        // Don't refresh if a delete operation just happened (give it time to save)
        // This is critical to prevent the deletion from being overwritten by stale data
        if (isDeletingRef.current && !forceUpdate) {
            const timeSinceDeletion = deletionTimestampRef.current ? Date.now() - deletionTimestampRef.current : 0;
            // Block refreshes for at least 5 seconds after deletion starts
            if (timeSinceDeletion < 5000) {
                console.log(`⏸️ Refresh skipped: deletion in progress (${timeSinceDeletion}ms ago)`);
                return;
            }
        }
        
        try {
            // PERFORMANCE: Only fetch the specific field we need
            const freshProject = await apiRef.current.fetchProject(project.id, ['documentSections']);
            const snapshotKey = getSnapshotKey(project.id);
            const normalizedFromDb = normalizeSectionsByYear(freshProject?.documentSections);
            let normalized = normalizedFromDb;
            const yearKeys = Object.keys(normalizedFromDb || {});
            const currentSnapshot = serializeSections(sectionsRef.current);
            const freshSnapshot = serializeSections(normalized);
            
            // If DB has no data but we have a local snapshot, treat snapshot as source of truth
            // BUT: Don't use snapshot if it has more sections than current state (indicates deletion happened)
            if ((!normalizedFromDb || yearKeys.length === 0) && snapshotKey && window.localStorage) {
                try {
                    const snapshotString = window.localStorage.getItem(snapshotKey);
                    if (snapshotString) {
                        const snapshotParsed = JSON.parse(snapshotString);
                        const snapshotMap = normalizeSectionsByYear(snapshotParsed);
                        const snapshotYears = Object.keys(snapshotMap || {});
                        if (snapshotYears.length > 0) {
                            // Check if snapshot would restore deleted sections
                            const currentYearSections = sectionsRef.current[selectedYear] || [];
                            const snapshotYearSections = snapshotMap[selectedYear] || [];
                            
                            // Only use snapshot if it doesn't have more sections than current state
                            // This prevents restoring sections that were just deleted
                            if (snapshotYearSections.length <= currentYearSections.length || currentYearSections.length === 0) {
                                normalized = snapshotMap;
                            } else {
                                console.log('⏸️ Snapshot ignored: would restore deleted sections', {
                                    current: currentYearSections.length,
                                    snapshot: snapshotYearSections.length
                                });
                            }
                        }
                    }
                } catch (snapshotError) {
                    console.warn('⚠️ Failed to apply document collection snapshot as DB fallback:', snapshotError);
                }
            }
            
            // Update from database if data has changed
            // Check if we have unsaved local changes
            // CRITICAL: Use the snapshot we just computed above, not a new one
            const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;
            
            // Double-check deletion flag before updating (defensive programming)
            // This prevents race conditions where the flag might be checked but then cleared
            // between the check and the state update
            if (isDeletingRef.current && !forceUpdate) {
                console.log('⏸️ Refresh aborted: deletion flag detected during update');
                return;
            }
            
            if (freshSnapshot !== currentSnapshot) {
            // CRITICAL: Don't restore deleted sections
            // If current state has fewer sections than database, a deletion likely just happened
            const currentYearSections = sectionsRef.current[selectedYear] || [];
            const freshYearSections = normalized[selectedYear] || [];
            
            // Check if any sections in the database are ones we're currently deleting
            const currentSectionIds = new Set(currentYearSections.map(s => String(s.id)));
            const freshSectionIds = new Set(freshYearSections.map(s => String(s.id)));
            const sectionsToRestore = freshYearSections.filter(s => 
                !currentSectionIds.has(String(s.id)) && 
                deletionSectionIdsRef.current.has(String(s.id))
            );
            
            // If database has sections we're deleting, don't update (deletion in progress)
            if (sectionsToRestore.length > 0) {
                console.log('⏸️ Refresh skipped: database contains sections being deleted', {
                    sectionsToRestore: sectionsToRestore.map(s => ({ id: s.id, name: s.name })),
                    deletionIds: Array.from(deletionSectionIdsRef.current)
                });
                return;
            }
            
            // If database has more sections than current state, don't update (deletion likely in progress)
            // CRITICAL: Also check if our snapshot matches current state (indicates deletion was saved)
            // Note: currentSnapshot is already declared above, so we reuse it here
            const snapshotMatchesCurrent = currentSnapshot === lastSavedSnapshotRef.current;
            
            if (freshYearSections.length > currentYearSections.length && currentYearSections.length > 0) {
                const timeSinceDeletion = deletionTimestampRef.current ? Date.now() - deletionTimestampRef.current : Infinity;
                // Block if deletion happened recently (within last 15 seconds) OR if snapshot matches current (deletion was saved)
                // This prevents restoring sections that were just deleted and saved
                if (timeSinceDeletion < 15000 || snapshotMatchesCurrent) {
                    console.log('⏸️ Refresh skipped: database has more sections than current state (deletion likely in progress or recently completed)', {
                        current: currentYearSections.length,
                        database: freshYearSections.length,
                        timeSinceDeletion: `${timeSinceDeletion}ms`,
                        snapshotMatchesCurrent: snapshotMatchesCurrent
                    });
                    return;
                }
            }
                
                // CRITICAL: Never update if we have unsaved local changes, regardless of snapshot matching
                // This prevents overwriting local changes before they're saved to the database
                // The only exception is forceUpdate, which should only be used after a successful save
                if (hasUnsavedChanges && !forceUpdate) {
                    console.log('⏸️ Refresh skipped: unsaved local changes detected (will not overwrite)', {
                        hasUnsavedChanges: true,
                        isSaving: isSavingRef.current,
                        currentSnapshot: currentSnapshot.substring(0, 100),
                        lastSavedSnapshot: lastSavedSnapshotRef.current.substring(0, 100)
                    });
                    return;
                }
                
                // Update if:
                // 1. No unsaved local changes (safe to update), OR
                // 2. Database matches what we last saved (database hasn't changed, safe to update), OR
                // 3. Force update requested (after successful save)
                const shouldUpdate = !hasUnsavedChanges || 
                                    (freshSnapshot === lastSavedSnapshotRef.current) || 
                                    forceUpdate;
                
                if (shouldUpdate) {
                    // Final check before updating state
                    // CRITICAL: Filter out any sections that are in the deletion tracking set
                    // This prevents restoring sections that were just deleted
                    if (deletionSectionIdsRef.current.size > 0) {
                        const filteredNormalized = { ...normalized };
                        Object.keys(filteredNormalized).forEach(year => {
                            filteredNormalized[year] = (filteredNormalized[year] || []).filter(section => 
                                !deletionSectionIdsRef.current.has(String(section.id))
                            );
                        });
                        normalized = filteredNormalized;
                        // Recalculate snapshot after filtering
                        const filteredSnapshot = serializeSections(normalized);
                        console.log('🔍 Filtered out sections being deleted from refresh update', {
                            deletedIds: Array.from(deletionSectionIdsRef.current),
                            originalSnapshot: freshSnapshot.substring(0, 100),
                            filteredSnapshot: filteredSnapshot.substring(0, 100)
                        });
                    }
                    
                    if (!isDeletingRef.current || forceUpdate) {
                        setSectionsByYear(normalized);
                        // Update snapshot reference to match database state (use filtered snapshot if filtering occurred)
                        const finalSnapshot = deletionSectionIdsRef.current.size > 0 ? serializeSections(normalized) : freshSnapshot;
                        if (finalSnapshot === lastSavedSnapshotRef.current || !hasUnsavedChanges) {
                            lastSavedSnapshotRef.current = finalSnapshot;
                        }
                    } else {
                        console.log('⏸️ State update skipped: deletion in progress');
                    }
                }
            } else {
                // Data matches, update snapshot reference if needed
                if (hasUnsavedChanges && freshSnapshot === lastSavedSnapshotRef.current) {
                    lastSavedSnapshotRef.current = freshSnapshot;
                }
            }
        } catch (error) {
            console.error('❌ Error fetching fresh project data:', error);
            // Retry once after a short delay if initial load failed
            if (forceUpdate && !hasLoadedInitialDataRef.current) {
                console.log('🔄 Retrying initial data fetch after error...');
                setTimeout(() => {
                    refreshFromDatabase(true).catch(retryError => {
                        console.error('❌ Retry failed:', retryError);
                        // Show user-friendly error message
                        if (window.alert) {
                            alert('Failed to load document collection data. Please refresh the page or try again later.');
                        }
                    });
                }, 1000);
            }
        }
    }, [project?.id]);
    
    useEffect(() => {
        if (!project?.id) return;
        
        const isNewProject = previousProjectIdRef.current !== project.id;
        if (isNewProject) {
            previousProjectIdRef.current = project.id;
            hasLoadedInitialDataRef.current = false;
        }
        
        const hasUnsavedChanges = serializeSections(sectionsRef.current) !== lastSavedSnapshotRef.current;
        if (isNewProject || !hasUnsavedChanges) {
            loadFromProjectProp();
        } else {
        }
        
        // OPTIMIZATION: Only refresh from database if we don't have data from props
        // This prevents unnecessary full project fetch on initial load
        const hasDataFromProps = project?.documentSections && 
            (typeof project.documentSections === 'string' ? project.documentSections.trim() : project.documentSections);
        
        // OPTIMIZATION: Skip database refresh if we already have data loaded and it's the same project
        // This prevents unnecessary database fetches on remount (e.g., second navigation)
        const hasExistingData = Object.keys(sectionsRef.current || {}).length > 0;
        const timeSinceLastLoad = Date.now() - (lastLoadTimestampRef.current || 0);
        const shouldSkipRefresh = hasExistingData && 
                                 hasLoadedInitialDataRef.current && 
                                 !isNewProject && 
                                 timeSinceLastLoad < 5000; // Skip if loaded within last 5 seconds
        
        // For new projects or when we have no data, refresh immediately with forceUpdate
        // This ensures we get data even if guards would normally block
        if (isNewProject || (!hasDataFromProps && !shouldSkipRefresh)) {
            refreshFromDatabase(true); // Force update on initial load
        } else if (!shouldSkipRefresh) {
            // Defer database refresh to allow UI to render first with prop data
            // But use shorter timeout for faster data sync
            const refreshTimeout = setTimeout(() => {
                refreshFromDatabase(false); // Allow guards on subsequent refreshes
            }, 50); // Reduced from 100ms to 50ms for faster sync
            return () => clearTimeout(refreshTimeout);
        }
        // If shouldSkipRefresh is true, we skip the database refresh entirely
        // This allows the UI to render immediately with existing data
    }, [project?.id, project?.documentSections, loadFromProjectProp, refreshFromDatabase]);
    
    // ============================================================
    // POLLING - Regularly refresh from database to get updates
    // ============================================================
    useEffect(() => {
        if (!project?.id || !apiRef.current) return;
        
        // OPTIMIZATION: Increase polling interval to 30 seconds to reduce network load
        // Only poll if component is visible and not actively being edited
        const pollInterval = setInterval(() => {
            // Skip polling if:
            // 1. User is actively editing (recent changes)
            // 2. A save is in progress
            // 3. Component is not visible (document hidden)
            const timeSinceLastChange = Date.now() - lastChangeTimestampRef.current;
            const isDocumentVisible = window.document.visibilityState === 'visible';
            
            if (isSavingRef.current || timeSinceLastChange < 5000 || !isDocumentVisible) {
                return; // Skip this poll
            }
            
            refreshFromDatabase(false);
        }, 30000); // Increased from 5 seconds to 30 seconds
        
        return () => {
            clearInterval(pollInterval);
        };
    }, [project?.id, refreshFromDatabase]);
    
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
            if (forceSaveTimeoutRef.current) {
                clearTimeout(forceSaveTimeoutRef.current);
            }
        };
    }, [sectionsByYear, isLoading, project?.id]);
    
    async function saveToDatabase(options = {}) {
        if (isSavingRef.current) {
            return;
        }
        // Don't trigger auto-save during deletion - deletion handles its own save
        if (isDeletingRef.current && !options.allowDuringDeletion) {
            console.log('⏸️ Auto-save skipped: deletion in progress');
            return;
        }
        if (!project?.id) {
            console.warn('⚠️ Cannot save: No project ID');
            return;
        }
        if (isLoading) {
            return;
        }

        const payload = sectionsRef.current || {};
        const serialized = serializeSections(payload);

        // Guard against wiping data with an all‑empty payload when we never had data,
        // but ALLOW saving an empty state when the user has explicitly deleted sections.
        const hasAnySections = Object.values(payload || {}).some(
            (yearSections) => Array.isArray(yearSections) && yearSections.length > 0
        );
        if (!hasAnySections && serialized === lastSavedSnapshotRef.current) {
            return;
        }
        if (!hasAnySections && serialized !== lastSavedSnapshotRef.current) {
        }

        isSavingRef.current = true;
        
        try {
            
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
            
            lastSavedSnapshotRef.current = serialized;
            
            // Persist a snapshot locally so navigation issues cannot lose user data
            const snapshotKey = getSnapshotKey(project.id);
            if (snapshotKey && window.localStorage) {
                try {
                    window.localStorage.setItem(snapshotKey, serialized);
                } catch (storageError) {
                    console.warn('⚠️ Failed to save document collection snapshot to localStorage:', storageError);
                }
            }
            
            // Refresh from database after save to get any concurrent updates
            // Use a longer delay and check if user is still making changes
            // Clear any pending refresh
            if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
            }
            
            refreshTimeoutRef.current = setTimeout(() => {
                // Check if there are unsaved changes or recent changes
                const timeSinceLastChange = Date.now() - lastChangeTimestampRef.current;
                const currentSnapshot = serializeSections(sectionsRef.current);
                const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;
                
                // Only refresh if:
                // 1. No changes in last 15 seconds (longer window after save to prevent overwriting rapid changes), AND
                // 2. No unsaved changes (everything is saved)
                // Use false instead of true so it respects all checks in refreshFromDatabase
                if (timeSinceLastChange > 15000 && !hasUnsavedChanges) {
                    refreshFromDatabase(false); // Use false to respect all checks
                } else {
                    // User is still making changes or has unsaved changes
                    // Don't refresh - let the periodic refresh handle it when user stops
                    console.log('⏸️ Post-save refresh skipped: user still making changes', {
                        timeSinceLastChange: `${timeSinceLastChange}ms`,
                        hasUnsavedChanges
                    });
                }
            }, 3000); // Increased delay to 3 seconds to give more time for rapid changes
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
                // Fire-and-forget save on unmount; parent update is optional here
                saveToDatabase({ skipParentUpdate: true });
            }
        };
    }, [project?.id]);
    
    // ============================================================
    // TEMPLATE MANAGEMENT - Database storage only
    // ============================================================
    
    const loadTemplates = async () => {
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
    
    // Build a lightweight template snapshot from the current year's sections,
    // stripping out runtime-only fields like collectionStatus/comments.
    const buildTemplateSectionsFromCurrent = () => {
        return (sections || []).map(section => ({
            name: section.name,
            description: section.description || '',
            documents: (section.documents || []).map(doc => ({
                name: doc.name,
                description: doc.description || ''
            }))
        }));
    };
    
    const saveTemplate = async (templateData) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                throw new Error('Authentication required to save templates');
            }
            
            const currentUser = getCurrentUser();
            
            const isEditingExisting = !!(editingTemplate && editingTemplate.id);
            
            if (isEditingExisting) {
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
                
            }
            
            // Reload templates from database to get fresh data
            // Add a small delay to ensure database transaction is committed
            await new Promise(resolve => setTimeout(resolve, 100));
            await loadTemplates();
            
            setEditingTemplate(null);
            setPrefilledTemplate(null);
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
            
            
            // Reload templates from database
            await loadTemplates();
            
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
        { value: 'not-collected', label: 'Not Collected', color: 'bg-red-300 text-white font-semibold', cellColor: 'bg-red-300 border-l-4 border-red-500 shadow-sm' },
        { value: 'ongoing', label: 'Collection Ongoing', color: 'bg-yellow-300 text-white font-semibold', cellColor: 'bg-yellow-300 border-l-4 border-yellow-500 shadow-sm' },
        { value: 'collected', label: 'Collected', color: 'bg-green-400 text-white font-semibold', cellColor: 'bg-green-400 border-l-4 border-green-500 shadow-sm' },
        { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-300 text-white font-semibold', cellColor: 'bg-gray-300 border-l-4 border-gray-500 shadow-sm' }
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
        } else {
            const newSection = {
                id: Date.now(),
                ...sectionData,
                documents: []
            };
            setSections(prev => [...prev, newSection]);
        }
        
        setShowSectionModal(false);
        setEditingSection(null);
    };
    
    // Actual deletion logic extracted to separate function
    const performDeletion = async (sectionId, event) => {
        // Prevent event propagation to avoid interfering with other handlers
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Normalize IDs to strings for comparison
        const normalizedSectionId = String(sectionId);
        
        // Get current state from ref to ensure we have the latest
        const currentState = sectionsRef.current || {};
        const currentSections = currentState[selectedYear] || [];
        const section = currentSections.find(s => String(s.id) === normalizedSectionId);
        
        if (!section) {
            console.warn('⚠️ Section not found for deletion (may have been already deleted). ID:', sectionId);
            // Don't show alert for queued deletions that are already gone
            return;
        }
        
        // CRITICAL: Set deletion flag IMMEDIATELY before any async operations
        // This prevents polling from interfering with the deletion process
        isDeletingRef.current = true;
        deletionTimestampRef.current = Date.now();
        deletionSectionIdsRef.current.add(normalizedSectionId);
        console.log('🗑️ Starting section deletion, polling disabled', {
            sectionId: normalizedSectionId,
            timestamp: deletionTimestampRef.current
        });
        
        // Clear any pending debounced saves to prevent race conditions
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        
        // Capture the current snapshot before deletion for rollback if needed
        const snapshotBeforeDeletion = serializeSections(sectionsRef.current);
        const sectionToDelete = JSON.parse(JSON.stringify(section)); // Deep clone for restoration
        
        // Defer state update to next frame so click handler returns immediately
        // UI will update within 16ms (next animation frame)
        requestAnimationFrame(() => {
            // Update state and ref atomically - OPTIMISTIC UPDATE (UI updates in next frame)
            setSectionsByYear(prev => {
                const yearSections = prev[selectedYear] || [];
                const filtered = yearSections.filter(s => String(s.id) !== normalizedSectionId);
                
                const updatedSectionsByYear = {
                    ...prev,
                    [selectedYear]: filtered
                };
                
                // Immediately update the ref synchronously
                sectionsRef.current = updatedSectionsByYear;
                
                // CRITICAL: Update localStorage snapshot IMMEDIATELY after state update
                // This prevents refreshFromDatabase from restoring the deleted section
                const deletedSectionSnapshot = serializeSections(updatedSectionsByYear);
                lastSavedSnapshotRef.current = deletedSectionSnapshot;
                
                // Persist snapshot to localStorage immediately (before database save)
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        window.localStorage.setItem(snapshotKey, deletedSectionSnapshot);
                        console.log('💾 Deletion snapshot saved to localStorage immediately');
                    } catch (storageError) {
                        console.warn('⚠️ Failed to save document collection snapshot to localStorage:', storageError);
                    }
                }
                
                return updatedSectionsByYear;
            });
            
            // Save in background (non-blocking) - UI already updated optimistically
            const deletedSectionSnapshot = serializeSections(sectionsRef.current);
            isSavingRef.current = true;
            
            // Perform save asynchronously without blocking
            (async () => {
            try {
                const payload = sectionsRef.current || {};
                
                if (apiRef.current && typeof apiRef.current.saveDocumentSections === 'function') {
                    await apiRef.current.saveDocumentSections(project.id, payload, false);
                } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                    const updatePayload = {
                        documentSections: serializeSections(payload)
                    };
                    await window.DatabaseAPI.updateProject(project.id, updatePayload);
                } else {
                    throw new Error('No available API for saving document sections');
                }
                
                // Snapshot already updated above, just confirm it matches
                lastSavedSnapshotRef.current = deletedSectionSnapshot;
                
                console.log('✅ Section deletion saved successfully');
                
                // Remove from deletion tracking
                deletionSectionIdsRef.current.delete(normalizedSectionId);
                
                // CRITICAL: Update lastSavedSnapshot to match the deleted state
                // This ensures refreshFromDatabase won't restore the deleted section
                const currentStateSnapshot = serializeSections(sectionsRef.current);
                lastSavedSnapshotRef.current = currentStateSnapshot;
                
                // Update localStorage snapshot to match deleted state
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        window.localStorage.setItem(snapshotKey, currentStateSnapshot);
                        console.log('💾 Deletion snapshot updated in localStorage after successful save');
                    } catch (storageError) {
                        console.warn('⚠️ Failed to update document collection snapshot in localStorage:', storageError);
                    }
                }
                
                // Clear the deleting flag after successful save - wait longer to ensure DB save completes
                // Increased from 3000ms to 5000ms to give database more time to persist
                // Only clear flag if no other deletions are in progress
                setTimeout(() => {
                    if (deletionSectionIdsRef.current.size === 0) {
                        isDeletingRef.current = false;
                        deletionTimestampRef.current = null;
                        console.log('✅ Deletion flag cleared, polling can resume');
                    } else {
                        console.log(`⏸️ Deletion flag kept active: ${deletionSectionIdsRef.current.size} deletion(s) still in progress`);
                    }
                    // DON'T call refreshFromDatabase immediately after deletion
                    // The state is already correct, and refresh might restore deleted sections
                    // if database hasn't fully updated yet. Let the normal polling handle sync.
                    // Process next deletion in queue if any
                    processDeletionQueue();
                }, 5000);
                
            } catch (saveError) {
                console.error('❌ Error saving section deletion:', saveError);
                
                // Rollback: Restore the section if save failed
                try {
                    setSectionsByYear(prev => {
                        const yearSections = prev[selectedYear] || [];
                        // Only restore if section doesn't already exist
                        if (!yearSections.find(s => String(s.id) === normalizedSectionId)) {
                            return {
                                ...prev,
                                [selectedYear]: [...yearSections, sectionToDelete]
                            };
                        }
                        return prev;
                    });
                    
                    // Also restore the ref
                    sectionsRef.current = JSON.parse(snapshotBeforeDeletion);
                    
                    alert('Failed to save deletion. The section has been restored. Please try again.');
                } catch (rollbackError) {
                    console.error('❌ Error during rollback:', rollbackError);
                    alert('An error occurred while deleting the section. Please refresh the page.');
                }
            } finally {
                isSavingRef.current = false;
                // Only clear deletion flag if this was the last deletion
                deletionSectionIdsRef.current.delete(normalizedSectionId);
                if (deletionSectionIdsRef.current.size === 0) {
                    isDeletingRef.current = false;
                    deletionTimestampRef.current = null;
                }
            }
            })();
        });
    };
    
    // Process deletion queue sequentially
    const processDeletionQueue = async () => {
        if (isProcessingDeletionQueueRef.current || deletionQueueRef.current.length === 0) {
            return;
        }
        
        isProcessingDeletionQueueRef.current = true;
        
        while (deletionQueueRef.current.length > 0) {
            const { sectionId, event } = deletionQueueRef.current.shift();
            await performDeletion(sectionId, event);
            // Wait a bit between deletions to ensure state is stable
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        isProcessingDeletionQueueRef.current = false;
    };
    
    // Public handler that queues deletions
    const handleDeleteSection = async (sectionId, event) => {
        // Prevent event propagation to avoid interfering with other handlers
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Normalize IDs to strings for comparison
        const normalizedSectionId = String(sectionId);
        
        // Use sectionsByYear directly to get the most up-to-date state
        const currentSections = sectionsByYear[selectedYear] || [];
        const section = currentSections.find(s => String(s.id) === normalizedSectionId);
        
        if (!section) {
            console.error('❌ Section not found for deletion. ID:', sectionId, 'Available sections:', currentSections.map(s => ({ id: s.id, name: s.name })));
            alert(`Error: Section not found. Cannot delete.`);
            return;
        }
        
        // Show confirmation dialog
        if (!confirm(`Delete section "${section.name}" and all its documents?`)) {
            return;
        }
        
        // If a deletion is already in progress, queue this one
        if (isDeletingRef.current || isProcessingDeletionQueueRef.current) {
            console.log('📋 Queuing deletion request:', normalizedSectionId);
            deletionQueueRef.current.push({ sectionId, event });
            // Start processing queue if not already processing
            setTimeout(() => {
                if (!isProcessingDeletionQueueRef.current) {
                    processDeletionQueue();
                }
            }, 0);
            return;
        }
        
        // No deletion in progress, process immediately
        await performDeletion(sectionId, event);
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
    
    const handleEditDocument = (section, doc) => {
        setEditingSectionId(section.id);
        setEditingDocument(doc);
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
    
    const handleDeleteDocument = (sectionId, documentId, event) => {
        // Prevent event propagation to avoid interfering with other handlers
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Normalize IDs to strings for comparison
        const normalizedSectionId = String(sectionId);
        const normalizedDocumentId = String(documentId);
        
        // Use sectionsByYear directly to get the most up-to-date state
        const currentSections = sectionsByYear[selectedYear] || [];
        const section = currentSections.find(s => String(s.id) === normalizedSectionId);
        
        if (!section) {
            console.error('❌ Section not found for document deletion. Section ID:', sectionId, 'Available sections:', currentSections.map(s => ({ id: s.id, name: s.name })));
            alert(`Error: Section not found. Cannot delete document.`);
            return;
        }
        
        const doc = section.documents.find(d => String(d.id) === normalizedDocumentId);
        if (!doc) {
            console.error('❌ Document not found for deletion. Document ID:', documentId, 'Section:', section.name);
            alert(`Error: Document not found. Cannot delete.`);
            return;
        }
        
        if (!confirm(`Delete document "${doc.name}"?`)) {
            return;
        }
        
        // Set deleting flag to prevent refresh from overwriting
        isDeletingRef.current = true;
        
        // Use functional update with sectionsByYear to ensure we have the latest state
        // Also update sectionsRef immediately to prevent race conditions with auto-save
        setSectionsByYear(prev => {
            const yearSections = prev[selectedYear] || [];
            const updatedSections = yearSections.map(section => {
                if (String(section.id) === normalizedSectionId) {
                    const filteredDocuments = section.documents.filter(doc => String(doc.id) !== normalizedDocumentId);
                    return {
                        ...section,
                        documents: filteredDocuments
                    };
                }
                return section;
            });
            
            const updated = {
                ...prev,
                [selectedYear]: updatedSections
            };
            
            // Immediately update the ref to prevent race conditions with auto-save
            sectionsRef.current = updated;
            
            return updated;
        });
        
        // Clear the deleting flag after auto-save completes (2 seconds should be enough)
        setTimeout(() => {
            isDeletingRef.current = false;
        }, 2000);
    };
    
    // ============================================================
    // STATUS AND COMMENTS
    // ============================================================
    
    const handleUpdateStatus = useCallback((sectionId, documentId, month, status, applyToSelected = false) => {
        // Track when the last change was made to prevent refresh from overwriting rapid changes
        lastChangeTimestampRef.current = Date.now();
        
        // Clear any existing force save timeout
        if (forceSaveTimeoutRef.current) {
            clearTimeout(forceSaveTimeoutRef.current);
        }
        
        // Schedule a forced save after 2 seconds of inactivity
        // This ensures rapid consecutive changes are saved even if debounce keeps resetting
        forceSaveTimeoutRef.current = setTimeout(() => {
            const timeSinceLastChange = Date.now() - lastChangeTimestampRef.current;
            // Only force save if no changes in last 2 seconds (user stopped making changes)
            if (timeSinceLastChange >= 2000) {
                const currentSnapshot = serializeSections(sectionsRef.current);
                const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;
                if (hasUnsavedChanges && !isSavingRef.current) {
                    console.log('💾 Force saving after rapid changes stopped');
                    saveToDatabase();
                }
            }
        }, 2000);
        
        // CRITICAL: For rapid changes, always start from the latest ref value to prevent losing updates
        // This ensures that if multiple status changes happen in quick succession, each one builds on the latest state
        const latestSectionsByYear = sectionsRef.current || {};
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        
        // Always use ref to get the latest selectedCells value (avoids stale closure)
        const currentSelectedCells = selectedCellsRef.current;
        
        // If applying to selected cells, get all selected cell keys
        let cellsToUpdate = [];
        if (applyToSelected && currentSelectedCells.size > 0) {
            // Parse all selected cell keys
            cellsToUpdate = Array.from(currentSelectedCells).map(cellKey => {
                const [secId, docId, mon] = cellKey.split('-');
                return { sectionId: secId, documentId: docId, month: mon };
            });
        } else {
            // Just update the single cell
            cellsToUpdate = [{ sectionId, documentId, month }];
        }
        
        // Update the sections for the current year
        const updated = currentYearSections.map(section => {
            // Check if this section has any documents that need updating
            const sectionUpdates = cellsToUpdate.filter(cell => String(section.id) === String(cell.sectionId));
            if (sectionUpdates.length === 0) {
                return section;
            }
            
            return {
                ...section,
                documents: section.documents.map(doc => {
                    // Check if this document needs updating for any month
                    const docUpdates = sectionUpdates.filter(cell => String(doc.id) === String(cell.documentId));
                    if (docUpdates.length === 0) {
                        return doc;
                    }
                    
                    // Apply status to all matching months for this document
                    let updatedStatus = doc.collectionStatus || {};
                    docUpdates.forEach(cell => {
                        updatedStatus = setStatusForYear(updatedStatus, cell.month, status, selectedYear);
                    });
                    
                    return {
                        ...doc,
                        collectionStatus: updatedStatus
                    };
                })
            };
        });
        
        const updatedSectionsByYear = {
            ...latestSectionsByYear,
            [selectedYear]: updated
        };
        
        // Update ref IMMEDIATELY before state update to prevent race conditions
        // This ensures auto-save always has the latest data, even during rapid changes
        sectionsRef.current = updatedSectionsByYear;
        
        // Now update state (this will trigger auto-save, but ref already has the latest data)
        setSectionsByYear(updatedSectionsByYear);
        
        // Clear selection after applying status to multiple cells
        // Use setTimeout to ensure React has updated the UI first
        if (applyToSelected && currentSelectedCells.size > 0) {
            setTimeout(() => {
                setSelectedCells(new Set());
                selectedCellsRef.current = new Set();
            }, 100);
        }
    }, [selectedYear]);
    
    const handleAddComment = async (sectionId, documentId, month, commentText) => {
        if (!commentText.trim()) return;
        
        const currentUser = getCurrentUser();
        const newCommentId = Date.now();
        const newComment = {
            id: newCommentId,
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
        
        // DO NOT auto-scroll after adding comment - let user stay where they are
        // User can manually scroll to see new comments if they want

        // ========================================================
        // @MENTIONS - Process mentions and create notifications
        // ========================================================
        try {
            if (window.MentionHelper && window.MentionHelper.hasMentions(commentText)) {
                const token = window.storage?.getToken?.();
                
                if (token && window.DatabaseAPI?.getUsers) {
                    // Fetch all users once for matching mentions
                    const usersResponse = await window.DatabaseAPI.getUsers();
                    const allUsers =
                        usersResponse?.data?.users ||
                        usersResponse?.data?.data?.users ||
                        usersResponse?.users ||
                        [];
                    
                    const contextTitle = `Document Collection - ${project?.name || 'Project'}`;
                    // Deep-link directly to the document collection cell & comment for email + in-app navigation
                    const contextLink = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(sectionId)}&docDocumentId=${encodeURIComponent(documentId)}&docMonth=${encodeURIComponent(month)}&commentId=${encodeURIComponent(newCommentId)}`;
                    const projectInfo = {
                        projectId: project?.id,
                        projectName: project?.name,
                        sectionId,
                        documentId,
                        month,
                        commentId: newCommentId
                    };
                    
                    // Fire mention notifications (do not block UI on errors)
                    window.MentionHelper.processMentions(
                        commentText,
                        contextTitle,
                        contextLink,
                        currentUser.name || currentUser.email || 'Unknown',
                        allUsers,
                        projectInfo
                    ).then(() => {
                    }).catch(error => {
                        console.error('❌ Error processing @mentions for document collection comment:', error);
                    });
                }
            }
        } catch (error) {
            console.error('❌ Unexpected error in handleAddComment @mentions processing:', error);
            // Swallow errors so commenting UI never breaks due to notifications
        }
    };
    
    const handleDeleteComment = (sectionId, documentId, month, commentId) => {
        const currentUser = getCurrentUser();
        const section = sections.find(s => s.id === sectionId);
        const doc = section?.documents.find(d => d.id === documentId);
        const existingComments = getCommentsForYear(doc?.comments, month, selectedYear);
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
    
    const getDocumentStatus = (doc, month) => {
        return getStatusForYear(doc.collectionStatus, month, selectedYear);
    };
    
    const getDocumentComments = (doc, month) => {
        return getCommentsForYear(doc.comments, month, selectedYear);
    };
    
    // ============================================================
    // DRAG AND DROP
    // ============================================================
    
    const handleSectionDragStart = (e, section, index) => {
        setDraggedSection({ section, index });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (e.currentTarget) {
                e.currentTarget.style.opacity = '0.5';
            }
        }, 0);
    };
    
    const handleSectionDragEnd = (e) => {
        if (e.currentTarget) {
            e.currentTarget.style.opacity = '1';
        }
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
                
                section.documents.forEach(doc => {
                    const row = [`  ${doc.name}${doc.description ? ' - ' + doc.description : ''}`];
                    
                    months.forEach(month => {
                        const status = getStatusForYear(doc.collectionStatus, month, selectedYear);
                        const statusLabel = status ? statusOptions.find(s => s.value === status)?.label : '';
                        row.push(statusLabel || '');
                        
                        const comments = getCommentsForYear(doc.comments, month, selectedYear);
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
    
    // (Per-section tables now scroll independently, so we skip auto-scroll to working months)
    
    // ============================================================
    // COMMENT POPUP MANAGEMENT
    // ============================================================
    
    // Auto-scroll to bottom only when popup first opens (not on position updates)
    // Auto-scroll to bottom only when popup first opens (not on every render)
    // NO AUTO-SCROLL - User has full control
    // Only scroll on initial page load if flag is not set
    useEffect(() => {
        if (!hoverCommentCell) {
            return;
        }
        
        // Check if there's a commentId in the URL (deep-link scenario) - skip auto-scroll
        const urlHash = window.location.hash || '';
        const urlSearch = window.location.search || '';
        const hasCommentId = urlHash.includes('commentId=') || urlSearch.includes('commentId=');
        
        if (hasCommentId) {
            // Deep-link logic handles scrolling
            hasAutoScrolledOnPageLoadRef.current = true;
            return;
        }
        
        // Only auto-scroll on initial page load (first time popup opens after page reload)
        // Use a longer delay and check flag multiple times to prevent re-running
        if (!hasAutoScrolledOnPageLoadRef.current) {
            const timeoutId = setTimeout(() => {
                const container = commentPopupContainerRef.current;
                // Triple-check the flag hasn't changed
                if (container && !hasAutoScrolledOnPageLoadRef.current) {
                    // Scroll to bottom on initial page load only
                    container.scrollTop = container.scrollHeight;
                    // Set flag IMMEDIATELY to prevent any other code from scrolling
                    hasAutoScrolledOnPageLoadRef.current = true;
                }
            }, 600); // Longer delay to ensure DOM is ready
            
            return () => clearTimeout(timeoutId);
        }
    }, [hoverCommentCell]); // Only run when hoverCommentCell changes
    
    // Smart positioning for comment popup (separate effect)
    useEffect(() => {
        // Smart positioning for comment popup
        const updatePopupPosition = () => {
            if (!hoverCommentCell) {
                return;
            }
            
            const commentButton = window.document.querySelector(`[data-comment-cell="${hoverCommentCell}"]`);
            if (!commentButton) {
                return;
            }
            
            const buttonRect = commentButton.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const popupWidth = 288; // w-72 = 288px
            const popupHeight = 300; // approximate max height
            const spacing = 8; // Space between button and popup
            
            // Determine if popup should be above or below
            const spaceBelow = viewportHeight - buttonRect.bottom;
            const spaceAbove = buttonRect.top;
            const positionAbove = spaceBelow < popupHeight + spacing && spaceAbove > spaceBelow;
            
            // Calculate popup position
            let popupTop, popupLeft;
            
            if (positionAbove) {
                // Position above the button
                popupTop = buttonRect.top - popupHeight - spacing;
            } else {
                // Position below the button (default)
                popupTop = buttonRect.bottom + spacing;
            }
            
            // Align horizontally - prefer aligning with button center, but adjust to stay in viewport
            const buttonCenterX = buttonRect.left + buttonRect.width / 2;
            let preferredLeft = buttonCenterX - popupWidth / 2;
            
            // Ensure popup stays within viewport
            if (preferredLeft < 10) {
                preferredLeft = 10;
            } else if (preferredLeft + popupWidth > viewportWidth - 10) {
                preferredLeft = viewportWidth - popupWidth - 10;
            }
            
            popupLeft = preferredLeft;
            
            // Update popup position
            setCommentPopupPosition({ top: popupTop, left: popupLeft });
        };
        
        // Update immediately and on resize/scroll
        if (hoverCommentCell) {
            setTimeout(updatePopupPosition, 50); // Wait for DOM to update
            window.addEventListener('resize', updatePopupPosition);
            window.addEventListener('scroll', updatePopupPosition);
            
            return () => {
                window.removeEventListener('resize', updatePopupPosition);
                window.removeEventListener('scroll', updatePopupPosition);
            };
        }
    }, [hoverCommentCell, sections]); // Removed commentPopupPosition to prevent re-triggering on position updates
    
    useEffect(() => {
        const handleClickOutside = (event) => {
            const isCommentButton = event.target.closest('[data-comment-cell]');
            const isInsidePopup = event.target.closest('.comment-popup');
            const isStatusCell = event.target.closest('select[data-section-id]') || 
                                 event.target.closest('td')?.querySelector('select[data-section-id]');
            
            if (hoverCommentCell && !isCommentButton && !isInsidePopup) {
                setHoverCommentCell(null);
                setQuickComment('');
            }
            
            // Clear selection when clicking outside status cells (unless Ctrl/Cmd is held)
            // Don't clear if clicking on a status cell or its parent td
            const currentSelectedCells = selectedCellsRef.current;
            if (currentSelectedCells.size > 0 && !isStatusCell && !event.ctrlKey && !event.metaKey) {
                const clickedTd = event.target.closest('td');
                // Only clear if not clicking on a td that contains a status select
                if (!clickedTd || !clickedTd.querySelector('select[data-section-id]')) {
                    const newSet = new Set();
                    setSelectedCells(newSet);
                    selectedCellsRef.current = newSet;
                }
            }
        };
        
        window.document.addEventListener('mousedown', handleClickOutside);
        return () => window.document.removeEventListener('mousedown', handleClickOutside);
    }, [hoverCommentCell, selectedCells]);

    // When opened via a deep-link (e.g. from an email notification), automatically
    // switch to the correct comment cell and open the popup so the user can
    // immediately see the relevant discussion.
    const checkAndOpenDeepLink = useCallback(() => {
        try {
            // Check if URL has deep link parameters first
            const urlHash = window.location.hash || '';
            const urlSearch = window.location.search || '';
            const hasDocCollectionParams = urlHash.includes('docSectionId=') || urlSearch.includes('docSectionId=');
            const hasCommentId = urlHash.includes('commentId=') || urlSearch.includes('commentId=');
            
            console.log('🔍 MonthlyDocumentCollectionTracker: checkAndOpenDeepLink called', {
                urlHash,
                urlSearch,
                hasDocCollectionParams,
                hasCommentId,
                sectionsCount: sections?.length || 0
            });
            
            // Only proceed if we have doc collection params OR commentId (for comment search fallback)
            if (!hasDocCollectionParams && !hasCommentId) {
                console.log('⏭️ MonthlyDocumentCollectionTracker: No deep link params, exiting');
                return; // No deep link params, exit early
            }
            
            // If sections aren't loaded yet, wait and retry (for email link navigation)
            if (!sections || sections.length === 0) {
                // Retry after a delay if we have deep link params or commentId but no sections yet
                if (hasDocCollectionParams || hasCommentId) {
                    console.log('⏳ MonthlyDocumentCollectionTracker: Sections not loaded, retrying in 500ms');
                    setTimeout(() => {
                        checkAndOpenDeepLink();
                    }, 500);
                }
                return;
            }
            
            console.log('✅ MonthlyDocumentCollectionTracker: Proceeding with deep link check');
            
            // Check both window.location.search (for regular URLs) and hash query params (for hash-based routing)
            let params = null;
            let deepSectionId = null;
            let deepDocumentId = null;
            let deepMonth = null;
            let deepCommentId = null;
            
            // First check hash query params (for hash-based routing like #/projects/123?docSectionId=...)
            if (urlHash.includes('?')) {
                const hashParts = urlHash.split('?');
                if (hashParts.length > 1) {
                    params = new URLSearchParams(hashParts[1]);
                    deepSectionId = params.get('docSectionId');
                    deepDocumentId = params.get('docDocumentId');
                    deepMonth = params.get('docMonth');
                    deepCommentId = params.get('commentId');
                }
            }
            
            // If not found in hash, check window.location.search (for regular URLs)
            if (!deepSectionId || !deepDocumentId || !deepMonth) {
                if (urlSearch) {
                    params = new URLSearchParams(urlSearch);
                    if (!deepSectionId) deepSectionId = params.get('docSectionId');
                    if (!deepDocumentId) deepDocumentId = params.get('docDocumentId');
                    if (!deepMonth) deepMonth = params.get('docMonth');
                    if (!deepCommentId) deepCommentId = params.get('commentId');
                }
            }
            
            // If we have full params, open the specific cell
            // OR if we only have commentId, search for it across all sections
            if (deepSectionId && deepDocumentId && deepMonth) {
                const cellKey = `${deepSectionId}-${deepDocumentId}-${deepMonth}`;
                
                // Set initial position (will be updated once cell is found)
                setCommentPopupPosition({
                    top: Math.max(window.innerHeight / 2 - 160, 60),
                    left: Math.max(window.innerWidth / 2 - 180, 20)
                });
                
                // Open the popup immediately
                setHoverCommentCell(cellKey);
                
                // Find the comment button for this cell and reposition popup near it using smart positioning
                const positionPopup = () => {
                    const commentButton = window.document.querySelector(`[data-comment-cell="${cellKey}"]`);
                    if (commentButton) {
                        const buttonRect = commentButton.getBoundingClientRect();
                        const viewportWidth = window.innerWidth;
                        const viewportHeight = window.innerHeight;
                        const popupWidth = 288;
                        const popupHeight = 300;
                        const spacing = 8;
                        const tailSize = 12;
                        
                        // Determine if popup should be above or below
                        const spaceBelow = viewportHeight - buttonRect.bottom;
                        const spaceAbove = buttonRect.top;
                        const positionAbove = spaceBelow < popupHeight + spacing && spaceAbove > spaceBelow;
                        
                        let popupTop, popupLeft;
                        
                        if (positionAbove) {
                            popupTop = buttonRect.top - popupHeight - spacing - tailSize;
                        } else {
                            popupTop = buttonRect.bottom + spacing + tailSize;
                        }
                        
                        // Align horizontally with button center, but stay in viewport
                        const buttonCenterX = buttonRect.left + buttonRect.width / 2;
                        let preferredLeft = buttonCenterX - popupWidth / 2;
                        
                        if (preferredLeft < 10) {
                            preferredLeft = 10;
                        } else if (preferredLeft + popupWidth > viewportWidth - 10) {
                            preferredLeft = viewportWidth - popupWidth - 10;
                        }
                        
                        setCommentPopupPosition({ top: popupTop, left: preferredLeft });
                    } else {
                        // Fallback: try to find the cell and position relative to it
                        const cell = window.document.querySelector(`[data-section-id="${deepSectionId}"][data-document-id="${deepDocumentId}"][data-month="${deepMonth}"]`);
                        if (cell) {
                            const cellRect = cell.getBoundingClientRect();
                            const viewportWidth = window.innerWidth;
                            const viewportHeight = window.innerHeight;
                            const popupWidth = 288;
                            const popupHeight = 300;
                            const spacing = 8;
                            const tailSize = 12;
                            
                            // Determine if popup should be above or below
                            const spaceBelow = viewportHeight - cellRect.bottom;
                            const spaceAbove = cellRect.top;
                            const positionAbove = spaceBelow < popupHeight + spacing && spaceAbove > spaceBelow;
                            
                            let popupTop, popupLeft;
                            
                            if (positionAbove) {
                                popupTop = cellRect.top - popupHeight - spacing - tailSize;
                            } else {
                                popupTop = cellRect.bottom + spacing + tailSize;
                            }
                            
                            // Align horizontally with cell center, but stay in viewport
                            const cellCenterX = cellRect.left + cellRect.width / 2;
                            let preferredLeft = cellCenterX - popupWidth / 2;
                            
                            if (preferredLeft < 10) {
                                preferredLeft = 10;
                            } else if (preferredLeft + popupWidth > viewportWidth - 10) {
                                preferredLeft = viewportWidth - popupWidth - 10;
                            }
                            
                            setCommentPopupPosition({ top: popupTop, left: preferredLeft });
                        }
                    }
                };
                
                // Try to position immediately, then retry a few times if not found
                positionPopup();
                let attempts = 0;
                const maxAttempts = 5;
                const retryPosition = setInterval(() => {
                    attempts++;
                    positionPopup();
                    if (attempts >= maxAttempts) {
                        clearInterval(retryPosition);
                    }
                }, 200);
                
                // If a specific comment ID is provided, scroll to it after the popup opens
                if (deepCommentId) {
                    // Mark as done so initial page load scroll doesn't interfere
                    hasAutoScrolledOnPageLoadRef.current = true;
                    
                    // Convert commentId to string for comparison (URL params are always strings)
                    const targetCommentId = String(deepCommentId);
                    
                    // Wait for the popup to render and comments to load - use multiple attempts
                    let attempts = 0;
                    const maxAttempts = 10; // Try for up to 2 seconds
                    const findAndScrollToComment = () => {
                        attempts++;
                        
                        // Try multiple selectors to find the comment (handle both string and number IDs)
                        const commentElement = 
                            window.document.querySelector(`[data-comment-id="${targetCommentId}"]`) ||
                            window.document.querySelector(`[data-comment-id="${Number(targetCommentId)}"]`) ||
                            window.document.querySelector(`#comment-${targetCommentId}`) ||
                            window.document.querySelector(`#comment-${Number(targetCommentId)}`);
                        
                        if (commentElement && commentPopupContainerRef.current) {
                            // Scroll the comment into view within the popup
                            commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Also scroll the popup container to ensure visibility
                            if (commentPopupContainerRef.current) {
                                const containerRect = commentPopupContainerRef.current.getBoundingClientRect();
                                const commentRect = commentElement.getBoundingClientRect();
                                const scrollTop = commentPopupContainerRef.current.scrollTop;
                                const commentOffset = commentRect.top - containerRect.top + scrollTop;
                                commentPopupContainerRef.current.scrollTo({
                                    top: commentOffset - 20, // 20px padding from top
                                    behavior: 'smooth'
                                });
                            }
                            // Highlight the comment briefly
                            const originalBg = window.getComputedStyle(commentElement).backgroundColor;
                            commentElement.style.transition = 'background-color 0.3s, box-shadow 0.3s';
                            commentElement.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                            commentElement.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
                            setTimeout(() => {
                                commentElement.style.backgroundColor = originalBg;
                                commentElement.style.boxShadow = '';
                                commentElement.style.transition = '';
                            }, 2000);
                            console.log('✅ Deep link: Scrolled to comment', targetCommentId);
                        } else if (attempts < maxAttempts) {
                            // Comment not found yet, try again
                            setTimeout(findAndScrollToComment, 200);
                        } else {
                            console.warn('⚠️ Deep link: Could not find comment with ID', targetCommentId, 'after', attempts, 'attempts');
                        }
                    };
                    
                    // Start looking for the comment after a short delay
                    setTimeout(findAndScrollToComment, 300);
                }
            } 
            // Fallback: If we only have commentId (missing section/doc/month), search for it
            else if (deepCommentId && !deepSectionId && !deepDocumentId && !deepMonth) {
                console.log('📧 MonthlyDocumentCollectionTracker: Searching for comment with ID:', deepCommentId);
                
                // If sections aren't loaded yet, wait and retry
                if (!sections || sections.length === 0) {
                    console.log('⏳ Sections not loaded yet, will retry in 500ms');
                    setTimeout(() => {
                        checkAndOpenDeepLink();
                    }, 500);
                    return;
                }
                
                // Search through all sections and documents to find the comment
                let foundComment = null;
                let foundSectionId = null;
                let foundDocumentId = null;
                let foundMonth = null;
                
                // Search through all sections, documents, and months
                for (const section of sections) {
                    for (const document of section.documents || []) {
                        // Comments are stored as: comments[monthKey] where monthKey = "January-2026"
                        // Search through all possible months in the selected year
                        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                        
                        for (const month of months) {
                            const monthComments = getCommentsForYear(document.comments, month, selectedYear);
                            const comment = monthComments.find(c => String(c.id) === String(deepCommentId));
                            
                            if (comment) {
                                foundComment = comment;
                                foundSectionId = section.id;
                                foundDocumentId = document.id;
                                foundMonth = month; // Store month name (e.g., "January")
                                console.log('✅ Found comment:', deepCommentId, 'in section:', foundSectionId, 'document:', foundDocumentId, 'month:', foundMonth);
                                break;
                            }
                        }
                        if (foundComment) break;
                    }
                    if (foundComment) break;
                }
                
                if (foundComment && foundSectionId && foundDocumentId && foundMonth) {
                    // Found the comment! Open the popup for that cell
                    const cellKey = `${foundSectionId}-${foundDocumentId}-${foundMonth}`;
                    console.log('✅ Opening comment popup for cell:', cellKey);
                    
                    // First, try to scroll the table to make the cell visible
                    // Find the cell element in the table and scroll it into view
                    setTimeout(() => {
                        const cellElement = window.document.querySelector(`[data-section-id="${foundSectionId}"][data-document-id="${foundDocumentId}"][data-month="${foundMonth}"]`);
                        if (cellElement) {
                            cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 100);
                    
                    // Set initial position
                    setCommentPopupPosition({
                        top: Math.max(window.innerHeight / 2 - 160, 60),
                        left: Math.max(window.innerWidth / 2 - 180, 20)
                    });
                    
                    // Open the popup
                    setHoverCommentCell(cellKey);
                    
                    // Position popup near the cell
                    const positionPopup = () => {
                        const commentButton = window.document.querySelector(`[data-comment-cell="${cellKey}"]`);
                        if (commentButton) {
                            const buttonRect = commentButton.getBoundingClientRect();
                            const viewportWidth = window.innerWidth;
                            const viewportHeight = window.innerHeight;
                            const popupWidth = 288;
                            const popupHeight = 300;
                            const spacing = 8;
                            const tailSize = 12;
                            
                            const spaceBelow = viewportHeight - buttonRect.bottom;
                            const spaceAbove = buttonRect.top;
                            const positionAbove = spaceBelow < popupHeight + spacing && spaceAbove > spaceBelow;
                            
                            let popupTop, popupLeft;
                            
                            if (positionAbove) {
                                popupTop = buttonRect.top - popupHeight - spacing - tailSize;
                            } else {
                                popupTop = buttonRect.bottom + spacing + tailSize;
                            }
                            
                            const buttonCenterX = buttonRect.left + buttonRect.width / 2;
                            let preferredLeft = buttonCenterX - popupWidth / 2;
                            
                            if (preferredLeft < 10) {
                                preferredLeft = 10;
                            } else if (preferredLeft + popupWidth > viewportWidth - 10) {
                                preferredLeft = viewportWidth - popupWidth - 10;
                            }
                            
                            setCommentPopupPosition({ top: popupTop, left: preferredLeft });
                        }
                    };
                    
                    // Try to position immediately, then retry a few times
                    positionPopup();
                    let attempts = 0;
                    const maxAttempts = 5;
                    const retryPosition = setInterval(() => {
                        attempts++;
                        positionPopup();
                        if (attempts >= maxAttempts) {
                            clearInterval(retryPosition);
                        }
                    }, 200);
                    
                    // Mark as done so initial page load scroll doesn't interfere
                    hasAutoScrolledOnPageLoadRef.current = true;
                    
                    // Scroll to the comment within the popup
                    const targetCommentId = String(deepCommentId);
                    let scrollAttempts = 0;
                    const maxScrollAttempts = 20; // Increased attempts to wait longer for popup to render
                    const findAndScrollToComment = () => {
                        scrollAttempts++;
                        console.log(`🔍 Attempt ${scrollAttempts}/${maxScrollAttempts} to find comment element with ID:`, targetCommentId);
                        
                        // Try multiple selectors to find the comment element
                        const commentElement = 
                            window.document.querySelector(`[data-comment-id="${targetCommentId}"]`) ||
                            window.document.querySelector(`[data-comment-id="${Number(targetCommentId)}"]`) ||
                            window.document.querySelector(`#comment-${targetCommentId}`) ||
                            window.document.querySelector(`#comment-${Number(targetCommentId)}`);
                        
                        if (commentElement && commentPopupContainerRef.current) {
                            console.log('✅ Found comment element, scrolling into view');
                            // Scroll the comment into view within the popup container
                            commentElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                            
                            if (commentPopupContainerRef.current) {
                                const containerRect = commentPopupContainerRef.current.getBoundingClientRect();
                                const commentRect = commentElement.getBoundingClientRect();
                                const scrollTop = commentPopupContainerRef.current.scrollTop;
                                const commentOffset = commentRect.top - containerRect.top + scrollTop;
                                commentPopupContainerRef.current.scrollTo({
                                    top: Math.max(0, commentOffset - 20),
                                    behavior: 'smooth'
                                });
                            }
                            
                            // Highlight the comment with a blue background
                            const originalBg = window.getComputedStyle(commentElement).backgroundColor;
                            commentElement.style.transition = 'background-color 0.3s, box-shadow 0.3s';
                            commentElement.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                            commentElement.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
                            setTimeout(() => {
                                commentElement.style.backgroundColor = originalBg;
                                commentElement.style.boxShadow = '';
                                commentElement.style.transition = '';
                            }, 3000); // Increased highlight duration
                            console.log('✅ Deep link: Successfully scrolled to and highlighted comment', targetCommentId);
                            return; // Exit once found
                        } else {
                            console.log(`⚠️ Comment element not found yet. Popup container exists:`, !!commentPopupContainerRef.current);
                        }
                        
                        if (scrollAttempts < maxScrollAttempts) {
                            // Wait a bit longer between attempts to allow popup to render
                            setTimeout(findAndScrollToComment, 300);
                        } else {
                            console.warn('⚠️ Deep link: Could not find comment element with ID', targetCommentId, 'after', maxScrollAttempts, 'attempts');
                            console.warn('🔍 Debug: Popup container ref:', commentPopupContainerRef.current);
                            console.warn('🔍 Debug: All comment elements in popup:', window.document.querySelectorAll('[data-comment-id]'));
                        }
                    };
                    
                    // Wait a bit longer before starting to search (popup needs time to render)
                    setTimeout(findAndScrollToComment, 500);
                } else {
                    console.warn('⚠️ Deep link: Could not find comment with ID', deepCommentId, 'in any section');
                }
            }
        } catch (error) {
            console.warn('⚠️ Failed to apply document collection deep-link:', error);
        }
    }, [sections, selectedYear]);
    
    // Check for deep link on mount, when sections load, and when URL changes
    useEffect(() => {
        console.log('🔄 MonthlyDocumentCollectionTracker: useEffect triggered', {
            sectionsCount: sections?.length || 0,
            urlHash: window.location.hash,
            urlSearch: window.location.search
        });
        
        // Wait a bit for component to fully render and sections to load
        const timer = setTimeout(() => {
            console.log('⏰ MonthlyDocumentCollectionTracker: Timer fired, calling checkAndOpenDeepLink');
            checkAndOpenDeepLink();
        }, 500); // Increased delay to ensure sections are loaded
        return () => clearTimeout(timer);
    }, [checkAndOpenDeepLink, sections]); // Also depend on sections so it re-runs when sections load
    
    // Also listen for hash changes in case URL is updated after component mounts
    useEffect(() => {
        const handleHashChange = () => {
            setTimeout(() => {
                checkAndOpenDeepLink();
            }, 200); // Increased delay to ensure DOM is ready
        };
        
        // Also check on initial load (in case hashchange doesn't fire for initial navigation)
        const checkOnLoad = () => {
            setTimeout(() => {
                checkAndOpenDeepLink();
            }, 300);
        };
        
        // Check immediately if hash params or commentId exist
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        if (hash.includes('docSectionId=') || search.includes('docSectionId=') || 
            hash.includes('commentId=') || search.includes('commentId=')) {
            console.log('🔍 MonthlyDocumentCollectionTracker: Found deep link params on load, will check');
            checkOnLoad();
        }
        
        window.addEventListener('hashchange', handleHashChange);
        window.addEventListener('load', checkOnLoad);
        
        return () => {
            window.removeEventListener('hashchange', handleHashChange);
            window.removeEventListener('load', checkOnLoad);
        };
    }, [checkAndOpenDeepLink]);
    
    // ============================================================
    // RENDER STATUS CELL
    // ============================================================
    
    const renderStatusCell = (section, doc, month) => {
        const status = getDocumentStatus(doc, month);
        const statusConfig = status ? getStatusConfig(status) : null;
        const comments = getDocumentComments(doc, month);
        const hasComments = comments.length > 0;
        const cellKey = `${section.id}-${doc.id}-${month}`;
        const isPopupOpen = hoverCommentCell === cellKey;
        const isSelected = selectedCells.has(cellKey);
        
        const isWorkingMonth = workingMonths.includes(months.indexOf(month)) && selectedYear === currentYear;
        let cellBackgroundClass = statusConfig 
            ? statusConfig.cellColor 
            : (isWorkingMonth ? 'bg-primary-50' : '');
        
        // Add selection styling (with higher priority)
        if (isSelected) {
            cellBackgroundClass = 'bg-blue-200 border-2 border-blue-500';
        }
        
        const textColorClass = statusConfig && statusConfig.color 
            ? statusConfig.color.split(' ').find(cls => cls.startsWith('text-')) || 'text-gray-900'
            : 'text-gray-400';
        
        const handleCellClick = (e) => {
            // Check for Ctrl (Windows/Linux) or Cmd (Mac) modifier
            const isMultiSelect = e.ctrlKey || e.metaKey;
            
            if (isMultiSelect) {
                e.preventDefault();
                e.stopPropagation();
                
                setSelectedCells(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(cellKey)) {
                        newSet.delete(cellKey);
                    } else {
                        newSet.add(cellKey);
                    }
                    // Update ref immediately
                    selectedCellsRef.current = newSet;
                    return newSet;
                });
            } else {
                // Single click without modifier - clear selection if clicking on a different cell
                // Use ref to get latest value
                const currentSelectedCells = selectedCellsRef.current;
                if (currentSelectedCells.size > 0 && !currentSelectedCells.has(cellKey)) {
                    const newSet = new Set();
                    setSelectedCells(newSet);
                    selectedCellsRef.current = newSet;
                }
            }
        };
        
        return (
            <td 
                className={`px-2 py-1 text-xs border-l border-gray-100 ${cellBackgroundClass} relative ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                onClick={handleCellClick}
                title={isSelected ? 'Selected (Ctrl/Cmd+Click to deselect)' : 'Ctrl/Cmd+Click to select multiple'}
            >
                <div className="min-w-[160px] relative">
                    <select
                        value={status || ''}
                        onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const newStatus = e.target.value;
                            // Always use ref to get latest selectedCells value
                            const currentSelectedCells = selectedCellsRef.current;
                            // Apply to all selected cells if this cell is part of the selection, otherwise just this cell
                            const applyToSelected = currentSelectedCells.size > 0 && currentSelectedCells.has(cellKey);
                            handleUpdateStatus(section.id, doc.id, month, newStatus, applyToSelected);
                        }}
                        onBlur={(e) => {
                            // Ensure state is saved on blur
                            const newStatus = e.target.value;
                            if (newStatus !== status) {
                                const currentSelectedCells = selectedCellsRef.current;
                                const applyToSelected = currentSelectedCells.size > 0 && currentSelectedCells.has(cellKey);
                                handleUpdateStatus(section.id, doc.id, month, newStatus, applyToSelected);
                            }
                        }}
                        onMouseDown={(e) => {
                            // Allow Ctrl/Cmd+Click to bubble up for multi-select
                            // Only stop propagation for normal clicks
                            if (!e.ctrlKey && !e.metaKey) {
                                e.stopPropagation();
                            }
                        }}
                        onClick={(e) => {
                            // Handle Ctrl/Cmd+Click on the select itself for multi-select
                            if (e.ctrlKey || e.metaKey) {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                setSelectedCells(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(cellKey)) {
                                        newSet.delete(cellKey);
                                    } else {
                                        newSet.add(cellKey);
                                    }
                                    selectedCellsRef.current = newSet;
                                    return newSet;
                                });
                            }
                        }}
                        aria-label={`Status for ${doc.name || 'document'} in ${month} ${selectedYear}`}
                        role="combobox"
                        aria-haspopup="listbox"
                        data-section-id={section.id}
                        data-document-id={doc.id}
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
                                    // Set initial position - smart positioning will update it
                                    setHoverCommentCell(cellKey);
                                    // Trigger position update after state is set
                                    setTimeout(() => {
                                        const commentButton = window.document.querySelector(`[data-comment-cell="${cellKey}"]`);
                                        if (commentButton) {
                                            const buttonRect = commentButton.getBoundingClientRect();
                                            const viewportWidth = window.innerWidth;
                                            const viewportHeight = window.innerHeight;
                                            const popupWidth = 288;
                                            const popupHeight = 300;
                                            const spacing = 8;
                                            const tailSize = 12;
                                            
                                            // Determine if popup should be above or below
                                            const spaceBelow = viewportHeight - buttonRect.bottom;
                                            const spaceAbove = buttonRect.top;
                                            const positionAbove = spaceBelow < popupHeight + spacing && spaceAbove > spaceBelow;
                                            
                                            let popupTop, popupLeft;
                                            
                                            if (positionAbove) {
                                                popupTop = buttonRect.top - popupHeight - spacing - tailSize;
                                            } else {
                                                popupTop = buttonRect.bottom + spacing + tailSize;
                                            }
                                            
                                            // Align horizontally with button center, but stay in viewport
                                            const buttonCenterX = buttonRect.left + buttonRect.width / 2;
                                            let preferredLeft = buttonCenterX - popupWidth / 2;
                                            
                                            if (preferredLeft < 10) {
                                                preferredLeft = 10;
                                            } else if (preferredLeft + popupWidth > viewportWidth - 10) {
                                                preferredLeft = viewportWidth - popupWidth - 10;
                                            }
                                            
                                            setCommentPopupPosition({ top: popupTop, left: preferredLeft });
                                        }
                                    }, 10);
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
        const [formData, setFormData] = useState(() => {
            if (editingTemplate) {
                return {
                    name: editingTemplate.name || '',
                    description: editingTemplate.description || '',
                    sections: parseSections(editingTemplate.sections)
                };
            }
            if (prefilledTemplate) {
                return {
                    name: prefilledTemplate.name || '',
                    description: prefilledTemplate.description || '',
                    sections: parseSections(prefilledTemplate.sections)
                };
            }
            return { name: '', description: '', sections: [] };
        });
        
        useEffect(() => {
            if (editingTemplate) {
                setFormData({
                    name: editingTemplate.name || '',
                    description: editingTemplate.description || '',
                    sections: parseSections(editingTemplate.sections)
                });
            } else if (prefilledTemplate) {
                setFormData({
                    name: prefilledTemplate.name || '',
                    description: prefilledTemplate.description || '',
                    sections: parseSections(prefilledTemplate.sections)
                });
            } else {
                setFormData({ name: '', description: '', sections: [] });
            }
        }, [editingTemplate, prefilledTemplate]);
        
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
                                                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                                                        {getTemplateDisplayName(template)}
                                                    </h3>
                                                    {template.description && (
                                                        <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-4 text-[10px] text-gray-500">
                                                        <span><i className="fas fa-folder mr-1"></i>{Array.isArray(template.sections) ? template.sections.length : 0} sections</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 ml-3">
                                                    {!template.isDefault && (
                                                        <button
                                                            onClick={() => {
                                                                setEditingTemplate(template);
                                                                setShowTemplateList(false);
                                                            }}
                                                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                                                            title="Edit template"
                                                        >
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                    )}
                                                    {!template.isDefault && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                deleteTemplate(template.id);
                                                            }}
                                                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                                                            title="Delete template"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    )}
                                                    {template.isDefault && (
                                                        <span
                                                            className="px-2 py-1 text-xs text-gray-400 flex items-center gap-1"
                                                            title="Default templates are read-only. Create a new template to customize."
                                                        >
                                                            <i className="fas fa-lock"></i>
                                                            <span>Default</span>
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
                                                {getTemplateDisplayName(template)} ({Array.isArray(template.sections) ? template.sections.length : 0} sections)
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
                const doc = section?.documents.find(d => String(d.id) === String(rawDocumentId));
                const comments = doc ? getDocumentComments(doc, month) : [];
                
                return (
                    <>
                        {/* Comment Popup */}
                        <div 
                            className="comment-popup fixed w-72 bg-white border border-gray-300 rounded-lg shadow-xl p-3 z-[999]"
                            style={{ top: `${commentPopupPosition.top}px`, left: `${commentPopupPosition.left}px` }}
                        >
                        {/* Show section and document context */}
                        {section && doc && (
                            <div className="mb-2 pb-2 border-b border-gray-200">
                                <div className="text-[10px] font-semibold text-gray-700 mb-0.5">
                                    {section.name || 'Section'}
                                </div>
                                <div className="text-[9px] text-gray-500">
                                    {doc.name || 'Document'} • {month}
                                </div>
                            </div>
                        )}
                        {comments.length > 0 && (
                            <div className="mb-3">
                                <div className="text-[10px] font-semibold text-gray-600 mb-1.5">Comments</div>
                                <div 
                                    ref={commentPopupContainerRef} 
                                    className="space-y-2 mb-2 pr-1"
                                    style={{ 
                                        height: '128px',
                                        maxHeight: '128px',
                                        overflowY: 'scroll',
                                        overflowX: 'hidden',
                                        scrollBehavior: 'auto',
                                        WebkitOverflowScrolling: 'touch',
                                        touchAction: 'pan-y',
                                        cursor: 'default',
                                        position: 'relative',
                                        willChange: 'scroll-position'
                                    }}
                                >
                                    {comments.map((comment, idx) => (
                                        <div 
                                            key={comment.id || idx} 
                                            data-comment-id={comment.id}
                                            id={comment.id ? `comment-${comment.id}` : undefined}
                                            className="pb-2 border-b last:border-b-0 bg-gray-50 rounded p-1.5 relative group"
                                        >
                                            <p
                                                className="text-xs text-gray-700 whitespace-pre-wrap pr-6"
                                                dangerouslySetInnerHTML={{
                                                    __html:
                                                        window.MentionHelper && comment.text
                                                            ? window.MentionHelper.highlightMentions(comment.text)
                                                            : (comment.text || '')
                                                }}
                                            />
                                            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                <span className="font-medium">{comment.author}</span>
                                                <span>{new Date(comment.date).toLocaleString('en-ZA', { 
                                                    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                                })}</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (!section || !doc) return;
                                                    handleDeleteComment(section.id, doc.id, month, comment.id);
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
                            {commentInputAvailable && section && doc ? (
                                <window.CommentInputWithMentions
                                    onSubmit={(commentText) => {
                                        if (commentText && commentText.trim()) {
                                            handleAddComment(section.id, doc.id, month, commentText);
                                        }
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
                                            if (e.key === 'Enter' && e.ctrlKey && section && doc) {
                                                handleAddComment(section.id, doc.id, month, quickComment);
                                            }
                                        }}
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                        rows="2"
                                        placeholder="Type comment... (Ctrl+Enter to submit)"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => {
                                            if (!section || !doc) return;
                                            handleAddComment(section.id, doc.id, month, quickComment);
                                        }}
                                        disabled={!quickComment.trim()}
                                        className="mt-1.5 w-full px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 disabled:opacity-50"
                                    >
                                        Add Comment
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    </>
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
                        <p className="text-xs text-gray-500">
                            {project?.name}
                            {' • '}
                            {project?.client}
                            {' • '}
                            Facilities:
                            {' '}
                            {getFacilitiesLabel(project) || 'Not specified'}
                        </p>
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
                        <button
                            onClick={() => {
                                try {
                                    if (!sections || sections.length === 0) {
                                        alert('There are no sections in this year to save as a template.');
                                        return;
                                    }
                                    const defaultName = `${project?.name || 'Project'} - ${selectedYear} template`;
                                    const name = window.prompt('Template name', defaultName);
                                    if (!name || !name.trim()) {
                                        return;
                                    }
                                    // Build a clean template payload from the current year's sections
                                    // (names/descriptions only, no status/comments) and route it
                                    // through the "create" flow so we POST a brand‑new template.
                                    setEditingTemplate(null);
                                    setPrefilledTemplate({
                                        name: name.trim(),
                                        description: `Saved from ${project?.name || 'project'} - year ${selectedYear}`,
                                        sections: buildTemplateSectionsFromCurrent()
                                    });
                                    setShowTemplateList(false);
                                    setShowTemplateModal(true);
                                } catch (e) {
                                    console.error('❌ Failed to prepare template from current year:', e);
                                    alert('Could not prepare template from current year. See console for details.');
                                }
                            }}
                            className="px-3 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-[10px] font-medium"
                            title="Save current year as template"
                        >
                            <i className="fas fa-save mr-1"></i>Save Year as Template
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
            
            {/* Per-section tables with independent horizontal scroll */}
            <div className="space-y-3">
                {sections.length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400">
                        <i className="fas fa-folder-open text-3xl mb-2 opacity-50"></i>
                        <p className="text-sm">No sections yet</p>
                        <button
                            onClick={handleAddSection}
                            className="mt-3 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                        >
                            <i className="fas fa-plus mr-1"></i>Add First Section
                        </button>
                    </div>
                ) : (
                    sections.map((section, sectionIndex) => (
                        <div
                            key={section.id}
                            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                            draggable="true"
                            onDragStart={(e) => handleSectionDragStart(e, section, sectionIndex)}
                            onDragEnd={handleSectionDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleSectionDrop(e, sectionIndex)}
                        >
                            {/* Section header */}
                            <div className="px-3 py-2 bg-gray-100 flex items-center justify-between cursor-grab active:cursor-grabbing">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                    <div>
                                        <div className="font-semibold text-sm text-gray-900">{section.name}</div>
                                        {section.description && (
                                            <div className="text-[10px] text-gray-500">{section.description}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleAddDocument(section.id)}
                                        className="px-2 py-0.5 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700"
                                    >
                                        <i className="fas fa-plus mr-1"></i>Add Document
                                    </button>
                                    <button
                                        onClick={() => handleEditSection(section)}
                                        className="text-gray-600 hover:text-primary-600 p-1"
                                    >
                                        <i className="fas fa-edit text-xs"></i>
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteSection(section.id, e)}
                                        className="text-gray-600 hover:text-red-600 p-1"
                                        type="button"
                                    >
                                        <i className="fas fa-trash text-xs"></i>
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable month/document grid for this section only */}
                            <div className="border-t border-gray-200 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th
                                                className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase sticky left-0 bg-gray-50 z-20 border-r border-gray-200"
                                                style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                            >
                                                Document / Data
                                            </th>
                                            {months.map((month, idx) => (
                                                <th
                                                    key={month}
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
                                            section.documents.map((doc) => (
                                                <tr key={doc.id} className="hover:bg-gray-50">
                                                    <td
                                                        className="px-4 py-1.5 sticky left-0 bg-white z-20 border-r border-gray-200"
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                                    >
                                                        <div className="min-w-[200px]">
                                                            <div className="text-xs font-medium text-gray-900">{document.name}</div>
                                                            {document.description && (
                                                                <div className="text-[10px] text-gray-500">{document.description}</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {months.map((month) => (
                                                        <React.Fragment key={`${doc.id}-${month}`}>
                                                            {renderStatusCell(section, doc, month)}
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="px-2.5 py-1.5 border-l border-gray-200">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleEditDocument(section, doc)}
                                                                className="text-gray-600 hover:text-primary-600 p-1"
                                                            >
                                                                <i className="fas fa-edit text-xs"></i>
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleDeleteDocument(section.id, doc.id, e)}
                                                                className="text-gray-600 hover:text-red-600 p-1"
                                                                type="button"
                                                            >
                                                                <i className="fas fa-trash text-xs"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
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

export default MonthlyDocumentCollectionTracker;
