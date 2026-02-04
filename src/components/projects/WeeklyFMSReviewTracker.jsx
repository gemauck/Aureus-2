// Get React hooks from window
const { useState, useEffect, useLayoutEffect, useRef, useCallback } = React;
const storage = window.storage;
const documentRef = window.document; // Store reference to avoid shadowing issues
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

// Helper function to truncate text to one line (approximately 60 characters)
const truncateDescription = (text, maxLength = 60) => {
    if (!text || text.length <= maxLength) return { truncated: text, isLong: false };
    // Find the last space before maxLength to avoid cutting words
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    const cutPoint = lastSpace > 0 ? lastSpace : maxLength;
    return { truncated: text.substring(0, cutPoint), isLong: true };
};

// Non-blocking toast for attachment errors (avoids native alert).
const showAttachmentToast = (message) => {
    const el = document.createElement('div');
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);max-width:90%;padding:12px 20px;background:#1e293b;color:#f1f5f9;border-radius:8px;font-size:14px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, 4000);
};

// Download comment attachment to disk (no new tab). Fetches file and triggers browser download.
const downloadCommentAttachment = (url, filename) => {
    if (!url) return;
    const name = (filename || '').trim() || (url.split('/').pop() || 'download').split('?')[0];
    fetch(url, { credentials: 'same-origin', mode: 'cors' })
        .catch(() => null)
        .then((res) => {
            if (!res) return null;
            if (!res.ok) {
                const msg = res.status === 404
                    ? 'Attachment not found. It may have been deleted or is stored on another server.'
                    : `Download failed (${res.status}).`;
                showAttachmentToast(msg);
                return null;
            }
            return res.blob();
        })
        .then((blob) => {
            if (!blob) return;
            const u = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = u;
            a.download = name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(u);
        })
        .catch(() => {});
};

const WeeklyFMSReviewTracker = ({ project, onBack }) => {
    const currentYear = new Date().getFullYear();
    const currentDate = new Date();
    
    // Simplified refs - only essential ones for debouncing and API reference
    const saveTimeoutRef = useRef(null);
    const isSavingRef = useRef(false);
    const sectionsRef = useRef({}); // Keep ref for immediate access during rapid updates
    const apiRef = useRef(window.DocumentCollectionAPI || null);
    const lastSavedDataRef = useRef(null); // Track last saved data to prevent unnecessary saves
    const isDeletingRef = useRef(false); // Track deletion in progress to prevent race conditions
    const deletionSectionIdsRef = useRef(new Set()); // Track which section IDs are being deleted
    const deletionTimestampRef = useRef(null); // Track when deletion started
    const scrollSyncRootRef = useRef(null); // Root element for querying scrollable table containers
    const isScrollingRef = useRef(false); // Flag to prevent infinite scroll loops
    
    const getSnapshotKey = (projectId) => projectId ? `weeklyFMSReviewSnapshot_${projectId}` : null;

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

    // Generate all weeks for a given year
    const generateWeeksForYear = (year) => {
        const weeks = [];
        // Get January 1st of the year
        const startDate = new Date(year, 0, 1);
        // Adjust to the start of the week (Monday)
        const dayOfWeek = startDate.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days
        startDate.setDate(startDate.getDate() + daysToMonday);
        
        // Generate weeks until we've covered the entire year
        let currentDate = new Date(startDate);
        let weekNum = 1;
        
        // Generate up to 53 weeks to cover the full year
        while (weeks.length < 53) {
            const weekStart = new Date(currentDate);
            const weekEnd = new Date(currentDate);
            weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
            
            // Stop if we've passed the end of the year significantly
            if (weekStart.getFullYear() > year && weekStart.getMonth() > 0) {
                break;
            }
            
            // Format dates with month abbreviations (e.g., "Dec 29 - Jan 5")
            const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const startMonthAbbr = monthAbbreviations[weekStart.getMonth()];
            const startDay = weekStart.getDate();
            const endMonthAbbr = monthAbbreviations[weekEnd.getMonth()];
            const endDay = weekEnd.getDate();
            
            // Create the date range string
            const dateRange = `${startMonthAbbr} ${startDay} - ${endMonthAbbr} ${endDay}`;
            
            weeks.push({
                number: weekNum,
                startDate: weekStart,
                endDate: weekEnd,
                label: `Week ${weekNum} (${dateRange})`,
                dateRange: dateRange
            });
            
            // Move to next week
            currentDate.setDate(currentDate.getDate() + 7);
            weekNum++;
            
            // Safety check: if we've gone past the year, break
            if (currentDate.getFullYear() > year) {
                break;
            }
        }
        
        return weeks;
    };
    
    // Generate weeks for the selected year (recalculate when year changes)
    const weeks = React.useMemo(() => generateWeeksForYear(selectedYear), [selectedYear]);
    
    // Calculate working week (1 week in arrears from current week only)
    const getWorkingWeeks = () => {
        const today = new Date();
        const currentWeekStart = new Date(today);
        const dayOfWeek = currentWeekStart.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        currentWeekStart.setDate(currentWeekStart.getDate() + daysToMonday);
        
        // One week in arrears only
        const oneWeekAgo = new Date(currentWeekStart);
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const weekNumbers = [];
        weeks.forEach((week) => {
            const weekStart = new Date(week.startDate);
            weekStart.setHours(0, 0, 0, 0);
            const oneWeekAgoStart = new Date(oneWeekAgo);
            oneWeekAgoStart.setHours(0, 0, 0, 0);
            if (weekStart.getTime() === oneWeekAgoStart.getTime()) {
                weekNumbers.push(week.number);
            }
        });
        return weekNumbers;
    };
    
    const workingWeeks = React.useMemo(() => getWorkingWeeks(), [weeks, currentYear]);
    
    const commentInputAvailable = typeof window !== 'undefined' && typeof window.CommentInputWithMentions === 'function';
    
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
    const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
    const templateDropdownRef = useRef(null);
    const [expandedDescriptionId, setExpandedDescriptionId] = useState(null);
    const [showTemplateList, setShowTemplateList] = useState(true);
    const [editingSection, setEditingSection] = useState(null);
    const [editingDocument, setEditingDocument] = useState(null);
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [editingTemplate, setEditingTemplate] = useState(null);
    
    // Close template dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (templateDropdownRef.current && !templateDropdownRef.current.contains(event.target)) {
                setIsTemplateDropdownOpen(false);
            }
        };
        
        if (isTemplateDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isTemplateDropdownOpen]);
    
    // Synchronize horizontal scrolling across all table containers.
    // Use root ref + querySelectorAll. Listen to both 'scroll' and 'wheel' (deltaX); trackpad
    // horizontal scroll often fires wheel but not scroll on the overflow div.
    useLayoutEffect(() => {
        if (sections.length === 0) return;
        const root = scrollSyncRootRef.current;
        if (!root) return;
        const scrollHandlers = new Map();
        const wheelHandlers = new Map();
        const handleScroll = (sourceElement) => {
            if (isScrollingRef.current) return;
            isScrollingRef.current = true;
            const scrollLeft = sourceElement.scrollLeft;
            scrollHandlers.forEach((_, el) => {
                if (el !== sourceElement && el.isConnected) el.scrollLeft = scrollLeft;
            });
            requestAnimationFrame(() => { isScrollingRef.current = false; });
        };
        const attach = () => {
            const containers = Array.from(root.querySelectorAll('[data-scroll-sync]'));
            const connected = containers.filter(el => el.isConnected);
            if (connected.length === 0) return false;
            connected.forEach(el => {
                if (scrollHandlers.has(el)) return;
                const onScroll = () => handleScroll(el);
                scrollHandlers.set(el, onScroll);
                el.addEventListener('scroll', onScroll, { passive: true });
                const onWheel = (e) => {
                    if (e.deltaX === 0) return;
                    e.preventDefault();
                    const maxScroll = el.scrollWidth - el.clientWidth;
                    el.scrollLeft = Math.max(0, Math.min(el.scrollLeft + e.deltaX, maxScroll));
                    handleScroll(el);
                };
                wheelHandlers.set(el, onWheel);
                el.addEventListener('wheel', onWheel, { passive: false });
            });
            return true;
        };
        const cleanup = () => {
            scrollHandlers.forEach((handler, el) => el.removeEventListener('scroll', handler));
            scrollHandlers.clear();
            wheelHandlers.forEach((handler, el) => el.removeEventListener('wheel', handler));
            wheelHandlers.clear();
        };
        if (attach()) return cleanup;
        let rafId = null;
        let retries = 0;
        const retry = () => {
            rafId = null;
            if (attach()) return;
            retries += 1;
            if (retries < 10) rafId = requestAnimationFrame(retry);
        };
        rafId = requestAnimationFrame(retry);
        return () => {
            if (rafId != null) cancelAnimationFrame(rafId);
            cleanup();
        };
    }, [sections.length]);
    
    // When creating a template from the current year's sections, we pre‑seed
    // the modal via this state so that it goes through the "create" code path
    // (POST) instead of trying to update an existing template.
    const [prefilledTemplate, setPrefilledTemplate] = useState(null);
    const [draggedSection, setDraggedSection] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedDocument, setDraggedDocument] = useState(null);
    const [dragOverDocumentIndex, setDragOverDocumentIndex] = useState(null);
    const [dragOverDocumentSectionId, setDragOverDocumentSectionId] = useState(null);
    const documentDragRef = useRef(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null);
    const [quickComment, setQuickComment] = useState('');
    const [commentPopupPosition, setCommentPopupPosition] = useState({ top: 0, left: 0 });
    const [pendingCommentAttachments, setPendingCommentAttachments] = useState([]);
    const [uploadingCommentAttachments, setUploadingCommentAttachments] = useState(false);
    const commentFileInputRef = useRef(null);
    const commentPopupContainerRef = useRef(null);

    useEffect(() => { setPendingCommentAttachments([]); }, [hoverCommentCell]);
    const pendingCommentOpenRef = useRef(null);
    const userHasScrolledRef = useRef(false);
    const hasAutoScrolledRef = useRef(false);
    const [users, setUsers] = useState([]);
    const [assignmentOpen, setAssignmentOpen] = useState(null); // { sectionId, docId }
    const [assignmentAnchorRect, setAssignmentAnchorRect] = useState(null);
    const assignmentDropdownRef = useRef(null);
    
    // Multi-select state: Set of cell keys (sectionId-documentId-weekLabel)
    const [selectedCells, setSelectedCells] = useState(new Set());
    const selectedCellsRef = useRef(new Set());
    
    // Keep ref in sync with state
    useEffect(() => {
        selectedCellsRef.current = selectedCells;
    }, [selectedCells]);
    
    // ============================================================
    // LOAD DATA – same logic as Monthly FMS Review and Document Collection
    // ============================================================
    const loadData = useCallback(async () => {
        if (!project?.id) return;
        if (isSavingRef.current) {
            console.log('⏸️ Load skipped: save in progress');
            return;
        }
        setIsLoading(true);
        try {
            if (apiRef.current) {
                console.log('📥 Loading from database...', { projectId: project.id });
                const freshProject = await apiRef.current.fetchProject(project.id);
                if (freshProject?.weeklyFMSReviewSections) {
                    const normalized = normalizeSectionsByYear(freshProject.weeklyFMSReviewSections);
                    setSectionsByYear(normalized);
                    sectionsRef.current = normalized;
                    lastSavedDataRef.current = JSON.stringify(normalized);
                    setIsLoading(false);
                    return;
                }
            }
            console.log('⚠️ Falling back to prop data');
            if (project?.weeklyFMSReviewSections) {
                const normalized = normalizeSectionsByYear(project.weeklyFMSReviewSections);
                setSectionsByYear(normalized);
                sectionsRef.current = normalized;
                lastSavedDataRef.current = JSON.stringify(normalized);
            } else {
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        const stored = window.localStorage.getItem(snapshotKey);
                        if (stored && stored.trim() && stored !== '{}' && stored !== 'null') {
                            const parsed = JSON.parse(stored);
                            const normalized = normalizeSectionsByYear(parsed);
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
                setSectionsByYear({});
                sectionsRef.current = {};
                lastSavedDataRef.current = JSON.stringify({});
            }
        } catch (error) {
            console.error('❌ Error loading data:', error);
            setSectionsByYear({});
            sectionsRef.current = {};
        } finally {
            setIsLoading(false);
        }
    }, [project?.id, project?.weeklyFMSReviewSections, selectedYear]);

    useEffect(() => {
        if (project?.id) {
            loadData();
        }
    }, [project?.id, selectedYear, loadData]);
    
    // Load users for reviewer and document assignment
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
                    setUsers(Array.isArray(allUsers) ? allUsers : []);
                } else if (typeof window.dataService?.getUsers === 'function') {
                    const list = await window.dataService.getUsers() || [];
                    setUsers(Array.isArray(list) ? list : []);
                }
            } catch (error) {
                console.error('❌ Error loading users:', error);
            }
        };
        loadUsers();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (assignmentDropdownRef.current && !assignmentDropdownRef.current.contains(event.target)) {
                setAssignmentOpen(null);
                setAssignmentAnchorRect(null);
            }
        };
        if (assignmentOpen) {
            documentRef.addEventListener('mousedown', handleClickOutside);
            return () => documentRef.removeEventListener('mousedown', handleClickOutside);
        }
    }, [assignmentOpen]);
    
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
        const serialized = JSON.stringify(payload);
        
        // Skip if data hasn't changed
        if (lastSavedDataRef.current === serialized) {
            console.log('⏸️ Save skipped: data unchanged');
            return;
        }
        
        console.log('💾 Saving to database...', { 
            hasData: Object.keys(payload).length > 0,
            yearKeys: Object.keys(payload),
            payloadSize: serialized.length
        });

        isSavingRef.current = true;
        
        try {
            // Use DocumentCollectionAPI if available, fallback to DatabaseAPI
            let result;
            if (apiRef.current?.saveWeeklyFMSReviewSections) {
                result = await apiRef.current.saveWeeklyFMSReviewSections(project.id, payload, options.skipParentUpdate);
                console.log('✅ Saved via DocumentCollectionAPI:', result);
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
                payloadSize: serialized.length
            });
            // Reset saved data ref so it will retry on next change
            lastSavedDataRef.current = null;
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
    
    // Create a week key scoped to the selected year.
    //
    // IMPORTANT BACKEND MAPPING:
    // - The Prisma tables for weekly FMS statuses/comments are stored at
    //   a YEAR+MONTH level (columns: year, month).
    // - The JSON used by the UI, however, can be more granular.
    //
    // To support **true per-week editing in the UI** while still being
    // compatible with the backend migration helpers, we:
    //   1. Persist weekly data under a key shaped like:  "YYYY-MM-W##"
    //      e.g. "2026-01-W01" for Week 1 in Jan 2026.
    //   2. When *reading*, we first look for the weekly key, and if it
    //      doesn't exist, we gracefully fall back to the coarser
    //      monthly key: "YYYY-MM".
    //
    // The table migrator only looks at the first two segments of the key
    // (year/month), so it remains compatible with the new weekly keys.
    //
    // `week` can be:
    // - a week object from generateWeeksForYear
    // - a week number
    // - a string like "Week 1 (Dec 29 - Jan 5)" or "W01"
    const getWeekKey = (week, year = selectedYear) => {
        if (!week) return null;
        
        // Resolve to a week object so we can derive the correct calendar month
        // and week number.
        let weekObj = null;
        
        if (typeof week === 'object' && week.number && week.startDate) {
            weekObj = week;
        } else {
            let weekNum = null;
            
            if (typeof week === 'string') {
                // Try to extract week number from labels like:
                // "Week 1 (Dec 29 - Jan 5)", "W01", or just "1"
                let match = week.match(/Week\s+(\d+)/i);
                if (match) {
                    weekNum = parseInt(match[1], 10);
                } else {
                    // Try old format: "W01" or just "1"
                    match = week.match(/W?(\d+)/i);
                    if (match) {
                        weekNum = parseInt(match[1], 10);
                    } else {
                        // Try finding by label/date range in weeks array
                        weekObj = weeks.find(w => w.label === week || w.dateRange === week) || null;
                    }
                }
            } else if (typeof week === 'number') {
                weekNum = week;
            } else {
                console.error('Invalid week:', week);
                return null;
            }
            
            if (!weekObj && weekNum != null) {
                weekObj = weeks.find(w => w.number === weekNum) || null;
            }
        }
        
        if (!weekObj || !weekObj.startDate) {
            console.warn('getWeekKey: Unable to resolve week object for', week);
            return null;
        }
        
        // Map the visual "week" to the month that falls inside the target year.
        // This ensures that persisted keys match the backend schema (YEAR+MONTH).
        const resolveMonthForYear = (targetYear) => {
            const base = new Date(weekObj.startDate);
            base.setHours(0, 0, 0, 0);
            
            // Walk the 7 days of the week and pick the first day that belongs to targetYear.
            for (let i = 0; i < 7; i++) {
                const d = new Date(base);
                d.setDate(base.getDate() + i);
                if (d.getFullYear() === targetYear) {
                    return d.getMonth() + 1;
                }
            }
            
            // Fallback: if none of the days match (shouldn't happen), use startDate's month
            return base.getMonth() + 1;
        };
        
        // Derive month + week number for the final key
        const month = resolveMonthForYear(year);
        const weekNumber = weekObj.number || weeks.find(w => w === weekObj)?.number;
        const monthStr = String(month).padStart(2, '0');
        const weekStr = String(weekNumber || '').padStart(2, '0');
        
        // If we couldn't resolve a week number, fall back to plain month key
        if (!weekStr || weekStr === '00') {
            return `${year}-${monthStr}`;
        }
        
        return `${year}-${monthStr}-W${weekStr}`;
    };
    
    // Get status for a specific week in the selected year only
    const getStatusForYear = (collectionStatus, week, year = selectedYear) => {
        if (!collectionStatus) return null;
        
        const weekKey = getWeekKey(week, year);
        if (!weekKey) return null;
        
        // Prefer the fully-qualified weekly key ("YYYY-MM-W##")
        if (Object.prototype.hasOwnProperty.call(collectionStatus, weekKey)) {
            const weeklyStatus = collectionStatus[weekKey];
            // If weekly key is explicitly set to empty string, return null (cleared)
            // Don't fall back to monthly key if this week was explicitly cleared
            if (weeklyStatus === '' || weeklyStatus === null) {
                return null;
            }
            return weeklyStatus;
        }
        
        // Fallback to the coarser monthly key ("YYYY-MM") so any legacy
        // data written before weekly support still shows up.
        // Only fall back if the weekly key was never set (not if it was explicitly cleared).
        // Also: if ANY weekly key exists for this month, do NOT use monthly fallback.
        const parts = weekKey.split('-');
        if (parts.length >= 2) {
            const monthKey = `${parts[0]}-${parts[1]}`;
            const weeklyPrefix = `${parts[0]}-${parts[1]}-W`;
            const hasWeeklyForMonth = Object.keys(collectionStatus || {}).some((key) =>
                key.startsWith(weeklyPrefix)
            );
            if (hasWeeklyForMonth) {
                return null;
            }
            return collectionStatus[monthKey] || null;
        }
        
        return null;
    };
    
    // Get comments for a specific week in the selected year only
    const getCommentsForYear = (comments, week, year = selectedYear) => {
        if (!comments) return [];
        
        const weekKey = getWeekKey(week, year);
        if (!weekKey) return [];
        
        // Prefer weekly key first - if it exists (even if empty array), use it
        // This prevents fallback to monthly key when weekly key was explicitly set
        if (Object.prototype.hasOwnProperty.call(comments, weekKey)) {
            const weeklyComments = comments[weekKey];
            // If weekly key is explicitly set to empty array, return empty (don't fall back)
            if (Array.isArray(weeklyComments)) {
                return weeklyComments;
            }
            // If it's set to something else (legacy), return empty array
            return [];
        }
        
        // Fallback to monthly key for legacy data (only if weekly key was never set)
        // BUT: Only fall back if NO weekly keys exist for this month to prevent
        // comments from one week appearing in other weeks
        const parts = weekKey.split('-');
        if (parts.length >= 2) {
            const monthKey = `${parts[0]}-${parts[1]}`;
            
            // Check if ANY weekly keys exist for this month
            // If they do, don't fall back to monthly key (prevents cross-week contamination)
            const hasWeeklyKeys = Object.keys(comments).some(key => {
                return key.startsWith(`${monthKey}-W`) && key !== monthKey;
            });
            
            // Only fall back to monthly key if no weekly keys exist for this month
            if (!hasWeeklyKeys && Object.prototype.hasOwnProperty.call(comments, monthKey)) {
                const monthlyComments = comments[monthKey];
                return Array.isArray(monthlyComments) ? monthlyComments : [];
            }
        }
        
        return [];
    };
    
    // Set status for a specific week in the selected year only
    // If status is empty/null, explicitly set it to empty string (not delete)
    // This prevents fallback to monthly key when a week is explicitly cleared
    const setStatusForYear = (collectionStatus, week, status, year = selectedYear) => {
        const weekKey = getWeekKey(week, year);
        // Only allow weekly keys ("YYYY-MM-W##") for writes to avoid
        // accidental month-wide status application.
        if (!weekKey || !weekKey.includes('-W')) return collectionStatus || {};
        
        const newStatus = { ...(collectionStatus || {}) };
        const [yearPart, monthPart] = weekKey.split('-');
        const monthKey = `${yearPart}-${monthPart}`;
        
        // Remove any legacy monthly key so weeks don't inherit it on refresh.
        if (Object.prototype.hasOwnProperty.call(newStatus, monthKey)) {
            delete newStatus[monthKey];
        }
        
        // If status is empty/null, explicitly set to empty string to mark as cleared
        // This prevents getStatusForYear from falling back to monthly key
        if (!status || status === '' || status === 'Select Status') {
            newStatus[weekKey] = '';
        } else {
            newStatus[weekKey] = status;
        }
        
        return newStatus;
    };
    
    // Set comments for a specific week in the selected year only
    const setCommentsForYear = (comments, week, newComments, year = selectedYear) => {
        const weekKey = getWeekKey(week, year);
        if (!weekKey) return comments || {};
        
        // Only allow weekly keys ("YYYY-MM-W##") for writes to avoid
        // accidental month-wide comment application.
        if (!weekKey.includes('-W')) return comments || {};
        
        const newCommentsObj = { ...(comments || {}) };
        const [yearPart, monthPart] = weekKey.split('-');
        const monthKey = `${yearPart}-${monthPart}`;
        
        // Remove any legacy monthly key so weeks don't inherit comments from other weeks.
        // This prevents the fallback logic in getCommentsForYear from showing comments
        // from one week in subsequent weeks that don't have their own weekly key set.
        if (Object.prototype.hasOwnProperty.call(newCommentsObj, monthKey)) {
            delete newCommentsObj[monthKey];
        }
        
        // Set the weekly key with the new comments
        newCommentsObj[weekKey] = newComments;
        
        return newCommentsObj;
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
                        comments: documentData.comments || {},
                        assignedTo: documentData.assignedTo ?? []
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

    const normalizeAssignedTo = (doc) => {
        if (!doc) return [];
        const raw = doc.assignedTo;
        if (Array.isArray(raw)) return raw.filter(Boolean);
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
            } catch (_) {
                return raw.trim() ? [raw] : [];
            }
        }
        return [];
    };

    const getAssigneeLabel = (identifier) => {
        if (identifier == null || identifier === '') return 'Unknown';
        const str = String(identifier).trim();
        const user = users.find(u => {
            if (!u) return false;
            const id = u.id || u._id;
            const name = (u.name || u.fullName || u.email || '').toString().trim();
            const email = (u.email || '').toString().trim().toLowerCase();
            if (id && str === String(id)) return true;
            if (name && (str === name || str.toLowerCase() === name.toLowerCase())) return true;
            if (email && str.toLowerCase() === email) return true;
            if (id && str === `id:${id}`) return true;
            if (email && str === `email:${email}`) return true;
            return false;
        });
        return user ? (user.name || user.fullName || user.email || str) : str;
    };

    const getAssigneeInitials = (identifier) => {
        const label = getAssigneeLabel(identifier);
        if (!label || label === 'Unknown') return '?';
        const parts = label.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            const first = (parts[0] || '').charAt(0);
            const last = (parts[parts.length - 1] || '').charAt(0);
            return (first + last).toUpperCase().slice(0, 2);
        }
        return (label.slice(0, 2) || '?').toUpperCase();
    };

    const getUserIdentifier = (user) => {
        if (!user) return null;
        if (user.id) return user.id;
        if (user._id) return user._id;
        if (user.email) return String(user.email).toLowerCase();
        return (user.name || user.fullName || '').toString().trim() || null;
    };

    const handleAssignmentChange = (sectionId, docId, newAssignedTo) => {
        setSections(prev => prev.map(section => {
            if (String(section.id) !== String(sectionId)) return section;
            return {
                ...section,
                documents: section.documents.map(doc => {
                    if (String(doc.id) !== String(docId)) return doc;
                    return { ...doc, assignedTo: Array.isArray(newAssignedTo) ? newAssignedTo : [] };
                })
            };
        }));
        setAssignmentOpen(null);
        setAssignmentAnchorRect(null);
        setTimeout(() => { if (typeof saveToDatabase === 'function') saveToDatabase(); }, 200);
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
    
    const handleUpdateStatus = useCallback(async (sectionId, documentId, week, status, applyToSelected = false) => {
        
        // Use current state (most up-to-date) or fallback to ref
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 
            ? sectionsByYear 
            : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        
        // Always use ref to get the latest selectedCells value (avoids stale closure)
        const currentSelectedCells = selectedCellsRef.current;
        
        // Ensure week is properly resolved to a week object
        let resolvedWeek = week;
        if (typeof week === 'object' && week.number) {
            // Already a week object, use it
            resolvedWeek = week;
        } else if (typeof week === 'string' || typeof week === 'number') {
            // Try to resolve to a week object
            const weekNum = typeof week === 'number' ? week : parseInt(week.toString().match(/W?(\d+)/i)?.[1] || '0', 10);
            resolvedWeek = weeks.find(w => w.number === weekNum) || week;
        }
        
        // If applying to selected cells, get all selected cell keys
        let cellsToUpdate = [];
        if (applyToSelected && currentSelectedCells.size > 1) {
            // Parse all selected cell keys (format: sectionId-documentId-W##)
            cellsToUpdate = Array.from(currentSelectedCells).map(cellKey => {
                // Cell key format: "sectionId-documentId-W##" (e.g., "section1-doc1-W01")
                const parts = cellKey.split('-');
                if (parts.length >= 3) {
                    const weekPart = parts.slice(-1)[0]; // Last part is week (e.g., "W01")
                    const documentId = parts[parts.length - 2];
                    const sectionId = parts.slice(0, -2).join('-'); // Everything before last two parts
                    // Extract week number from "W01" format and find the week object
                    const weekMatch = weekPart.match(/W(\d+)/i);
                    const weekNum = weekMatch ? parseInt(weekMatch[1], 10) : null;
                    const weekObj = weekNum ? weeks.find(w => w.number === weekNum) : null;
                    return { sectionId, documentId, week: weekObj || weekNum || weekPart };
                }
                // Fallback for old format (shouldn't happen but handle it)
                const [secId, docId, ...weekParts] = parts;
                const weekPart = weekParts.join('-');
                const weekMatch = weekPart.match(/W(\d+)/i);
                const weekNum = weekMatch ? parseInt(weekMatch[1], 10) : null;
                const weekObj = weekNum ? weeks.find(w => w.number === weekNum) : null;
                return { sectionId: secId, documentId: docId, week: weekObj || weekNum || weekPart };
            });
        } else {
            // Just update the single cell - ensure we use the resolved week object
            cellsToUpdate = [{ sectionId, documentId, week: resolvedWeek }];
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
                    // Check if this document needs updating for any week
                    const docUpdates = sectionUpdates.filter(cell => String(doc.id) === String(cell.documentId));
                    if (docUpdates.length === 0) {
                        return doc;
                    }
                    
                    // Apply status to all matching weeks for this document
                    let updatedStatus = doc.collectionStatus || {};
                    docUpdates.forEach(cell => {
                        // Ensure week is properly resolved before setting status
                        const weekKey = getWeekKey(cell.week, selectedYear);
                        if (!weekKey) {
                            console.warn('⚠️ Cannot resolve week key for:', cell.week, 'skipping update');
                            return;
                        }
                        updatedStatus = setStatusForYear(updatedStatus, cell.week, status, selectedYear);
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
        
        // Force immediate save (don't wait for debounce) to ensure persistence
        // Clear any pending debounced save first
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        // Save immediately and await to ensure it completes before any navigation
        try {
            await saveToDatabase();
        } catch (error) {
            console.error('❌ Error saving status change:', error);
        }
        
        // Clear selection after applying status to multiple cells
        // Use setTimeout to ensure React has updated the UI first
        if (applyToSelected && currentSelectedCells.size > 0) {
            setTimeout(() => {
                setSelectedCells(new Set());
                selectedCellsRef.current = new Set();
            }, 100);
        }
    }, [selectedYear, sectionsByYear]);
    
    const uploadCommentAttachments = async (files) => {
        if (!files?.length) return [];
        const folder = 'weekly-fms-comments';
        const token = window.storage?.getToken?.();
        const results = [];
        for (const { file, name } of files) {
            const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(file);
            });
            const res = await fetch('/api/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ name, dataUrl, folder })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || err.error || 'Upload failed');
            }
            const data = await res.json();
            results.push({ name, url: data.url || data.data?.url });
        }
        return results;
    };

    const handleAddComment = async (sectionId, documentId, week, commentText, attachments = []) => {
        if (!commentText.trim()) return;
        
        const currentUser = getCurrentUser();
        const newCommentId = Date.now();
        const newComment = {
            id: newCommentId,
            text: commentText,
            date: new Date().toISOString(),
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id,
            attachments: Array.isArray(attachments) ? attachments : []
        };
        
        // Use current state (most up-to-date) or fallback to ref
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 
            ? sectionsByYear 
            : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        // Capture prior participants for this cell so we can notify them (and so backend can notify @mentioned)
        const priorSection = currentYearSections.find((s) => String(s.id) === String(sectionId));
        const priorDoc = priorSection?.documents?.find((d) => String(d.id) === String(documentId));
        const priorComments = priorDoc ? getCommentsForYear(priorDoc.comments, week, selectedYear) : [];
        
            const updated = currentYearSections.map(section => {
                if (String(section.id) === String(sectionId)) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
                            if (String(doc.id) === String(documentId)) {
                            const existingComments = getCommentsForYear(doc.comments, week, selectedYear);
                            return {
                                ...doc,
                                comments: setCommentsForYear(doc.comments || {}, week, [...existingComments, newComment], selectedYear)
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
        
        // Force immediate save (don't wait for debounce) to ensure persistence
        // Clear any pending debounced save first
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        // CRITICAL: Clear so save is not skipped; await save + retry so comment is persisted before @mention emails
        lastSavedDataRef.current = null;
        try {
            await saveToDatabase();
            await new Promise((r) => setTimeout(r, 600));
            await saveToDatabase();
        } catch (error) {
            console.error('❌ Error saving comment (weekly FMS):', error);
        }
        
        setQuickComment('');

        // ========================================================
        // @MENTIONS - Process mentions and create notifications (after comment is saved)
        // ========================================================
        const weekLabel = typeof week === 'object' ? week.label : week;
        const contextTitle = `Weekly FMS Review - ${project?.name || 'Project'}`;
        const contextLink = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(sectionId)}&docDocumentId=${encodeURIComponent(documentId)}&docWeek=${encodeURIComponent(weekLabel)}&docYear=${encodeURIComponent(selectedYear)}&commentId=${encodeURIComponent(newCommentId)}&focusInput=comment`;
        const metadata = {
            projectId: project?.id,
            projectName: project?.name,
            sectionId,
            documentId,
            week: weekLabel,
            docYear: selectedYear,
            year: selectedYear,
            commentId: newCommentId
        };
        try {
            if (window.MentionHelper && window.MentionHelper.hasMentions(commentText)) {
                const token = window.storage?.getToken?.();
                if (token && window.DatabaseAPI?.getUsers) {
                    const usersResponse = await window.DatabaseAPI.getUsers();
                    const allUsers =
                        usersResponse?.data?.users ||
                        usersResponse?.data?.data?.users ||
                        usersResponse?.users ||
                        (Array.isArray(usersResponse?.data) ? usersResponse.data : []) ||
                        [];
                    const projectInfo = { ...metadata };
                    try {
                        await window.MentionHelper.processMentions(
                            commentText,
                            contextTitle,
                            contextLink,
                            currentUser.name || currentUser.email || 'Unknown',
                            allUsers,
                            projectInfo
                        );
                    } catch (err) {
                        console.error('❌ Error processing @mentions for weekly FMS review comment:', err);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Unexpected error in handleAddComment @mentions processing:', error);
        }

        // Notify prior participants (same as Document Collection) so emails trigger for replies and @mentions
        if ((priorComments.length > 0 || (window.MentionHelper && window.MentionHelper.hasMentions(commentText))) && window.DatabaseAPI?.makeRequest) {
            try {
                await window.DatabaseAPI.makeRequest('/notifications/comment-participants', {
                    method: 'POST',
                    body: JSON.stringify({
                        commentAuthorId: currentUser.id,
                        commentText,
                        entityAuthorId: null,
                        priorCommentAuthorIds: priorComments.map((c) => c.authorId).filter(Boolean),
                        priorCommentAuthorNames: priorComments.filter((c) => !c.authorId && (c.author || c.authorEmail)).map((c) => c.author || c.authorEmail).filter(Boolean),
                        priorCommentTexts: priorComments.map((c) => c.text).filter(Boolean),
                        authorName: currentUser.name || currentUser.email || 'Unknown',
                        contextTitle,
                        link: contextLink,
                        metadata
                    })
                });
            } catch (err) {
                console.error('❌ Error notifying prior participants for weekly FMS comment:', err);
            }
        }
    };
    
    const handleDeleteComment = async (sectionId, documentId, week, commentId) => {
        
        const currentUser = getCurrentUser();
        
        // Use current state (most up-to-date) or fallback to ref
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 
            ? sectionsByYear 
            : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        
        const section = currentYearSections.find(s => String(s.id) === String(sectionId));
        const doc = section?.documents.find(d => String(d.id) === String(documentId));
        const existingComments = getCommentsForYear(doc?.comments, week, selectedYear);
        
        if (!confirm('Delete this comment?')) return;
        
        // Get the week key to identify which key(s) to update
        const weekKey = getWeekKey(week, selectedYear);
        if (!weekKey) {
            console.error('Failed to get week key for comment deletion');
            return;
        }
        
        // Extract monthly key for cleanup
        const parts = weekKey.split('-');
        const monthKey = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : null;
        
        const updated = currentYearSections.map(section => {
            if (String(section.id) === String(sectionId)) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
                        if (String(doc.id) === String(documentId)) {
                            const comments = { ...(doc.comments || {}) };
                            const updatedComments = existingComments.filter(c => c.id !== commentId);
                            
                            // Set the weekly key with filtered comments
                            comments[weekKey] = updatedComments;
                            
                            // Also remove the comment from monthly key if it exists
                            // This prevents duplicates when reloading from database
                            if (monthKey && comments[monthKey]) {
                                const monthlyComments = Array.isArray(comments[monthKey]) 
                                    ? comments[monthKey] 
                                    : [];
                                const updatedMonthlyComments = monthlyComments.filter(c => {
                                    // Match by id, or by text+author if id doesn't match (for legacy data)
                                    if (c.id === commentId) return false;
                                    if (comment && comment.text && c.text === comment.text && c.author === comment.author) {
                                        return false;
                                    }
                                    return true;
                                });
                                if (updatedMonthlyComments.length === 0) {
                                    delete comments[monthKey];
                                } else {
                                    comments[monthKey] = updatedMonthlyComments;
                                }
                            }
                            
                            return {
                                ...doc,
                                comments
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
        
        // Force immediate save to ensure deletion persists
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        try {
            await saveToDatabase();
        } catch (error) {
            console.error('❌ Error saving comment deletion:', error);
        }
    };
    
    const getDocumentStatus = (doc, week) => {
        return getStatusForYear(doc.collectionStatus, week, selectedYear);
    };
    
    const getDocumentComments = (doc, week) => {
        return getCommentsForYear(doc.comments, week, selectedYear);
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
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            lastSavedDataRef.current = null;
            saveToDatabase();
        }
        setDragOverIndex(null);
    };

    const handleSectionDragOver = (e, sectionIndex) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(sectionIndex);
    };

    const handleSectionDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOverIndex(null);
    };

    // Document drag-and-drop (reorder documents within a section)
    const handleDocumentDragStart = (sectionId, docIndex, e) => {
        documentDragRef.current = { sectionId, docIndex };
        setDraggedDocument({ sectionId, docIndex });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(sectionId));
        setTimeout(() => { if (e.currentTarget) e.currentTarget.style.opacity = '0.5'; }, 0);
    };

    const handleDocumentDragEnd = (e) => {
        if (e.currentTarget) e.currentTarget.style.opacity = '1';
        documentDragRef.current = null;
        setDraggedDocument(null);
        setDragOverDocumentSectionId(null);
        setDragOverDocumentIndex(null);
    };

    const handleDocumentDragOver = (e, sectionId, docIndex) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverDocumentSectionId(sectionId);
        setDragOverDocumentIndex(docIndex);
    };

    const handleDocumentDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverDocumentSectionId(null);
            setDragOverDocumentIndex(null);
        }
    };

    const handleDocumentDrop = (e, sectionId, dropDocIndex) => {
        e.preventDefault();
        const drag = documentDragRef.current;
        if (!drag || String(drag.sectionId) !== String(sectionId) || drag.docIndex === dropDocIndex) {
            setDragOverDocumentSectionId(null);
            setDragOverDocumentIndex(null);
            return;
        }
        setSections(prev => prev.map(section => {
            if (String(section.id) !== String(sectionId)) return section;
            const docs = [...(section.documents || [])];
            const [removed] = docs.splice(drag.docIndex, 1);
            docs.splice(dropDocIndex, 0, removed);
            return { ...section, documents: docs };
        }));
        setDragOverDocumentSectionId(null);
        setDragOverDocumentIndex(null);
        documentDragRef.current = null;
        setDraggedDocument(null);
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        lastSavedDataRef.current = null;
        saveToDatabase();
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
                headerRow1.push(week.label, '');
                headerRow2.push('Status', 'Comments');
            });
            
            excelData.push(headerRow1, headerRow2);
            
            sections.forEach(section => {
                const sectionRow = [section.name];
                for (let i = 0; i < weeks.length * 2; i++) sectionRow.push('');
                excelData.push(sectionRow);
                
                section.documents.forEach(doc => {
                    const row = [`  ${doc.name}${doc.description ? ' - ' + doc.description : ''}`];
                    
                    weeks.forEach(week => {
                        const status = getStatusForYear(doc.collectionStatus, week, selectedYear);
                        const statusLabel = status ? statusOptions.find(s => s.value === status)?.label : '';
                        row.push(statusLabel || '');
                        
                        const comments = getCommentsForYear(doc.comments, week, selectedYear);
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
    
    useEffect(() => {
        // Auto-scroll removed - user controls scroll position
        
        // Smart positioning for comment popup
        const updatePopupPosition = () => {
            if (!hoverCommentCell) {
                return;
            }
            
            const commentButton = documentRef.querySelector(`[data-comment-cell="${hoverCommentCell}"]`);
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
        
        // Update immediately and on resize only (no scroll listener)
        if (hoverCommentCell) {
            setTimeout(updatePopupPosition, 50); // Wait for DOM to update
            window.addEventListener('resize', updatePopupPosition);
            
            return () => {
                window.removeEventListener('resize', updatePopupPosition);
            };
        }
    }, [hoverCommentCell, sections, commentPopupPosition]);
    
    useEffect(() => {
        const handleClickOutside = (event) => {
            const el = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
            const isCommentButton = el?.closest?.('[data-comment-cell]');
            const isInsidePopup = el?.closest?.('.comment-popup') || el?.closest?.('[data-comment-attachment]') || el?.closest?.('[data-comment-attachment-area]');
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
        
        documentRef.addEventListener('mousedown', handleClickOutside);
        return () => documentRef.removeEventListener('mousedown', handleClickOutside);
    }, [hoverCommentCell, selectedCells]);

    // Capture-phase listeners for attachment: trigger download, stop propagation so no navigation.
    useEffect(() => {
        if (!hoverCommentCell) return;
        const getAttachmentEl = (target) => {
            if (!target) return null;
            const node = target.nodeType === 1 ? target : target.parentElement;
            return node && typeof node.closest === 'function' ? node.closest('[data-comment-attachment]') : null;
        };
        const handleAttachmentMousedown = (e) => {
            const el = getAttachmentEl(e.target);
            if (!el) return;
            const url = el.getAttribute('data-url');
            const filename = el.getAttribute('data-download-name') || '';
            if (url) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                downloadCommentAttachment(url, filename);
            }
        };
        const handleAttachmentClick = (e) => {
            if (getAttachmentEl(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        };
        documentRef.addEventListener('mousedown', handleAttachmentMousedown, true);
        documentRef.addEventListener('click', handleAttachmentClick, true);
        return () => {
            documentRef.removeEventListener('mousedown', handleAttachmentMousedown, true);
            documentRef.removeEventListener('click', handleAttachmentClick, true);
        };
    }, [hoverCommentCell]);

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
            let deepWeek = null;
            let deepCommentId = null;
            let deepYear = null;
            
            // First check hash query params (for hash-based routing like #/projects/123?docSectionId=...)
            const hash = window.location.hash || '';
            if (hash.includes('?')) {
                const hashParts = hash.split('?');
                if (hashParts.length > 1) {
                    params = new URLSearchParams(hashParts[1]);
                    deepSectionId = params.get('docSectionId');
                    deepDocumentId = params.get('docDocumentId');
                    // Support both docWeek (new) and docMonth (legacy) for backward compatibility
                    deepWeek = params.get('docWeek') || params.get('docMonth');
                    deepCommentId = params.get('commentId');
                    deepYear = params.get('docYear') || params.get('year');
                }
            }
            
            // If not found in hash, check window.location.search (for regular URLs)
            if (!deepSectionId || !deepDocumentId || !deepWeek) {
                const search = window.location.search || '';
                if (search) {
                    params = new URLSearchParams(search);
                    if (!deepSectionId) deepSectionId = params.get('docSectionId');
                    if (!deepDocumentId) deepDocumentId = params.get('docDocumentId');
                    // Support both docWeek (new) and docMonth (legacy) for backward compatibility
                    if (!deepWeek) deepWeek = params.get('docWeek') || params.get('docMonth');
                    if (!deepCommentId) deepCommentId = params.get('commentId');
                    if (!deepYear) deepYear = params.get('docYear') || params.get('year');
                }
            }
            
            const parsedDeepYear = deepYear ? Number(deepYear) : null;
            const normalizedDeepYear = parsedDeepYear && !Number.isNaN(parsedDeepYear) ? parsedDeepYear : null;
            let isValidDocumentId = deepDocumentId && 
                                    deepDocumentId !== 'undefined' && 
                                    deepDocumentId.trim() !== '';
            
            // If year is specified and different from current, switch to that year first
            if (normalizedDeepYear && normalizedDeepYear !== selectedYear && deepSectionId && isValidDocumentId && deepWeek) {
                // Store pending comment open for after year change (include commentId so we scroll to it)
                pendingCommentOpenRef.current = {
                    sectionId: deepSectionId,
                    documentId: deepDocumentId,
                    week: deepWeek
                };
                handleYearChange(normalizedDeepYear);
                // Return early - will retry after year changes
                return;
            }

            // If we have commentId, search for the comment (like Document Collection) when not found at specified location
            if (deepCommentId && sections && sections.length > 0 && weeks && weeks.length > 0) {
                const commentIdToFind = String(deepCommentId);
                const commentIdNum = parseInt(deepCommentId, 10);
                const matchId = (c) => {
                    const cId = c.id;
                    return String(cId) === commentIdToFind || (typeof cId === 'number' && cId === commentIdNum) || (typeof commentIdNum === 'number' && !isNaN(commentIdNum) && cId === commentIdNum);
                };
                let found = false;
                if (deepSectionId && isValidDocumentId && deepWeek) {
                    const section = sections.find(s => String(s.id) === String(deepSectionId));
                    const doc = section?.documents?.find(d => String(d.id) === String(deepDocumentId));
                    if (doc) {
                        const weekObj = weeks.find(w => w.label === deepWeek || w.dateRange === deepWeek || String(w.number) === String(deepWeek));
                        if (weekObj) {
                            const comments = getCommentsForYear(doc.comments, weekObj, selectedYear);
                            if (comments.some(matchId)) found = true;
                        }
                    }
                }
                if (!found) {
                    for (const section of sections) {
                        if (!section.documents) continue;
                        for (const doc of section.documents) {
                            if (!doc.comments) continue;
                            for (const weekObj of weeks) {
                                const comments = getCommentsForYear(doc.comments, weekObj, selectedYear);
                                if (comments.some(matchId)) {
                                    deepSectionId = section.id;
                                    deepDocumentId = doc.id;
                                    deepWeek = weekObj.label;
                                    isValidDocumentId = true;
                                    found = true;
                                    break;
                                }
                            }
                            if (found) break;
                        }
                        if (found) break;
                    }
                }
            }
            
            if (deepSectionId && deepDocumentId && deepWeek) {
                // Convert deepWeek to week number format for cell key
                // deepWeek might be "Week 1 (Dec 29 - Jan 5)" or "W01" or "1"
                let weekNum = null;
                const weekMatch = String(deepWeek).match(/Week\s+(\d+)/i) || String(deepWeek).match(/W(\d+)/i) || String(deepWeek).match(/^(\d+)$/);
                if (weekMatch) {
                    weekNum = parseInt(weekMatch[1], 10);
                } else {
                    // Try to find by label
                    const weekObj = weeks.find(w => w.label === deepWeek || w.dateRange === deepWeek);
                    if (weekObj) {
                        weekNum = weekObj.number;
                    }
                }
                const weekKey = weekNum ? `W${String(weekNum).padStart(2, '0')}` : deepWeek;
                const cellKey = `${deepSectionId}-${deepDocumentId}-${weekKey}`;
                
                // Set initial position (will be updated once cell is found)
                setCommentPopupPosition({
                    top: Math.max(window.innerHeight / 2 - 160, 60),
                    left: Math.max(window.innerWidth / 2 - 180, 20)
                });
                
                // Open the popup immediately and clear pending so we don't re-run after year change
                pendingCommentOpenRef.current = null;
                setHoverCommentCell(cellKey);
                
                // Find the comment button for this cell and reposition popup near it using smart positioning
                const positionPopup = () => {
                    const commentButton = documentRef.querySelector(`[data-comment-cell="${cellKey}"]`);
                    if (commentButton) {
                        try {
                            commentButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                        } catch (_) {
                            commentButton.scrollIntoView(true);
                        }
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
                        // deepWeek might be a week label or week number, try both
                        let cell = documentRef.querySelector(`[data-section-id="${deepSectionId}"][data-document-id="${deepDocumentId}"][data-week-label="${deepWeek}"]`);
                        if (!cell) {
                            // Try by week number if deepWeek is a number or week label
                            const weekMatch = String(deepWeek).match(/Week\s+(\d+)/i) || String(deepWeek).match(/W(\d+)/i) || String(deepWeek).match(/(\d+)/);
                            const weekNum = weekMatch ? weekMatch[1] : null;
                            if (weekNum) {
                                cell = documentRef.querySelector(`[data-section-id="${deepSectionId}"][data-document-id="${deepDocumentId}"][data-week="${weekNum}"]`);
                            }
                        }
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
                
                // Scroll to specific comment if commentId is provided
                if (deepCommentId) {
                    const scrollToComment = () => {
                        const commentElement = window.document.getElementById(`comment-${deepCommentId}`);
                        const container = commentPopupContainerRef.current;
                        if (commentElement && container) {
                            // Calculate scroll position to center the comment in the container
                            // Use offsetTop relative to the container's scrollable content
                            const containerScrollTop = container.scrollTop;
                            const commentOffsetTop = commentElement.offsetTop - container.offsetTop;
                            const containerHeight = container.clientHeight;
                            const commentHeight = commentElement.offsetHeight;
                            
                            // Center the comment vertically in the visible area
                            const targetScrollTop = commentOffsetTop - (containerHeight / 2) + (commentHeight / 2);
                            
                            container.scrollTo({
                                top: Math.max(0, targetScrollTop),
                                behavior: 'smooth'
                            });
                            
                            // Highlight the comment briefly with a subtle animation
                            commentElement.style.transition = 'background-color 0.3s ease';
                            commentElement.style.backgroundColor = '#fef3c7'; // yellow highlight
                            setTimeout(() => {
                                commentElement.style.backgroundColor = '';
                                setTimeout(() => {
                                    commentElement.style.transition = '';
                                }, 300);
                            }, 2000);
                            
                            console.log('✅ Scrolled to comment:', deepCommentId);
                            return true;
                        }
                        return false;
                    };
                    
                    // Try scrolling immediately, then retry a few times (wait for popup to render)
                    setTimeout(() => {
                        if (!scrollToComment()) {
                            let scrollAttempts = 0;
                            const maxScrollAttempts = 10;
                            const scrollRetry = setInterval(() => {
                                scrollAttempts++;
                                if (scrollToComment() || scrollAttempts >= maxScrollAttempts) {
                                    clearInterval(scrollRetry);
                                }
                            }, 200);
                        }
                    }, 100); // Small delay to ensure popup is rendered
                }
            }
        } catch (error) {
            console.warn('⚠️ Failed to apply weekly FMS review deep-link:', error);
        }
    }, [sections, sectionsByYear, selectedYear, weeks, handleYearChange]);
    
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
    
    // When year changes, check if we have a pending comment to open
    useEffect(() => {
        if (pendingCommentOpenRef.current && sections && sections.length > 0) {
            const timer = setTimeout(() => {
                checkAndOpenDeepLink();
            }, 500); // Wait a bit longer for sections to render after year change
            return () => clearTimeout(timer);
        }
    }, [selectedYear, sections.length, checkAndOpenDeepLink]);
    
    // ============================================================
    // RENDER STATUS CELL
    // ============================================================
    
    const renderStatusCell = (section, doc, week) => {
        const status = getDocumentStatus(doc, week);
        const statusConfig = status ? getStatusConfig(status) : null;
        const comments = getDocumentComments(doc, week);
        const hasComments = comments.length > 0;
        // Use week number for cell key (more reliable than label which contains special chars)
        // Use week number for cell key (more reliable than label which contains special chars)
        const weekNumber = typeof week === 'object' ? week.number : (typeof week === 'string' ? parseInt(week.match(/Week\s+(\d+)/i)?.[1] || week.match(/\d+/)?.[0] || '0') : week);
        const weekLabel = typeof week === 'object' ? week.label : week;
        const cellKey = `${section.id}-${doc.id}-W${String(weekNumber).padStart(2, '0')}`;
        const isPopupOpen = hoverCommentCell === cellKey;
        const isSelected = selectedCells.has(cellKey);
        
        const isWorkingWeek = workingWeeks.includes(weekNumber) && selectedYear === currentYear;
        let cellBackgroundClass = statusConfig 
            ? statusConfig.cellColor 
            : (isWorkingWeek ? 'bg-primary-50' : '');
        
        // Add selection styling (with higher priority)
        if (isSelected) {
            cellBackgroundClass = 'bg-blue-200 border-2 border-blue-500';
        }
        
        const baseTextColorClass = statusConfig && statusConfig.color 
            ? statusConfig.color.split(' ').find(cls => cls.startsWith('text-')) || 'text-gray-900'
            : 'text-gray-400';
        
        const textColorClass = isSelected ? 'text-white' : baseTextColorClass;
        
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
                            // Only apply to selected cells if:
                            // 1. There are multiple selected cells (more than just this one)
                            // 2. This cell is part of the selection
                            // This prevents accidentally applying to cells that were selected unintentionally
                            const applyToSelected = currentSelectedCells.size > 1 && currentSelectedCells.has(cellKey);
                            
                            handleUpdateStatus(section.id, doc.id, week, newStatus, applyToSelected);
                        }}
                        onBlur={(e) => {
                            // Ensure state is saved on blur
                            const newStatus = e.target.value;
                            if (newStatus !== status) {
                                const currentSelectedCells = selectedCellsRef.current;
                                // Only apply to selected cells if there are multiple selected
                                const applyToSelected = currentSelectedCells.size > 1 && currentSelectedCells.has(cellKey);
                                handleUpdateStatus(section.id, doc.id, week, newStatus, applyToSelected);
                            }
                        }}
                        onMouseDown={(e) => {
                            // Clear selection when clicking on dropdown (unless Ctrl/Cmd is held for multi-select)
                            if (!e.ctrlKey && !e.metaKey) {
                                // Clear any existing selection when user clicks on dropdown
                                const currentSelectedCells = selectedCellsRef.current;
                                if (currentSelectedCells.size > 0) {
                                    const newSet = new Set([cellKey]); // Keep only this cell selected
                                    setSelectedCells(newSet);
                                    selectedCellsRef.current = newSet;
                                }
                                e.stopPropagation();
                            }
                            // Allow Ctrl/Cmd+Click to bubble up for multi-select
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
                        aria-label={`Status for ${doc.name || 'document'} in ${weekLabel} ${selectedYear}`}
                        role="combobox"
                        aria-haspopup="listbox"
                        data-section-id={section.id}
                        data-document-id={doc.id}
                        data-week={weekNumber}
                        data-week-label={weekLabel}
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
                                    // Clear URL params when closing popup (but preserve project path)
                                    if (window.RouteState && window.RouteState.navigate && project?.id) {
                                        window.RouteState.navigate({
                                            page: 'projects',
                                            segments: [String(project.id)],
                                            hash: '',
                                            search: '',
                                            replace: false,
                                            preserveSearch: false,
                                            preserveHash: false
                                        });
                                    }
                                } else {
                                    // Set initial position - smart positioning will update it
                                    setHoverCommentCell(cellKey);
                                    
                                    // Update URL with deep link when opening popup (week is the week param; weekLabel is derived from it)
                                    if (section && doc && weekLabel && project?.id) {
                                        const deepLinkUrl = `#/projects/${project.id}?docSectionId=${encodeURIComponent(section.id)}&docDocumentId=${encodeURIComponent(doc.id)}&docWeek=${encodeURIComponent(weekLabel)}&docYear=${encodeURIComponent(selectedYear)}`;
                                        
                                        if (window.RouteState && window.RouteState.navigate) {
                                            window.RouteState.navigate({
                                                page: 'projects',
                                                segments: [String(project.id)],
                                                hash: deepLinkUrl.replace('#', ''),
                                                replace: false,
                                                preserveSearch: false,
                                                preserveHash: false
                                            });
                                        } else {
                                            window.location.hash = deepLinkUrl;
                                        }
                                    }
                                    
                                    // Trigger position update after state is set
                                    setTimeout(() => {
                                        const commentButton = documentRef.querySelector(`[data-comment-cell="${cellKey}"]`);
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
        const templateDocumentDragRef = useRef(null);
        const [dragOverTemplateDoc, setDragOverTemplateDoc] = useState({ sectionIdx: null, docIdx: null });
        
        const handleTemplateDocDragStart = (sectionIdx, docIdx, e) => {
            templateDocumentDragRef.current = { sectionIdx, docIdx };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `${sectionIdx}-${docIdx}`);
            setTimeout(() => { if (e.currentTarget) e.currentTarget.style.opacity = '0.5'; }, 0);
        };
        const handleTemplateDocDragEnd = (e) => {
            if (e.currentTarget) e.currentTarget.style.opacity = '1';
            templateDocumentDragRef.current = null;
            setDragOverTemplateDoc({ sectionIdx: null, docIdx: null });
        };
        const handleTemplateDocDragOver = (e, sectionIdx, docIdx) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverTemplateDoc({ sectionIdx, docIdx });
        };
        const handleTemplateDocDragLeave = (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDragOverTemplateDoc({ sectionIdx: null, docIdx: null });
        };
        const handleTemplateDocDrop = (e, sectionIdx, dropDocIdx) => {
            e.preventDefault();
            const drag = templateDocumentDragRef.current;
            if (!drag || drag.sectionIdx !== sectionIdx || drag.docIdx === dropDocIdx) {
                setDragOverTemplateDoc({ sectionIdx: null, docIdx: null });
                templateDocumentDragRef.current = null;
                return;
            }
            setFormData(prev => {
                const newSections = prev.sections.map((sec, i) => {
                    if (i !== sectionIdx) return sec;
                    const docs = [...(sec.documents || [])];
                    const [removed] = docs.splice(drag.docIdx, 1);
                    docs.splice(dropDocIdx, 0, removed);
                    return { ...sec, documents: docs };
                });
                return { ...prev, sections: newSections };
            });
            setDragOverTemplateDoc({ sectionIdx: null, docIdx: null });
            templateDocumentDragRef.current = null;
        };
        
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
                                                <div
                                                    key={docIdx}
                                                    draggable
                                                    onDragStart={(e) => handleTemplateDocDragStart(idx, docIdx, e)}
                                                    onDragEnd={handleTemplateDocDragEnd}
                                                    onDragOver={(e) => handleTemplateDocDragOver(e, idx, docIdx)}
                                                    onDragLeave={handleTemplateDocDragLeave}
                                                    onDrop={(e) => handleTemplateDocDrop(e, idx, docIdx)}
                                                    className={`flex items-center gap-1 bg-white p-1.5 rounded border transition-colors cursor-grab active:cursor-grabbing ${dragOverTemplateDoc.sectionIdx === idx && dragOverTemplateDoc.docIdx === docIdx ? 'border-primary-300 ring-1 ring-primary-200 bg-primary-50' : 'border-gray-200'}`}
                                                >
                                                    <span className="inline-flex cursor-grab active:cursor-grabbing text-gray-400 flex-shrink-0" title="Drag to reorder">
                                                        <i className="fas fa-grip-vertical text-[9px]"></i>
                                                    </span>
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
        <div ref={scrollSyncRootRef} className="space-y-3" data-scroll-sync-root>
            {/* Comment Popup */}
            {hoverCommentCell && (() => {
                // IMPORTANT: Section/document IDs can be strings (e.g. "file3", "file3-doc1")
                // Never parseInt them – always compare as strings to ensure we find the right row.
                // Cell key format: "sectionId-documentId-W##" (e.g., "section1-doc1-W01")
                const parts = hoverCommentCell.split('-');
                const weekPart = parts.slice(-1)[0]; // Last part is week (e.g., "W01")
                const documentId = parts[parts.length - 2];
                const sectionId = parts.slice(0, -2).join('-'); // Everything before last two parts
                
                const section = sections.find(s => String(s.id) === String(sectionId));
                const doc = section?.documents.find(d => String(d.id) === String(documentId));
                
                // Extract week number from "W01" format and find the week object
                const weekMatch = weekPart.match(/W(\d+)/i);
                const weekNum = weekMatch ? parseInt(weekMatch[1], 10) : null;
                const weekObj = weekNum ? weeks.find(w => w.number === weekNum) : null;
                const comments = doc && weekObj ? getDocumentComments(doc, weekObj) : [];
                
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
                                    {doc.name || 'Document'} • {weekObj ? `${weekObj.label} (${weekObj.dateRange})` : weekLabel}
                                </div>
                            </div>
                        )}
                        {comments.length > 0 && (
                            <div className="mb-3">
                                <div className="text-[10px] font-semibold text-gray-600 mb-1.5">Comments</div>
                                <div 
                                    key={`comment-container-${hoverCommentCell}`}
                                    ref={commentPopupContainerRef}
                                    className="comment-scroll-container mb-2"
                                >
                                    <div className="space-y-2 pr-1">
                                        {comments.map((comment, idx) => (
                                        <div 
                                            key={comment.id || idx} 
                                            data-comment-id={comment.id}
                                            id={comment.id ? `comment-${comment.id}` : undefined}
                                            className="pb-2 border-b last:border-b-0 bg-gray-50 rounded p-1.5 relative group cursor-pointer"
                                            onClick={(e) => {
                                                const ce = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
                                                if (ce?.closest?.('[data-comment-attachment]') || ce?.closest?.('[data-comment-attachment-area]')) {
                                                    e.stopPropagation();
                                                    return;
                                                }
                                                // Update URL when clicking on a comment to enable sharing
                                                if (section && doc && weekObj && comment.id) {
                                                    const deepLinkUrl = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(section.id)}&docDocumentId=${encodeURIComponent(doc.id)}&docWeek=${encodeURIComponent(weekObj.label)}&docYear=${encodeURIComponent(selectedYear)}&commentId=${encodeURIComponent(comment.id)}`;
                                                    
                                                    // Update URL using RouteState if available, otherwise use hash
                                                    if (window.RouteState && window.RouteState.navigate) {
                                                        const url = new URL(window.location.href);
                                                        url.hash = deepLinkUrl.replace('#', '');
                                                        window.RouteState.navigate({
                                                            page: 'projects',
                                                            segments: [String(project?.id || '')],
                                                            hash: deepLinkUrl.replace('#', ''),
                                                            replace: false,
                                                            preserveSearch: false,
                                                            preserveHash: false
                                                        });
                                                    } else {
                                                        window.location.hash = deepLinkUrl;
                                                    }
                                                    
                                                    // Copy to clipboard
                                                    const fullUrl = window.location.origin + window.location.pathname + deepLinkUrl;
                                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                                        navigator.clipboard.writeText(fullUrl).then(() => {
                                                            // Show brief feedback
                                                            const button = window.document.querySelector(`[data-copy-link="${comment.id}"]`);
                                                            if (button) {
                                                                const originalHTML = button.innerHTML;
                                                                button.innerHTML = '<i class="fas fa-check text-[9px]"></i>';
                                                                button.className = button.className.replace('text-gray-400', 'text-green-600');
                                                                setTimeout(() => {
                                                                    button.innerHTML = originalHTML;
                                                                    button.className = button.className.replace('text-green-600', 'text-gray-400');
                                                                }, 1500);
                                                            }
                                                        }).catch(err => {
                                                            console.warn('Failed to copy link:', err);
                                                        });
                                                    }
                                                }
                                            }}
                                            title="Click to copy link to this comment"
                                        >
                                            <p
                                                className="text-xs text-gray-700 whitespace-pre-wrap pr-12"
                                                dangerouslySetInnerHTML={{
                                                    __html:
                                                        window.MentionHelper && comment.text
                                                            ? window.MentionHelper.highlightMentions(comment.text)
                                                            : (comment.text || '')
                                                }}
                                            />
                                            {Array.isArray(comment.attachments) && comment.attachments.length > 0 && (
                                                <div
                                                    className="mt-1 flex flex-wrap gap-1"
                                                    data-comment-attachment-area="true"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {comment.attachments.map((att, i) => {
                                                        const fullUrl = (att.url && /^https?:\/\//i.test(att.url)) ? att.url : (window.location.origin + (att.url || ''));
                                                        const downloadName = att.name || (att.url && att.url.split('/').pop()) || 'attachment';
                                                        return (
                                                            <button
                                                                key={i}
                                                                type="button"
                                                                data-comment-attachment="true"
                                                                data-url={fullUrl}
                                                                data-download-name={downloadName}
                                                                className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer bg-transparent border-0 p-0 font-inherit align-baseline"
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    e.stopImmediatePropagation();
                                                                    downloadCommentAttachment(fullUrl, downloadName);
                                                                }}
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    e.stopImmediatePropagation();
                                                                }}
                                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); downloadCommentAttachment(fullUrl, downloadName); } }}
                                                                title={`Download ${downloadName}`}
                                                            >
                                                                <i className="fas fa-paperclip text-[8px]"></i> <span>{att.name || downloadName}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                <span className="font-medium">{comment.author}</span>
                                                <span>{comment.date ? (() => {
                                                    try {
                                                        const date = new Date(comment.date);
                                                        if (isNaN(date.getTime())) return 'Invalid Date';
                                                        return date.toLocaleString('en-ZA', { 
                                                            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                                        });
                                                    } catch (e) {
                                                        return 'Invalid Date';
                                                    }
                                                })() : 'No date'}</span>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent triggering comment click
                                                    if (!section || !doc || !weekObj) return;
                                                    handleDeleteComment(section.id, doc.id, weekObj, comment.id);
                                                }}
                                                className="absolute top-1 right-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                type="button"
                                                title="Delete comment"
                                            >
                                                <i className="fas fa-trash text-[10px]"></i>
                                            </button>
                                            <button
                                                data-copy-link={comment.id}
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent triggering comment click
                                                    if (!section || !doc || !weekObj || !comment.id) return;
                                                    
                                                    const deepLinkUrl = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(section.id)}&docDocumentId=${encodeURIComponent(doc.id)}&docWeek=${encodeURIComponent(weekObj.label)}&docYear=${encodeURIComponent(selectedYear)}&commentId=${encodeURIComponent(comment.id)}`;
                                                    const fullUrl = window.location.origin + window.location.pathname + deepLinkUrl;
                                                    
                                                    // Copy to clipboard
                                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                                        navigator.clipboard.writeText(fullUrl).then(() => {
                                                            // Show feedback
                                                            const button = e.currentTarget;
                                                            const originalHTML = button.innerHTML;
                                                            button.innerHTML = '<i class="fas fa-check text-[9px]"></i>';
                                                            button.className = button.className.replace('text-gray-400', 'text-green-600');
                                                            setTimeout(() => {
                                                                button.innerHTML = originalHTML;
                                                                button.className = button.className.replace('text-green-600', 'text-gray-400');
                                                            }, 1500);
                                                        }).catch(err => {
                                                            console.warn('Failed to copy link:', err);
                                                        });
                                                    }
                                                }}
                                                className="absolute top-1 right-6 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                type="button"
                                                title="Copy link to this comment"
                                            >
                                                <i className="fas fa-link text-[9px]"></i>
                                            </button>
                                        </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold text-gray-600">Add Comment</span>
                                <div className="flex items-center gap-1">
                                    <input
                                        ref={commentFileInputRef}
                                        type="file"
                                        multiple
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt"
                                        onChange={(e) => {
                                            const files = e.target.files;
                                            if (files?.length) {
                                                const newItems = Array.from(files).map((f) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, file: f, name: f.name }));
                                                setPendingCommentAttachments((prev) => [...prev, ...newItems]);
                                            }
                                            e.target.value = '';
                                        }}
                                    />
                                    <button type="button" onClick={() => commentFileInputRef.current?.click()} className="p-1 text-gray-500 hover:text-gray-700 rounded" title="Attach files"><i className="fas fa-paperclip text-[12px]"></i></button>
                                </div>
                            </div>
                            {pendingCommentAttachments.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1.5">
                                    {pendingCommentAttachments.map((p) => (
                                        <span key={p.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-200 rounded text-[10px]">
                                            {p.name}
                                            <button type="button" onClick={() => setPendingCommentAttachments((prev) => prev.filter((x) => x.id !== p.id))} className="ml-0.5 text-gray-500 hover:text-red-600">×</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            {commentInputAvailable && section && doc && weekObj ? (
                                <window.CommentInputWithMentions
                                    onSubmit={async (commentText) => {
                                        if (!commentText?.trim()) return;
                                        let atts = [];
                                        if (pendingCommentAttachments.length > 0) {
                                            setUploadingCommentAttachments(true);
                                            try {
                                                atts = await uploadCommentAttachments(pendingCommentAttachments);
                                                setPendingCommentAttachments([]);
                                            } catch (err) {
                                                alert(err.message || 'Failed to upload attachments');
                                                setUploadingCommentAttachments(false);
                                                return;
                                            }
                                            setUploadingCommentAttachments(false);
                                        }
                                        handleAddComment(section.id, doc.id, weekObj, commentText, atts);
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
                                            if (e.key === 'Enter' && e.ctrlKey && section && doc && weekObj) {
                                                e.preventDefault();
                                                (async () => {
                                                    if (!quickComment.trim()) return;
                                                    let atts = [];
                                                    if (pendingCommentAttachments.length > 0) {
                                                        setUploadingCommentAttachments(true);
                                                        try {
                                                            atts = await uploadCommentAttachments(pendingCommentAttachments);
                                                            setPendingCommentAttachments([]);
                                                        } catch (err) {
                                                            alert(err.message || 'Failed to upload attachments');
                                                            setUploadingCommentAttachments(false);
                                                            return;
                                                        }
                                                        setUploadingCommentAttachments(false);
                                                    }
                                                    handleAddComment(section.id, doc.id, weekObj, quickComment, atts);
                                                    setQuickComment('');
                                                })();
                                            }
                                        }}
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                        rows="2"
                                        placeholder="Type comment... (Ctrl+Enter to submit)"
                                        autoFocus
                                    />
                                    <button
                                        onClick={async () => {
                                            if (!section || !doc || !weekObj || !quickComment.trim()) return;
                                            let atts = [];
                                            if (pendingCommentAttachments.length > 0) {
                                                setUploadingCommentAttachments(true);
                                                try {
                                                    atts = await uploadCommentAttachments(pendingCommentAttachments);
                                                    setPendingCommentAttachments([]);
                                                } catch (err) {
                                                    alert(err.message || 'Failed to upload attachments');
                                                    setUploadingCommentAttachments(false);
                                                    return;
                                                }
                                                setUploadingCommentAttachments(false);
                                            }
                                            handleAddComment(section.id, doc.id, weekObj, quickComment, atts);
                                            setQuickComment('');
                                        }}
                                        disabled={!quickComment.trim() || uploadingCommentAttachments}
                                        className="mt-1.5 w-full px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 disabled:opacity-50"
                                    >
                                        {uploadingCommentAttachments ? 'Uploading…' : 'Add Comment'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    </>
                );
            })()}
            
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={onBack} 
                                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <i className="fas fa-arrow-left"></i>
                            </button>
                            <div>
                                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Weekly FMS Review Tracker</h1>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {project?.name}
                                    {project?.client && ` • ${project.client}`}
                                    {' • Facilities: '}
                                    <span className="font-medium">{getFacilitiesLabel(project) || 'Not specified'}</span>
                                </p>
                            </div>
                        </div>
                        
                        <button
                            onClick={handleExportToExcel}
                            disabled={isExporting || sections.length === 0}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center gap-1.5 self-start lg:self-auto"
                        >
                            {isExporting ? (
                                <><i className="fas fa-spinner fa-spin"></i><span>Exporting...</span></>
                            ) : (
                                <><i className="fas fa-file-excel"></i><span>Export</span></>
                            )}
                        </button>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                            <label className="text-xs font-semibold text-gray-700">Year:</label>
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
                                className="text-sm font-medium text-gray-900 bg-transparent border-0 focus:ring-0 cursor-pointer"
                            >
                                {yearOptions.map(year => (
                                    <option key={year} value={year}>{year}{year === currentYear && ' (Current)'}</option>
                                ))}
                            </select>
                        </div>
                        
                        <button
                            onClick={handleAddSection}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-semibold transition-all shadow-sm hover:shadow-md flex items-center gap-1.5"
                        >
                            <i className="fas fa-plus"></i><span>Add Section</span>
                        </button>
                        
                        <div className="flex items-center gap-1.5 border-l border-gray-300 pl-3 ml-1">
                            <div className="relative" ref={templateDropdownRef}>
                                <button
                                    onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-semibold transition-all shadow-sm hover:shadow-md flex items-center gap-1.5"
                                >
                                    <i className="fas fa-layer-group"></i><span>Templates</span>
                                    <i className={`fas fa-chevron-${isTemplateDropdownOpen ? 'up' : 'down'} text-xs`}></i>
                                </button>
                                
                                {isTemplateDropdownOpen && (
                                    <div className="absolute left-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                                        <button
                                            onClick={() => {
                                                setShowApplyTemplateModal(true);
                                                setIsTemplateDropdownOpen(false);
                                            }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2 transition-colors"
                                        >
                                            <i className="fas fa-magic text-purple-600"></i>
                                            <span>Apply Template</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowTemplateModal(true);
                                                setIsTemplateDropdownOpen(false);
                                            }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors"
                                        >
                                            <i className="fas fa-layer-group text-indigo-600"></i>
                                            <span>Manage Templates</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                try {
                                                    if (!sections || sections.length === 0) {
                                                        alert('There are no sections in this year to save as a template.');
                                                        setIsTemplateDropdownOpen(false);
                                                        return;
                                                    }
                                                    const defaultName = `${project?.name || 'Project'} - ${selectedYear} template`;
                                                    const name = window.prompt('Template name', defaultName);
                                                    if (!name || !name.trim()) {
                                                        setIsTemplateDropdownOpen(false);
                                                        return;
                                                    }
                                                    setEditingTemplate(null);
                                                    setPrefilledTemplate({
                                                        name: name.trim(),
                                                        description: `Saved from ${project?.name || 'project'} - year ${selectedYear}`,
                                                        sections: buildTemplateSectionsFromCurrent()
                                                    });
                                                    setShowTemplateList(false);
                                                    setShowTemplateModal(true);
                                                    setIsTemplateDropdownOpen(false);
                                                } catch (e) {
                                                    console.error('❌ Failed to prepare template from current year:', e);
                                                    alert('Could not prepare template from current year. See console for details.');
                                                    setIsTemplateDropdownOpen(false);
                                                }
                                            }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2 transition-colors"
                                            title="Save current year as template"
                                        >
                                            <i className="fas fa-save text-amber-600"></i>
                                            <span>Save Template</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Legend */}
            <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Status Legend:</span>
                    {statusOptions.map((option, idx) => (
                        <React.Fragment key={option.value}>
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                                <div className={`w-4 h-4 rounded-full ${option.cellColor || 'bg-gray-200'} ring-2 ring-white shadow-sm`}></div>
                                <span className="text-xs font-medium text-gray-700">{option.label}</span>
                            </div>
                            {idx < statusOptions.length - 1 && <i className="fas fa-arrow-right text-xs text-gray-400"></i>}
                        </React.Fragment>
                    ))}
                </div>
            </div>
            
            {/* Per-section tables with independent horizontal scroll */}
            <div className="space-y-3">
                {sections.length === 0 ? (
                    <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center">
                                <i className="fas fa-folder-open text-3xl text-primary-600"></i>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-gray-900">No sections yet</p>
                                <p className="text-sm text-gray-600 mt-1">Create your first section to start organizing documents</p>
                            </div>
                            <button
                                onClick={handleAddSection}
                                className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                            >
                                <i className="fas fa-plus"></i><span>Add First Section</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    sections.map((section, sectionIndex) => (
                        <div
                            key={section.id}
                            className={`bg-white rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${dragOverIndex === sectionIndex ? 'ring-2 ring-primary-500 ring-offset-2 border-primary-300' : 'border-gray-200'}`}
                            draggable="true"
                            onDragStart={(e) => handleSectionDragStart(e, section, sectionIndex)}
                            onDragEnd={handleSectionDragEnd}
                            onDragOver={(e) => handleSectionDragOver(e, sectionIndex)}
                            onDragLeave={handleSectionDragLeave}
                            onDrop={(e) => handleSectionDrop(e, sectionIndex)}
                        >
                            {/* Section header */}
                            <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                    <i className="fas fa-grip-vertical text-gray-400 text-sm"></i>
                                    <div className="flex-1">
                                        <div className="font-bold text-base text-gray-900 flex items-center gap-2">
                                            <span>#{sectionIndex + 1}</span>
                                            <span>{section.name}</span>
                                        </div>
                                        {section.description && (
                                            <div className="text-xs text-gray-600 mt-1">{section.description}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-gray-200">
                                        <label className="text-xs font-semibold text-gray-700">Reviewer:</label>
                                        <select
                                            value={section.reviewer || ''}
                                            onChange={(e) => handleUpdateReviewer(section.id, e.target.value)}
                                            className="text-xs font-medium text-gray-900 bg-transparent border-0 focus:ring-0 cursor-pointer"
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
                                        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700 transition-all shadow-sm hover:shadow-md flex items-center gap-1.5"
                                    >
                                        <i className="fas fa-plus"></i><span>Add Document</span>
                                    </button>
                                    <button
                                        onClick={() => handleEditSection(section)}
                                        className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                        title="Edit section"
                                    >
                                        <i className="fas fa-edit text-sm"></i>
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteSection(section.id, e)}
                                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        type="button"
                                        title="Delete section"
                                    >
                                        <i className="fas fa-trash text-sm"></i>
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable week/document grid for this section only */}
                            <div data-scroll-sync className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gradient-to-b from-gray-100 to-gray-50">
                                        <tr>
                                            <th
                                                className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider sticky left-0 bg-gradient-to-b from-gray-100 to-gray-50 z-20 border-r-2 border-gray-300"
style={{ boxShadow: STICKY_COLUMN_SHADOW, width: '300px', minWidth: '300px', maxWidth: '300px' }}
                                                >
                                                Document / Data
                                            </th>
                                            {weeks.map((week) => (
                                                <th
                                                    key={week.label}
                                                    className={`px-3 py-3 text-center text-xs font-bold uppercase tracking-wider border-l-2 border-gray-200 ${
                                                        workingWeeks.includes(week.number) && selectedYear === currentYear
                                                            ? 'bg-primary-100 text-primary-800 border-primary-300'
                                                            : 'text-gray-700'
                                                    }`}
                                                    title={week.dateRange}
                                                >
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span className="text-[10px]">{week.label}</span>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider border-l-2 border-gray-300">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody
                                        className="bg-white divide-y divide-gray-200"
                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    >
                                        {section.documents.length === 0 ? (
                                            <tr>
                                                <td colSpan={weeks.length + 2} className="px-8 py-12 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                                            <i className="fas fa-file-alt text-2xl text-gray-400"></i>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-700">No documents in this section</p>
                                                            <p className="text-xs text-gray-500 mt-1">Get started by adding your first document</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleAddDocument(section.id)}
                                                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                                                        >
                                                            <i className="fas fa-plus"></i><span>Add Document</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            section.documents.map((doc, docIndex) => (
                                                <tr
                                                    key={doc.id}
                                                    className={`transition-colors border-b border-gray-100 cursor-grab active:cursor-grabbing ${dragOverDocumentSectionId === section.id && dragOverDocumentIndex === docIndex ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-gray-50'}`}
                                                    draggable
                                                    onDragStart={(e) => handleDocumentDragStart(section.id, docIndex, e)}
                                                    onDragEnd={handleDocumentDragEnd}
                                                    onDragOver={(e) => handleDocumentDragOver(e, section.id, docIndex)}
                                                    onDragLeave={handleDocumentDragLeave}
                                                    onDrop={(e) => handleDocumentDrop(e, section.id, docIndex)}
                                                >
                                                    <td
                                                        className="px-4 py-3 sticky left-0 bg-white z-20 border-r-2 border-gray-300"
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW, width: '300px', minWidth: '300px', maxWidth: '300px' }}
                                                    >
                                                        <div className="w-full flex items-start gap-2">
                                                            <span className="inline-flex cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5" title="Drag to reorder">
                                                                <i className="fas fa-grip-vertical text-[10px]"></i>
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-semibold text-gray-900 mb-1">{doc.name}</div>
                                                            {doc.description && (() => {
                                                                const { truncated, isLong } = truncateDescription(String(doc.description));
                                                                return (
                                                                    <div className="text-[10px] text-gray-500 flex items-center gap-1 overflow-hidden">
                                                                        <span className="truncate flex-1 min-w-0">{truncated}</span>
                                                                        {isLong && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setExpandedDescriptionId(doc.id);
                                                                                }}
                                                                                className="text-primary-600 hover:text-primary-700 underline cursor-pointer flex-shrink-0"
                                                                            >
                                                                                ...more
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                            {/* Assign: compact icon + chips; dropdown fixed so not covered */}
                                                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                                {normalizeAssignedTo(doc).map((uid, i) => (
                                                                    <span
                                                                        key={`${doc.id}-${i}-${uid}`}
                                                                        className="inline-flex items-center gap-0.5 group/avatar"
                                                                    >
                                                                        <span
                                                                            title={getAssigneeLabel(uid)}
                                                                            className="w-6 h-6 rounded-full bg-primary-100 text-primary-800 flex items-center justify-center text-[10px] font-semibold shrink-0"
                                                                        >
                                                                            {getAssigneeInitials(uid)}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const next = normalizeAssignedTo(doc).filter((_, j) => j !== i);
                                                                                handleAssignmentChange(section.id, doc.id, next);
                                                                            }}
                                                                            className="opacity-0 group-hover/avatar:opacity-100 text-gray-500 hover:text-red-600 p-0.5 rounded"
                                                                            aria-label={`Remove ${getAssigneeLabel(uid)}`}
                                                                        >
                                                                            <i className="fas fa-times text-[8px]"></i>
                                                                        </button>
                                                                    </span>
                                                                ))}
                                                                <button
                                                                    type="button"
                                                                    title="Assign User"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const isOpen = assignmentOpen?.sectionId === section.id && assignmentOpen?.docId === doc.id;
                                                                        if (isOpen) {
                                                                            setAssignmentOpen(null);
                                                                            setAssignmentAnchorRect(null);
                                                                        } else {
                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                            setAssignmentOpen({ sectionId: section.id, docId: doc.id });
                                                                            setAssignmentAnchorRect({ top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width });
                                                                        }
                                                                    }}
                                                                    className="inline-flex items-center justify-center w-6 h-6 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
                                                                    aria-label="Assign User"
                                                                >
                                                                    <i className="fas fa-user-plus text-xs"></i>
                                                                </button>
                                                            </div>
                                                            </div>
                                                    </td>
                                                    {weeks.map((week) => (
                                                        <React.Fragment key={`${doc.id}-${week.label}`}>
                                                            {renderStatusCell(section, doc, week)}
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="px-4 py-3 border-l-2 border-gray-200">
                                                        <div className="flex items-center gap-2 justify-center">
                                                            <button
                                                                onClick={() => handleEditDocument(section, doc)}
                                                                className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                                title="Edit document"
                                                            >
                                                                <i className="fas fa-edit text-sm"></i>
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleDeleteDocument(section.id, doc.id, e)}
                                                                className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                type="button"
                                                                title="Delete document"
                                                            >
                                                                <i className="fas fa-trash text-sm"></i>
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
            {expandedDescriptionId && (() => {
                // Find the document with the expanded description ID
                let foundDoc = null;
                let foundDocName = '';
                for (const section of sections) {
                    const doc = section.documents?.find(d => d.id === expandedDescriptionId);
                    if (doc) {
                        foundDoc = doc;
                        foundDocName = doc.name;
                        break;
                    }
                }
                
                if (!foundDoc || !foundDoc.description) return null;
                
                return (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setExpandedDescriptionId(null)}>
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                                <h2 className="text-base font-semibold text-gray-900">{foundDocName} - Description</h2>
                                <button 
                                    onClick={() => setExpandedDescriptionId(null)} 
                                    className="text-gray-400 hover:text-gray-600 p-1"
                                >
                                    <i className="fas fa-times text-sm"></i>
                                </button>
                            </div>
                            <div className="p-4 overflow-y-auto">
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{foundDoc.description}</p>
                            </div>
                            <div className="flex justify-end px-4 py-3 border-t border-gray-200">
                                <button
                                    onClick={() => setExpandedDescriptionId(null)}
                                    className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {assignmentOpen && assignmentAnchorRect && (() => {
                const sec = sections.find(s => String(s.id) === assignmentOpen.sectionId);
                const targetDoc = sec?.documents?.find(d => String(d.id) === assignmentOpen.docId);
                if (!sec || !targetDoc) return null;
                const current = normalizeAssignedTo(targetDoc);
                return (
                    <div
                        ref={assignmentDropdownRef}
                        className="fixed min-w-[180px] max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-[10000]"
                        style={{ left: assignmentAnchorRect.left, top: assignmentAnchorRect.bottom + 4 }}
                    >
                        {users.length === 0 ? (
                            <div className="px-3 py-2 text-[10px] text-gray-500">No users loaded</div>
                        ) : (
                            users
                                .filter(u => u && (u.name || u.email || u.fullName))
                                .sort((a, b) => ((a.name || a.email || a.fullName || '').toString().toLowerCase()).localeCompare((b.name || b.email || b.fullName || '').toString().toLowerCase()))
                                .map(user => {
                                    const ident = getUserIdentifier(user);
                                    const label = user.name || user.fullName || user.email || 'Unknown';
                                    const isChecked = ident && current.some(c => String(c) === String(ident) || getAssigneeLabel(c) === label);
                                    return (
                                        <label key={ident || label} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
                                            <input
                                                type="checkbox"
                                                checked={!!isChecked}
                                                onChange={() => {
                                                    const next = isChecked
                                                        ? current.filter(c => String(c) !== String(ident) && getAssigneeLabel(c) !== label)
                                                        : [...current, ident].filter(Boolean);
                                                    handleAssignmentChange(sec.id, targetDoc.id, next);
                                                }}
                                                className="rounded border-gray-300 text-primary-600"
                                            />
                                            <span className="truncate">{label}</span>
                                        </label>
                                    );
                                })
                        )}
                    </div>
                );
            })()}
        </div>
    );
};

// Make available globally
window.WeeklyFMSReviewTracker = WeeklyFMSReviewTracker;
if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('weeklyFMSReviewTrackerUpdated', {
        detail: { source: 'dist' }
    }));
}
