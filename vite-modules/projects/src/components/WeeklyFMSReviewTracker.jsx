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

// Helper function to generate weeks for each month in a year
// Each month typically has 4-5 weeks
const generateWeeksForYear = (year) => {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const weeks = [];
    
    months.forEach((month, monthIndex) => {
        // Get number of days in the month
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        
        // Calculate number of weeks (typically 4-5 weeks per month)
        // Weeks are numbered 1-5, with most months having 4-5 weeks
        const numberOfWeeks = Math.ceil(daysInMonth / 7);
        const actualWeeks = Math.min(numberOfWeeks, 5); // Cap at 5 weeks
        
        for (let weekNumber = 1; weekNumber <= actualWeeks; weekNumber++) {
            // Calculate date range for this week
            // Week 1: days 1-7, Week 2: days 8-14, Week 3: days 15-21, Week 4: days 22-28, Week 5: remaining days
            const startDay = (weekNumber - 1) * 7 + 1;
            const endDay = Math.min(weekNumber * 7, daysInMonth);
            
            // For the first week of January, check if it should start from December
            // This handles cases like "W1 = 29 December to 4 Jan 2026"
            let startDate, endDate;
            if (monthIndex === 0 && weekNumber === 1) {
                // First week of January - check if we should start from December
                const daysInPrevMonth = new Date(year - 1, 11, 0).getDate();
                // If January doesn't start on the 1st of a week, start from December
                // For simplicity, if week 1 is less than 7 days, extend backwards
                if (endDay < 7) {
                    const daysFromPrevMonth = 7 - endDay;
                    startDate = new Date(year - 1, 11, daysInPrevMonth - daysFromPrevMonth + 1);
                } else {
                    startDate = new Date(year, monthIndex, startDay);
                }
                endDate = new Date(year, monthIndex, endDay);
            } else if (monthIndex === 11 && weekNumber === actualWeeks) {
                // Last week of December - extend into January if needed
                startDate = new Date(year, monthIndex, startDay);
                const daysInWeek = endDay - startDay + 1;
                if (daysInWeek < 7) {
                    // Extend into January
                    const daysToExtend = 7 - daysInWeek;
                    endDate = new Date(year + 1, 0, daysToExtend);
                } else {
                    endDate = new Date(year, monthIndex, endDay);
                }
            } else {
                // Regular weeks
                startDate = new Date(year, monthIndex, startDay);
                endDate = new Date(year, monthIndex, endDay);
            }
            
            // Determine end month and year
            let endMonth = months[endDate.getMonth()];
            let endYear = endDate.getFullYear();
            
            // Format dates
            const formatDate = (date) => {
                const day = date.getDate();
                const monthName = months[date.getMonth()];
                return `${day} ${monthName}`;
            };
            
            const dateRange = startDate.getTime() === endDate.getTime()
                ? formatDate(startDate)
                : `${formatDate(startDate)} to ${endDate.getDate()} ${endMonth}${endYear !== year ? ` ${endYear}` : ''}`;
            
            weeks.push({
                month,
                monthIndex,
                weekNumber,
                key: `${month}-Week${weekNumber}-${year}`,
                display: `W${weekNumber}`,
                dateRange: dateRange,
                startDate: startDate,
                endDate: endDate
            });
        }
    });
    
    return weeks;
};

const WeeklyFMSReviewTracker = ({ project, onBack }) => {
    console.log('🚀 WeeklyFMSReviewTracker component mounted/rendered', {
        projectId: project?.id,
        hasProject: !!project,
        hasWeeklyFMSReviewSections: !!project?.weeklyFMSReviewSections
    });
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    const currentWeek = Math.ceil(new Date().getDate() / 7); // Approximate current week
    
    // Calculate working weeks (2 weeks in arrears from current week)
    const getWorkingWeeks = () => {
        const weeks = generateWeeksForYear(currentYear);
        const currentWeekIndex = weeks.findIndex(w => 
            w.monthIndex === currentMonth && w.weekNumber === currentWeek
        );
        
        if (currentWeekIndex === -1) return [];
        
        const twoWeeksBack = Math.max(0, currentWeekIndex - 2);
        const oneWeekBack = Math.max(0, currentWeekIndex - 1);
        
        return [twoWeeksBack, oneWeekBack];
    };
    
    const workingWeeks = getWorkingWeeks();
    const saveTimeoutRef = useRef(null);
    const isSavingRef = useRef(false);
    const previousProjectIdRef = useRef(project?.id);
    const hasLoadedInitialDataRef = useRef(false);
    const sectionsRef = useRef({});
    const lastSavedSnapshotRef = useRef('{}');
    const apiRef = useRef(window.DocumentCollectionAPI || null);
    const isDeletingRef = useRef(false);
    const deletionTimestampRef = useRef(null); // Track when deletion started
    const deletionSectionIdsRef = useRef(new Set()); // Track which section IDs are being deleted
    const deletionQueueRef = useRef([]); // Queue for consecutive deletions
    const isProcessingDeletionQueueRef = useRef(false); // Track if we're processing the queue
    const lastChangeTimestampRef = useRef(0); // Track when last status change was made
    const refreshTimeoutRef = useRef(null); // Track pending refresh timeout
    const forceSaveTimeoutRef = useRef(null); // Track forced save timeout for rapid changes
    const sectionScrollRefs = useRef({}); // Track scroll containers for each section
    const isScrollingRef = useRef(false); // Flag to prevent infinite scroll loops
    const hasScrolledToCurrentMonthRef = useRef(false); // Flag to prevent auto-scroll on every change
    
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
    
    // Generate weeks for the selected year (must be after selectedYear is declared)
    const weeks = React.useMemo(() => generateWeeksForYear(selectedYear), [selectedYear]);
    
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

        // LEGACY MODE:
        // For flat sections arrays (no per‑year map yet), scope them ONLY to the
        // active/fallback year instead of cloning across all inferred years.
        // Cloning across inferred years caused edits in one year to appear in all years.
        const baseSections = Array.isArray(parsedValue) ? parsedValue : parseSections(parsedValue);
        const targetYear = fallbackYear || new Date().getFullYear();
        if (!targetYear) {
            return {};
        }

        return {
            [targetYear]: cloneSectionsArray(baseSections)
        };
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
        // CRITICAL: Update timestamp when sections change so save logic can detect changes
        lastChangeTimestampRef.current = Date.now();
        
        setSectionsByYear(prev => {
            const prevForYear = prev[selectedYear] || [];
            const nextForYear = typeof updater === 'function'
                ? updater(prevForYear)
                : (updater || []);
            
            const updated = {
                ...prev,
                [selectedYear]: nextForYear
            };
            
            // CRITICAL: Keep ref in sync immediately so save functions have latest data
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
    const [commentAttachments, setCommentAttachments] = useState([]);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    
    // Multi-select state: Set of cell keys (sectionId-documentId-month-WeekN)
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
        
        console.log('📥 Loading weekly review sections from project prop...', {
            projectId: project.id,
            hasWeeklyFMSReviewSections: !!project.weeklyFMSReviewSections,
            hasDocumentSections: !!project.documentSections,
            weeklyFMSReviewSectionsType: typeof project.weeklyFMSReviewSections,
            weeklyFMSReviewSectionsLength: project.weeklyFMSReviewSections?.length || 0
        });
        
        setIsLoading(true);
        try {
            const snapshotKey = getSnapshotKey(project.id);
            const normalizedFromProp = normalizeSectionsByYear(project.weeklyFMSReviewSections || project.documentSections);
            const propYearKeys = Object.keys(normalizedFromProp || {});
            const propHasData = propYearKeys.length > 0 && 
                propYearKeys.some(year => {
                    const yearSections = normalizedFromProp[year] || [];
                    return Array.isArray(yearSections) && yearSections.length > 0;
                });
            
            console.log('📥 Normalized from prop:', {
                propYearKeys,
                propHasData,
                sectionCounts: propYearKeys.reduce((acc, year) => {
                    acc[year] = (normalizedFromProp[year] || []).length;
                    return acc;
                }, {})
            });
            
            let normalized = normalizedFromProp;
            
            // CRITICAL: Always check localStorage as backup, even if prop has data
            // This ensures we don't lose data if the prop hasn't been refreshed yet
            // Optimized: Only check localStorage if prop has no data or use requestIdleCallback for non-blocking
            if (snapshotKey && window.localStorage) {
                try {
                    // If prop has data, defer localStorage check to avoid blocking
                    if (propHasData) {
                        // Use requestIdleCallback to check localStorage without blocking
                        const checkLocalStorage = () => {
                            try {
                                const snapshotString = window.localStorage.getItem(snapshotKey);
                                if (snapshotString) {
                                    const snapshotParsed = JSON.parse(snapshotString);
                                    const snapshotMap = normalizeSectionsByYear(snapshotParsed);
                                    const snapshotYears = Object.keys(snapshotMap || {});
                                    const snapshotSectionCount = snapshotYears.reduce((sum, year) => 
                                        sum + ((snapshotMap[year] || []).length), 0
                                    );
                                    const propSectionCount = propYearKeys.reduce((sum, year) => 
                                        sum + ((normalizedFromProp[year] || []).length), 0
                                    );
                                    
                                    if (snapshotSectionCount > propSectionCount) {
                                        setSectionsByYear(snapshotMap);
                                        lastSavedSnapshotRef.current = serializeSections(snapshotMap);
                                        console.log('💾 Using localStorage (has more sections)', {
                                            propCount: propSectionCount,
                                            snapshotCount: snapshotSectionCount
                                        });
                                    }
                                }
                            } catch (e) {
                                // Silently fail - prop data is already loaded
                            }
                        };
                        
                        if (typeof requestIdleCallback !== 'undefined') {
                            requestIdleCallback(checkLocalStorage, { timeout: 100 });
                        } else {
                            setTimeout(checkLocalStorage, 0);
                        }
                    } else {
                        // Prop is empty, check localStorage immediately (synchronous)
                        const snapshotString = window.localStorage.getItem(snapshotKey);
                        if (snapshotString) {
                            const snapshotParsed = JSON.parse(snapshotString);
                            const snapshotMap = normalizeSectionsByYear(snapshotParsed);
                            const snapshotYears = Object.keys(snapshotMap || {});
                            const snapshotHasData = snapshotYears.length > 0 &&
                                snapshotYears.some(year => {
                                    const yearSections = snapshotMap[year] || [];
                                    return Array.isArray(yearSections) && yearSections.length > 0;
                                });
                            
                            if (snapshotHasData) {
                                normalized = snapshotMap;
                                console.log('💾 Restored from localStorage (prop was empty)', {
                                    snapshotYears,
                                    sectionsCount: snapshotYears.reduce((sum, year) => 
                                        sum + (snapshotMap[year]?.length || 0), 0
                                    )
                                });
                            }
                        }
                    }
                } catch (snapshotError) {
                    console.warn('⚠️ Failed to restore document collection snapshot from localStorage:', snapshotError);
                }
            }
            
            const finalYearKeys = Object.keys(normalized || {});
            const finalSectionCount = finalYearKeys.reduce((sum, year) => 
                sum + ((normalized[year] || []).length), 0
            );
            
            console.log('📥 Final loaded data:', {
                finalYearKeys,
                finalSectionCount,
                source: normalized === normalizedFromProp ? 'prop' : 'localStorage'
            });
            
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
    }, [project?.weeklyFMSReviewSections, project?.documentSections, project?.id]);
    
    const refreshFromDatabase = useCallback(async (forceUpdate = false) => {
        if (!project?.id || !apiRef.current) return;
        
        // Don't refresh if a save is in progress to avoid race conditions
        if (isSavingRef.current && !forceUpdate) {
            console.log('⏸️ Refresh skipped: save in progress');
            return;
        }
        
        // Don't refresh if user made changes recently (within last 15 seconds)
        // This prevents overwriting rapid consecutive changes
        // Increased from 5 seconds to 15 seconds to better handle rapid consecutive changes
        const timeSinceLastChange = Date.now() - lastChangeTimestampRef.current;
        if (!forceUpdate && timeSinceLastChange < 15000) {
            console.log('⏸️ Refresh skipped: recent changes detected (will not overwrite)', {
                timeSinceLastChange: `${timeSinceLastChange}ms`
            });
            return;
        }
        
        // Also check if there are unsaved changes - don't refresh if user is still editing
        // This provides additional protection even if the timestamp check passes
        // BUT: Allow refresh if currentSnapshot is empty (fresh load, not editing)
        const currentSnapshot = serializeSections(sectionsRef.current);
        const isEmptySnapshot = currentSnapshot === '{}' || currentSnapshot === '';
        const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;
        if (!forceUpdate && hasUnsavedChanges && !isEmptySnapshot && timeSinceLastChange < 20000) {
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
            const freshProject = await apiRef.current.fetchProject(project.id);
            const snapshotKey = getSnapshotKey(project.id);
            const normalizedFromDb = normalizeSectionsByYear(freshProject?.weeklyFMSReviewSections || freshProject?.documentSections);
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
            if (freshYearSections.length > currentYearSections.length && currentYearSections.length > 0) {
                const timeSinceDeletion = deletionTimestampRef.current ? Date.now() - deletionTimestampRef.current : Infinity;
                // Only block if deletion happened recently (within last 10 seconds)
                if (timeSinceDeletion < 10000) {
                    console.log('⏸️ Refresh skipped: database has more sections than current state (deletion likely in progress)', {
                        current: currentYearSections.length,
                        database: freshYearSections.length,
                        timeSinceDeletion: `${timeSinceDeletion}ms`
                    });
                    return;
                }
            }
                
                // CRITICAL: Never update if we have unsaved local changes, regardless of snapshot matching
                // This prevents overwriting local changes before they're saved to the database
                // The only exception is forceUpdate, which should only be used after a successful save
                // ALSO: Allow refresh if currentSnapshot is empty (fresh load, not editing)
                const isEmptySnapshot = currentSnapshot === '{}' || currentSnapshot === '';
                if (hasUnsavedChanges && !forceUpdate && !isEmptySnapshot) {
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
                    if (!isDeletingRef.current || forceUpdate) {
                        setSectionsByYear(normalized);
                        // Update snapshot reference to match database state
                        if (freshSnapshot === lastSavedSnapshotRef.current || !hasUnsavedChanges) {
                            lastSavedSnapshotRef.current = freshSnapshot;
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
        
        refreshFromDatabase();
    }, [project?.id, project?.weeklyFMSReviewSections, project?.documentSections, loadFromProjectProp, refreshFromDatabase]);
    
    // ============================================================
    // POLLING - Regularly refresh from database to get updates
    // ============================================================
    useEffect(() => {
        if (!project?.id || !apiRef.current) return;
        
        // Poll every 5 seconds to check for database updates
        const pollInterval = setInterval(() => {
            refreshFromDatabase(false);
        }, 5000);
        
        return () => {
            clearInterval(pollInterval);
        };
    }, [project?.id, refreshFromDatabase]);
    
    // ============================================================
    // Handle navigation with save - ensures data is saved before navigating away
    const handleBackWithSave = useCallback(async () => {
        // Check if there are unsaved changes
        const hasUnsavedChanges = serializeSections(sectionsRef.current) !== lastSavedSnapshotRef.current;
        
        if (hasUnsavedChanges && !isSavingRef.current && project?.id) {
            // Clear any pending debounced saves
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            
            // Save immediately before navigating
            console.log('💾 Saving before navigation...');
            try {
                await saveToDatabase({ skipParentUpdate: true });
                console.log('✅ Save complete, navigating...');
            } catch (error) {
                console.error('❌ Error saving before navigation:', error);
                // Still navigate even if save fails - unmount handler will try again
            }
        }
        
        // Call original onBack handler
        if (typeof onBack === 'function') {
            onBack();
        }
    }, [project?.id, onBack]);
    
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
        
        // CRITICAL: Prevent saving empty state if we never had data (would overwrite existing data)
        // Only allow empty save if lastSavedSnapshot was also empty (user explicitly deleted everything)
        const lastSnapshotWasEmpty = !lastSavedSnapshotRef.current || 
                                     lastSavedSnapshotRef.current === '{}' || 
                                     lastSavedSnapshotRef.current === '[]';
        
        if (!hasAnySections && serialized === lastSavedSnapshotRef.current) {
            // No changes, skip save
            return;
        }
        
        if (!hasAnySections && !lastSnapshotWasEmpty) {
            // Trying to save empty state when we previously had data - this would wipe existing data!
            // Only allow if user explicitly deleted sections (indicated by sectionsRef being explicitly set to empty)
            // For safety, check if we're in a state where data might have been lost
            console.warn('⚠️ Prevented saving empty state that would overwrite existing data', {
                projectId: project.id,
                lastSnapshot: lastSavedSnapshotRef.current?.substring(0, 100),
                currentSerialized: serialized?.substring(0, 100)
            });
            return;
        }

        isSavingRef.current = true;
        
        try {
            
            if (apiRef.current && typeof apiRef.current.saveWeeklyFMSReviewSections === 'function') {
                await apiRef.current.saveWeeklyFMSReviewSections(project.id, payload, options.skipParentUpdate);
            } else if (apiRef.current && typeof apiRef.current.saveDocumentSections === 'function') {
                // Fallback to documentSections API if weeklyFMSReviewSections API doesn't exist
                await apiRef.current.saveDocumentSections(project.id, payload, options.skipParentUpdate);
            } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                const serialized = serializeSections(payload);
                const updatePayload = {
                    weeklyFMSReviewSections: serialized
                };
                const result = await window.DatabaseAPI.updateProject(project.id, updatePayload);
                
                // Update parent component's project prop if available and not skipping
                if (!options.skipParentUpdate && window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                    const updatedProject = result?.data?.project || result?.project || result?.data;
                    if (updatedProject) {
                        window.updateViewingProject({
                            ...updatedProject,
                            weeklyFMSReviewSections: serialized
                        });
                    }
                }
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
                // CRITICAL: Save synchronously on unmount to prevent data loss during navigation
                // Use both localStorage (immediate) and fetch with keepalive (continues after navigation)
                const payload = sectionsRef.current || {};
                const serialized = serializeSections(payload);
                
                // 1. Save to localStorage immediately (synchronous)
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        window.localStorage.setItem(snapshotKey, serialized);
                        console.log('💾 Saved weekly review snapshot to localStorage on unmount');
                    } catch (storageError) {
                        console.warn('⚠️ Failed to save weekly review snapshot to localStorage:', storageError);
                    }
                }
                
                // 2. Send to API with keepalive (continues after page unloads)
                try {
                    const token = window.storage?.getToken?.();
                    if (token && window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                        // Use fetch with keepalive to ensure request continues after navigation
                        fetch(`/api/projects/${project.id}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                weeklyFMSReviewSections: serialized
                            }),
                            keepalive: true // Critical: allows request to continue after page unloads
                        }).catch(error => {
                            console.warn('⚠️ Background save on unmount failed (non-critical):', error);
                        });
                        console.log('💾 Initiated background save on unmount');
                    }
                } catch (error) {
                    console.warn('⚠️ Failed to initiate background save on unmount:', error);
                }
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
            
            const response = await fetch('/api/weekly-fms-review-templates', {
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
                const response = await fetch(`/api/weekly-fms-review-templates/${editingTemplate.id}`, {
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
                const response = await fetch('/api/weekly-fms-review-templates', {
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
            const response = await fetch(`/api/weekly-fms-review-templates/${encodeURIComponent(templateId)}`, {
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
    
    // Create a week key scoped to the selected year
    const getWeekKey = (month, weekNumber, year = selectedYear) => {
        return `${month}-Week${weekNumber}-${year}`;
    };
    
    // Get status for a specific week in the selected year only
    const getStatusForYear = (collectionStatus, month, weekNumber, year = selectedYear) => {
        if (!collectionStatus) return null;
        const weekKey = getWeekKey(month, weekNumber, year);
        const status = collectionStatus[weekKey] || null;
        
        // Migrate old status values to new ones
        if (status) {
            const statusMigration = {
                'not-collected': 'not-checked',
                'ongoing': 'acceptable',
                'collected': 'acceptable',
                'unavailable': 'not-checked'
            };
            
            if (statusMigration[status]) {
                // Auto-migrate: update the status in the data structure
                const migratedStatus = statusMigration[status];
                if (collectionStatus[weekKey] !== migratedStatus) {
                    collectionStatus[weekKey] = migratedStatus;
                    // Trigger a save to persist the migration
                    setTimeout(() => saveToDatabase({ skipParentUpdate: true }), 100);
                }
                return migratedStatus;
            }
        }
        
        return status;
    };
    
    // Get comments for a specific week in the selected year only
    const getCommentsForYear = (comments, month, weekNumber, year = selectedYear) => {
        if (!comments) return [];
        const weekKey = getWeekKey(month, weekNumber, year);
        return comments[weekKey] || [];
    };
    
    // Set status for a specific week in the selected year only
    const setStatusForYear = (collectionStatus, month, weekNumber, status, year = selectedYear) => {
        const weekKey = getWeekKey(month, weekNumber, year);
        return {
            ...collectionStatus,
            [weekKey]: status
        };
    };
    
    // Set comments for a specific week in the selected year only
    const setCommentsForYear = (comments, month, weekNumber, newComments, year = selectedYear) => {
        const weekKey = getWeekKey(month, weekNumber, year);
        return {
            ...comments,
            [weekKey]: newComments
        };
    };
    
    // ============================================================
    // STATUS OPTIONS
    // ============================================================
    
    const statusOptions = [
        { value: 'not-checked', label: 'Not Checked', color: 'bg-gray-300 text-white font-semibold', cellColor: 'bg-gray-300 border-l-4 border-gray-500 shadow-sm' },
        { value: 'acceptable', label: 'Acceptable', color: 'bg-green-400 text-white font-semibold', cellColor: 'bg-green-400 border-l-4 border-green-500 shadow-sm' },
        { value: 'issue', label: 'Issue', color: 'bg-red-400 text-white font-semibold', cellColor: 'bg-red-400 border-l-4 border-red-500 shadow-sm' }
    ];
    
    const getStatusConfig = (status) => {
        // Migrate old status values to new ones
        const statusMigration = {
            'not-collected': 'not-checked',
            'ongoing': 'acceptable',
            'collected': 'acceptable',
            'unavailable': 'not-checked'
        };
        
        // If status is an old value, migrate it
        if (status && statusMigration[status]) {
            console.log(`🔄 Migrating old status "${status}" to "${statusMigration[status]}"`);
            return statusOptions.find(opt => opt.value === statusMigration[status]) || statusOptions[0];
        }
        
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
    
    const handleSaveSection = async (sectionData) => {
        // Calculate the new state before updating
        let updatedSectionsByYear = { ...sectionsByYear };
        const currentYearSections = updatedSectionsByYear[selectedYear] || [];
        
        if (editingSection) {
            updatedSectionsByYear[selectedYear] = currentYearSections.map(s => 
                s.id === editingSection.id ? { ...s, ...sectionData } : s
            );
        } else {
            const newSection = {
                id: Date.now(),
                ...sectionData,
                documents: []
            };
            updatedSectionsByYear[selectedYear] = [...currentYearSections, newSection];
        }
        
        // Update state
        setSectionsByYear(updatedSectionsByYear);
        // CRITICAL: Update ref immediately so save has the latest data
        sectionsRef.current = updatedSectionsByYear;
        // Update timestamp
        lastChangeTimestampRef.current = Date.now();
        
        setShowSectionModal(false);
        setEditingSection(null);
        
        // CRITICAL: Force immediate save when adding/editing sections to prevent data loss
        // Clear any pending debounced save and save immediately
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        
        // Save immediately with the calculated state - AWAIT to ensure it completes
        if (project?.id && !isSavingRef.current) {
            const serialized = serializeSections(updatedSectionsByYear);
            
            // CRITICAL: Save to localStorage immediately as backup
            const snapshotKey = getSnapshotKey(project.id);
            if (snapshotKey && window.localStorage) {
                try {
                    window.localStorage.setItem(snapshotKey, serialized);
                    console.log('💾 Section change saved to localStorage immediately', {
                        hasData: Object.keys(updatedSectionsByYear).length > 0,
                        yearKeys: Object.keys(updatedSectionsByYear),
                        sectionCount: updatedSectionsByYear[selectedYear]?.length || 0
                    });
                } catch (storageError) {
                    console.warn('⚠️ Failed to save section to localStorage:', storageError);
                }
            }
            
            // Save to database immediately using API service - AWAIT to ensure parent update completes
            isSavingRef.current = true;
            try {
                console.log('💾 Saving weekly review sections to database...', {
                    projectId: project.id,
                    serializedLength: serialized.length,
                    hasData: Object.keys(updatedSectionsByYear).length > 0,
                    yearKeys: Object.keys(updatedSectionsByYear)
                });
                
                // Use API service first (like Document Collection) - this handles parent updates automatically
                if (apiRef.current && typeof apiRef.current.saveWeeklyFMSReviewSections === 'function') {
                    const result = await apiRef.current.saveWeeklyFMSReviewSections(project.id, updatedSectionsByYear, false);
                    console.log('✅ Saved via API service (with parent update)', { result: !!result });
                } else if (apiRef.current && typeof apiRef.current.saveDocumentSections === 'function') {
                    // Fallback to documentSections API if weeklyFMSReviewSections API doesn't exist
                    // NOTE: This will save to documentSections field, not weeklyFMSReviewSections!
                    console.warn('⚠️ Using documentSections API fallback - data will be saved to wrong field!');
                    await apiRef.current.saveDocumentSections(project.id, updatedSectionsByYear, false);
                    console.log('✅ Saved via documentSections API (fallback)');
                } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                    console.log('⚠️ API service not available, using direct DatabaseAPI call');
                    // Final fallback - direct API call with manual parent update
                    const updatePayload = {
                        weeklyFMSReviewSections: serialized
                    };
                    const result = await window.DatabaseAPI.updateProject(project.id, updatePayload);
                    
                    // Update parent component's project prop so it has the latest data
                    if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                        const updatedProject = result?.data?.project || result?.project || result?.data;
                        if (updatedProject) {
                            window.updateViewingProject({
                                ...updatedProject,
                                weeklyFMSReviewSections: serialized
                            });
                            console.log('✅ Project prop updated with new sections');
                        }
                    }
                } else {
                    console.error('❌ No available API for saving weekly review sections');
                }
                
                // Update lastSavedSnapshot AFTER successful save
                lastSavedSnapshotRef.current = serialized;
            } catch (error) {
                console.error('❌ Error saving section to database:', error);
            } finally {
                isSavingRef.current = false;
            }
        }
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
                
                if (apiRef.current && typeof apiRef.current.saveWeeklyFMSReviewSections === 'function') {
                    await apiRef.current.saveWeeklyFMSReviewSections(project.id, payload, false);
                } else if (apiRef.current && typeof apiRef.current.saveDocumentSections === 'function') {
                    // Fallback to documentSections API if weeklyFMSReviewSections API doesn't exist
                    await apiRef.current.saveDocumentSections(project.id, payload, false);
                } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                    const serialized = serializeSections(payload);
                    const updatePayload = {
                        weeklyFMSReviewSections: serialized
                    };
                    const result = await window.DatabaseAPI.updateProject(project.id, updatePayload);
                    
                    // Update parent component's project prop
                    if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                        const updatedProject = result?.data?.project || result?.project || result?.data;
                        if (updatedProject) {
                            window.updateViewingProject({
                                ...updatedProject,
                                weeklyFMSReviewSections: serialized
                            });
                        }
                    }
                } else {
                    throw new Error('No available API for saving document sections');
                }
                
                // Snapshot already updated above, just confirm it matches
                lastSavedSnapshotRef.current = deletedSectionSnapshot;
                
                console.log('✅ Section deletion saved successfully');
                
                // Remove from deletion tracking
                deletionSectionIdsRef.current.delete(normalizedSectionId);
                
                // Clear the deleting flag after successful save - wait longer to ensure DB save completes
                // Increased from 500ms to 3000ms to give database more time to persist
                // Only clear flag if no other deletions are in progress
                setTimeout(() => {
                    if (deletionSectionIdsRef.current.size === 0) {
                        isDeletingRef.current = false;
                        deletionTimestampRef.current = null;
                        console.log('✅ Deletion flag cleared, polling can resume');
                    } else {
                        console.log(`⏸️ Deletion flag kept active: ${deletionSectionIdsRef.current.size} deletion(s) still in progress`);
                    }
                    // Trigger a single refresh after flag is cleared to sync state
                    refreshFromDatabase(false);
                    // Process next deletion in queue if any
                    processDeletionQueue();
                }, 3000);
                
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
        
        const document = section.documents.find(d => String(d.id) === normalizedDocumentId);
        if (!document) {
            console.error('❌ Document not found for deletion. Document ID:', documentId, 'Section:', section.name);
            alert(`Error: Document not found. Cannot delete.`);
            return;
        }
        
        if (!confirm(`Delete document "${document.name}"?`)) {
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
    
    const handleUpdateStatus = useCallback((sectionId, documentId, month, weekNumber, status, applyToSelected = false) => {
        // Preserve scroll positions before update to prevent page shifting
        const scrollPositions = new Map();
        Object.entries(sectionScrollRefs.current).forEach(([sectionId, container]) => {
            if (container) {
                scrollPositions.set(sectionId, {
                    scrollLeft: container.scrollLeft,
                    scrollTop: container.scrollTop
                });
            }
        });
        const mainScrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const mainScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
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
            // Parse all selected cell keys (format: sectionId-documentId-month-WeekN)
            cellsToUpdate = Array.from(currentSelectedCells).map(cellKey => {
                const parts = cellKey.split('-');
                // Find where "Week" appears to split month and week number
                const weekIndex = parts.findIndex(p => p.startsWith('Week'));
                if (weekIndex > 0) {
                    const secId = parts[0];
                    const docId = parts[1];
                    const month = parts.slice(2, weekIndex).join('-');
                    const weekNum = parts[weekIndex].replace('Week', '');
                    return { sectionId: secId, documentId: docId, month, weekNumber: weekNum };
                }
                // Fallback for old format
                const [secId, docId, mon] = cellKey.split('-');
                return { sectionId: secId, documentId: docId, month: mon, weekNumber: '1' };
            });
        } else {
            // Just update the single cell
            cellsToUpdate = [{ sectionId, documentId, month, weekNumber }];
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
                    
                    // Apply status to all matching weeks for this document
                    let updatedStatus = doc.collectionStatus || {};
                    docUpdates.forEach(cell => {
                        updatedStatus = setStatusForYear(updatedStatus, cell.month, cell.weekNumber, status, selectedYear);
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
        
        // Restore scroll positions after state update to prevent page shifting
        // Use multiple requestAnimationFrame calls to ensure DOM has fully updated
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Temporarily disable scroll sync during restoration
                isScrollingRef.current = true;
                
                scrollPositions.forEach((pos, sectionId) => {
                    const container = sectionScrollRefs.current[sectionId];
                    if (container) {
                        container.scrollLeft = pos.scrollLeft;
                        container.scrollTop = pos.scrollTop;
                    }
                });
                
                // Restore main window scroll position - use multiple methods for reliability
                try {
                    window.scrollTo({
                        left: mainScrollLeft,
                        top: mainScrollTop,
                        behavior: 'auto' // Use 'auto' for better compatibility
                    });
                } catch (e) {
                    window.scrollTo(mainScrollLeft, mainScrollTop);
                }
                
                // Also set directly as fallback to ensure it works
                if (document.documentElement) {
                    document.documentElement.scrollLeft = mainScrollLeft;
                    document.documentElement.scrollTop = mainScrollTop;
                }
                if (document.body) {
                    document.body.scrollLeft = mainScrollLeft;
                    document.body.scrollTop = mainScrollTop;
                }
                
                // Re-enable scroll sync after restoration
                setTimeout(() => {
                    isScrollingRef.current = false;
                }, 100);
            });
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
    
    const handleAddComment = async (sectionId, documentId, month, weekNumber, commentText) => {
        if (!commentText.trim() && commentAttachments.length === 0) return;
        
        const currentUser = getCurrentUser();
        const newCommentId = Date.now();
        const newComment = {
            id: newCommentId,
            text: commentText || '',
            date: new Date().toISOString(),
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id,
            attachments: commentAttachments.length > 0 ? [...commentAttachments] : []
        };
        
        setSections(prev => prev.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
                        if (doc.id === documentId) {
                            const existingComments = getCommentsForYear(doc.comments, month, weekNumber, selectedYear);
                            return {
                                ...doc,
                                comments: setCommentsForYear(doc.comments || {}, month, weekNumber, [...existingComments, newComment], selectedYear)
                            };
                        }
                        return doc;
                    })
                };
            }
            return section;
        }));
        
        setQuickComment('');
        setCommentAttachments([]); // Clear attachments after adding comment

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
                    const contextLink = `#/projects/${project?.id || ''}?weeklySectionId=${encodeURIComponent(sectionId)}&weeklyDocumentId=${encodeURIComponent(documentId)}&weeklyMonth=${encodeURIComponent(month)}&weeklyWeek=${encodeURIComponent(weekNumber)}&commentId=${encodeURIComponent(newCommentId)}`;
                    const projectInfo = {
                        projectId: project?.id,
                        projectName: project?.name,
                        sectionId,
                        documentId,
                        month,
                        weekNumber,
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
    
    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        setIsUploadingAttachment(true);
        
        try {
            const uploadPromises = files.map(async (file) => {
                // Check file size (8MB max)
                const MAX_SIZE = 8 * 1024 * 1024;
                if (file.size > MAX_SIZE) {
                    alert(`File "${file.name}" is too large. Maximum size is 8MB.`);
                    return null;
                }
                
                // Convert file to base64 data URL
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            const dataUrl = event.target.result;
                            
                            // Upload to server
                            const token = window.storage?.getToken?.();
                            if (!token) {
                                reject(new Error('Not authenticated'));
                                return;
                            }
                            
                            const response = await fetch('/api/files', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({
                                    name: file.name,
                                    dataUrl: dataUrl,
                                    folder: 'weekly-fms-comments'
                                })
                            });
                            
                            if (!response.ok) {
                                const error = await response.json();
                                reject(new Error(error.message || 'Upload failed'));
                                return;
                            }
                            
                            const result = await response.json();
                            resolve({
                                id: Date.now() + Math.random(),
                                name: result.name || file.name,
                                url: result.url,
                                size: result.size || file.size,
                                type: result.mimeType || file.type,
                                uploadDate: new Date().toISOString()
                            });
                        } catch (error) {
                            reject(error);
                        }
                    };
                    reader.onerror = () => reject(new Error('Failed to read file'));
                    reader.readAsDataURL(file);
                });
            });
            
            const uploadedFiles = await Promise.all(uploadPromises);
            const validFiles = uploadedFiles.filter(f => f !== null);
            
            if (validFiles.length > 0) {
                setCommentAttachments(prev => [...prev, ...validFiles]);
            }
        } catch (error) {
            console.error('❌ Error uploading file:', error);
            alert(`Failed to upload file: ${error.message}`);
        } finally {
            setIsUploadingAttachment(false);
            // Reset file input
            e.target.value = '';
        }
    };
    
    const handleRemoveAttachment = (attachmentId) => {
        setCommentAttachments(prev => prev.filter(a => a.id !== attachmentId));
    };
    
    const handleDeleteComment = (sectionId, documentId, month, weekNumber, commentId) => {
        const currentUser = getCurrentUser();
        const section = sections.find(s => s.id === sectionId);
        const document = section?.documents.find(d => d.id === documentId);
        const existingComments = getCommentsForYear(document?.comments, month, weekNumber, selectedYear);
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
                                comments: setCommentsForYear(doc.comments || {}, month, weekNumber, updatedComments, selectedYear)
                            };
                        }
                        return doc;
                    })
                };
            }
            return section;
        }));
    };
    
    const getDocumentStatus = (document, month, weekNumber) => {
        return getStatusForYear(document.collectionStatus, month, weekNumber, selectedYear);
    };
    
    const getDocumentComments = (document, month, weekNumber) => {
        return getCommentsForYear(document.comments, month, weekNumber, selectedYear);
    };
    
    // ============================================================
    // DRAG AND DROP
    // ============================================================
    
    const handleSectionDragStart = (e, section, index) => {
        setDraggedSection({ section, index });
        e.dataTransfer.effectAllowed = 'move';
        const target = e.currentTarget;
        if (target) {
            setTimeout(() => {
                if (target && target.style) {
                    target.style.opacity = '0.5';
                }
            }, 0);
        }
    };
    
    const handleSectionDragEnd = (e) => {
        if (e.currentTarget && e.currentTarget.style) {
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
            
            weeks.forEach(week => {
                const weekLabel = `${week.month.slice(0, 3)} ${week.display}`;
                headerRow1.push(weekLabel, '');
                headerRow2.push('Status', 'Comments');
            });
            
            excelData.push(headerRow1, headerRow2);
            
            sections.forEach(section => {
                const sectionRow = [section.name];
                for (let i = 0; i < weeks.length * 2; i++) sectionRow.push('');
                excelData.push(sectionRow);
                
                section.documents.forEach(document => {
                    const row = [`  ${document.name}${document.description ? ' - ' + document.description : ''}`];
                    
                    weeks.forEach(week => {
                        const status = getStatusForYear(document.collectionStatus, week.month, week.weekNumber, selectedYear);
                        const statusLabel = status ? statusOptions.find(s => s.value === status)?.label : '';
                        row.push(statusLabel || '');
                        
                        const comments = getCommentsForYear(document.comments, week.month, week.weekNumber, selectedYear);
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
            for (let i = 0; i < weeks.length; i++) {
                colWidths.push({ wch: 18 }, { wch: 50 });
            }
            ws['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(wb, ws, `Weekly FMS Review ${selectedYear}`);
            
            const filename = `${project.name}_Weekly_FMS_Review_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, filename);
            
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Failed to export: ' + error.message);
        } finally {
            setIsExporting(false);
        }
    };
    
    // (Per-section tables now scroll independently, so we skip auto-scroll to working months)
    
    // Synchronize horizontal scrolling across all sections - SIMPLE AND RELIABLE
    useEffect(() => {
        if (sections.length === 0) return;
        
        // Wait a bit for refs to be populated
        let scrollHandlers = new Map();
        let timeoutId = setTimeout(() => {
            const scrollContainers = Object.values(sectionScrollRefs.current).filter(Boolean);
            if (scrollContainers.length === 0) return;
            
            scrollContainers.forEach(sourceContainer => {
                const handleScroll = () => {
                    // Skip if we're already syncing (prevents infinite loops)
                    if (isScrollingRef.current) return;
                    
                    isScrollingRef.current = true;
                    const scrollLeft = sourceContainer.scrollLeft;
                    
                    // Update all other containers synchronously for immediate sync
                    scrollContainers.forEach(container => {
                        if (container !== sourceContainer && container) {
                            container.scrollLeft = scrollLeft;
                        }
                    });
                    
                    // Reset flag after a short delay
                    setTimeout(() => {
                        isScrollingRef.current = false;
                    }, 10);
                };
                
                scrollHandlers.set(sourceContainer, handleScroll);
                sourceContainer.addEventListener('scroll', handleScroll, { passive: true });
            });
        }, 100);
        
        // Cleanup function
        return () => {
            clearTimeout(timeoutId);
            scrollHandlers.forEach((handler, container) => {
                container.removeEventListener('scroll', handler);
            });
        };
    }, [sections.length]);
    
    // Scroll to current month on initial load ONLY - not on every change
    useEffect(() => {
        if (isLoading || sections.length === 0) return;
        
        // Only scroll once on initial load, not on every change
        if (hasScrolledToCurrentMonthRef.current) return;
        
        // Only scroll if we're viewing the current year
        if (selectedYear !== currentYear) return;
        
        // Mark that we've scrolled to prevent future auto-scrolling
        hasScrolledToCurrentMonthRef.current = true;
        
        // Find the first week of the current month
        const currentMonthName = months[currentMonth];
        const firstWeekOfCurrentMonth = weeks.findIndex(w => w.month === currentMonthName && w.weekNumber === 1);
        
        if (firstWeekOfCurrentMonth === -1) {
            // If exact match not found, find any week in the current month
            const anyWeekInCurrentMonth = weeks.findIndex(w => w.month === currentMonthName);
            if (anyWeekInCurrentMonth === -1) return;
        }
        
        const targetWeekIndex = firstWeekOfCurrentMonth !== -1 ? firstWeekOfCurrentMonth : weeks.findIndex(w => w.month === currentMonthName);
        
        // Scroll all section scroll containers to the current month
        const scrollToCurrentMonth = () => {
            // Only auto-scroll if user hasn't manually scrolled yet
            const hasUserScrolled = Array.from(sectionScrollRefs.current.values()).some(
                container => container && container.scrollLeft > 50
            );
            
            if (!hasUserScrolled) {
                // Temporarily disable scroll sync to prevent conflicts
                isScrollingRef.current = true;
                
                Object.values(sectionScrollRefs.current).forEach(scrollContainer => {
                    if (scrollContainer) {
                        // Find the header cell for the target week
                        const headerCells = scrollContainer.querySelectorAll('thead th');
                        if (headerCells.length > targetWeekIndex + 1) {
                            const targetCell = headerCells[targetWeekIndex + 1]; // +1 because first cell is "Document / Data"
                            if (targetCell) {
                                targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
                            }
                        }
                    }
                });
                
                // Re-enable scroll sync after scrolling completes
                setTimeout(() => {
                    isScrollingRef.current = false;
                }, 500);
            }
        };
        
        // Wait a bit for DOM to render
        setTimeout(scrollToCurrentMonth, 300);
    }, [isLoading, sections.length, selectedYear, currentYear, currentMonth, weeks, months]);
    
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
            const isStatusCell = event.target.closest('select[data-section-id]') || 
                                 event.target.closest('td')?.querySelector('select[data-section-id]');
            
            if (hoverCommentCell && !isCommentButton && !isInsidePopup) {
                setHoverCommentCell(null);
                setQuickComment('');
                setCommentAttachments([]); // Clear attachments when closing popup
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
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [hoverCommentCell, selectedCells]);

    // When opened via a deep-link (e.g. from an email notification), automatically
    // switch to the correct comment cell and open the popup so the user can
    // immediately see the relevant discussion.
    useEffect(() => {
        try {
            const search = window.location.search || '';
            if (!search) return;
            const params = new URLSearchParams(search);
            const deepSectionId = params.get('weeklySectionId') || params.get('docSectionId');
            const deepDocumentId = params.get('weeklyDocumentId') || params.get('docDocumentId');
            const deepMonth = params.get('weeklyMonth') || params.get('docMonth');
            const deepWeek = params.get('weeklyWeek') || '1';
            const deepCommentId = params.get('commentId');
            
            if (deepSectionId && deepDocumentId && deepMonth) {
                const cellKey = `${deepSectionId}-${deepDocumentId}-${deepMonth}-Week${deepWeek}`;
                // Center the popup on screen; the underlying grid provides context.
                setCommentPopupPosition({
                    top: Math.max(window.innerHeight / 2 - 160, 60),
                    left: Math.max(window.innerWidth / 2 - 180, 20)
                });
                setHoverCommentCell(cellKey);
                
                // If a specific comment ID is provided, scroll to it after the popup opens
                if (deepCommentId) {
                    // Wait for the popup to render and comments to load
                    setTimeout(() => {
                        const commentElement = document.querySelector(`[data-comment-id="${deepCommentId}"]`) ||
                                             document.querySelector(`#comment-${deepCommentId}`);
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
                        }
                    }, 500); // Wait 500ms for popup to render
                }
            }
        } catch (error) {
            console.warn('⚠️ Failed to apply document collection deep-link:', error);
        }
    }, []);
    
    // ============================================================
    // RENDER STATUS CELL
    // ============================================================
    
    const renderStatusCell = (section, document, month, weekNumber) => {
        const status = getDocumentStatus(document, month, weekNumber);
        const statusConfig = status ? getStatusConfig(status) : null;
        const comments = getDocumentComments(document, month, weekNumber);
        const hasComments = comments.length > 0;
        const cellKey = `${section.id}-${document.id}-${month}-Week${weekNumber}`;
        const isPopupOpen = hoverCommentCell === cellKey;
        const isSelected = selectedCells.has(cellKey);
        
        const weekIndex = weeks.findIndex(w => w.month === month && w.weekNumber === weekNumber);
        const isWorkingWeek = workingWeeks.includes(weekIndex) && selectedYear === currentYear;
        let cellBackgroundClass = statusConfig 
            ? statusConfig.cellColor 
            : (isWorkingWeek ? 'bg-primary-50' : '');
        
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
                        value={status || 'not-checked'}
                        onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const newStatus = e.target.value;
                            // Always use ref to get latest selectedCells value
                            const currentSelectedCells = selectedCellsRef.current;
                            // Apply to all selected cells if this cell is part of the selection, otherwise just this cell
                            const applyToSelected = currentSelectedCells.size > 0 && currentSelectedCells.has(cellKey);
                            handleUpdateStatus(section.id, document.id, month, weekNumber, newStatus, applyToSelected);
                        }}
                        onBlur={(e) => {
                            // Ensure state is saved on blur
                            const newStatus = e.target.value;
                            if (newStatus !== status) {
                                const currentSelectedCells = selectedCellsRef.current;
                                const applyToSelected = currentSelectedCells.size > 0 && currentSelectedCells.has(cellKey);
                                handleUpdateStatus(section.id, document.id, month, weekNumber, newStatus, applyToSelected);
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
                        aria-label={`Status for ${document.name || 'document'} in ${month} Week ${weekNumber} ${selectedYear}`}
                        role="combobox"
                        aria-haspopup="listbox"
                        data-section-id={section.id}
                        data-document-id={document.id}
                        data-month={month}
                        data-week={weekNumber}
                        data-year={selectedYear}
                        className={`w-full px-1.5 py-0.5 text-[10px] rounded font-medium border-0 cursor-pointer appearance-none bg-transparent ${textColorClass} hover:opacity-80`}
                    >
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
                                    setCommentAttachments([]); // Clear attachments when closing popup
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
        
        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!formData.name.trim()) {
                alert('Please enter a section name');
                return;
            }
            await handleSaveSection(formData);
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
                // Format: sectionId-documentId-month-WeekN
                const parts = hoverCommentCell.split('-');
                const weekIndex = parts.findIndex(p => p.startsWith('Week'));
                let rawSectionId, rawDocumentId, month, weekNumber;
                
                if (weekIndex > 0) {
                    rawSectionId = parts[0];
                    rawDocumentId = parts[1];
                    month = parts.slice(2, weekIndex).join('-');
                    weekNumber = parts[weekIndex].replace('Week', '');
                } else {
                    // Fallback for old format
                    [rawSectionId, rawDocumentId, month] = parts;
                    weekNumber = '1';
                }
                
                const section = sections.find(s => String(s.id) === String(rawSectionId));
                const document = section?.documents.find(d => String(d.id) === String(rawDocumentId));
                const comments = document ? getDocumentComments(document, month, weekNumber) : [];
                
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
                                            {comment.attachments && comment.attachments.length > 0 && (
                                                <div className="mt-1.5 space-y-1">
                                                    {comment.attachments.map((attachment) => (
                                                        <div key={attachment.id || attachment.url} className="flex items-center gap-1.5 text-[10px]">
                                                            <i className="fas fa-paperclip text-gray-400"></i>
                                                            <a
                                                                href={attachment.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-primary-600 hover:text-primary-700 hover:underline truncate flex-1"
                                                                title={attachment.name}
                                                            >
                                                                {attachment.name}
                                                            </a>
                                                            {attachment.size && (
                                                                <span className="text-gray-400">
                                                                    ({(attachment.size / 1024).toFixed(1)} KB)
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
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
                            
                            {/* File attachments preview */}
                            {commentAttachments.length > 0 && (
                                <div className="mb-2 space-y-1">
                                    {commentAttachments.map((attachment) => (
                                        <div key={attachment.id} className="flex items-center gap-1.5 text-[10px] bg-gray-50 rounded px-2 py-1">
                                            <i className="fas fa-paperclip text-gray-400"></i>
                                            <span className="flex-1 truncate text-gray-700" title={attachment.name}>
                                                {attachment.name}
                                            </span>
                                            {attachment.size && (
                                                <span className="text-gray-400">
                                                    ({(attachment.size / 1024).toFixed(1)} KB)
                                                </span>
                                            )}
                                            <button
                                                onClick={() => handleRemoveAttachment(attachment.id)}
                                                className="text-red-500 hover:text-red-700"
                                                type="button"
                                                title="Remove attachment"
                                            >
                                                <i className="fas fa-times text-[10px]"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            <>
                                {commentInputAvailable && section && document ? (
                                    <window.CommentInputWithMentions
                                        onSubmit={(commentText) => {
                                            if (commentText && commentText.trim() || commentAttachments.length > 0) {
                                                handleAddComment(section.id, document.id, month, weekNumber, commentText);
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
                                                if (e.key === 'Enter' && e.ctrlKey && section && document) {
                                                    handleAddComment(section.id, document.id, month, weekNumber, quickComment);
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
                                                handleAddComment(section.id, document.id, month, weekNumber, quickComment);
                                            }}
                                            disabled={!quickComment.trim() && commentAttachments.length === 0}
                                            className="mt-1.5 w-full px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 disabled:opacity-50"
                                        >
                                            Add Comment
                                        </button>
                                    </>
                                )}
                                
                                {/* File upload input - Always visible after comment input */}
                                <div className="mt-2">
                                    <label htmlFor="comment-file-upload" className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 bg-gray-50 border border-gray-300 rounded cursor-pointer hover:bg-gray-100 hover:border-gray-400 transition-colors">
                                        <input
                                            id="comment-file-upload"
                                            type="file"
                                            multiple
                                            onChange={handleFileUpload}
                                            disabled={isUploadingAttachment}
                                            className="hidden"
                                            accept="*/*"
                                        />
                                        <i className={`fas ${isUploadingAttachment ? 'fa-spinner fa-spin' : 'fa-paperclip'} text-xs`}></i>
                                        <span className="font-medium">{isUploadingAttachment ? 'Uploading...' : 'Attach file(s)'}</span>
                                    </label>
                                </div>
                            </>
                        </div>
                    </div>
                );
            })()}
            
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={handleBackWithSave} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
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

                            {/* Scrollable week/document grid for this section only */}
                            <div 
                                ref={(el) => {
                                    if (el) {
                                        sectionScrollRefs.current[section.id] = el;
                                    }
                                }}
                                className="border-t border-gray-200 overflow-x-auto"
                                style={{ scrollBehavior: 'auto' }}
                            >
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th
                                                className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase sticky left-0 bg-gray-50 z-20 border-r border-gray-200"
                                                style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                            >
                                                Document / Data
                                            </th>
                                            {weeks.map((week, idx) => {
                                                // Group weeks by month - show month header when month changes
                                                const prevWeek = idx > 0 ? weeks[idx - 1] : null;
                                                const showMonthHeader = !prevWeek || prevWeek.month !== week.month;
                                                
                                                return (
                                                    <th
                                                        key={week.key}
                                                        className={`px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase border-l border-gray-200 ${
                                                            workingWeeks.includes(idx) && selectedYear === currentYear
                                                                ? 'bg-primary-50 text-primary-700'
                                                                : 'text-gray-600'
                                                        }`}
                                                        title={`${week.month} Week ${week.weekNumber}: ${week.dateRange}`}
                                                    >
                                                        {showMonthHeader && idx > 0 ? (
                                                            <div>
                                                                <div className="text-[9px] font-bold text-gray-500">{week.month.slice(0, 3)}</div>
                                                                <div className="text-[9px]">{week.display}</div>
                                                                <div className="text-[8px] font-normal text-gray-500 mt-0.5 leading-tight">{week.dateRange}</div>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <div>{week.display}</div>
                                                                <div className="text-[8px] font-normal text-gray-500 mt-0.5 leading-tight">{week.dateRange}</div>
                                                            </div>
                                                        )}
                                                    </th>
                                                );
                                            })}
                                            <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase border-l border-gray-200">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {section.documents.length === 0 ? (
                                            <tr>
                                                <td colSpan={weeks.length + 2} className="px-8 py-4 text-center text-gray-400">
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
                                            section.documents.map((document) => (
                                                <tr key={document.id} className="hover:bg-gray-50">
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
                                                    {weeks.map((week) => (
                                                        <React.Fragment key={`${document.id}-${week.key}`}>
                                                            {renderStatusCell(section, document, week.month, week.weekNumber)}
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
                                                                onClick={(e) => handleDeleteDocument(section.id, document.id, e)}
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

// Export for ES modules
export default WeeklyFMSReviewTracker;
