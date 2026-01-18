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

const WeeklyFMSReviewTracker = ({ project, onBack }) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    
    // Calculate working months (2 months in arrears from current month)
    const getWorkingMonths = () => {
        const twoMonthsBack = currentMonth - 2 < 0 ? currentMonth - 2 + 12 : currentMonth - 2;
        const oneMonthBack = currentMonth - 1 < 0 ? currentMonth - 1 + 12 : currentMonth - 1;
        return [twoMonthsBack, oneMonthBack];
    };
    
    const workingMonths = getWorkingMonths();
    // Simplified refs - only essential ones for debouncing and API reference
    const saveTimeoutRef = useRef(null);
    const isSavingRef = useRef(false);
    const sectionsRef = useRef({}); // Keep ref for immediate access during rapid updates
    const apiRef = useRef(window.DocumentCollectionAPI || null);
    const lastSavedDataRef = useRef(null); // Track last saved data to prevent unnecessary saves
    const isDeletingRef = useRef(false); // Track deletion in progress to prevent race conditions
    const deletionSectionIdsRef = useRef(new Set()); // Track which section IDs are being deleted
    const deletionTimestampRef = useRef(null); // Track when deletion started
    const deletionQueueRef = useRef([]); // Queue for pending deletions when one is already in progress
    const isProcessingDeletionQueueRef = useRef(false); // Track if the deletion queue is currently being processed
    
    const getSnapshotKey = (projectId) => projectId ? `weeklyFMSReviewSnapshot_${projectId}` : null;

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const commentInputAvailable = typeof window !== 'undefined' && typeof window.CommentInputWithMentions === 'function';

    // Year selection with persistence
    const YEAR_STORAGE_PREFIX = 'weeklyFMSReviewSelectedYear_';
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
    
    // Parse weeklyFMSReviewSections safely (legacy flat array support)
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
                            console.warn('Failed to parse weeklyFMSReviewSections after', attempts, 'attempts');
                            return [];
                        }
                    }
                }
                return [];
            }
        } catch (e) {
            console.warn('Failed to parse weeklyFMSReviewSections:', e);
            return [];
        }
        return [];
    };

    // Snapshot serializer for any weeklyFMSReviewSections shape (array or year map)
    const serializeSections = (data) => {
        try {
            return JSON.stringify(data ?? {});
        } catch (error) {
            console.warn('Failed to serialize weeklyFMSReviewSections snapshot:', error);
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
        // Handle empty objects - if it's an empty object, return empty object (don't treat as no data)
        if (!rawValue) return {};
        if (typeof rawValue === 'object' && !Array.isArray(rawValue) && Object.keys(rawValue).length === 0) {
            return {}; // Empty object is valid - means no sections for any year
        }

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
            
            const updated = {
                ...prev,
                [selectedYear]: nextForYear
            };
            
            // CRITICAL: Update ref immediately to prevent race conditions with save
            sectionsRef.current = updated;
            
            return updated;
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
        const EXXARO_DEFAULT_NAME = 'Exxaro Grootegeluk weekly FMS review checklist for 2025';
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
    const userHasScrolledRef = useRef(false);
    const [users, setUsers] = useState([]);
    
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
    
    // Simplified loading - load from database, use prop as fallback
    const loadData = useCallback(async (retryCount = 0) => {
        if (!project?.id) return;
        
        // Don't reload if we're currently saving - wait for save to complete, then retry
        if (isSavingRef.current) {
            console.log('⏸️ Load skipped: save in progress, will retry...');
            // Retry after a short delay (max 3 retries)
            if (retryCount < 3) {
                setTimeout(() => {
                    loadData(retryCount + 1);
                }, 500);
            } else {
                console.warn('⚠️ Load failed after retries: save still in progress');
            }
            return;
        }
        
        setIsLoading(true);
        
        try {
            // ALWAYS load from database first (most reliable, has latest data)
            // PERFORMANCE: Only fetch the specific field we need
            if (apiRef.current) {
                console.log('📥 Loading from database (optimized)...', { projectId: project.id });
                const freshProject = await apiRef.current.fetchProject(project.id, ['weeklyFMSReviewSections']);
                console.log('📥 Loaded project from database:', { 
                    hasWeeklyFMSReviewSections: !!freshProject?.weeklyFMSReviewSections,
                    weeklyFMSReviewSectionsType: typeof freshProject?.weeklyFMSReviewSections,
                    weeklyFMSReviewSectionsLength: typeof freshProject?.weeklyFMSReviewSections === 'string' 
                        ? freshProject.weeklyFMSReviewSections.length 
                        : 'N/A'
                });
                
                if (freshProject?.weeklyFMSReviewSections) {
                    const normalized = normalizeSectionsByYear(freshProject.weeklyFMSReviewSections);
                    console.log('📥 Normalized sections:', { 
                        yearKeys: Object.keys(normalized),
                        totalSections: Object.values(normalized).reduce((sum, arr) => sum + (arr?.length || 0), 0)
                    });
                    setSectionsByYear(normalized);
                    sectionsRef.current = normalized;
                    lastSavedDataRef.current = JSON.stringify(normalized);
                    setIsLoading(false);
                    return;
                }
            }
            
            // Fallback to prop data (only if database load failed)
            console.log('⚠️ Falling back to prop data');
            if (project?.weeklyFMSReviewSections) {
                const normalized = normalizeSectionsByYear(project.weeklyFMSReviewSections);
                console.log('📥 Normalized prop data:', { 
                    yearKeys: Object.keys(normalized),
                    totalSections: Object.values(normalized).reduce((sum, arr) => sum + (arr?.length || 0), 0)
                });
                setSectionsByYear(normalized);
                sectionsRef.current = normalized;
                lastSavedDataRef.current = JSON.stringify(normalized);
                setIsLoading(false);
                return;
            } else {
                // Check localStorage as backup before initializing empty
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        const stored = window.localStorage.getItem(snapshotKey);
                        if (stored && stored.trim() && stored !== '{}' && stored !== 'null') {
                            console.log('📥 Loading from localStorage backup...');
                            const parsed = JSON.parse(stored);
                            const normalized = normalizeSectionsByYear(parsed);
                            console.log('📥 Loaded from localStorage:', { 
                                yearKeys: Object.keys(normalized),
                                totalSections: Object.values(normalized).reduce((sum, arr) => sum + (arr?.length || 0), 0)
                            });
                            setSectionsByYear(normalized);
                            sectionsRef.current = normalized;
                            lastSavedDataRef.current = stored;
                            setIsLoading(false);
                            return;
                        }
                    } catch (storageError) {
                        console.warn('⚠️ Failed to load from localStorage:', storageError);
                    }
                }
                
                // No data - initialize empty
                console.log('📭 No data found, initializing empty');
                setSectionsByYear({});
                sectionsRef.current = {};
                lastSavedDataRef.current = JSON.stringify({});
            }
        } catch (error) {
            console.error('❌ Error loading data:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                projectId: project.id
            });
            setSectionsByYear({});
            sectionsRef.current = {};
        } finally {
            setIsLoading(false);
        }
    }, [project?.id, project?.weeklyFMSReviewSections]);
    
    // Load data on mount and when project changes
    // OPTIMIZATION: Don't reload when only year changes - data is already loaded for all years
    const lastProjectIdRef = useRef(null);
    const hasLoadedRef = useRef(false);
    useEffect(() => {
        if (project?.id) {
            // Load on initial mount or when project ID changes
            if (project.id !== lastProjectIdRef.current || !hasLoadedRef.current) {
                lastProjectIdRef.current = project.id;
                hasLoadedRef.current = true;
                loadData();
            }
        }
    }, [project?.id, loadData]);
    
    // Load users for reviewer assignment
    useEffect(() => {
        const loadUsers = async () => {
            try {
                if (window.DatabaseAPI?.getUsers) {
                    const usersResponse = await window.DatabaseAPI.getUsers();
                    const allUsers =
                        usersResponse?.data?.users ||
                        usersResponse?.data?.data?.users ||
                        usersResponse?.users ||
                        [];
                    setUsers(allUsers);
                }
            } catch (error) {
                console.error('❌ Error loading users:', error);
            }
        };
        loadUsers();
    }, []);
    
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
    
    // Simplified save function - clear and reliable
    async function saveToDatabase(options = {}) {
        if (isSavingRef.current || !project?.id || isLoading) {
            console.log('⏸️ Save skipped:', { 
                isSaving: isSavingRef.current, 
                hasProjectId: !!project?.id, 
                isLoading 
            });
            return;
        }

        // Use ref (updated immediately by handlers) or fallback to state
        // Ref is updated synchronously before state updates, so it has the latest data
        const payload = sectionsRef.current && Object.keys(sectionsRef.current).length > 0 
            ? sectionsRef.current 
            : sectionsByYear;
        
        // CRITICAL: Verify payload structure before saving
        console.log('🔍 Payload verification before save:', {
            hasPayload: !!payload,
            payloadType: typeof payload,
            payloadKeys: Object.keys(payload || {}),
            firstYear: Object.keys(payload || {})[0],
            firstYearSectionsCount: payload?.[Object.keys(payload || {})[0]]?.length || 0,
            firstSectionFirstDoc: payload?.[Object.keys(payload || {})[0]]?.[0]?.documents?.[0],
            firstDocStatus: payload?.[Object.keys(payload || {})[0]]?.[0]?.documents?.[0]?.collectionStatus
        });
        
        const serialized = JSON.stringify(payload);
        
        console.log('🔍 Serialized payload check:', {
            serializedLength: serialized.length,
            serializedPreview: serialized.substring(0, 500),
            containsStatus: serialized.includes('collectionStatus'),
            containsChecked: serialized.includes('checked') || serialized.includes('not-checked') || serialized.includes('issue')
        });
        
        // Skip if data hasn't changed (unless forceSave is requested)
        if (!options.forceSave && lastSavedDataRef.current === serialized) {
            console.log('⏸️ Save skipped: data unchanged', {
                payloadSize: serialized.length,
                lastSavedSize: lastSavedDataRef.current?.length,
                hasPayload: !!payload,
                payloadKeys: Object.keys(payload || {})
            });
            return;
        }
        
        if (options.forceSave) {
            console.log('🔨 Force save requested - bypassing unchanged check');
        }
        
        console.log('💾 Saving to database...', { 
            hasData: Object.keys(payload).length > 0,
            yearKeys: Object.keys(payload),
            payloadSize: serialized.length,
            payloadPreview: serialized.substring(0, 500)
        });

        isSavingRef.current = true;
        
        try {
            // Use DocumentCollectionAPI if available, fallback to DatabaseAPI
            let result;
            if (apiRef.current?.saveWeeklyFMSReviewSections) {
                console.log('📤 Calling saveWeeklyFMSReviewSections API with payload:', {
                    projectId: project.id,
                    payloadType: typeof payload,
                    payloadKeys: Object.keys(payload || {}),
                    firstYearData: payload[Object.keys(payload)[0]]?.slice(0, 2)
                });
                result = await apiRef.current.saveWeeklyFMSReviewSections(project.id, payload, options.skipParentUpdate);
                console.log('✅ Saved via DocumentCollectionAPI:', result);
                console.log('✅ Save result details:', {
                    hasResult: !!result,
                    hasData: !!result?.data,
                    hasProject: !!result?.data?.project || !!result?.project,
                    projectId: result?.data?.project?.id || result?.project?.id
                });
            } else if (window.DatabaseAPI?.updateProject) {
                result = await window.DatabaseAPI.updateProject(project.id, {
                    weeklyFMSReviewSections: serialized
                });
                console.log('✅ Saved via DatabaseAPI:', result);
            } else {
                throw new Error('No available API for saving weekly FMS review sections');
            }
            
            // Mark as saved
            lastSavedDataRef.current = serialized;
            console.log('✅ Save completed successfully');
            console.log('✅ Save verification - lastSavedDataRef now contains:', {
                length: lastSavedDataRef.current?.length,
                preview: lastSavedDataRef.current?.substring(0, 300),
                containsStatus: lastSavedDataRef.current?.includes('collectionStatus')
            });
            
            // Update localStorage backup
            const snapshotKey = getSnapshotKey(project.id);
            if (snapshotKey && window.localStorage) {
                try {
                    window.localStorage.setItem(snapshotKey, serialized);
                } catch (storageError) {
                    console.warn('⚠️ Failed to save snapshot to localStorage:', storageError);
                }
            }
        } catch (error) {
            console.error('❌ Error saving to database:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                projectId: project.id,
                payloadSize: serialized.length,
                payloadPreview: serialized.substring(0, 200),
                errorName: error.name,
                errorCode: error.code,
                responseStatus: error.response?.status,
                responseData: error.response?.data
            });
            // Don't reset lastSavedDataRef on error - keep the previous successful save state
            // This prevents infinite retry loops if there's a persistent error
            // Only reset if this is a network/client error, not a server error
            if (error.message?.includes('network') || error.message?.includes('fetch')) {
                lastSavedDataRef.current = null;
            }
            // Don't re-throw - this function is called without await, so errors are handled via .catch()
        } finally {
            isSavingRef.current = false;
        }
    };
    
    // Save pending changes on hard refresh / tab close
    useEffect(() => {
        if (!project?.id) return;
        
        const handleBeforeUnload = (event) => {
            const currentData = JSON.stringify(sectionsRef.current || sectionsByYear);
            if (currentData !== lastSavedDataRef.current && !isSavingRef.current) {
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
            const currentData = JSON.stringify(sectionsRef.current || sectionsByYear);
            if (currentData !== lastSavedDataRef.current && !isSavingRef.current) {
                // Save pending changes on unmount
                // Note: We can't await in cleanup, but we ensure saves are awaited in handlers
                // This is a fallback for any edge cases where handlers didn't complete
                const payload = sectionsRef.current && Object.keys(sectionsRef.current).length > 0 
                    ? sectionsRef.current 
                    : sectionsByYear;
                const serialized = JSON.stringify(payload);
                
                // Save to localStorage immediately as backup
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        window.localStorage.setItem(snapshotKey, serialized);
                        console.log('✅ Saved to localStorage on unmount (backup)');
                    } catch (storageError) {
                        console.warn('⚠️ Failed to save snapshot to localStorage:', storageError);
                    }
                }
                
                // Attempt async save (may not complete if page is closing, but localStorage backup helps)
                saveToDatabase({ skipParentUpdate: true }).catch(error => {
                    console.error('❌ Error saving on unmount:', error);
                });
            }
        };
    }, [project?.id, sectionsByYear]);
    
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
            reviewer: section.reviewer || '',
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
    // Format: "YYYY-MM" (e.g., "2026-01") to match backend expectations
    // month can be either a month name (e.g., "January") or a number (1-12)
    const getMonthKey = (month, year = selectedYear) => {
        let monthNum;
        if (typeof month === 'string') {
            // Convert month name to number (0-indexed, so add 1)
            const monthIndex = months.indexOf(month);
            if (monthIndex === -1) {
                // Try parsing as number string
                monthNum = parseInt(month, 10);
                if (isNaN(monthNum)) {
                    console.error('Invalid month:', month);
                    return null;
                }
            } else {
                monthNum = monthIndex + 1; // Convert 0-11 to 1-12
            }
        } else {
            monthNum = month;
        }
        const monthStr = String(monthNum).padStart(2, '0');
        return `${year}-${monthStr}`;
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
    // If status is empty/null, remove the key instead of setting it to empty string
    const setStatusForYear = (collectionStatus, month, status, year = selectedYear) => {
        const monthKey = getMonthKey(month, year);
        const newStatus = { ...collectionStatus };
        
        // If status is empty/null, remove the key to show white background
        if (!status || status === '' || status === 'Select Status') {
            delete newStatus[monthKey];
        } else {
            newStatus[monthKey] = status;
        }
        
        return newStatus;
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
        { value: 'not-checked', label: 'Not Checked', color: 'text-gray-700 font-semibold', cellColor: 'bg-white border border-gray-300' },
        { value: 'checked', label: 'Checked', color: 'bg-green-400 text-white font-semibold', cellColor: 'bg-green-400 border-l-4 border-green-500 shadow-sm' },
        { value: 'issue', label: 'Issue', color: 'bg-red-300 text-white font-semibold', cellColor: 'bg-red-300 border-l-4 border-red-500 shadow-sm' }
    ];
    
    const getStatusConfig = (status) => {
        if (!status || status === '' || status === 'Select Status') {
            return null; // Return null for empty/select status to show white background
        }
        return statusOptions.find(opt => opt.value === status) || null;
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
        // Use current state from ref to ensure we have the latest
        const currentState = sectionsRef.current || {};
        const currentSections = currentState[selectedYear] || [];
        
        if (editingSection) {
            const updated = currentSections.map(s => 
                String(s.id) === String(editingSection.id) ? { ...s, ...sectionData } : s
            );
            const updatedSectionsByYear = {
                ...currentState,
                [selectedYear]: updated
            };
            sectionsRef.current = updatedSectionsByYear;
            setSectionsByYear(updatedSectionsByYear);
        } else {
            const newSection = {
                id: Date.now() + Math.random(),
                ...sectionData,
                documents: [],
                reviewer: sectionData.reviewer || ''
            };
            const updated = [...currentSections, newSection];
            const updatedSectionsByYear = {
                ...currentState,
                [selectedYear]: updated
            };
            sectionsRef.current = updatedSectionsByYear;
            setSectionsByYear(updatedSectionsByYear);
        }
        
        setShowSectionModal(false);
        setEditingSection(null);
    };
    
    // Handler to update reviewer for a section
    const handleUpdateReviewer = (sectionId, reviewerId) => {
        const currentState = sectionsRef.current || {};
        const currentSections = currentState[selectedYear] || [];
        
        const updated = currentSections.map(section => {
            if (String(section.id) === String(sectionId)) {
                return {
                    ...section,
                    reviewer: reviewerId || ''
                };
            }
            return section;
        });
        
        const updatedSectionsByYear = {
            ...currentState,
            [selectedYear]: updated
        };
        
        // Update ref immediately
        sectionsRef.current = updatedSectionsByYear;
        
        // Update state (triggers auto-save)
        setSectionsByYear(updatedSectionsByYear);
        
        // Force immediate save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        saveToDatabase();
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
        const snapshotBeforeDeletion = JSON.stringify(sectionsRef.current);
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
                
                // CRITICAL: Update saved data ref IMMEDIATELY after state update
                const deletedSectionSnapshot = JSON.stringify(updatedSectionsByYear);
                lastSavedDataRef.current = deletedSectionSnapshot;
                
                // Persist snapshot to localStorage immediately (before database save)
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        window.localStorage.setItem(snapshotKey, deletedSectionSnapshot);
                        console.log('💾 Deletion snapshot saved to localStorage immediately');
                    } catch (storageError) {
                        console.warn('⚠️ Failed to save weekly FMS review snapshot to localStorage:', storageError);
                    }
                }
                
                return updatedSectionsByYear;
            });
            
            // Save in background (non-blocking) - UI already updated optimistically
            const deletedSectionSnapshot = JSON.stringify(sectionsRef.current);
            isSavingRef.current = true;
            
            // Perform save asynchronously without blocking
            (async () => {
            try {
                const payload = sectionsRef.current || {};
                
                if (apiRef.current && typeof apiRef.current.saveWeeklyFMSReviewSections === 'function') {
                    await apiRef.current.saveWeeklyFMSReviewSections(project.id, payload, false);
                } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                    const updatePayload = {
                        weeklyFMSReviewSections: JSON.stringify(payload)
                    };
                    await window.DatabaseAPI.updateProject(project.id, updatePayload);
                } else {
                    throw new Error('No available API for saving document sections');
                }
                
                // Update saved data ref to match deleted state
                const currentStateSnapshot = JSON.stringify(sectionsRef.current);
                lastSavedDataRef.current = currentStateSnapshot;
                
                console.log('✅ Section deletion saved successfully');
                
                // Update localStorage snapshot to match deleted state
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        window.localStorage.setItem(snapshotKey, currentStateSnapshot);
                        console.log('💾 Deletion snapshot updated in localStorage after successful save');
                    } catch (storageError) {
                        console.warn('⚠️ Failed to update weekly FMS review snapshot in localStorage:', storageError);
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
        console.log('🔄 handleUpdateStatus called:', { sectionId, documentId, month, status, applyToSelected, selectedYear });
        
        // Use current state (most up-to-date) or fallback to ref
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 
            ? sectionsByYear 
            : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        
        console.log('🔄 Current state:', { 
            hasSectionsByYear: Object.keys(sectionsByYear || {}).length > 0,
            hasRef: Object.keys(sectionsRef.current || {}).length > 0,
            currentYearSectionsCount: currentYearSections.length,
            selectedYear 
        });
        
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
        
        console.log('🔄 Cells to update:', cellsToUpdate);
        
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
                    const oldStatus = { ...updatedStatus };
                    docUpdates.forEach(cell => {
                        updatedStatus = setStatusForYear(updatedStatus, cell.month, status, selectedYear);
                    });
                    
                    console.log('🔄 Document status updated:', { 
                        docId: doc.id, 
                        docName: doc.name,
                        oldStatus: oldStatus,
                        newStatus: updatedStatus 
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
        
        console.log('🔄 Updated sections by year:', { 
            year: selectedYear, 
            sectionsCount: updated.length,
            firstSectionName: updated[0]?.name,
            serializedLength: JSON.stringify(updatedSectionsByYear).length
        });
        
        // Update ref IMMEDIATELY before state update to prevent race conditions
        // This ensures auto-save always has the latest data, even during rapid changes
        sectionsRef.current = updatedSectionsByYear;
        
        // Verify ref was updated correctly
        const refVerify = JSON.stringify(sectionsRef.current);
        const stateVerify = JSON.stringify(updatedSectionsByYear);
        if (refVerify !== stateVerify) {
            console.error('⚠️ CRITICAL: Ref update mismatch!', {
                refLength: refVerify.length,
                stateLength: stateVerify.length
            });
        }
        
        console.log('🔄 Ref updated, about to save. Ref has data:', {
            refHasData: Object.keys(sectionsRef.current || {}).length > 0,
            refYearKeys: Object.keys(sectionsRef.current || {}),
            stateYearKeys: Object.keys(updatedSectionsByYear)
        });
        
        // Now update state (this will trigger auto-save, but ref already has the latest data)
        setSectionsByYear(updatedSectionsByYear);
        
        // Force immediate save (don't wait for debounce) to ensure persistence
        // Clear any pending debounced save first
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        
        // Save immediately - use forceSave to bypass unchanged check since we just updated the data
        console.log('💾 handleUpdateStatus: Triggering immediate save with forceSave');
        console.log('💾 handleUpdateStatus: Ref at save time:', {
            hasRef: !!sectionsRef.current,
            refKeys: Object.keys(sectionsRef.current || {}),
            refDataSample: JSON.stringify(sectionsRef.current || {}).substring(0, 200)
        });
        
        // Don't await - fire and forget to keep UI responsive
        // But catch errors to prevent unhandled promise rejections
        saveToDatabase({ forceSave: true }).then(() => {
            console.log('✅ handleUpdateStatus: Save promise resolved');
        }).catch(error => {
            console.error('❌ handleUpdateStatus: Save failed (non-blocking):', error);
            // Show alert for critical errors
            if (error.message && !error.message.includes('network')) {
                console.error('🚨 CRITICAL SAVE ERROR - User should see this in console');
            }
        });
        
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
        
        console.log('💬 handleAddComment called:', { sectionId, documentId, month, commentText: commentText.substring(0, 50) });
        
        try {
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
            
            // Validate inputs
            if (!sectionId || !documentId || !month) {
                console.error('❌ Missing required fields for comment:', { sectionId, documentId, month });
                alert('Error: Missing required information. Please try again.');
                return;
            }
            
            // Use current state (most up-to-date) or fallback to ref
            const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 
                ? sectionsByYear 
                : (sectionsRef.current || {});
            const currentYearSections = latestSectionsByYear[selectedYear] || [];
            
            console.log('🔍 Looking for section:', { sectionId, selectedYear, sectionsCount: currentYearSections.length });
            
            let sectionFound = false;
            let documentFound = false;
            
            const updated = currentYearSections.map(section => {
                if (String(section.id) === String(sectionId)) {
                    sectionFound = true;
                    return {
                        ...section,
                        documents: section.documents.map(doc => {
                            if (String(doc.id) === String(documentId)) {
                                documentFound = true;
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
            });
            
            if (!sectionFound) {
                console.error('❌ Section not found:', sectionId);
                alert('Error: Section not found. Please refresh and try again.');
                return;
            }
            
            if (!documentFound) {
                console.error('❌ Document not found:', documentId);
                alert('Error: Document not found. Please refresh and try again.');
                return;
            }
            
            const updatedSectionsByYear = {
                ...latestSectionsByYear,
                [selectedYear]: updated
            };
            
            // Update ref IMMEDIATELY before state update to prevent race conditions
            sectionsRef.current = updatedSectionsByYear;
            
            // Now update state (this will trigger auto-save)
            setSectionsByYear(updatedSectionsByYear);
            
            // Force immediate save (don't wait for debounce) to ensure persistence
            // Clear any pending debounced save first
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            // Save immediately - use forceSave to bypass unchanged check since we just updated the data
            console.log('💾 handleAddComment: Triggering immediate save with forceSave');
            // Don't await - fire and forget to keep UI responsive
            // But catch errors to prevent unhandled promise rejections
            saveToDatabase({ forceSave: true }).catch(error => {
                console.error('❌ handleAddComment: Save failed (non-blocking):', error);
            });
            
            setQuickComment('');

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
                        
                        const contextTitle = `Weekly FMS Review - ${project?.name || 'Project'}`;
                        // Deep-link directly to the weekly FMS review cell & comment for email + in-app navigation
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
                            console.error('❌ Error processing @mentions for weekly FMS review comment:', error);
                        });
                    }
                }
            } catch (error) {
                console.error('❌ Unexpected error in handleAddComment @mentions processing:', error);
                // Swallow errors so commenting UI never breaks due to notifications
            }
        } catch (error) {
            console.error('❌ Error in handleAddComment:', error);
            alert('Error adding comment. Please try again.');
        }
    };
    
    const handleDeleteComment = (sectionId, documentId, month, commentId) => {
        
        const currentUser = getCurrentUser();
        
        // Use current state (most up-to-date) or fallback to ref
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 
            ? sectionsByYear 
            : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        
        const section = currentYearSections.find(s => String(s.id) === String(sectionId));
        const doc = section?.documents.find(d => String(d.id) === String(documentId));
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
        
        const updated = currentYearSections.map(section => {
            if (String(section.id) === String(sectionId)) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
                        if (String(doc.id) === String(documentId)) {
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
        });
        
        const updatedSectionsByYear = {
            ...latestSectionsByYear,
            [selectedYear]: updated
        };
        
        // Update ref IMMEDIATELY before state update to prevent race conditions
        sectionsRef.current = updatedSectionsByYear;
        
        // Now update state (this will trigger auto-save)
        setSectionsByYear(updatedSectionsByYear);
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
    
    // Auto-scroll to bottom only when popup first opens (not on every render)
    // IMPORTANT: Only runs once when hoverCommentCell changes, and respects user scroll
    useEffect(() => {
        if (!hoverCommentCell) {
            // Reset flag when popup closes
            userHasScrolledRef.current = false;
            return;
        }
        
        const container = commentPopupContainerRef.current;
        if (!container) return;
        
        // Only auto-scroll to bottom if user hasn't manually scrolled
        if (!userHasScrolledRef.current) {
            // Use a longer delay to ensure scroll listener is set up first
            const timeoutId = setTimeout(() => {
                // Double-check conditions before scrolling
                const currentContainer = commentPopupContainerRef.current;
                if (currentContainer && !userHasScrolledRef.current) {
                    currentContainer.scrollTop = currentContainer.scrollHeight;
                }
            }, 150);
            
            return () => clearTimeout(timeoutId);
        }
    }, [hoverCommentCell]); // Only depend on hoverCommentCell - runs once when popup opens
    
    // Track manual scrolling to prevent auto-scroll from interfering
    useEffect(() => {
        const container = commentPopupContainerRef.current;
        if (!container || !hoverCommentCell) return;
        
        // Set up scroll listener immediately when popup opens
        const handleScroll = () => {
            // If user has manually scrolled away from bottom, mark it
            // Use a larger tolerance to catch scroll attempts
            const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 5;
            if (!isAtBottom) {
                userHasScrolledRef.current = true;
            } else if (isAtBottom) {
                // If user scrolls back to bottom, reset the flag to allow auto-scroll for new comments
                // But only after a small delay to avoid race conditions
                setTimeout(() => {
                    if (container.scrollHeight - container.scrollTop - container.clientHeight < 5) {
                        userHasScrolledRef.current = false;
                    }
                }, 100);
            }
        };
        
        container.addEventListener('scroll', handleScroll, { passive: true });
        
        return () => {
            container.removeEventListener('scroll', handleScroll);
        };
    }, [hoverCommentCell]);
    
    // Smart positioning for comment popup
    useEffect(() => {
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
    }, [hoverCommentCell, sections, commentPopupPosition]);
    
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
            // Only proceed if sections are loaded
            if (!sections || sections.length === 0) {
                return;
            }
            
            // Check both window.location.search (for regular URLs) and hash query params (for hash-based routing)
            let params = null;
            let deepSectionId = null;
            let deepDocumentId = null;
            let deepMonth = null;
            let deepCommentId = null;
            
            // First check hash query params (for hash-based routing like #/projects/123?docSectionId=...)
            const hash = window.location.hash || '';
            if (hash.includes('?')) {
                const hashParts = hash.split('?');
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
                const search = window.location.search || '';
                if (search) {
                    params = new URLSearchParams(search);
                    if (!deepSectionId) deepSectionId = params.get('docSectionId');
                    if (!deepDocumentId) deepDocumentId = params.get('docDocumentId');
                    if (!deepMonth) deepMonth = params.get('docMonth');
                    if (!deepCommentId) deepCommentId = params.get('commentId');
                }
            }
            
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
        } catch (error) {
            console.warn('⚠️ Failed to apply weekly FMS review deep-link:', error);
        }
    }, [sections]);
    
    // Check for deep link on mount and when sections load
    useEffect(() => {
        // Wait a bit for component to fully render
        const timer = setTimeout(() => {
            checkAndOpenDeepLink();
        }, 300);
        return () => clearTimeout(timer);
    }, [checkAndOpenDeepLink]);
    
    // Also listen for hash changes in case URL is updated after component mounts
    useEffect(() => {
        const handleHashChange = () => {
            setTimeout(() => {
                checkAndOpenDeepLink();
            }, 100);
        };
        
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
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
            description: editingSection?.description || '',
            reviewer: editingSection?.reviewer || ''
        });
        
        useEffect(() => {
            setFormData({
                name: editingSection?.name || '',
                description: editingSection?.description || '',
                reviewer: editingSection?.reviewer || ''
            });
        }, [editingSection]);
        
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
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Reviewer (Optional)</label>
                            <select
                                value={formData.reviewer || ''}
                                onChange={(e) => setFormData({...formData, reviewer: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                            >
                                <option value="">-- Select Reviewer --</option>
                                {users.map(user => (
                                    <option key={user.id} value={user.id}>
                                        {user.name || user.email}
                                    </option>
                                ))}
                            </select>
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
                                <p className="text-xs text-gray-600">Manage your weekly FMS review templates</p>
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
                    <p className="text-sm text-gray-600">Loading weekly FMS review tracker...</p>
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
                                <div ref={commentPopupContainerRef} className="max-h-32 overflow-y-auto space-y-2 mb-2 smooth-scroll">
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
                        <h1 className="text-lg font-semibold text-gray-900">Weekly FMS Review Tracker</h1>
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
                        aria-label="Select year for weekly FMS review tracker"
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
                    {statusOptions.map((option, idx) => (
                        <React.Fragment key={option.value}>
                            <div className="flex items-center gap-1">
                                <div className={`w-3 h-3 rounded ${option.cellColor}`}></div>
                                <span className="text-[10px] text-gray-600">{option.label}</span>
                            </div>
                            {idx < statusOptions.length - 1 && <i className="fas fa-arrow-right text-[8px] text-gray-400"></i>}
                        </React.Fragment>
                    ))}
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
                                <div className="flex items-center gap-2 flex-1">
                                    <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                    <div className="flex-1">
                                        <div className="font-semibold text-sm text-gray-900">{section.name}</div>
                                        {section.description && (
                                            <div className="text-[10px] text-gray-500">{section.description}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <label className="text-[10px] font-medium text-gray-600">Reviewer:</label>
                                        <select
                                            value={section.reviewer || ''}
                                            onChange={(e) => handleUpdateReviewer(section.id, e.target.value)}
                                            className="px-2 py-0.5 text-[10px] border border-gray-300 rounded bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                                            onClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            <option value="">-- Select --</option>
                                            {users.map(user => (
                                                <option key={user.id} value={user.id}>
                                                    {user.name || user.email}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
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
                                                            <div className="text-xs font-medium text-gray-900">{doc.name}</div>
                                                            {doc.description && (
                                                                <div className="text-[10px] text-gray-500">{doc.description}</div>
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
window.WeeklyFMSReviewTracker = WeeklyFMSReviewTracker;

// Export as default for ES6 modules
export default WeeklyFMSReviewTracker;
