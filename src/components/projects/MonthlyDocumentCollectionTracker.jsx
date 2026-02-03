// Get React hooks from window
const { useState, useEffect, useLayoutEffect, useRef, useCallback } = React;
const storage = window.storage;
const STICKY_COLUMN_SHADOW = '4px 0 12px rgba(15, 23, 42, 0.08)';
const DEEPLINK_DEBUG = false; // Set true to log deep-link checks (noisy)
const DEBUG_SCROLL_SYNC = false; // Log scroll-sync attach/scroll (set true to debug)
// Delimiter for comment cell key: sectionId, documentId, month. IDs can contain hyphens (e.g. file1-doc1).
const COMMENT_CELL_SEP = '\u0001';
const buildCellKey = (sectionId, documentId, month) =>
    `${String(sectionId)}${COMMENT_CELL_SEP}${String(documentId)}${COMMENT_CELL_SEP}${String(month)}`;
const parseCellKey = (cellKey) => {
    const p = String(cellKey).split(COMMENT_CELL_SEP);
    return { sectionId: p[0], documentId: p[1], month: p[2] };
};

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

// Non-blocking toast for attachment errors (avoids native alert / CursorBrowser dialog suppression).
const showAttachmentToast = (message) => {
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);max-width:90%;padding:12px 20px;background:#1e293b;color:#f1f5f9;border-radius:8px;font-size:14px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); }, 4000);
};

// Success toast: "Email sent" pop-up when document request email is sent.
const showEmailSentToast = () => {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:14px 24px;background:linear-gradient(135deg,#047857 0%,#059669 100%);color:#fff;border-radius:12px;font-size:14px;font-weight:500;z-index:99999;box-shadow:0 4px 14px rgba(4,120,87,0.4);display:flex;align-items:center;gap:10px;';
  el.innerHTML = '<i class="fas fa-check-circle" style="font-size:18px;opacity:0.95;"></i><span>Email sent successfully</span>';
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); }, 3500);
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

// Helper function to format dates as date and time (without timezone info)
const formatDateTime = (dateValue) => {
    if (!dateValue) return '';
    try {
        // Handle string dates - remove Z if present for consistent parsing
        const cleanDate = String(dateValue).replace(/Z$/, '');
        const date = new Date(cleanDate);
        if (isNaN(date.getTime())) {
            // Try parsing as ISO string directly
            const date2 = new Date(dateValue);
            if (isNaN(date2.getTime())) return '';
            // Format as: "Jan 23, 2026 6:03 PM" (no timezone, no milliseconds)
            return date2.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
        // Format as: "Jan 23, 2026 6:03 PM" (no timezone, no milliseconds)
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        console.warn('Failed to format date:', dateValue, e);
        return '';
    }
};

// Helper function to format dates as date only (no time)
const formatDateOnly = (dateValue) => {
    if (!dateValue) return '';
    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return '';
        // Format as: "Jan 23, 2026"
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return '';
    }
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

const MonthlyDocumentCollectionTracker = ({ project, onBack, dataSource = 'documentCollection' }) => {
    // dataSource: 'documentCollection' | 'monthlyDataReview' - same UI, different storage (documentSections vs monthlyDataReviewSections)
    const isMonthlyDataReview = dataSource === 'monthlyDataReview';
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    
    // One month in arrears only (for column highlight)
    const oneMonthArrearsYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const oneMonthArrearsMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
    const isOneMonthArrears = (year, monthIndex) =>
        year === oneMonthArrearsYear && monthIndex === oneMonthArrearsMonthIndex;
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
    const scrollSyncRootRef = useRef(null); // Root element for querying scrollable table containers
    const isScrollingRef = useRef(false); // Flag to prevent infinite scroll loops
    const loadRetryTimeoutRef = useRef(null); // Timeout for single retry when load returns empty
    const hasRetriedLoadRef = useRef(false); // Only retry once per "load session"
    
    const getSnapshotKey = (projectId) => projectId
        ? (isMonthlyDataReview ? `monthlyDataReviewSnapshot_${projectId}` : `documentCollectionSnapshot_${projectId}`)
        : null;

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const commentInputAvailable = typeof window !== 'undefined' && typeof window.CommentInputWithMentions === 'function';

    // Year selection with persistence
    const YEAR_STORAGE_PREFIX = isMonthlyDataReview ? 'monthlyDataReviewSelectedYear_' : 'documentCollectionSelectedYear_';
    const getInitialSelectedYear = () => {
        if (typeof window !== 'undefined') {
            // Deep link: prefer docYear from URL so the comment opens on the correct year
            const hash = window.location.hash || '';
            const search = window.location.search || '';
            let urlYear = null;
            if (hash.includes('?')) {
                const parts = hash.split('?');
                if (parts.length > 1) {
                    const p = new URLSearchParams(parts[1]);
                    urlYear = p.get('docYear') || p.get('year');
                }
            }
            if (!urlYear && search) {
                const p = new URLSearchParams(search);
                urlYear = p.get('docYear') || p.get('year');
            }
            if (urlYear) {
                const y = parseInt(String(urlYear).trim(), 10);
                if (!Number.isNaN(y)) return y;
            }
            if (project?.id) {
                const storedYear = localStorage.getItem(`${YEAR_STORAGE_PREFIX}${project.id}`);
                const parsedYear = storedYear ? parseInt(storedYear, 10) : NaN;
                if (!Number.isNaN(parsedYear)) {
                    return parsedYear;
                }
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
    const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
    const templateDropdownRef = useRef(null);
    
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
    const [showTemplateList, setShowTemplateList] = useState(true);
    const [expandedDescriptionId, setExpandedDescriptionId] = useState(null);
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
    const [emailModalContext, setEmailModalContext] = useState(null);

    // Clear pending attachments when switching to another comment cell
    useEffect(() => {
        setPendingCommentAttachments([]);
    }, [hoverCommentCell]);
    const pendingCommentOpenRef = useRef(null); // Store comment location to open after year switch
    const deepLinkHandledRef = useRef(null); // Last cellKey we opened for; skip re-open to prevent loop
    
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
    const loadData = useCallback(async () => {
        if (!project?.id) return;
        
        // Don't reload if we're currently saving - wait for save to complete
        if (isSavingRef.current) {
            console.log('⏸️ Load skipped: save in progress');
            return;
        }
        
        setIsLoading(true);
        
        try {
            // 1) For document collection only: use v2 endpoint (different path = no cached response)
            let sectionsField = null;
            if (!isMonthlyDataReview) {
                const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
                const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
                const authHeaders = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
                const endpointV2 = `/api/projects/${project.id}/document-sections-v2?_=${Date.now()}`;
                const endpointV1 = `/api/projects/${project.id}/document-sections?_=${Date.now()}`;
                try {
                    const res = await fetch(base + endpointV2, {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                        headers: authHeaders
                    });
                    if (res.ok) {
                        const json = await res.json();
                        sectionsField = json.data?.documentSections ?? json.documentSections;
                    }
                } catch (fetchErr) {
                    console.warn('📥 document-sections-v2 failed, trying v1:', fetchErr?.message);
                }
                if (sectionsField == null) {
                    try {
                        const res = await fetch(base + endpointV1, {
                            method: 'GET',
                            credentials: 'include',
                            cache: 'no-store',
                            headers: authHeaders
                        });
                        if (res.ok) {
                            const json = await res.json();
                            sectionsField = json.data?.documentSections ?? json.documentSections;
                        }
                    } catch (fetchErr) {
                        console.warn('📥 document-sections endpoint failed, trying fetchProject:', fetchErr?.message);
                    }
                }
            }
            
            // 2) Fallback: full project fetch (may be cached in some browsers)
            if (sectionsField == null && apiRef.current) {
                console.log('📥 Loading from fetchProject...', { projectId: project.id });
                const freshProject = await apiRef.current.fetchProject(project.id);
                sectionsField = isMonthlyDataReview ? freshProject?.monthlyDataReviewSections : freshProject?.documentSections;
            }
            
            // Use docYear from URL when normalizing so deep-link year has data (avoids blank comment box)
            let urlYearForNormalize = null;
            if (typeof window !== 'undefined') {
                const hash = window.location.hash || '';
                const search = window.location.search || '';
                let urlYear = null;
                if (hash.includes('?')) {
                    const p = new URLSearchParams(hash.split('?')[1] || '');
                    urlYear = p.get('docYear') || p.get('year');
                }
                if (!urlYear && search) {
                    const p = new URLSearchParams(search);
                    urlYear = p.get('docYear') || p.get('year');
                }
                if (urlYear) {
                    const y = parseInt(String(urlYear).trim(), 10);
                    if (!Number.isNaN(y) && y > 1900 && y < 3000) urlYearForNormalize = y;
                }
            }
            
            if (sectionsField != null && typeof sectionsField === 'object') {
                let normalized = normalizeSectionsByYear(sectionsField, urlYearForNormalize);
                // If URL has docYear but API returned year-keyed data without that year, copy from another year so popup has sections
                if (urlYearForNormalize != null && (normalized[String(urlYearForNormalize)] == null || (Array.isArray(normalized[String(urlYearForNormalize)]) && normalized[String(urlYearForNormalize)].length === 0))) {
                    const otherYears = Object.keys(normalized).filter(y => Array.isArray(normalized[y]) && normalized[y].length > 0);
                    if (otherYears.length > 0) {
                        const sourceYear = otherYears[0];
                        const cloned = cloneSectionsArray(normalized[sourceYear]);
                        normalized = { ...normalized, [String(urlYearForNormalize)]: cloned };
                    }
                }
                hasRetriedLoadRef.current = false; // Reset so future loads can retry if needed
                setSectionsByYear(normalized);
                sectionsRef.current = normalized;
                lastSavedDataRef.current = JSON.stringify(normalized);
                setIsLoading(false);
                return;
            }
            
            // 3) Fallback to prop data
            const propSections = isMonthlyDataReview ? project?.monthlyDataReviewSections : project?.documentSections;
            if (propSections) {
                let normalized = normalizeSectionsByYear(propSections, urlYearForNormalize);
                if (urlYearForNormalize != null && (normalized[String(urlYearForNormalize)] == null || (Array.isArray(normalized[String(urlYearForNormalize)]) && normalized[String(urlYearForNormalize)].length === 0))) {
                    const otherYears = Object.keys(normalized).filter(y => Array.isArray(normalized[y]) && normalized[y].length > 0);
                    if (otherYears.length > 0) {
                        const sourceYear = otherYears[0];
                        const cloned = cloneSectionsArray(normalized[sourceYear]);
                        normalized = { ...normalized, [String(urlYearForNormalize)]: cloned };
                    }
                }
                setSectionsByYear(normalized);
                sectionsRef.current = normalized;
                lastSavedDataRef.current = JSON.stringify(normalized);
            } else {
                setSectionsByYear({});
                sectionsRef.current = {};
                lastSavedDataRef.current = JSON.stringify({});
                // Document Collection only: retry load once after a short delay (fixes "empty in this tab, works in new incognito")
                if (!isMonthlyDataReview) {
                    if (loadRetryTimeoutRef.current) {
                        clearTimeout(loadRetryTimeoutRef.current);
                        loadRetryTimeoutRef.current = null;
                    }
                    if (!hasRetriedLoadRef.current) {
                        hasRetriedLoadRef.current = true;
                        loadRetryTimeoutRef.current = setTimeout(() => {
                            loadRetryTimeoutRef.current = null;
                            loadData();
                        }, 800);
                    } else {
                        // Already retried and still empty: one-time full-page reload to bust cache
                        if (typeof sessionStorage !== 'undefined') {
                            const reloadKey = 'docCollection_reloaded_' + project.id;
                            if (sessionStorage.getItem(reloadKey) !== '1') {
                                sessionStorage.setItem(reloadKey, '1');
                                if (typeof window !== 'undefined' && window.location) {
                                    const url = new URL(window.location.href);
                                    url.searchParams.set('v', String(Date.now()));
                                    window.location.href = url.pathname + url.search + (window.location.hash || '');
                                }
                                return;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error loading data:', error);
            setSectionsByYear({});
            sectionsRef.current = {};
        } finally {
            setIsLoading(false);
        }
    }, [project?.id, project?.documentSections, project?.monthlyDataReviewSections, selectedYear, isMonthlyDataReview, dataSource]);
    
    // Load data on mount and when project/year changes
    useEffect(() => {
        if (project?.id) {
            loadData();
        }
    }, [project?.id, selectedYear, loadData]);

    // When tab becomes visible and we have no sections, refetch (fixes "empty in this tab, works in new incognito")
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const onVisibility = () => {
            if (document.visibilityState !== 'visible' || !project?.id || isMonthlyDataReview) return;
            const years = sectionsByYear && typeof sectionsByYear === 'object' ? Object.keys(sectionsByYear) : [];
            const hasAny = years.some((y) => Array.isArray(sectionsByYear[y]) && sectionsByYear[y].length > 0);
            if (!hasAny) loadData();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [project?.id, sectionsByYear, isMonthlyDataReview, loadData]);

    // Clear retry timeout on unmount
    useEffect(() => {
        return () => {
            if (loadRetryTimeoutRef.current) {
                clearTimeout(loadRetryTimeoutRef.current);
                loadRetryTimeoutRef.current = null;
            }
        };
    }, []);

    // Sync selectedYear from URL (docYear) so deep links open with correct year and popup shows comments
    useEffect(() => {
        const syncYearFromUrl = () => {
            if (typeof window === 'undefined') return;
            const hash = window.location.hash || '';
            if (!hash.includes('?')) return;
            const p = new URLSearchParams(hash.split('?')[1] || '');
            const urlYear = p.get('docYear') || p.get('year');
            if (!urlYear) return;
            const y = parseInt(String(urlYear).trim(), 10);
            if (Number.isNaN(y) || y < 1900 || y > 3000) return;
            setSelectedYear(prev => (prev !== y ? y : prev));
        };
        syncYearFromUrl();
        window.addEventListener('hashchange', syncYearFromUrl);
        return () => window.removeEventListener('hashchange', syncYearFromUrl);
    }, []);

    // When data is loaded, if the selected year has no sections but other years do, switch to the latest year that has data
    // Skip when URL has docYear (deep link) so we don't overwrite the year the user opened from email
    useEffect(() => {
        if (isLoading || !project?.id || !sectionsByYear || typeof sectionsByYear !== 'object') return;
        if (typeof window !== 'undefined') {
            const hash = window.location.hash || '';
            if (hash.includes('?')) {
                const p = new URLSearchParams(hash.split('?')[1] || '');
                const urlYear = p.get('docYear') || p.get('year');
                if (urlYear) {
                    const y = parseInt(String(urlYear).trim(), 10);
                    if (!Number.isNaN(y) && y > 1900 && y < 3000) return; // keep selectedYear from URL
                }
            }
        }
        const yearsWithData = Object.keys(sectionsByYear).filter((y) => {
            const arr = sectionsByYear[y];
            return Array.isArray(arr) && arr.length > 0;
        }).map((y) => parseInt(y, 10)).filter((y) => !Number.isNaN(y)).sort((a, b) => b - a);
        if (yearsWithData.length === 0) return;
        const currentSections = Array.isArray(sectionsByYear[selectedYear]) ? sectionsByYear[selectedYear] : [];
        if (currentSections.length > 0) return;
        const bestYear = yearsWithData[0];
        if (bestYear != null && bestYear !== selectedYear) {
            setSelectedYear(bestYear);
            try {
                if (typeof window !== 'undefined' && project?.id) {
                    localStorage.setItem(`${YEAR_STORAGE_PREFIX}${project.id}`, String(bestYear));
                }
            } catch (_) {}
        }
    }, [sectionsByYear, isLoading, project?.id, selectedYear]);

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
            let result;
            if (isMonthlyDataReview) {
                // Monthly Data Review: save to JSON field only (no DocumentSection table)
                if (window.DatabaseAPI?.updateProject) {
                    result = await window.DatabaseAPI.updateProject(project.id, {
                        monthlyDataReviewSections: serialized
                    });
                    console.log('✅ Saved monthlyDataReviewSections via DatabaseAPI:', result);
                } else {
                    throw new Error('DatabaseAPI.updateProject not available');
                }
            } else {
                // Document Collection: use DocumentCollectionAPI or DatabaseAPI with documentSections
                if (apiRef.current?.saveDocumentSections) {
                    result = await apiRef.current.saveDocumentSections(project.id, payload, options.skipParentUpdate);
                    console.log('✅ Saved via DocumentCollectionAPI:', result);
                } else if (window.DatabaseAPI?.updateProject) {
                    result = await window.DatabaseAPI.updateProject(project.id, {
                        documentSections: serialized
                    });
                    console.log('✅ Saved via DatabaseAPI:', result);
                } else {
                    throw new Error('No available API for saving document sections');
                }
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
                // Fire-and-forget save on unmount
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
                comments: {},
                emailRequestByMonth: {}
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

    // Email request per document/month: saved recipients, subject, body, schedule (for "Request documents via email")
    const getEmailRequestForYear = (doc, month, year = selectedYear) => {
        if (!doc) return {};
        const monthKey = getMonthKey(month, year);
        return doc.emailRequestByMonth?.[monthKey] || {};
    };

    // Save email request template for this document across all months (selected year).
    // Preserves existing lastSentAt per month so scheduled sends are not reset.
    // Returns Promise so caller can await persistence.
    const saveEmailRequestForCell = (sectionId, documentId, _month, data) => {
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 ? sectionsByYear : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        const byMonthTemplate = { recipients: data.recipients, cc: data.cc, subject: data.subject, body: data.body, schedule: data.schedule };
        const updated = currentYearSections.map(section => {
            if (String(section.id) !== String(sectionId)) return section;
            return {
                ...section,
                documents: (section.documents || []).map(doc => {
                    if (String(doc.id) !== String(documentId)) return doc;
                    const existingByMonth = doc.emailRequestByMonth || {};
                    const byMonth = {};
                    months.forEach((m) => {
                        const monthKey = getMonthKey(m, selectedYear);
                        const existing = existingByMonth[monthKey];
                        byMonth[monthKey] = { ...byMonthTemplate, ...(existing && existing.lastSentAt != null ? { lastSentAt: existing.lastSentAt } : {}) };
                    });
                    return { ...doc, emailRequestByMonth: byMonth };
                })
            };
        });
        const updatedSectionsByYear = { ...latestSectionsByYear, [selectedYear]: updated };
        sectionsRef.current = updatedSectionsByYear;
        setSectionsByYear(updatedSectionsByYear);
        lastSavedDataRef.current = null;
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        return saveToDatabase();
    };

    // ============================================================
    // STATUS OPTIONS
    // ============================================================
    
    const statusOptions = [
        { value: 'requested', label: 'Requested', color: 'bg-sky-400 text-white font-semibold', cellColor: 'bg-sky-400 border-l-4 border-sky-600 shadow-sm' },
        { value: 'not-collected', label: 'Not Collected', color: 'bg-red-300 text-white font-semibold', cellColor: 'bg-red-300 border-l-4 border-red-500 shadow-sm' },
        { value: 'ongoing', label: 'Collection Ongoing', color: 'bg-yellow-300 text-white font-semibold', cellColor: 'bg-yellow-300 border-l-4 border-yellow-500 shadow-sm' },
        { value: 'collected', label: 'Collected', color: 'bg-green-400 text-white font-semibold', cellColor: 'bg-green-400 border-l-4 border-green-500 shadow-sm' },
        { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-300 text-white font-semibold', cellColor: 'bg-gray-300 border-l-4 border-gray-500 shadow-sm' }
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
                
                if (isMonthlyDataReview) {
                    if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                        await window.DatabaseAPI.updateProject(project.id, {
                            monthlyDataReviewSections: serializeSections(payload)
                        });
                    } else {
                        throw new Error('DatabaseAPI.updateProject not available');
                    }
                } else if (apiRef.current && typeof apiRef.current.saveDocumentSections === 'function') {
                    await apiRef.current.saveDocumentSections(project.id, payload, false);
                } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                    await window.DatabaseAPI.updateProject(project.id, {
                        documentSections: serializeSections(payload)
                    });
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
        
        // Use current state (most up-to-date) or fallback to ref
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 
            ? sectionsByYear 
            : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        
        // Always use ref to get the latest selectedCells value (avoids stale closure)
        const currentSelectedCells = selectedCellsRef.current;
        
        // If applying to selected cells, get all selected cell keys
        let cellsToUpdate = [];
        if (applyToSelected && currentSelectedCells.size > 0) {
            // Parse all selected cell keys
            cellsToUpdate = Array.from(currentSelectedCells).map(cellKey => {
                const { sectionId: secId, documentId: docId, month: mon } = parseCellKey(cellKey);
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
        
        // Force immediate save (don't wait for debounce) to ensure persistence
        // Clear any pending debounced save first
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        // Save immediately
        saveToDatabase();
        
        // Clear selection after applying status to multiple cells
        // Use setTimeout to ensure React has updated the UI first
        if (applyToSelected && currentSelectedCells.size > 0) {
            setTimeout(() => {
                setSelectedCells(new Set());
                selectedCellsRef.current = new Set();
            }, 100);
        }
    }, [selectedYear]);
    
    const uploadCommentAttachments = async (files) => {
        if (!files?.length) return [];
        const folder = 'doc-collection-comments';
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

    const handleAddComment = async (sectionId, documentId, month, commentText, attachments = [], cellKeyForLink = null) => {
        if (!commentText.trim()) return;
        // Use cell key for notification link so the email deep link always matches the open cell (avoids wrong section/document from stale closure)
        const { sectionId: linkSectionId, documentId: linkDocumentId, month: linkMonth } = cellKeyForLink != null ? parseCellKey(cellKeyForLink) : { sectionId, documentId, month };
        
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
        // Capture prior participants for this cell so we can notify them (even if not @mentioned in new comment)
        const priorSection = currentYearSections.find((s) => String(s.id) === String(sectionId));
        const priorDoc = priorSection?.documents?.find((d) => String(d.id) === String(documentId));
        const priorComments = priorDoc ? getCommentsForYear(priorDoc.comments, month, selectedYear) : [];
        
            const updated = currentYearSections.map(section => {
                if (String(section.id) === String(sectionId)) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
                            if (String(doc.id) === String(documentId)) {
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
        
        // CRITICAL: Clear lastSavedDataRef to force save (prevents "data unchanged" skip)
        // The new comment must be saved, so we bypass the unchanged check
        lastSavedDataRef.current = null;
        
        // Debug: Log comment being added
        console.log('💬 Adding comment:', {
            sectionId,
            documentId,
            month,
            commentText: commentText.substring(0, 50) + (commentText.length > 50 ? '...' : ''),
            commentId: newCommentId
        });
        
        // CRITICAL: Await save so comment is persisted before @mention email is sent.
        // Otherwise the email can be delivered but the comment never saved (e.g. save skipped when another save in progress).
        try {
            await saveToDatabase();
            // Retry after short delay if first save was skipped (e.g. another save in progress); await so notifications run only after save
            await new Promise((r) => setTimeout(r, 600));
            await saveToDatabase();
        } catch (saveErr) {
            console.error('❌ Failed to save comment:', saveErr);
            // Still allow @mentions below; user may retry save via debounce
        }
        
        setQuickComment('');

        // ========================================================
        // @MENTIONS - Process mentions and create notifications (after comment is saved)
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
                    // Deep-link using link* IDs (from cellKey when provided) so email link matches the open cell
                    const contextLink = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(linkSectionId)}&docDocumentId=${encodeURIComponent(linkDocumentId)}&docMonth=${encodeURIComponent(linkMonth)}&docYear=${encodeURIComponent(selectedYear)}&commentId=${encodeURIComponent(newCommentId)}&focusInput=comment`;
                    const projectInfo = {
                        projectId: project?.id,
                        projectName: project?.name,
                        sectionId: linkSectionId,
                        documentId: linkDocumentId,
                        month: linkMonth,
                        commentId: newCommentId,
                        docYear: selectedYear,
                        year: selectedYear
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

        // Notify prior participants (prior commenters + prior @mentioned) so they get notified on every new comment
        if (priorComments.length > 0 && window.DatabaseAPI?.makeRequest) {
            try {
                const contextTitle = `Document Collection - ${project?.name || 'Project'}`;
                const contextLink = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(linkSectionId)}&docDocumentId=${encodeURIComponent(linkDocumentId)}&docMonth=${encodeURIComponent(linkMonth)}&docYear=${encodeURIComponent(selectedYear)}&commentId=${encodeURIComponent(newCommentId)}&focusInput=comment`;
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
                        metadata: {
                            projectId: project?.id,
                            projectName: project?.name,
                            sectionId: linkSectionId,
                            documentId: linkDocumentId,
                            month: linkMonth,
                            commentId: newCommentId,
                            docYear: selectedYear,
                            year: selectedYear
                        }
                    })
                });
            } catch (err) {
                console.error('❌ Error notifying prior participants for document collection comment:', err);
            }
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
                            try {
                                const dateValue = c.date || c.createdAt;
                                if (!dateValue) return `${c.author}: ${c.text}`;
                                const date = new Date(dateValue);
                                if (isNaN(date.getTime())) return `${c.author}: ${c.text}`;
                                const formattedDate = formatDateTime(dateValue);
                                return `[${formattedDate}] ${c.author}: ${c.text}`;
                            } catch (e) {
                                return `${c.author}: ${c.text}`;
                            }
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
    
    // Clear deep-link "already opened" guard when popup is closed so we can re-open from same URL later
    useEffect(() => {
        if (!hoverCommentCell) deepLinkHandledRef.current = null;
    }, [hoverCommentCell]);

    // Smart positioning for comment popup (no auto-scroll, no window scroll listener)
    useEffect(() => {
        if (!hoverCommentCell) {
            return;
        }

        const updatePopupPosition = () => {
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

        // Initial position update
        setTimeout(updatePopupPosition, 50);

        // Update on window resize only (no scroll listener)
        window.addEventListener('resize', updatePopupPosition);
        return () => {
            window.removeEventListener('resize', updatePopupPosition);
        };
    }, [hoverCommentCell]);

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
                // Clear URL params when closing popup by clicking outside (but preserve project path)
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
        const doc = window.document;
        doc.addEventListener('mousedown', handleAttachmentMousedown, true);
        doc.addEventListener('click', handleAttachmentClick, true);
        return () => {
            doc.removeEventListener('mousedown', handleAttachmentMousedown, true);
            doc.removeEventListener('click', handleAttachmentClick, true);
        };
    }, [hoverCommentCell]);
    
    // When opened via a deep-link (e.g. from an email notification), automatically
    // switch to the correct comment cell and open the popup so the user can
    // immediately see the relevant discussion.
    const checkAndOpenDeepLink = useCallback(() => {
        try {
            // Check if we have a pending comment to open after year switch
            if (pendingCommentOpenRef.current) {
                const pending = pendingCommentOpenRef.current;
                if (DEEPLINK_DEBUG) console.log('🔄 MonthlyDocumentCollectionTracker: Opening pending comment after year switch:', pending);
                
                // Only proceed if sections are loaded for the new year
                if (sections && sections.length > 0) {
                    const cellKey = buildCellKey(pending.sectionId, pending.documentId, pending.month);
                    if (deepLinkHandledRef.current === cellKey) return;
                    deepLinkHandledRef.current = cellKey;
                    
                    // Clear the pending ref
                    pendingCommentOpenRef.current = null;
                    
                    // Open the popup
                    setCommentPopupPosition({
                        top: Math.max(window.innerHeight / 2 - 160, 60),
                        left: Math.max(window.innerWidth / 2 - 180, 20)
                    });
                    setHoverCommentCell(cellKey);
                    
                    // Position the popup and scroll cell into view
                    setTimeout(() => {
                        const commentButton = window.document.querySelector(`[data-comment-cell="${cellKey}"]`);
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
                            
                            const spaceBelow = viewportHeight - buttonRect.bottom;
                            const spaceAbove = buttonRect.top;
                            const positionAbove = spaceBelow < popupHeight + spacing && spaceAbove > spaceBelow;
                            
                            let popupTop = positionAbove 
                                ? buttonRect.top - popupHeight - spacing - tailSize
                                : buttonRect.bottom + spacing + tailSize;
                            
                            const buttonCenterX = buttonRect.left + buttonRect.width / 2;
                            let preferredLeft = buttonCenterX - popupWidth / 2;
                            
                            if (preferredLeft < 10) preferredLeft = 10;
                            else if (preferredLeft + popupWidth > viewportWidth - 10) {
                                preferredLeft = viewportWidth - popupWidth - 10;
                            }
                            
                            setCommentPopupPosition({ top: popupTop, left: preferredLeft });
                        }
                    }, 100);
                    
                    return;
                } else {
                    if (DEEPLINK_DEBUG) console.log('⏳ MonthlyDocumentCollectionTracker: Waiting for sections to load after year switch');
                    return;
                }
            }
            
            // Check both window.location.search (for regular URLs) and hash query params (for hash-based routing)
            let params = null;
            let deepSectionId = null;
            let deepDocumentId = null;
            let deepMonth = null;
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
                    deepMonth = params.get('docMonth');
                    deepCommentId = params.get('commentId');
                    deepYear = params.get('docYear') || params.get('year');
                }
            }
            
            // Also check window.location.search (for regular URLs like ?commentId=...)
            // This is important because some URLs might only have search params, not hash params
            const search = window.location.search || '';
            if (search) {
                const searchParams = new URLSearchParams(search);
                if (!deepSectionId) deepSectionId = searchParams.get('docSectionId');
                if (!deepDocumentId) deepDocumentId = searchParams.get('docDocumentId');
                if (!deepMonth) deepMonth = searchParams.get('docMonth');
                if (!deepCommentId) deepCommentId = searchParams.get('commentId');
                if (!deepYear) deepYear = searchParams.get('docYear') || searchParams.get('year');
            }
            
            const parsedDeepYear = deepYear ? Number(deepYear) : null;
            const normalizedDeepYear = parsedDeepYear && !Number.isNaN(parsedDeepYear) ? parsedDeepYear : null;
            let isValidDocumentId = deepDocumentId && 
                                    deepDocumentId !== 'undefined' && 
                                    deepDocumentId.trim() !== '';
            
            if (normalizedDeepYear && normalizedDeepYear !== selectedYear && deepSectionId && isValidDocumentId && deepMonth) {
                // Always set pending so we open the popup after year switch (with or without commentId)
                pendingCommentOpenRef.current = {
                    sectionId: deepSectionId,
                    documentId: deepDocumentId,
                    month: deepMonth
                };
                handleYearChange(normalizedDeepYear);
                return;
            }
            
            // Only proceed if we have data to work with: either current-year sections or (for commentId search) any year in sectionsByYear
            const hasSectionsForCurrentYear = sections && sections.length > 0;
            const hasAnyYearData = Object.keys(sectionsByYear || {}).some(y => Array.isArray(sectionsByYear[y]) && sectionsByYear[y].length > 0);
            const canSearchByCommentId = deepCommentId && hasAnyYearData;
            if (!hasSectionsForCurrentYear && !canSearchByCommentId) {
                if (deepSectionId && isValidDocumentId && deepMonth) {
                    const yearsToSearch = Object.keys(sectionsByYear || {});
                    for (const year of yearsToSearch) {
                        const yearSections = sectionsByYear[year] || [];
                        const matchingSection = yearSections.find(s => String(s.id) === String(deepSectionId));
                        const matchingDoc = matchingSection?.documents?.find(d => String(d.id) === String(deepDocumentId));
                        if (matchingSection && matchingDoc) {
                            const targetYear = Number(year);
                            if (!Number.isNaN(targetYear) && targetYear !== selectedYear) {
                                pendingCommentOpenRef.current = {
                                    sectionId: deepSectionId,
                                    documentId: deepDocumentId,
                                    month: deepMonth
                                };
                                handleYearChange(targetYear);
                                return;
                            }
                        }
                    }
                }
                if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: No sections loaded yet, skipping deep link check');
                return;
            }
            
            if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: Deep link params:', { deepSectionId, deepDocumentId, deepMonth, deepCommentId, sectionsCount: sections?.length });

            // Normalize docDocumentId - treat "undefined" string, null, or empty as invalid
            isValidDocumentId = deepDocumentId && 
                                deepDocumentId !== 'undefined' && 
                                deepDocumentId.trim() !== '';
            
            if (deepSectionId && isValidDocumentId && deepMonth) {
                const section = sections.find(s => String(s.id) === String(deepSectionId));
                const doc = section?.documents?.find(d => String(d.id) === String(deepDocumentId));
                if (!section || !doc) {
                    const yearsToSearch = Object.keys(sectionsByYear || {});
                    for (const year of yearsToSearch) {
                        const yearSections = sectionsByYear[year] || [];
                        const matchingSection = yearSections.find(s => String(s.id) === String(deepSectionId));
                        const matchingDoc = matchingSection?.documents?.find(d => String(d.id) === String(deepDocumentId));
                        if (matchingSection && matchingDoc) {
                            const targetYear = Number(year);
                            if (!Number.isNaN(targetYear) && targetYear !== selectedYear) {
                                pendingCommentOpenRef.current = {
                                    sectionId: deepSectionId,
                                    documentId: deepDocumentId,
                                    month: deepMonth
                                };
                                handleYearChange(targetYear);
                                return;
                            }
                        }
                    }
                }
            }
            
            // If we have commentId, search for the comment (even if we have some params, verify they're correct)
            // This handles cases where commentId is present but other params might be wrong or missing
            let commentIdInUrlButNotFound = false; // when true, do not open popup (avoids blank box from email links)
            if (deepCommentId) {
                // If we have all params, first verify the comment exists at that location
                let commentFoundAtLocation = false;
                if (deepSectionId && isValidDocumentId && deepMonth) {
                    const section = sections.find(s => String(s.id) === String(deepSectionId));
                    const doc = section?.documents?.find(d => String(d.id) === String(deepDocumentId));
                    if (doc) {
                        const comments = getCommentsForYear(doc.comments, deepMonth, selectedYear);
                        const commentIdToFind = String(deepCommentId);
                        const commentIdNum = parseInt(deepCommentId, 10);
                        commentFoundAtLocation = comments.some(c => {
                            const cId = c.id;
                            return String(cId) === commentIdToFind || 
                                   (typeof cId === 'number' && cId === commentIdNum) ||
                                   (typeof commentIdNum === 'number' && !isNaN(commentIdNum) && cId === commentIdNum);
                        });
                    }
                }
                
                // If comment not found at specified location, or if params are missing, search for it
                if (!commentFoundAtLocation) {
                    if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: Searching for commentId:', deepCommentId);
                    
                    // Search through all sections, documents, and months to find the comment
                    let foundComment = null;
                    let foundSectionId = null;
                    let foundDocumentId = null;
                    let foundMonth = null;
                    let foundYear = null;
                    
                    const commentIdToFind = String(deepCommentId);
                    const commentIdNum = parseInt(deepCommentId, 10);
                    
                    // Search through all years in sectionsByYear
                    const yearsToSearch = Object.keys(sectionsByYear);
                    if (yearsToSearch.length === 0) {
                        yearsToSearch.push(String(selectedYear));
                    }
                    
                    if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: Searching in years:', yearsToSearch);
                    
                    // Search through all years
                    for (const year of yearsToSearch) {
                        const yearSections = sectionsByYear[year] || [];
                        
                        // Search through all sections
                        for (const section of yearSections) {
                            if (!section.documents) continue;
                            
                            // Search through all documents in this section
                            for (const doc of section.documents) {
                                if (!doc.comments) continue;
                                
                                // Search through all months
                                for (const month of months) {
                                    const comments = getCommentsForYear(doc.comments, month, parseInt(year, 10));
                                    
                                    // Check if any comment matches the ID (try both string and number comparison)
                                    const matchingComment = comments.find(c => {
                                        const cId = c.id;
                                        return String(cId) === commentIdToFind || 
                                               (typeof cId === 'number' && cId === commentIdNum) ||
                                               (typeof commentIdNum === 'number' && !isNaN(commentIdNum) && cId === commentIdNum);
                                    });
                                    
                                    if (matchingComment) {
                                        foundComment = matchingComment;
                                        foundSectionId = section.id;
                                        foundDocumentId = doc.id;
                                        foundMonth = month;
                                        foundYear = parseInt(year, 10);
                                        if (DEEPLINK_DEBUG) console.log('✅ MonthlyDocumentCollectionTracker: Found comment!', { sectionId: foundSectionId, documentId: foundDocumentId, month: foundMonth, year: foundYear });
                                        break;
                                    }
                                }
                                
                                if (foundComment) break;
                            }
                            
                            if (foundComment) break;
                        }
                        
                        if (foundComment) break;
                    }
                    
                    // If comment was found, use the found location
                    if (foundComment && foundSectionId && foundDocumentId && foundMonth) {
                        deepSectionId = foundSectionId;
                        deepDocumentId = foundDocumentId;
                        deepMonth = foundMonth;
                        
                        // Switch to the correct year if needed, then retry opening the popup
                        if (foundYear && foundYear !== selectedYear) {
                            if (DEEPLINK_DEBUG) console.log('📅 MonthlyDocumentCollectionTracker: Switching year from', selectedYear, 'to', foundYear);
                            // Store the location to open after year switch
                            pendingCommentOpenRef.current = {
                                sectionId: foundSectionId,
                                documentId: foundDocumentId,
                                month: foundMonth
                            };
                            setSelectedYear(foundYear);
                            // Retry opening the popup after year switch (will be triggered by useEffect)
                            return;
                        }
                        
                        // Re-validate document ID after finding it
                        isValidDocumentId = deepDocumentId && 
                                           deepDocumentId !== 'undefined' && 
                                           deepDocumentId.trim() !== '';
                    } else {
                        // URL had commentId but comment not found (wrong section/doc in email, or data not loaded)
                        commentIdInUrlButNotFound = true;
                        console.warn('⚠️ MonthlyDocumentCollectionTracker: Comment not found:', deepCommentId, {
                            searchedYears: yearsToSearch,
                            sectionsCount: sections.length,
                            sectionsByYearKeys: Object.keys(sectionsByYear),
                            selectedYear: selectedYear
                        });
                        
                        // Debug: Log all comment IDs we found during search
                        if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: Debug - Searching for comment IDs in all sections...');
                        let totalComments = 0;
                        for (const year of yearsToSearch) {
                            const yearSections = sectionsByYear[year] || [];
                            for (const section of yearSections) {
                                if (!section.documents) continue;
                                for (const doc of section.documents) {
                                    if (!doc.comments) continue;
                                    for (const month of months) {
                                        const comments = getCommentsForYear(doc.comments, month, parseInt(year, 10));
                                        totalComments += comments.length;
                                        if (comments.length > 0 && DEEPLINK_DEBUG) {
                                            console.log(`  Found ${comments.length} comment(s) in ${section.name}/${doc.name}/${month}/${year}:`, comments.map(c => ({ id: c.id, idType: typeof c.id, text: c.text?.substring(0, 30) })));
                                        }
                                    }
                                }
                            }
                        }
                        if (DEEPLINK_DEBUG) console.log(`🔍 MonthlyDocumentCollectionTracker: Total comments found: ${totalComments}`);
                    }
                } else {
                    if (DEEPLINK_DEBUG) console.log('✅ MonthlyDocumentCollectionTracker: Comment found at specified location, using existing params');
                }
            }
            
            // Only skip opening when URL had commentId but we couldn't find it AND we don't have a valid cell to open (avoids blank popup from wrong email links).
            // If we have valid docSectionId/docDocumentId/docMonth, open the cell anyway so the comments modal opens (we may not scroll to the specific comment).
            if (commentIdInUrlButNotFound && !(deepSectionId && isValidDocumentId && deepMonth)) return;
            
            if (deepSectionId && isValidDocumentId && deepMonth) {
                const cellKey = buildCellKey(deepSectionId, deepDocumentId, deepMonth);
                if (deepLinkHandledRef.current === cellKey) return;
                deepLinkHandledRef.current = cellKey;
                
                if (DEEPLINK_DEBUG) console.log('🎯 MonthlyDocumentCollectionTracker: Opening comment popup for cell:', cellKey);
                
                // Set initial position (will be updated once cell is found)
                setCommentPopupPosition({
                    top: Math.max(window.innerHeight / 2 - 160, 60),
                    left: Math.max(window.innerWidth / 2 - 180, 20)
                });
                
                setHoverCommentCell(cellKey);
                
                // Find the comment button for this cell and reposition popup near it using smart positioning
                const positionPopup = () => {
                    const commentButton = window.document.querySelector(`[data-comment-cell="${cellKey}"]`);
                    if (commentButton) {
                        // Scroll the cell into view when opening from deep link so the user sees context
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
                            
                            if (DEEPLINK_DEBUG) console.log('✅ Scrolled to comment:', deepCommentId);
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
            console.warn('⚠️ Failed to apply document collection deep-link:', error);
        }
    }, [sections, sectionsByYear, selectedYear, months, handleYearChange]);
    
    // Check for deep link on mount and when sections load
    useEffect(() => {
        // Run soon after mount so we catch doc params in URL
        const timer = setTimeout(() => {
            if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: Initial deep link check');
            checkAndOpenDeepLink();
        }, 500);
        return () => clearTimeout(timer);
    }, [checkAndOpenDeepLink]);
    
    // Run deep link check when data load finishes (isLoading -> false) and we have sections
    // This ensures we open the comment dialog when opening the project via a doc-collection URL
    useEffect(() => {
        if (!isLoading && sections && sections.length > 0) {
            const timer = setTimeout(() => {
                if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: Load complete, checking deep link');
                checkAndOpenDeepLink();
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [isLoading, sections.length, checkAndOpenDeepLink]);
    
    // Also retry if sections load after initial mount
    useEffect(() => {
        if (sections && sections.length > 0) {
            const timer = setTimeout(() => {
                if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: Sections loaded, checking deep link');
                checkAndOpenDeepLink();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [sections.length, checkAndOpenDeepLink]);
    
    // Aggressive retry: Check multiple times with increasing delays to catch late-loading sections
    useEffect(() => {
        if (!sections || sections.length === 0) {
            // If sections aren't loaded, retry several times
            const retries = [800, 1500, 2500];
            const timers = retries.map(delay => 
                setTimeout(() => {
                    if (DEEPLINK_DEBUG) console.log(`🔍 MonthlyDocumentCollectionTracker: Retry check (${delay}ms delay)`);
                    checkAndOpenDeepLink();
                }, delay)
            );
            return () => timers.forEach(clearTimeout);
        }
    }, [sections.length, checkAndOpenDeepLink]);
    
    // When sectionsByYear is first populated (e.g. after loadData), run deep link so comment links open popup
    const sectionsByYearKeyCount = Object.keys(sectionsByYear || {}).length;
    useEffect(() => {
        if (sectionsByYearKeyCount > 0) {
            const timer = setTimeout(() => {
                if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: sectionsByYear populated, checking deep link');
                checkAndOpenDeepLink();
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [sectionsByYearKeyCount, checkAndOpenDeepLink]);
    
    // When year changes, check if we have a pending comment to open
    useEffect(() => {
        if (pendingCommentOpenRef.current && sections && sections.length > 0) {
            const timer = setTimeout(() => {
                checkAndOpenDeepLink();
            }, 500); // Wait a bit longer for sections to render after year change
            return () => clearTimeout(timer);
        }
    }, [selectedYear, sections.length, checkAndOpenDeepLink]);
    
    // Also listen for hash changes in case URL is updated after component mounts
    useEffect(() => {
        const handleHashChange = () => {
            if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: Hash changed, checking deep link');
            setTimeout(() => {
                checkAndOpenDeepLink();
            }, 100);
        };
        
        const handlePopState = () => {
            if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: PopState event, checking deep link');
            setTimeout(() => {
                checkAndOpenDeepLink();
            }, 100);
        };
        
        // Also listen for pushState/replaceState by intercepting them
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        const handlePushState = (...args) => {
            originalPushState.apply(history, args);
            setTimeout(() => {
                if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: PushState detected, checking deep link');
                checkAndOpenDeepLink();
            }, 100);
        };
        
        const handleReplaceState = (...args) => {
            originalReplaceState.apply(history, args);
            setTimeout(() => {
                if (DEEPLINK_DEBUG) console.log('🔍 MonthlyDocumentCollectionTracker: ReplaceState detected, checking deep link');
                checkAndOpenDeepLink();
            }, 100);
        };
        
        history.pushState = handlePushState;
        history.replaceState = handleReplaceState;
        
        window.addEventListener('hashchange', handleHashChange);
        window.addEventListener('popstate', handlePopState);
        
        return () => {
            window.removeEventListener('hashchange', handleHashChange);
            window.removeEventListener('popstate', handlePopState);
            history.pushState = originalPushState;
            history.replaceState = originalReplaceState;
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
        const cellKey = buildCellKey(section.id, doc.id, month);
        const isPopupOpen = hoverCommentCell === cellKey;
        const isSelected = selectedCells.has(cellKey);
        
        const isWorkingMonth = isOneMonthArrears(selectedYear, months.indexOf(month));
        let cellBackgroundClass = statusConfig 
            ? statusConfig.cellColor 
            : (isWorkingMonth ? 'bg-primary-50' : '');
        
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
                className={`px-3 py-2 text-xs border-l-2 border-gray-200 ${cellBackgroundClass} relative transition-all ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:bg-opacity-90'}`}
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
                        className={`w-full pl-2 pr-7 py-1.5 text-xs rounded-lg font-semibold border-0 cursor-pointer appearance-none bg-transparent ${textColorClass} hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary-400`}
                    >
                        <option value="">Select Status</option>
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    {/* Right side: email above, comments below - stacked with gap so they never overlap */}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1.5">
                        {!isMonthlyDataReview && (
                            <button
                                type="button"
                                data-email-cell={cellKey}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEmailModalContext({ section, doc, month });
                                }}
                                className="text-gray-500 hover:text-primary-600 transition-colors p-0.5 rounded shrink-0"
                                title="Request documents via email"
                                aria-label="Request documents via email"
                            >
                                <i className="fas fa-envelope text-[10px]"></i>
                            </button>
                        )}
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
                                    
                                    // Update URL with deep link when opening popup
                                    const { sectionId, documentId, month } = parseCellKey(cellKey);
                                    if (sectionId && documentId && month && project?.id) {
                                        const deepLinkUrl = `#/projects/${project.id}?docSectionId=${encodeURIComponent(sectionId)}&docDocumentId=${encodeURIComponent(documentId)}&docMonth=${encodeURIComponent(month)}&docYear=${encodeURIComponent(selectedYear)}`;
                                        
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
                            className="relative text-gray-500 hover:text-gray-700 transition-colors p-1 rounded shrink-0"
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

    const DocumentRequestEmailModal = () => {
        const ctx = emailModalContext;
        const docName = ctx?.doc?.name || 'Document';
        const month = ctx?.month || '';
        const projectName = project?.name || 'Project';
        const currentPeriodText = `${month} ${selectedYear}`.trim();
        const defaultSubject = `Abco Document / Data request: ${projectName} – ${docName} – ${currentPeriodText}`;
        const defaultBody = `Dear Sir/Madam,

We kindly request the following document(s) / data for our records:

• Document / Data: ${docName}
• Period: ${currentPeriodText}
• Project: ${projectName}

Please send these at your earliest convenience.

Kind regards,
Abcotronics`;

        const [contacts, setContacts] = useState([]);
        const [contactsCc, setContactsCc] = useState([]);
        const [newContact, setNewContact] = useState('');
        const [newContactCc, setNewContactCc] = useState('');
        const [subject, setSubject] = useState(defaultSubject);
        const [body, setBody] = useState(defaultBody);
        const [scheduleFrequency, setScheduleFrequency] = useState('none');
        const [scheduleStopStatus, setScheduleStopStatus] = useState('collected');
        const [sending, setSending] = useState(false);
        const [savingTemplate, setSavingTemplate] = useState(false);
        const [result, setResult] = useState(null);
        const [emailActivity, setEmailActivity] = useState({ sent: [], received: [] });
        const [loadingActivity, setLoadingActivity] = useState(false);
        const [expandedSentId, setExpandedSentId] = useState(null);

        // Replace period in saved template (e.g. "January 2026") with current month when opening modal for a different month
        const withCurrentPeriod = (text) => {
            if (!text || typeof text !== 'string' || !currentPeriodText) return text;
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            let out = text;
            monthNames.forEach((m) => {
                const pattern = new RegExp(`${m}\\s+\\d{4}`, 'g');
                out = out.replace(pattern, currentPeriodText);
            });
            return out;
        };
        // Remove section/file line from body (e.g. "• Section: File 1") so emails never show it
        const withoutSectionLine = (text) => {
            if (!text || typeof text !== 'string') return text;
            return text.replace(/\n?\s*•\s*Section:\s*[^\n]*/g, '').replace(/\n?\s*Section:\s*[^\n]*/g, '').replace(/\n{3,}/g, '\n\n').trim();
        };
        // Ensure subject is preceded by "Abco " for document request emails (handles old saved templates)
        const ensureAbcoSubject = (subjectLine) => {
            if (!subjectLine || typeof subjectLine !== 'string') return subjectLine;
            const t = subjectLine.trim();
            if (t.toLowerCase().startsWith('abco ')) return t;
            return `Abco ${t}`;
        };

        useEffect(() => {
            const s = getEmailRequestForYear(ctx?.doc, ctx?.month, selectedYear);
            setContacts(Array.isArray(s.recipients) && s.recipients.length > 0 ? s.recipients : []);
            setContactsCc(Array.isArray(s.cc) && s.cc.length > 0 ? s.cc : []);
            const savedSubject = typeof s.subject === 'string' && s.subject.trim() ? s.subject : null;
            const savedBody = typeof s.body === 'string' && s.body.trim() ? s.body : null;
            setSubject(savedSubject ? ensureAbcoSubject(withCurrentPeriod(savedSubject)) : defaultSubject);
            setBody(savedBody ? withoutSectionLine(withCurrentPeriod(savedBody)) : defaultBody);
            setScheduleFrequency(s.schedule?.frequency === 'weekly' || s.schedule?.frequency === 'monthly' ? s.schedule.frequency : 'none');
            setScheduleStopStatus(typeof s.schedule?.stopWhenStatus === 'string' ? s.schedule.stopWhenStatus : 'collected');
            setNewContact('');
            setNewContactCc('');
            setResult(null);
        }, [ctx?.section?.id, ctx?.doc?.id, ctx?.month, selectedYear]);

        // Fetch email activity (sent/received) for this document and month; callable from useEffect and after send
        const fetchEmailActivity = useCallback(() => {
            if (!ctx?.doc?.id || !ctx?.month || project?.id == null || selectedYear == null) {
                setEmailActivity({ sent: [], received: [] });
                return;
            }
            const monthNum = months.indexOf(ctx.month) >= 0 ? months.indexOf(ctx.month) + 1 : null;
            if (monthNum == null) return;
            setLoadingActivity(true);
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
            const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
            const q = new URLSearchParams({
                documentId: String(ctx.doc.id).trim(),
                month: String(monthNum),
                year: String(selectedYear)
            });
            if (ctx?.section?.id) q.set('sectionId', String(ctx.section.id).trim());
            fetch(`${base}/api/projects/${project.id}/document-collection-email-activity?${q}`, {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
            })
                .then((res) => res.json().catch(() => ({})))
                .then((json) => {
                    const data = json.data || json;
                    setEmailActivity({
                        sent: Array.isArray(data.sent) ? data.sent : [],
                        received: Array.isArray(data.received) ? data.received : []
                    });
                })
                .catch(() => setEmailActivity({ sent: [], received: [] }))
                .finally(() => setLoadingActivity(false));
        }, [ctx?.doc?.id, ctx?.month, selectedYear, project?.id]);

        useEffect(() => {
            if (!ctx?.doc?.id || !ctx?.month) {
                setEmailActivity({ sent: [], received: [] });
                return;
            }
            fetchEmailActivity();
        }, [ctx?.doc?.id, ctx?.month, selectedYear, project?.id, fetchEmailActivity]);

        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const addContact = () => {
            const t = newContact.trim();
            if (!t || !emailRe.test(t)) return;
            if (contacts.includes(t)) return;
            setContacts((c) => [...c, t]);
            setNewContact('');
        };
        const removeContact = (email) => setContacts((c) => c.filter((e) => e !== email));
        const addContactCc = () => {
            const t = newContactCc.trim();
            if (!t || !emailRe.test(t)) return;
            if (contactsCc.includes(t)) return;
            setContactsCc((c) => [...c, t]);
            setNewContactCc('');
        };
        const removeContactCc = (email) => setContactsCc((c) => c.filter((e) => e !== email));

        const handleSaveTemplate = async () => {
            if (!ctx?.section?.id || !ctx?.doc?.id || !ctx?.month) return;
            setSavingTemplate(true);
            setResult(null);
            try {
                await saveEmailRequestForCell(ctx.section.id, ctx.doc.id, ctx.month, {
                    recipients: [...contacts],
                    cc: [...contactsCc],
                    subject: subject.trim() || defaultSubject,
                    body: body.trim() || defaultBody,
                    schedule: {
                        frequency: scheduleFrequency === 'none' ? 'none' : scheduleFrequency,
                        stopWhenStatus: scheduleStopStatus || 'collected'
                    }
                });
                setResult({ saved: true });
                setTimeout(() => setResult(prev => (prev?.saved ? null : prev)), 2000);
            } catch (err) {
                console.error('Failed to save email template:', err);
                setResult({ error: 'Save failed. Please try again.' });
            } finally {
                setSavingTemplate(false);
            }
        };

        const buildStyledEmailHtml = (subjectLine, bodyText) => {
            const escapeHtml = (t) => {
                if (!t) return '';
                return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
            };
            const bodyHtml = bodyText.split('\n').map((l) => escapeHtml(l)).join('<br>');
            const bannerBlue = '#0369a1';
            const boxBg = '#f1f5f9';
            const boxBorder = '#e2e8f0';
            return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: ${bannerBlue}; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 18px; font-weight: bold;">${escapeHtml(subjectLine)}</h1>
  </div>
  <div style="padding: 20px; background: #f8fafc;">
    <div style="background: ${boxBg}; border: 1px solid ${boxBorder}; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <div style="font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: bold;">Context</div>
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">
        <strong>Document / Data:</strong> ${escapeHtml(docName)}<br>
        <strong>Period:</strong> ${escapeHtml(currentPeriodText)}<br>
        <strong>Project:</strong> ${escapeHtml(projectName)}
      </div>
    </div>
    <div style="background: ${boxBg}; border: 1px solid ${boxBorder}; border-radius: 8px; padding: 16px;">
      <div style="font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: bold;">Message</div>
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">${bodyHtml}</div>
    </div>
  </div>
</div>`;
        };

        const handleSend = async () => {
            if (contacts.length === 0) {
                alert('Please add at least one recipient.');
                return;
            }
            if (!subject.trim()) {
                alert('Please enter a subject.');
                return;
            }
            if (!body.trim()) {
                alert('Please enter the email body.');
                return;
            }
            setSending(true);
            setResult(null);
            try {
                const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
                const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
                const htmlPayload = buildStyledEmailHtml(subject.trim(), body.trim());
                const monthNum = ctx?.month && months.indexOf(ctx.month) >= 0 ? months.indexOf(ctx.month) + 1 : null;
                const yearNum = selectedYear != null && !isNaN(selectedYear) ? parseInt(selectedYear, 10) : null;
                const hasCellKeys = !!(ctx?.doc?.id && monthNum >= 1 && monthNum <= 12 && yearNum && project?.id);
                const hasCellContext = !!(ctx?.section?.id && ctx?.doc?.id && monthNum >= 1 && monthNum <= 12 && yearNum);
                const sendUrl = hasCellKeys
                    ? `${base}/api/projects/${project.id}/document-collection-send-email?documentId=${encodeURIComponent(String(ctx.doc.id))}&month=${Number(monthNum)}&year=${Number(yearNum)}`
                    : `${base}/api/projects/${project.id}/document-collection-send-email`;
                const res = await fetch(sendUrl, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        to: contacts,
                        cc: contactsCc.length > 0 ? contactsCc : undefined,
                        subject: subject.trim(),
                        html: htmlPayload,
                        text: body.trim(),
                        ...(hasCellKeys
                            ? {
                                projectId: String(project.id).trim(),
                                documentId: String(ctx.doc.id).trim(),
                                month: Number(monthNum),
                                year: Number(yearNum)
                            }
                            : {}),
                        ...(hasCellContext ? { sectionId: String(ctx.section.id).trim() } : {})
                    })
                });
                const json = await res.json().catch(() => ({}));
                const data = json.data || json;
                const sentList = data.sent || json.sent || [];
                const failedList = data.failed || json.failed || [];
                if (!res.ok && res.status !== 503) {
                    setResult({ error: data.error || json.error || 'Failed to send' });
                    return;
                }
                setResult({
                    sent: sentList,
                    failed: failedList,
                    ...((data.warning || json.warning || (res.status === 503 ? (data.error || json.error) : null)) ? { warning: data.warning || json.warning || data.error || json.error || 'Activity could not be saved.' } : {})
                });
                if (sentList.length > 0) {
                    showEmailSentToast();
                    setEmailActivity((prev) => ({
                        ...prev,
                        sent: [...prev.sent, { id: 'sent-' + Date.now(), createdAt: new Date().toISOString() }]
                    }));
                    // Persist selectedYear so after hard refresh the same year is used for activity fetch
                    if (project?.id && selectedYear != null && typeof window !== 'undefined') {
                        try {
                            localStorage.setItem(YEAR_STORAGE_PREFIX + project.id, String(selectedYear));
                        } catch (_) {}
                    }
                }
                setTimeout(() => fetchEmailActivity(), 400);
                setTimeout(() => fetchEmailActivity(), 1200);
                // Mark this document/month as "Requested" when email is sent successfully
                if (ctx?.section?.id != null && ctx?.doc?.id != null && ctx?.month) {
                    const latestSectionsByYear = sectionsRef.current && Object.keys(sectionsRef.current).length > 0 ? sectionsRef.current : sectionsByYear;
                    const currentYearSections = latestSectionsByYear[selectedYear] || [];
                    const updated = currentYearSections.map(section => {
                        if (String(section.id) !== String(ctx.section.id)) return section;
                        return {
                            ...section,
                            documents: (section.documents || []).map(doc => {
                                if (String(doc.id) !== String(ctx.doc.id)) return doc;
                                const updatedStatus = setStatusForYear(doc.collectionStatus || {}, ctx.month, 'requested', selectedYear);
                                return { ...doc, collectionStatus: updatedStatus };
                            })
                        };
                    });
                    const updatedSectionsByYear = { ...latestSectionsByYear, [selectedYear]: updated };
                    sectionsRef.current = updatedSectionsByYear;
                    setSectionsByYear(updatedSectionsByYear);
                    lastSavedDataRef.current = null;
                    if (saveTimeoutRef.current) {
                        clearTimeout(saveTimeoutRef.current);
                        saveTimeoutRef.current = null;
                    }
                    saveToDatabase();
                }
            } catch (err) {
                setResult({ error: err.message || 'Request failed' });
            } finally {
                setSending(false);
            }
        };

        const hasSuccess = result && result.sent && result.sent.length > 0;
        const hasFailures = result && result.failed && result.failed.length > 0;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-100">
                    {/* Header with gradient */}
                    <div className="relative bg-gradient-to-r from-[#0369a1] to-[#0ea5e9] px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                                <i className="fas fa-envelope-open text-lg text-white"></i>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-base font-semibold text-white truncate">Request documents via email</h2>
                                <p className="text-xs text-white/80 mt-0.5 truncate">
                                    {docName} · {month} {selectedYear}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEmailModalContext(null)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/20 hover:text-white transition-colors shrink-0"
                                aria-label="Close"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-gray-50/50">
                        {/* Recipients */}
                        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <i className="fas fa-users text-[#0369a1] text-sm"></i>
                                <label className="text-sm font-medium text-gray-800">Recipients</label>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={newContact}
                                    onChange={(e) => setNewContact(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addContact(); } }}
                                    placeholder="client@example.com"
                                    className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0ea5e9] focus:border-[#0ea5e9] placeholder-gray-400 transition-shadow"
                                />
                                <button
                                    type="button"
                                    onClick={addContact}
                                    className="px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#0369a1] to-[#0ea5e9] rounded-xl hover:opacity-90 shadow-md hover:shadow-lg transition-all shrink-0"
                                >
                                    <i className="fas fa-plus mr-1.5"></i>Add
                                </button>
                            </div>
                            {contacts.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {contacts.map((email) => (
                                        <span
                                            key={email}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]"
                                        >
                                            <i className="fas fa-envelope text-[10px] opacity-70"></i>
                                            <span className="truncate max-w-[180px]">{email}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeContact(email)}
                                                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[#0ea5e9] hover:text-white text-[#0369a1] transition-colors ml-0.5"
                                                aria-label={`Remove ${email}`}
                                            >
                                                <i className="fas fa-times text-[10px]"></i>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* CC */}
                        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <i className="fas fa-copy text-[#0369a1] text-sm"></i>
                                <label className="text-sm font-medium text-gray-800">CC (optional)</label>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={newContactCc}
                                    onChange={(e) => setNewContactCc(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addContactCc(); } }}
                                    placeholder="cc@example.com"
                                    className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0ea5e9] focus:border-[#0ea5e9] placeholder-gray-400 transition-shadow"
                                />
                                <button
                                    type="button"
                                    onClick={addContactCc}
                                    className="px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#0369a1] to-[#0ea5e9] rounded-xl hover:opacity-90 shadow-md hover:shadow-lg transition-all shrink-0"
                                >
                                    <i className="fas fa-plus mr-1.5"></i>Add
                                </button>
                            </div>
                            {contactsCc.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {contactsCc.map((email) => (
                                        <span
                                            key={email}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#f0fdf4] text-[#047857] border border-[#bbf7d0]"
                                        >
                                            <i className="fas fa-copy text-[10px] opacity-70"></i>
                                            <span className="truncate max-w-[180px]">{email}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeContactCc(email)}
                                                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[#0ea5e9] hover:text-white text-[#047857] transition-colors ml-0.5"
                                                aria-label={`Remove CC ${email}`}
                                            >
                                                <i className="fas fa-times text-[10px]"></i>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Subject */}
                        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <i className="fas fa-tag text-[#0369a1] text-sm"></i>
                                <label className="text-sm font-medium text-gray-800">Subject</label>
                            </div>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0ea5e9] focus:border-[#0ea5e9] placeholder-gray-400 transition-shadow"
                                placeholder="Abco Document / Data request subject..."
                            />
                        </div>

                        {/* Body */}
                        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <i className="fas fa-align-left text-[#0369a1] text-sm"></i>
                                <label className="text-sm font-medium text-gray-800">Email body</label>
                            </div>
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={9}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0ea5e9] focus:border-[#0ea5e9] placeholder-gray-400 resize-y font-sans leading-relaxed"
                                placeholder="Draft your request..."
                            />
                        </div>

                        {/* Schedule: repeat until status */}
                        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <i className="fas fa-calendar-alt text-[#0369a1] text-sm"></i>
                                <label className="text-sm font-medium text-gray-800">Schedule reminder</label>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">Send this request automatically until the cell is marked with the chosen status. Your server cron should call <code className="text-[10px] bg-gray-100 px-1 rounded">/api/cron/document-collection-scheduled-send</code> (e.g. daily).</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                                    <select
                                        value={scheduleFrequency}
                                        onChange={(e) => setScheduleFrequency(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0ea5e9] focus:border-[#0ea5e9]"
                                    >
                                        <option value="none">None</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Stop when status is</label>
                                    <select
                                        value={scheduleStopStatus}
                                        onChange={(e) => setScheduleStopStatus(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0ea5e9] focus:border-[#0ea5e9]"
                                    >
                                        {statusOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Email activity for this month: sent, received, attachments */}
                        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <i className="fas fa-inbox text-[#0369a1] text-sm"></i>
                                <label className="text-sm font-medium text-gray-800">Email activity for this month</label>
                            </div>
                            {loadingActivity ? (
                                <p className="text-sm text-gray-500 flex items-center gap-2">
                                    <i className="fas fa-spinner fa-spin"></i> Loading…
                                </p>
                            ) : (emailActivity.sent.length === 0 && emailActivity.received.length === 0) ? (
                                <p className="text-sm text-gray-500">No emails sent or received yet for this document and month.</p>
                            ) : (
                                <div className="space-y-4">
                                    {emailActivity.sent.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Sent</h4>
                                            <ul className="space-y-1.5">
                                                {emailActivity.sent.map((s) => {
                                                    const isExpanded = expandedSentId === s.id;
                                                    return (
                                                        <li key={s.id} className="rounded-lg bg-sky-50 border border-sky-100 overflow-hidden">
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedSentId((prev) => (prev === s.id ? null : s.id))}
                                                                className="w-full flex items-center gap-2 text-sm text-gray-700 py-1.5 px-2 text-left hover:bg-sky-100/80 transition-colors"
                                                            >
                                                                <i className={`fas fa-paper-plane text-sky-600 text-xs shrink-0 ${isExpanded ? 'rotate-90' : ''}`} style={{ transition: 'transform 0.2s' }}></i>
                                                                <span className="flex-1">{formatDateTime(s.createdAt)}</span>
                                                                <i className={`fas fa-chevron-down text-sky-500 text-xs shrink-0 ${isExpanded ? 'rotate-180' : ''}`} style={{ transition: 'transform 0.2s' }}></i>
                                                            </button>
                                                            {isExpanded && (
                                                                <div className="px-3 py-2 border-t border-sky-100 bg-white/80">
                                                                    <div className="mb-2">
                                                                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Subject</span>
                                                                        <p className="text-sm font-medium text-gray-800 mt-0.5">{s.subject && s.subject.trim() ? s.subject : '—'}</p>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Message</span>
                                                                        <div className="mt-0.5 text-sm text-gray-700 whitespace-pre-wrap break-words max-h-48 overflow-y-auto rounded border border-gray-100 p-2 bg-gray-50/50">
                                                                            {s.bodyText && s.bodyText.trim() ? s.bodyText : '—'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}
                                    {emailActivity.received.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Received</h4>
                                            <ul className="space-y-3">
                                                {emailActivity.received.map((r) => (
                                                    <li key={r.id} className="text-sm border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
                                                        <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center gap-2">
                                                            <i className="fas fa-reply text-emerald-600 text-xs"></i>
                                                            <span className="text-gray-600">{formatDateTime(r.createdAt)}</span>
                                                        </div>
                                                        <div className="px-3 py-2 text-gray-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto text-sm">{r.text && r.text.trim() ? r.text : '—'}</div>
                                                        {r.attachments && r.attachments.length > 0 && (
                                                            <div className="px-3 py-2 border-t border-gray-200 flex flex-wrap gap-2">
                                                                {r.attachments.map((att, idx) => {
                                                                    const attUrl = att.url && att.url.startsWith('http') ? att.url : (typeof window !== 'undefined' && window.location && att.url ? (window.location.origin + (att.url.startsWith('/') ? att.url : '/' + att.url)) : att.url);
                                                                    return (
                                                                        <a
                                                                            key={idx}
                                                                            href={attUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-[#0369a1] hover:bg-[#e0f2fe]"
                                                                            onClick={(e) => { e.preventDefault(); downloadCommentAttachment(attUrl, att.name); }}
                                                                        >
                                                                            <i className="fas fa-paperclip text-[10px]"></i>
                                                                            <span className="truncate max-w-[160px]">{att.name || 'Attachment'}</span>
                                                                        </a>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(() => {
                                        const allAttachments = (emailActivity.received || []).flatMap((r) => (r.attachments || []).map((a) => ({ ...a, receivedAt: r.createdAt })));
                                        if (allAttachments.length === 0) return null;
                                        return (
                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">All attachments</h4>
                                                <ul className="flex flex-wrap gap-2">
                                                    {allAttachments.map((att, idx) => {
                                                        const attUrl = att.url && att.url.startsWith('http') ? att.url : (typeof window !== 'undefined' && window.location && att.url ? (window.location.origin + (att.url.startsWith('/') ? att.url : '/' + att.url)) : att.url);
                                                        return (
                                                            <li key={idx}>
                                                                <a
                                                                    href={attUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-sm text-[#0369a1] hover:bg-[#e0f2fe]"
                                                                    onClick={(e) => { e.preventDefault(); downloadCommentAttachment(attUrl, att.name); }}
                                                                >
                                                                    <i className="fas fa-file-alt text-xs"></i>
                                                                    <span className="truncate max-w-[180px]">{att.name || 'Attachment'}</span>
                                                                </a>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Result messages */}
                        {result?.saved && (
                            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                                <i className="fas fa-check-circle text-emerald-500 mt-0.5 shrink-0"></i>
                                <p className="text-sm text-emerald-700">Saved for this document (all months). Recipients, CC, and email will load next time.</p>
                            </div>
                        )}
                        {result?.error && (
                            <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                                <i className="fas fa-exclamation-circle text-red-500 mt-0.5 shrink-0"></i>
                                <p className="text-sm text-red-700">{result.error}</p>
                            </div>
                        )}
                        {hasSuccess && (
                            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                                <i className="fas fa-check-circle text-emerald-500 mt-0.5 shrink-0"></i>
                                <div className="text-sm text-emerald-800">
                                    <p className="font-medium">Sent successfully</p>
                                    <p className="mt-1 text-emerald-700">{result.sent.join(', ')}</p>
                                </div>
                            </div>
                        )}
                        {hasFailures && (
                            <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                                <i className="fas fa-exclamation-triangle text-amber-500 mt-0.5 shrink-0"></i>
                                <div className="text-sm text-amber-800">
                                    <p className="font-medium">Some deliveries failed</p>
                                    <p className="mt-1 text-amber-700">{result.failed.map((f) => `${f.email}: ${f.error}`).join('; ')}</p>
                                </div>
                            </div>
                        )}
                        {result?.warning && (
                            <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                                <i className="fas fa-info-circle text-amber-600 mt-0.5 shrink-0"></i>
                                <p className="text-sm text-amber-800">{result.warning}</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex flex-wrap justify-end gap-3 px-5 py-4 bg-white border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setEmailModalContext(null)}
                            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveTemplate}
                            disabled={savingTemplate || contacts.length === 0}
                            className="px-4 py-2.5 text-sm font-medium text-[#0369a1] bg-[#e0f2fe] hover:bg-[#bae6fd] rounded-xl transition-colors border border-[#7dd3fc]"
                        >
                            {savingTemplate ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>Saving…</> : <><i className="fas fa-save mr-1.5"></i>Save for this document</>}
                        </button>
                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={sending || contacts.length === 0}
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#0369a1] to-[#0ea5e9] rounded-xl shadow-md hover:shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50 transition-all"
                        >
                            {sending ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i>
                                    Sending…
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-paper-plane"></i>
                                    Send email
                                </>
                            )}
                        </button>
                    </div>
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
                // Parse with safe delimiter – IDs may contain hyphens so we don't split on '-'.
                const { sectionId: rawSectionId, documentId: rawDocumentId, month } = parseCellKey(hoverCommentCell);
                const section = sections.find(s => String(s.id) === String(rawSectionId));
                const doc = section?.documents.find(d => String(d.id) === String(rawDocumentId));
                let comments = doc ? getDocumentComments(doc, month) : [];
                // Deep link fallback: if URL has commentId but comments are empty, find comment by id in current doc keys, then in any year's same section/doc (fixes empty box when year key or data from different year)
                let urlCommentId = null;
                if (typeof window !== 'undefined' && comments.length === 0) {
                    const hash = window.location.hash || '';
                    const search = window.location.search || '';
                    if (hash.includes('?')) {
                        const p = new URLSearchParams(hash.split('?')[1] || '');
                        urlCommentId = p.get('commentId');
                    }
                    if (!urlCommentId && search) {
                        const p = new URLSearchParams(search);
                        urlCommentId = p.get('commentId');
                    }
                }
                if (comments.length === 0 && urlCommentId) {
                    const idStr = String(urlCommentId);
                    const idNum = parseInt(urlCommentId, 10);
                    const matchId = (c) => c && (String(c.id) === idStr || c.id === idNum || c.id === urlCommentId);
                    if (doc?.comments && typeof doc.comments === 'object') {
                        for (const key of Object.keys(doc.comments)) {
                            const arr = Array.isArray(doc.comments[key]) ? doc.comments[key] : [];
                            const found = arr.find(matchId);
                            if (found) {
                                comments = [found];
                                break;
                            }
                        }
                    }
                    if (comments.length === 0 && sectionsByYear && typeof sectionsByYear === 'object') {
                        for (const year of Object.keys(sectionsByYear)) {
                            const secs = sectionsByYear[year] || [];
                            const sec = secs.find(s => String(s.id) === String(rawSectionId));
                            const d = sec?.documents?.find(dd => String(dd.id) === String(rawDocumentId));
                            if (!d?.comments || typeof d.comments !== 'object') continue;
                            for (const key of Object.keys(d.comments)) {
                                const arr = Array.isArray(d.comments[key]) ? d.comments[key] : [];
                                const found = arr.find(matchId);
                                if (found) {
                                    comments = [found];
                                    break;
                                }
                            }
                            if (comments.length > 0) break;
                        }
                    }
                }
                
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
                        {/* Always show Comments section so the popup is clearly the comments modal, not just "Add Comment" */}
                        <div className="mb-3">
                            <div className="text-[10px] font-semibold text-gray-600 mb-1.5">Comments</div>
                            {comments.length > 0 ? (
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
                                                if (section && doc && comment.id) {
                                                    const deepLinkUrl = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(section.id)}&docDocumentId=${encodeURIComponent(doc.id)}&docMonth=${encodeURIComponent(month)}&docYear=${encodeURIComponent(selectedYear)}&commentId=${encodeURIComponent(comment.id)}`;
                                                    
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
                                                <span>{(comment.date || comment.createdAt) ? (() => {
                                                    try {
                                                        const date = new Date(comment.date || comment.createdAt);
                                                        if (isNaN(date.getTime())) return 'Invalid Date';
                                                        return formatDateTime(comment.date || comment.createdAt);
                                                    } catch (e) {
                                                        return 'Invalid Date';
                                                    }
                                                })() : 'No date'}</span>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent triggering comment click
                                                    if (!section || !doc) return;
                                                    handleDeleteComment(section.id, doc.id, month, comment.id);
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
                                                    if (!section || !doc || !comment.id) return;
                                                    
                                                    const deepLinkUrl = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(section.id)}&docDocumentId=${encodeURIComponent(doc.id)}&docMonth=${encodeURIComponent(month)}&docYear=${encodeURIComponent(selectedYear)}&commentId=${encodeURIComponent(comment.id)}`;
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
                                                            alert('Failed to copy link. Please copy manually from the address bar.');
                                                        });
                                                    } else {
                                                        // Fallback: select the URL in a temporary input
                                                        const input = document.createElement('input');
                                                        input.value = fullUrl;
                                                        document.body.appendChild(input);
                                                        input.select();
                                                        document.execCommand('copy');
                                                        document.body.removeChild(input);
                                                        alert('Link copied to clipboard!');
                                                    }
                                                    
                                                    // Also update URL
                                                    if (window.RouteState && window.RouteState.navigate) {
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
                            ) : (
                                <div className="py-3 px-2 rounded bg-gray-50 border border-gray-100 text-center">
                                    <p className="text-[11px] text-gray-500">No comments yet</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Add one below</p>
                                </div>
                            )}
                        </div>
                        
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
                            {commentInputAvailable && section && doc ? (
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
                                        handleAddComment(section.id, doc.id, month, commentText, atts, hoverCommentCell);
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
                                                    handleAddComment(section.id, doc.id, month, quickComment, atts, hoverCommentCell);
                                                    setQuickComment('');
                                                })();
                                            }
                                        }}
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                        rows="2"
                                        placeholder="Type comment... (Ctrl+Enter to submit)"
                                    />
                                    <button
                                        onClick={async () => {
                                            if (!section || !doc || !quickComment.trim()) return;
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
                                            handleAddComment(section.id, doc.id, month, quickComment, atts, hoverCommentCell);
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
                                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
                                    {isMonthlyDataReview ? 'Monthly Data Review' : 'Monthly Document Collection Tracker'}
                                </h1>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {project?.name}
                                    {project?.client && ` • ${project.client}`}
                                    {!isMonthlyDataReview && (
                                        <>
                                            {' • Facilities: '}
                                            <span className="font-medium">{getFacilitiesLabel(project) || 'Not specified'}</span>
                                        </>
                                    )}
                                    {isMonthlyDataReview && ' • Same functionality as Document Collection'}
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
                                aria-label="Select year for document collection tracker"
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
                                <div className={`w-4 h-4 rounded-full ${option.cellColor} ring-2 ring-white shadow-sm`}></div>
                                <span className="text-xs font-medium text-gray-700">{option.label}</span>
                            </div>
                            {idx < statusOptions.length - 1 && <i className="fas fa-arrow-right text-xs text-gray-400"></i>}
                        </React.Fragment>
                    ))}
                </div>
            </div>
            
            {/* Per-section tables with independent horizontal scroll */}
            <div ref={scrollSyncRootRef} className="space-y-3" data-scroll-sync-root>
                {sections.length === 0 ? (
                    (() => {
                        const yearsWithSections = Object.keys(sectionsByYear || {}).filter((y) => (sectionsByYear[y] || []).length > 0).map((y) => parseInt(y, 10)).filter((y) => !Number.isNaN(y)).sort((a, b) => b - a);
                        const hasDataInOtherYears = yearsWithSections.length > 0;
                        const bestYear = yearsWithSections[0];
                        return (
                    <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center">
                                <i className="fas fa-folder-open text-3xl text-primary-600"></i>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-gray-900">No sections yet</p>
                                {hasDataInOtherYears ? (
                                    <>
                                        <p className="text-sm text-gray-600 mt-1">No sections for <strong>{selectedYear}</strong>. Your document collection has data for {yearsWithSections.join(', ')}.</p>
                                        <p className="text-sm text-primary-600 mt-2">Change the <strong>Year</strong> dropdown above, or click below to view that year.</p>
                                    </>
                                ) : (
                                    <p className="text-sm text-gray-600 mt-1">Create your first section to start organizing documents</p>
                                )}
                                {!hasDataInOtherYears && (
                                <p className="text-xs text-amber-700 mt-3 p-2 bg-amber-50 rounded border border-amber-200">
                                    <strong>Works in another browser but not here?</strong> Likely cache or an extension. Use <strong>Clear cache & reload</strong> below, or try Incognito/Private. Or F12 → Network and check <code className="bg-amber-100 px-0.5">document-sections-v2</code>.
                                </p>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {hasDataInOtherYears && bestYear != null && (
                                    <button
                                        onClick={() => handleYearChange(bestYear)}
                                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold"
                                    >
                                        Show {bestYear}
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (typeof window === 'undefined' || !window.location) return;
                                        const url = new URL(window.location.href);
                                        url.searchParams.set('clearCache', '1');
                                        window.location.href = url.pathname + url.search + (window.location.hash || '');
                                    }}
                                    className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 text-sm font-medium border border-amber-300"
                                >
                                    Clear cache & reload
                                </button>
                                <button
                                    onClick={() => { if (project?.id) loadData(); }}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium disabled:opacity-50"
                                >
                                    {isLoading ? 'Loading…' : 'Retry load'}
                                </button>
                                <button
                                    onClick={handleAddSection}
                                    className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                                >
                                    <i className="fas fa-plus"></i><span>Add First Section</span>
                                </button>
                            </div>
                        </div>
                    </div>
                        );
                    })()
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
                            <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 flex items-center justify-between cursor-grab active:cursor-grabbing">
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

                            {/* Scrollable month/document grid for this section only */}
                            <div data-scroll-sync className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gradient-to-b from-gray-100 to-gray-50">
                                        <tr>
                                            <th
                                                className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider sticky left-0 bg-gradient-to-b from-gray-100 to-gray-50 z-20 border-r-2 border-gray-300"
                                                style={{ boxShadow: STICKY_COLUMN_SHADOW, width: '250px', minWidth: '250px', maxWidth: '250px' }}
                                            >
                                                Document / Data
                                            </th>
                                            {months.map((month, idx) => (
                                                <th
                                                    key={month}
                                                    className={`px-3 py-3 text-center text-xs font-bold uppercase tracking-wider border-l-2 border-gray-200 ${
                                                        isOneMonthArrears(selectedYear, idx)
                                                            ? 'bg-primary-100 text-primary-800 border-primary-300'
                                                            : 'text-gray-700'
                                                    }`}
                                                >
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span>{month.slice(0, 3)}</span>
                                                        <span className="text-[10px] font-normal">{String(selectedYear).slice(-2)}</span>
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
                                                <td colSpan={14} className="px-8 py-12 text-center">
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
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW, width: '250px', minWidth: '250px', maxWidth: '250px' }}
                                                    >
                                                        <div className="w-full flex items-start gap-2">
                                                            <span className="inline-flex cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5" title="Drag to reorder">
                                                                <i className="fas fa-grip-vertical text-[10px]"></i>
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-semibold text-gray-900 mb-1">{doc.name}</div>
                                                            {doc.description && (() => {
                                                                // Check if description contains ISO date strings and format them
                                                                let desc = String(doc.description);
                                                                
                                                                // Multiple regex patterns to catch all ISO date variations
                                                                // Pattern 1: Standard ISO with T and Z: 2026-01-23T18:03:45.992Z
                                                                const isoPattern1 = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z)/gi;
                                                                // Pattern 2: ISO without Z: 2026-01-23T18:03:45.992
                                                                const isoPattern2 = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)(?![0-9Z])/gi;
                                                                // Pattern 3: ISO with space instead of T: 2026-01-23 18:03:45.992Z
                                                                const isoPattern3 = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z?)/gi;
                                                                
                                                                // Apply all patterns
                                                                [isoPattern1, isoPattern2, isoPattern3].forEach(pattern => {
                                                                    desc = desc.replace(pattern, (match) => {
                                                                        // Clean the match - replace space with T if needed, ensure proper format
                                                                        let cleanedMatch = match.trim().replace(/\s+/, 'T');
                                                                        // Ensure it ends with Z or add it if it's a complete ISO string
                                                                        if (cleanedMatch.includes('T') && !cleanedMatch.endsWith('Z') && cleanedMatch.match(/\.\d+$/)) {
                                                                            // Has milliseconds but no Z - add Z for proper parsing
                                                                            cleanedMatch = cleanedMatch + 'Z';
                                                                        }
                                                                        
                                                                        const formatted = formatDateTime(cleanedMatch);
                                                                        // If formatting failed, try direct Date parsing
                                                                        if (!formatted || formatted === '') {
                                                                            try {
                                                                                const date = new Date(cleanedMatch);
                                                                                if (!isNaN(date.getTime())) {
                                                                                    return date.toLocaleString('en-US', {
                                                                                        year: 'numeric',
                                                                                        month: 'short',
                                                                                        day: 'numeric',
                                                                                        hour: 'numeric',
                                                                                        minute: '2-digit',
                                                                                        hour12: true
                                                                                    });
                                                                                }
                                                                            } catch (e) {
                                                                                // If all else fails, return original
                                                                            }
                                                                            return match; // Return original if formatting fails
                                                                        }
                                                                        return formatted;
                                                                    });
                                                                });
                                                                
                                                                const { truncated, isLong } = truncateDescription(desc);
                                                                const isExpanded = expandedDescriptionId === doc.id;
                                                                
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
                                                            </div>
                                                    </td>
                                                    {months.map((month) => (
                                                        <React.Fragment key={`${doc.id}-${month}`}>
                                                            {renderStatusCell(section, doc, month)}
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
            {emailModalContext && <DocumentRequestEmailModal />}
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
                
                // Format the description (handle ISO dates)
                let desc = foundDoc.description;
                const isoDatePattern = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)/g;
                desc = desc.replace(isoDatePattern, (match) => {
                    const formatted = formatDateTime(match);
                    return formatted || match;
                });
                
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
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{desc}</p>
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
        </div>
    );
};

// Make available globally
window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
