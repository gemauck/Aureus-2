// Get React hooks from window
const { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } = React;
const storage = window.storage;
const STICKY_COLUMN_SHADOW = '4px 0 12px rgba(15, 23, 42, 0.08)';
const DEEPLINK_DEBUG = false; // Set true to log deep-link checks (noisy)
const DEBUG_SCROLL_SYNC = false; // Log scroll-sync attach/scroll (set true to debug)
// Delimiter for comment cell key: sectionId, documentId, month. IDs can contain hyphens (e.g. file1-doc1).
const COMMENT_CELL_SEP = '\u0001';
const buildCellKey = (sectionId, documentId, month) =>
    `${String(sectionId)}${COMMENT_CELL_SEP}${String(documentId)}${COMMENT_CELL_SEP}${String(month)}`;
const buildDocMonthKey = (documentId, month) =>
    `${String(documentId)}-${Number(month)}`;
const parseCellKey = (cellKey) => {
    const p = String(cellKey).split(COMMENT_CELL_SEP);
    return { sectionId: p[0], documentId: p[1], month: p[2] };
};

/** Reserved key in monthlyDataReviewSections JSON: { [year]: { [monthIndex]: url } } (not section rows). */
const MDR_DRIVE_LINKS_KEY = '__mdrDriveLinks';

/** True for keys that hold per-year section arrays (excludes `__…` metadata keys). */
const isSectionsYearMapDataKey = (k) => k != null && !String(k).startsWith('__');

const normalizeDriveOpenUrl = (input) => {
    const s = String(input || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s.replace(/^\/+/, '')}`;
};

/** If GET returns before PUT is visible, keep in-memory Drive URLs that the server row does not yet list. */
const mergeMdrDriveLinksFromRef = (serverNorm, refSnap) => {
    if (!serverNorm || typeof serverNorm !== 'object' || !refSnap || typeof refSnap !== 'object') {
        return serverNorm;
    }
    const refMeta = refSnap[MDR_DRIVE_LINKS_KEY];
    if (!refMeta || typeof refMeta !== 'object') return serverNorm;
    const out = { ...serverNorm };
    const srvMeta =
        out[MDR_DRIVE_LINKS_KEY] && typeof out[MDR_DRIVE_LINKS_KEY] === 'object'
            ? { ...out[MDR_DRIVE_LINKS_KEY] }
            : {};
    for (const y of Object.keys(refMeta)) {
        const refYm = refMeta[y];
        if (!refYm || typeof refYm !== 'object') continue;
        const srvYm = { ...(typeof srvMeta[y] === 'object' ? srvMeta[y] : {}) };
        for (const m of Object.keys(refYm)) {
            const rv = String(refYm[m] || '').trim();
            const sv = String(srvYm[m] || '').trim();
            if (!sv && rv) srvYm[m] = refYm[m];
        }
        if (Object.keys(srvYm).length) srvMeta[y] = srvYm;
        else delete srvMeta[y];
    }
    if (Object.keys(srvMeta).length) out[MDR_DRIVE_LINKS_KEY] = srvMeta;
    else delete out[MDR_DRIVE_LINKS_KEY];
    return out;
};

/** If URL targets a specific comment, activity panel should scroll there (deep-link) not to latest. */
const getCommentIdFromLocation = () => {
    if (typeof window === 'undefined') return null;
    try {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        if (hash.includes('?')) {
            const id = new URLSearchParams(hash.split('?')[1] || '').get('commentId');
            if (id && String(id).trim()) return String(id).trim();
        }
        if (search) {
            const id = new URLSearchParams(search).get('commentId');
            if (id && String(id).trim()) return String(id).trim();
        }
    } catch (_) {}
    return null;
};

// Stable reference — do not allocate a new array each render (cell-activity effect depends on identity).
const DOCUMENT_COLLECTION_MONTHS = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]);

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

const SA_TIMEZONE_OFFSET = '+02:00';

const parseDateValue = (dateValue) => {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    const raw = String(dateValue).trim();
    if (!raw) return null;
    const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
    // Treat stored timestamps as SA "wall time" regardless of timezone suffix.
    const withoutTimezone = normalized.replace(/([zZ]|[+-]\d{2}:?\d{2})$/, '');
    const withTimezone = `${withoutTimezone}${SA_TIMEZONE_OFFSET}`;
    const date = new Date(withTimezone);
    if (isNaN(date.getTime())) return null;
    return date;
};

// Use SAST for display (single place for options)
const SAST_OPTS = { timeZone: 'Africa/Johannesburg' };
const SAST_DATETIME_OPTS = { ...SAST_OPTS, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
const SAST_DATE_ONLY_OPTS = { ...SAST_OPTS, year: 'numeric', month: 'short', day: 'numeric' };

// For values that are clearly UTC from API (ISO with Z or offset), parse as UTC. Otherwise use parseDateValue (SA wall time).
function parseDateForDisplay(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return isNaN(dateValue.getTime()) ? null : dateValue;
    const raw = String(dateValue).trim();
    if (!raw) return null;
    const hasUtcIndicator = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
    const date = hasUtcIndicator ? new Date(raw) : parseDateValue(dateValue);
    return date && !isNaN(date.getTime()) ? date : null;
}

// Helper function to format dates as date and time (SAST)
const formatDateTime = (dateValue) => {
    try {
        const date = parseDateForDisplay(dateValue);
        if (!date) return '';
        return date.toLocaleString('en-ZA', SAST_DATETIME_OPTS);
    } catch (e) {
        console.warn('Failed to format date:', dateValue, e);
        return '';
    }
};

// Helper function to format dates as date only (SAST)
const formatDateOnly = (dateValue) => {
    try {
        const date = parseDateForDisplay(dateValue);
        if (!date) return '';
        return date.toLocaleDateString('en-ZA', SAST_DATE_ONLY_OPTS);
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
    // dataSource: 'documentCollection' | 'monthlyDataReview' | 'complianceReview' - same UI, different storage
    const isMonthlyDataReview = dataSource === 'monthlyDataReview';
    const isComplianceReview = dataSource === 'complianceReview';
    /** API `DocumentCollectionTemplate.type` for list/create in this tracker context */
    const templateApiType = isMonthlyDataReview
        ? 'monthly-data-review'
        : isComplianceReview
            ? 'compliance-review'
            : 'document-collection';
    const isJsonOnlyTracker = isMonthlyDataReview || isComplianceReview;
    /** Hash ?tab= value so emails/notifications open the correct project sub-tab (not Document Collection by mistake). */
    const trackerTabForDeepLink = isMonthlyDataReview ? 'monthlyDataReview' : isComplianceReview ? 'complianceReview' : 'documentCollection';
    const trackerNotifySource = trackerTabForDeepLink;
    const trackerContextTitlePrefix = isMonthlyDataReview ? 'Monthly Data Review' : isComplianceReview ? 'Compliance Review' : 'Document Collection';
    // Month grid column widths (Data Review, Compliance Review, Document Collection)
    const jsonTrackerStatusColPx = isComplianceReview ? 280 : 360;
    const jsonTrackerNotesColPx = isComplianceReview ? 260 : 340;
    /** Two-row sticky header: offset for Status/Notes row (approx. JAN + year row with py-2). */
    const jsonTrackerHeaderRow2TopClass = 'top-[3.5rem]';
    const documentCollectionMonthColMinPx = 240;
    const getProjectSectionsField = (proj) => {
        if (dataSource === 'monthlyDataReview') return proj?.monthlyDataReviewSections;
        if (dataSource === 'complianceReview') return proj?.complianceReviewSections;
        return proj?.documentSections;
    };
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
    const pendingSaveRef = useRef(false); // Queue one retry when save is blocked by in-flight save/loading
    const pendingSaveSkipLoadingGuardRef = useRef(false); // Preserve skipLoadingGuard intent for queued save
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
    const showedPropDataRef = useRef(false); // True when we showed prop data so background fetch failure doesn't clear it
    const userSelectedYearRef = useRef(false); // Track manual year selection to avoid auto-switching
    const autoScrolledWorkingMonthRef = useRef(null); // Prevent repeated forced scroll for same project/year/layout
    
    const getSnapshotKey = (projectId) => projectId
        ? (isMonthlyDataReview ? `monthlyDataReviewSnapshot_${projectId}` : isComplianceReview ? `complianceReviewSnapshot_${projectId}` : `documentCollectionSnapshot_${projectId}`)
        : null;

    const months = DOCUMENT_COLLECTION_MONTHS;
    const commentInputAvailable = typeof window !== 'undefined' && typeof window.CommentInputWithMentions === 'function';

    // Year selection with persistence
    const YEAR_STORAGE_PREFIX = isMonthlyDataReview ? 'monthlyDataReviewSelectedYear_' : isComplianceReview ? 'complianceReviewSelectedYear_' : 'documentCollectionSelectedYear_';
    const MIN_YEAR = 2008;
    const FUTURE_YEAR_BUFFER = 5;
    const isValidYear = (value) => {
        const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
        return Number.isFinite(parsed) && parsed >= MIN_YEAR && parsed <= currentYear + FUTURE_YEAR_BUFFER;
    };
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
                if (isValidYear(y)) return y;
            }
            if (project?.id) {
                const storedYear = localStorage.getItem(`${YEAR_STORAGE_PREFIX}${project.id}`);
                const parsedYear = storedYear ? parseInt(storedYear, 10) : NaN;
                if (isValidYear(parsedYear)) {
                    return parsedYear;
                }
            }
        }
        return currentYear;
    };
    
    const [selectedYear, setSelectedYear] = useState(getInitialSelectedYear);
    useEffect(() => {
        userSelectedYearRef.current = false;
    }, [project?.id]);
    // Section header Actions dropdown (declare early to avoid TDZ in effects below)
    const [sectionActionsOpenId, setSectionActionsOpenId] = useState(null);
    const [stickyColWidthPx, setStickyColWidthPx] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth <= 1023 ? 200 : 300
    );
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const apply = () => setStickyColWidthPx(mq.matches ? 200 : 300);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);
    const stickyFirstColStyle = useMemo(
        () => ({
            boxShadow: STICKY_COLUMN_SHADOW,
            width: `${stickyColWidthPx}px`,
            minWidth: `${stickyColWidthPx}px`,
            maxWidth: `${stickyColWidthPx}px`,
        }),
        [stickyColWidthPx]
    );
    // Close section Actions dropdown when clicking outside (effect lives near state to avoid TDZ)
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (event.target.closest && !event.target.closest('[data-section-actions-dropdown]')) {
                setSectionActionsOpenId(null);
            }
        };
        if (sectionActionsOpenId != null) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [sectionActionsOpenId]);

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

    /**
     * Deep-link / URL year: copy another year's sections only when the target year is absent from storage.
     * If the year exists as [] (explicit empty after deletes), do not resurrect rows from another year.
     */
    const seedUrlYearFromOtherYearsIfMissing = (normalized, urlYearForNormalize) => {
        if (urlYearForNormalize == null || !normalized || typeof normalized !== 'object') return normalized;
        const yKey = String(urlYearForNormalize);
        if (Object.prototype.hasOwnProperty.call(normalized, yKey)) {
            const yearEntry = normalized[yKey];
            if (Array.isArray(yearEntry) && yearEntry.length === 0) return normalized;
            if (Array.isArray(yearEntry) && yearEntry.length > 0) return normalized;
            if (yearEntry != null && !Array.isArray(yearEntry)) return normalized;
        }
        const otherYears = Object.keys(normalized).filter(y => Array.isArray(normalized[y]) && normalized[y].length > 0);
        if (otherYears.length === 0) return normalized;
        const sourceYear = otherYears[0];
        const cloned = cloneSectionsArray(normalized[sourceYear]);
        return { ...normalized, [yKey]: cloned };
    };

    const yearMapHasSections = (byYear) => {
        if (!byYear || typeof byYear !== 'object') return false;
        return Object.keys(byYear).some(
            (y) => isSectionsYearMapDataKey(y) && Array.isArray(byYear[y]) && byYear[y].length > 0
        );
    };

    const inferYearsFromSections = (sections) => {
        const years = new Set();
        (sections || []).forEach(section => {
            (section.documents || []).forEach(doc => {
                const keys = [
                    ...Object.keys(doc.collectionStatus || {}),
                    ...Object.keys(doc.comments || {}),
                    ...Object.keys(doc.notesByMonth || {})
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
        // Handle empty objects - if it's an empty object, return empty object (don't treat as no data)
        if (!rawValue) return {};
        if (typeof rawValue === 'object' && !Array.isArray(rawValue) && Object.keys(rawValue).length === 0) {
            return {}; // Empty object is valid - means no sections for any year
        }

        // Do NOT cache by a short prefix of JSON: deleting a later section (e.g. "File 7") leaves the
        // prefix unchanged, so a cache hit would resurrect removed rows after reload/refetch.

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
            const yearKeys = Object.keys(parsedValue);
            for (let i = 0; i < yearKeys.length; i++) {
                const yearKey = yearKeys[i];
                const value = parsedValue[yearKey];
                if (yearKey === MDR_DRIVE_LINKS_KEY && value && typeof value === 'object' && !Array.isArray(value)) {
                    result[yearKey] = value;
                    continue;
                }
                if (String(yearKey).startsWith('__')) {
                    continue;
                }
                result[yearKey] = Array.isArray(value) ? value : parseSections(value);
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

    const [driveLinkModal, setDriveLinkModal] = useState(null);
    const driveHoverTimerRef = useRef(null);

    const clearDriveHoverTimer = useCallback(() => {
        if (driveHoverTimerRef.current) {
            clearTimeout(driveHoverTimerRef.current);
            driveHoverTimerRef.current = null;
        }
    }, []);

    const getMdrDriveUrl = useCallback((byYear, year, monthIndex) => {
        if (!byYear || typeof byYear !== 'object') return '';
        const meta = byYear[MDR_DRIVE_LINKS_KEY];
        if (!meta || typeof meta !== 'object') return '';
        const ym = meta[String(year)];
        if (!ym || typeof ym !== 'object') return '';
        const v = ym[String(monthIndex)] ?? ym[monthIndex];
        return v != null ? String(v).trim() : '';
    }, []);

    const applyMdrDriveUrl = useCallback((year, monthIndex, urlRaw) => {
        const url = (urlRaw || '').trim();
        setSectionsByYear((prev) => {
            const next = { ...prev };
            const prevMeta =
                next[MDR_DRIVE_LINKS_KEY] && typeof next[MDR_DRIVE_LINKS_KEY] === 'object'
                    ? { ...next[MDR_DRIVE_LINKS_KEY] }
                    : {};
            const yKey = String(year);
            const monthMap = {
                ...(prevMeta[yKey] && typeof prevMeta[yKey] === 'object' ? prevMeta[yKey] : {}),
            };
            const mKey = String(monthIndex);
            if (!url) delete monthMap[mKey];
            else monthMap[mKey] = url;
            if (Object.keys(monthMap).length === 0) delete prevMeta[yKey];
            else prevMeta[yKey] = monthMap;
            if (Object.keys(prevMeta).length === 0) delete next[MDR_DRIVE_LINKS_KEY];
            else next[MDR_DRIVE_LINKS_KEY] = prevMeta;
            sectionsRef.current = next;
            return next;
        });
    }, []);

    useEffect(() => () => clearDriveHoverTimer(), [clearDriveHoverTimer]);

    const [isLoading, setIsLoading] = useState(true);
    const [loadingSlow, setLoadingSlow] = useState(false);
    
    // Show "taking longer than usual" after 15s so user knows the app is still working
    useEffect(() => {
        if (!isLoading) {
            setLoadingSlow(false);
            return;
        }
        const t = setTimeout(() => setLoadingSlow(true), 15000);
        return () => clearTimeout(t);
    }, [isLoading]);
    
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
    
    // Load users for assignment dropdown
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                if (typeof window.dataService?.getUsers === 'function') {
                    const list = await window.dataService.getUsers() || [];
                    if (!cancelled) setUsers(Array.isArray(list) ? list : []);
                }
            } catch (e) {
                if (!cancelled) setUsers([]);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const [showTemplateList, setShowTemplateList] = useState(true);
    const [expandedDescriptionId, setExpandedDescriptionId] = useState(null);
    const [editingSection, setEditingSection] = useState(null);
    const [editingDocument, setEditingDocument] = useState(null);
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [users, setUsers] = useState([]);
    const [assignmentOpen, setAssignmentOpen] = useState(null); // { sectionId, docId }
    const [assignmentAnchorRect, setAssignmentAnchorRect] = useState(null); // { top, left, bottom, width } for fixed dropdown
    const assignmentDropdownRef = useRef(null);

    // Close assignment dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (assignmentDropdownRef.current && !assignmentDropdownRef.current.contains(event.target)) {
                setAssignmentOpen(null);
                setAssignmentAnchorRect(null);
            }
        };
        if (assignmentOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [assignmentOpen]);

    // Close template dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (templateDropdownRef.current && !templateDropdownRef.current.contains(event.target)) {
                setIsTemplateDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
    const [isImportingExcel, setIsImportingExcel] = useState(false);
    const complianceImportFileInputRef = useRef(null);
    const [hoverCommentCell, setHoverCommentCell] = useState(null);
    const [cellActivityTimeline, setCellActivityTimeline] = useState([]);
    const [cellActivityLoading, setCellActivityLoading] = useState(false);
    const [cellActivityBump, setCellActivityBump] = useState(0);
    const [deletingCellEmailLogId, setDeletingCellEmailLogId] = useState(null);
    const hoverCommentCellRef = useRef(null);
    /** Bumps when the cell-activity effect instance changes so stale fetches never clear loading. */
    const cellActivityEffectGenRef = useRef(0);
    const [quickComment, setQuickComment] = useState('');
    const [commentPopupPosition, setCommentPopupPosition] = useState({ top: 0, left: 0 });
    const [pendingCommentAttachments, setPendingCommentAttachments] = useState([]);
    const [uploadingCommentAttachments, setUploadingCommentAttachments] = useState(false);
    const commentFileInputRef = useRef(null);
    const commentPopupContainerRef = useRef(null);
    /** Avoid re-scrolling on silent polls when timeline length unchanged; reset when popup closes. */
    const lastActivityScrollSigRef = useRef(null);
    const [emailModalContext, setEmailModalContext] = useState(null);
    // Received email counts per cell (key: `${documentId}-${month}` where month is 1-12) for badge on envelope
    const [receivedMetaByCell, setReceivedMetaByCell] = useState({});
    const [openedNotificationByCell, setOpenedNotificationByCell] = useState({});
    const previousEmailModalContextRef = useRef(null);
    // Cell hover: show email/comment actions only on hover to reduce visual clutter
    const [hoveredStatusCell, setHoveredStatusCell] = useState(null);
    // Status legend collapsed by default to reduce visual weight
    const [legendCollapsed, setLegendCollapsed] = useState(true);

    // Table vs vertical list layout (persisted per project + tracker type; default list on narrow viewports)
    const layoutStorageKey = project?.id ? `mdct_layout_${dataSource}_${project.id}` : null;
    const [trackerLayoutMode, setTrackerLayoutMode] = useState(() => {
        if (typeof window === 'undefined') return 'table';
        const key = project?.id ? `mdct_layout_${dataSource}_${project.id}` : null;
        if (key) {
            try {
                const stored = localStorage.getItem(key);
                if (stored === 'list' || stored === 'table') return stored;
            } catch (_) {}
        }
        return window.innerWidth < 1024 ? 'list' : 'table';
    });
    useEffect(() => {
        if (!layoutStorageKey || typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem(layoutStorageKey);
            if (stored === 'list' || stored === 'table') {
                setTrackerLayoutMode(stored);
                return;
            }
        } catch (_) {}
        setTrackerLayoutMode(window.innerWidth < 1024 ? 'list' : 'table');
    }, [layoutStorageKey, project?.id, dataSource]);
    useEffect(() => {
        if (!layoutStorageKey) return;
        try {
            localStorage.setItem(layoutStorageKey, trackerLayoutMode);
        } catch (_) {}
    }, [trackerLayoutMode, layoutStorageKey]);

    useEffect(() => {
        hoverCommentCellRef.current = hoverCommentCell;
    }, [hoverCommentCell]);

    // Clear pending attachments when switching to another comment cell
    useEffect(() => {
        setPendingCommentAttachments([]);
    }, [hoverCommentCell]);

    // Unified activity timeline for the open comment popup (document collection + MDR/compliance JSON trackers)
    useEffect(() => {
        if (!hoverCommentCell || !project?.id) {
            setCellActivityTimeline([]);
            setCellActivityLoading(false);
            return undefined;
        }
        const { sectionId: sid, documentId: did, month: monthLabel } = parseCellKey(hoverCommentCell);
        const monthIdx = months.indexOf(monthLabel);
        if (monthIdx < 0) {
            setCellActivityTimeline([]);
            setCellActivityLoading(false);
            return undefined;
        }
        const reviewTrackerParam = isMonthlyDataReview
            ? 'monthly_data_review'
            : isComplianceReview
              ? 'compliance_review'
              : null;

        if (isJsonOnlyTracker && !reviewTrackerParam) {
            setCellActivityTimeline([]);
            setCellActivityLoading(false);
            return undefined;
        }

        cellActivityEffectGenRef.current += 1;
        const effectGen = cellActivityEffectGenRef.current;
        let cancelled = false;
        const monthNum = monthIdx + 1;

        const load = async (silent) => {
            if (cancelled) return;
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
            const token =
                (typeof window !== 'undefined' &&
                    (window.storage?.getToken?.() ??
                        localStorage.getItem('authToken') ??
                        localStorage.getItem('auth_token') ??
                        localStorage.getItem('abcotronics_token') ??
                        localStorage.getItem('token'))) ||
                '';

            if (!silent) setCellActivityLoading(true);
            try {
                let url;
                if (isJsonOnlyTracker && reviewTrackerParam) {
                    const q = new URLSearchParams({
                        tracker: reviewTrackerParam,
                        documentId: String(did).trim(),
                        month: String(monthNum),
                        year: String(selectedYear),
                        _: String(Date.now())
                    });
                    url = `${base}/api/projects/${project.id}/review-cell-activity?${q}`;
                } else {
                    const q = new URLSearchParams({
                        documentId: String(did).trim(),
                        month: String(monthNum),
                        year: String(selectedYear),
                        _: String(Date.now())
                    });
                    const yrSecs = sectionsByYear[selectedYear] || [];
                    const sec = yrSecs.find((s) => String(s.id) === String(sid));
                    const d = sec?.documents?.find((dd) => String(dd.id) === String(did));
                    if (d?.name) q.set('documentName', String(d.name).trim());
                    if (sec?.id) q.set('sectionId', String(sec.id).trim());
                    url = `${base}/api/projects/${project.id}/document-collection-cell-activity?${q}`;
                }

                const res = await fetch(url, {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store',
                    headers: {
                        Accept: 'application/json',
                        'Cache-Control': 'no-store',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    }
                });
                const json = await res.json().catch(() => ({}));
                const data = json.data || json;
                const timeline = Array.isArray(data.timeline) ? data.timeline : [];
                if (cancelled || cellActivityEffectGenRef.current !== effectGen) return;
                setCellActivityTimeline((prev) => {
                    if (silent) {
                        const prevSig = prev.map((x) => x.id).join('\u0001');
                        const nextSig = timeline.map((x) => x.id).join('\u0001');
                        if (prevSig === nextSig) return prev;
                    }
                    return timeline;
                });
            } catch (_) {
                if (!cancelled && cellActivityEffectGenRef.current === effectGen && !silent) {
                    setCellActivityTimeline([]);
                }
            } finally {
                if (!silent && cellActivityEffectGenRef.current === effectGen) {
                    setCellActivityLoading(false);
                }
            }
        };

        load(false);
        const iv = setInterval(() => load(true), 18000);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, [
        hoverCommentCell,
        project?.id,
        selectedYear,
        cellActivityBump,
        isJsonOnlyTracker,
        isMonthlyDataReview,
        isComplianceReview,
        sectionsByYear,
        months
    ]);

    /** Refetch activity timeline when the comment popup is open for this cell. */
    const bumpCellActivityIfPopupMatchesCell = useCallback((sectionId, documentId, month) => {
        const open = hoverCommentCellRef.current;
        if (!open) return;
        const k = parseCellKey(open);
        if (String(k.sectionId) !== String(sectionId)) return;
        if (String(k.documentId) !== String(documentId)) return;
        if (k.month !== month) return;
        setCellActivityBump((b) => b + 1);
    }, []);

    const bumpCellActivityIfPopupMatchesDoc = useCallback((sectionId, documentId) => {
        const open = hoverCommentCellRef.current;
        if (!open) return;
        const k = parseCellKey(open);
        if (String(k.sectionId) !== String(sectionId)) return;
        if (String(k.documentId) !== String(documentId)) return;
        setCellActivityBump((b) => b + 1);
    }, []);

    const pendingCommentOpenRef = useRef(null); // Store comment location to open after year switch
    const deepLinkHandledRef = useRef(null); // Last cellKey we opened for; skip re-open to prevent loop
    
    // Multi-select state: Set of cell keys (sectionId-documentId-month)
    const [selectedCells, setSelectedCells] = useState(new Set());
    const selectedCellsRef = useRef(new Set());
    
    // Keep ref in sync with state
    useEffect(() => {
        selectedCellsRef.current = selectedCells;
    }, [selectedCells]);

    // Fetch received email counts per document/month for the current project and year (badge on envelope)
    const fetchReceivedCounts = useCallback(() => {
        if (!project?.id || !selectedYear) {
            setReceivedMetaByCell({});
            return;
        }
        const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
        const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
        fetch(`${base}/api/projects/${project.id}/document-collection-received-counts?year=${selectedYear}`, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        })
            .then((res) => res.json().catch(() => ({})))
            .then((json) => {
                const data = json.data || json;
                const list = Array.isArray(data.counts) ? data.counts : [];
                const map = {};
                list.forEach(({ documentId, month, receivedCount, latestReceivedAt }) => {
                    if (documentId != null && month != null && receivedCount > 0) {
                        map[buildDocMonthKey(documentId, month)] = {
                            count: receivedCount,
                            latestReceivedAt: latestReceivedAt || null
                        };
                    }
                });
                setReceivedMetaByCell(map);
                const openedList = Array.isArray(data.opened) ? data.opened : [];
                if (openedList.length > 0) {
                    const openedMap = {};
                    openedList.forEach(({ documentId, month, type, openedAt }) => {
                        if (!documentId || !month || !type || !openedAt) return;
                        const docMonthKey = buildDocMonthKey(documentId, month);
                        const current = openedMap[docMonthKey] || {};
                        openedMap[docMonthKey] = { ...current, [type]: openedAt };
                    });
                    setOpenedNotificationByCell(openedMap);
                } else {
                    setOpenedNotificationByCell({});
                }
            })
            .catch(() => {
                setReceivedMetaByCell({});
                setOpenedNotificationByCell({});
            });
    }, [project?.id, selectedYear]);

    useEffect(() => {
        fetchReceivedCounts();
    }, [fetchReceivedCounts]);

    const markNotificationOpened = useCallback((documentId, month, type) => {
        if (!documentId || !month || !type) return;
        const docMonthKey = buildDocMonthKey(documentId, month);
        setOpenedNotificationByCell(prev => {
            const current = prev[docMonthKey] || {};
            if (current[type]) return prev;
            return { ...prev, [docMonthKey]: { ...current, [type]: new Date().toISOString() } };
        });
        try {
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
            const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
            fetch(`${base}/api/projects/${project?.id}/document-collection-notification-opened`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    documentId,
                    year: selectedYear,
                    month: month,
                    type
                })
            }).catch(() => {});
        } catch (_) {
            // ignore network errors
        }
    }, [project?.id, selectedYear]);

    useEffect(() => {
        if (!project?.id || !selectedYear) {
            setOpenedNotificationByCell({});
        }
    }, [project?.id, selectedYear]);

    // When email modal closes, refetch received counts so badge updates after refresh in modal
    useEffect(() => {
        const wasOpen = previousEmailModalContextRef.current != null;
        previousEmailModalContextRef.current = emailModalContext;
        if (wasOpen && emailModalContext == null) {
            fetchReceivedCounts();
        }
    }, [emailModalContext, fetchReceivedCounts]);

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
        if (isDeletingRef.current) {
            console.log('⏸️ Load skipped: section deletion in progress');
            return;
        }

        // Quick path: if project already has sections (e.g. from full project load), show immediately
        const propSectionsFirst = getProjectSectionsField(project);
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
        const hasPropData = propSectionsFirst != null && typeof propSectionsFirst === 'object' &&
            Object.keys(propSectionsFirst).some((k) => {
                const v = propSectionsFirst[k];
                return Array.isArray(v) && v.length > 0;
            });
        if (hasPropData) {
            showedPropDataRef.current = true;
            let normalized = normalizeSectionsByYear(propSectionsFirst, urlYearForNormalize);
            normalized = seedUrlYearFromOtherYearsIfMissing(normalized, urlYearForNormalize);
            if (isMonthlyDataReview) {
                normalized = mergeMdrDriveLinksFromRef(normalized, sectionsRef.current);
            }
            setSectionsByYear(normalized);
            sectionsRef.current = normalized;
            lastSavedDataRef.current = JSON.stringify(normalized);
            setIsLoading(false);
            // Still fetch from API in background to get latest (and emailRequestByMonth from blob), then update
            // Fall through to run the fetch below without blocking the UI
        } else {
            showedPropDataRef.current = false;
            setIsLoading(true);
        }
        
        try {
            // 1) Prefer uncached endpoint fetches
            let sectionsField = null;
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
            const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
            const authHeaders = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
            if (!isJsonOnlyTracker) {
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
            } else {
                const sectionsFieldName = isComplianceReview ? 'complianceReviewSections' : 'monthlyDataReviewSections';
                const endpoint = `/api/projects/${project.id}?fields=${sectionsFieldName}&_=${Date.now()}`;
                try {
                    const res = await fetch(base + endpoint, {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                        headers: authHeaders
                    });
                    if (res.ok) {
                        const json = await res.json();
                        const freshProject = json?.data?.project || json?.project || json?.data;
                        sectionsField = getProjectSectionsField(freshProject);
                    }
                } catch (fetchErr) {
                    console.warn('📥 project fetch failed, trying fallbacks:', fetchErr?.message);
                }
            }
            
            // 2) Fallback: full project fetch (may be cached in some browsers)
            if (sectionsField == null && apiRef.current) {
                console.log('📥 Loading from fetchProject...', { projectId: project.id });
                const freshProject = await apiRef.current.fetchProject(project.id);
                sectionsField = getProjectSectionsField(freshProject);
            }

            // 3) Fallback: DatabaseAPI fetch if available
            if (sectionsField == null && window.DatabaseAPI?.getProject) {
                try {
                    const fresh = await window.DatabaseAPI.getProject(project.id);
                    const freshProject = fresh?.data?.project || fresh?.project || fresh?.data;
                    sectionsField = getProjectSectionsField(freshProject);
                } catch (fetchErr) {
                    console.warn('📥 DatabaseAPI.getProject failed:', fetchErr?.message);
                }
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
            
            if (
                sectionsField != null &&
                (typeof sectionsField === 'object' || typeof sectionsField === 'string')
            ) {
                let normalized = normalizeSectionsByYear(sectionsField, urlYearForNormalize);
                // If URL has docYear but that year is missing from API data, seed from another year (not when year is explicit [])
                normalized = seedUrlYearFromOtherYearsIfMissing(normalized, urlYearForNormalize);
                if (isMonthlyDataReview) {
                    normalized = mergeMdrDriveLinksFromRef(normalized, sectionsRef.current);
                }
                if (!yearMapHasSections(normalized) && yearMapHasSections(sectionsRef.current)) {
                    console.warn('📥 Ignoring empty sections payload; keeping existing tracker data (avoid wipe from race or partial API response).');
                    setIsLoading(false);
                    return;
                }
                hasRetriedLoadRef.current = false; // Reset so future loads can retry if needed
                setSectionsByYear(normalized);
                sectionsRef.current = normalized;
                lastSavedDataRef.current = JSON.stringify(normalized);
                setIsLoading(false);
                return;
            }
            
            // 4) Fallback to prop data
            const propSections = getProjectSectionsField(project);
            if (propSections) {
                let normalized = normalizeSectionsByYear(propSections, urlYearForNormalize);
                normalized = seedUrlYearFromOtherYearsIfMissing(normalized, urlYearForNormalize);
                if (isMonthlyDataReview) {
                    normalized = mergeMdrDriveLinksFromRef(normalized, sectionsRef.current);
                }
                setSectionsByYear(normalized);
                sectionsRef.current = normalized;
                lastSavedDataRef.current = JSON.stringify(normalized);
            } else {
                // Document Collection: try browser backup when server/prop returned nothing (e.g. fetch blocked by cache/extension)
                if (!isJsonOnlyTracker && project?.id && typeof window !== 'undefined' && window.localStorage) {
                    const key = getSnapshotKey(project.id);
                    if (key) {
                        const raw = window.localStorage.getItem(key);
                        if (raw && raw.trim()) {
                            try {
                                const parsed = JSON.parse(raw);
                                const normalized = normalizeSectionsByYear(parsed, urlYearForNormalize);
                                if (normalized && typeof normalized === 'object' && Object.keys(normalized).some((y) => Array.isArray(normalized[y]) && normalized[y].length > 0)) {
                                    hasRetriedLoadRef.current = false;
                                    setSectionsByYear(normalized);
                                    sectionsRef.current = normalized;
                                    lastSavedDataRef.current = null; // Force save so server gets this data
                                    setIsLoading(false);
                                    if (typeof saveToDatabase === 'function') saveToDatabase();
                                    return;
                                }
                            } catch (e) {
                                console.warn('Load from browser backup failed:', e);
                            }
                        }
                    }
                }
                setSectionsByYear({});
                sectionsRef.current = {};
                lastSavedDataRef.current = JSON.stringify({});
                // Document Collection only: retry load once after a short delay (fixes "empty in this tab, works in new incognito")
                if (!isJsonOnlyTracker) {
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
            // Don't clear state if we already showed prop data (background fetch failed)
            if (!showedPropDataRef.current) {
                setSectionsByYear({});
                sectionsRef.current = {};
            }
        } finally {
            setIsLoading(false);
        }
    // Note: do not depend on selectedYear — API returns all years; reloading on year change was redundant
    // and could race with saves. Year is only for normalizeSectionsByYear when provided via URL.
    }, [project?.id, project?.documentSections, project?.monthlyDataReviewSections, project?.complianceReviewSections, isJsonOnlyTracker, dataSource]);
    
    // Load data on mount and when project/year changes
    useEffect(() => {
        if (project?.id) {
            loadData();
        }
    }, [project?.id, selectedYear, loadData]);

    // Restore from last browser backup (e.g. after a failed save that cleared the server)
    const handleRestoreFromBackup = useCallback(() => {
        if (isJsonOnlyTracker || !project?.id) return;
        const key = getSnapshotKey(project.id);
        if (!key || typeof window === 'undefined' || !window.localStorage) return;
        const raw = window.localStorage.getItem(key);
        if (!raw || !raw.trim()) {
            alert('No browser backup found for this project. Use the same browser where you last had the data.');
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            const normalized = normalizeSectionsByYear(parsed, selectedYear);
            if (!normalized || typeof normalized !== 'object' || Object.keys(normalized).length === 0) {
                alert('Backup is empty.');
                return;
            }
            setSectionsByYear(normalized);
            sectionsRef.current = normalized;
            // Do NOT set lastSavedDataRef here — we want saveToDatabase to see "changed" and push to server
            if (typeof saveToDatabase === 'function') {
                const savePromise = saveToDatabase();
                if (savePromise && typeof savePromise.then === 'function') {
                    savePromise.then(() => {
                        if (typeof window !== 'undefined' && window.showNotification) {
                            window.showNotification('Restored from browser backup and saved to server.', 'success');
                        }
                    }).catch(() => {
                        if (typeof window !== 'undefined' && window.showNotification) {
                            window.showNotification('Restored locally but save to server failed. Check network and retry.', 'error');
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('Restore from backup failed:', e);
            alert('Backup data is invalid or corrupted.');
        }
    }, [project?.id, selectedYear, isJsonOnlyTracker]);

    // When tab becomes visible and we have no sections, refetch (fixes "empty in this tab, works in new incognito")
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const onVisibility = () => {
            if (document.visibilityState !== 'visible' || !project?.id || isJsonOnlyTracker) return;
            const years =
                sectionsByYear && typeof sectionsByYear === 'object' ? Object.keys(sectionsByYear) : [];
            const hasAny = years.some(
                (y) =>
                    isSectionsYearMapDataKey(y) &&
                    Array.isArray(sectionsByYear[y]) &&
                    sectionsByYear[y].length > 0
            );
            if (!hasAny) loadData();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [project?.id, sectionsByYear, isJsonOnlyTracker, loadData]);

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
            if (!isValidYear(y)) return;
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
        if (userSelectedYearRef.current) return;
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

        const yearsWithData = Object.keys(sectionsByYear)
            .filter((y) => {
                if (!isSectionsYearMapDataKey(y)) return false;
                const arr = sectionsByYear[y];
                return Array.isArray(arr) && arr.length > 0;
            })
            .map((y) => parseInt(y, 10))
            .filter((y) => isValidYear(y))
            .sort((a, b) => b - a);
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

    // Flush queued save once loading completes and no save is currently running.
    useEffect(() => {
        if (!project?.id || isLoading || isSavingRef.current || !pendingSaveRef.current) return;
        const queuedSkipLoadingGuard = pendingSaveSkipLoadingGuardRef.current;
        pendingSaveRef.current = false;
        pendingSaveSkipLoadingGuardRef.current = false;
        void saveToDatabase({ skipLoadingGuard: queuedSkipLoadingGuard });
    }, [isLoading, project?.id]);
    
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

    // Monthly Data Review: auto-navigate horizontally to the highlighted working month column.
    useEffect(() => {
        if (!isMonthlyDataReview) return;
        if (trackerLayoutMode !== 'table') return;
        if (!project?.id || sections.length === 0) return;

        const runKey = `${project.id}:${selectedYear}:table`;
        if (autoScrolledWorkingMonthRef.current === runKey) return;

        const root = scrollSyncRootRef.current;
        if (!root) return;

        let rafId = null;
        let tries = 0;
        const maxTries = 12;
        const targetMonthIndex = oneMonthArrearsMonthIndex;

        const scrollToWorkingMonth = () => {
            const containers = Array.from(root.querySelectorAll('[data-scroll-sync]')).filter(el => el.isConnected);
            if (containers.length === 0) return false;

            const firstContainer = containers[0];
            const targetHeader = firstContainer.querySelector(`[data-month-header-index="${targetMonthIndex}"]`);
            if (!targetHeader) return false;

            const targetLeft = Math.max(0, targetHeader.offsetLeft - stickyColWidthPx - 16);
            containers.forEach((container) => {
                container.scrollLeft = targetLeft;
            });
            return true;
        };

        const attempt = () => {
            rafId = null;
            if (scrollToWorkingMonth()) {
                autoScrolledWorkingMonthRef.current = runKey;
                return;
            }
            tries += 1;
            if (tries < maxTries) {
                rafId = requestAnimationFrame(attempt);
            }
        };

        rafId = requestAnimationFrame(attempt);
        return () => {
            if (rafId != null) cancelAnimationFrame(rafId);
        };
    }, [
        isMonthlyDataReview,
        trackerLayoutMode,
        project?.id,
        sections.length,
        selectedYear,
        oneMonthArrearsMonthIndex,
        stickyColWidthPx
    ]);
    
    // Simplified save function - clear and reliable
    async function saveToDatabase(options = {}) {
        const skipLoadingGuard = Boolean(options.skipLoadingGuard);
        if (isSavingRef.current || !project?.id || (!skipLoadingGuard && isLoading)) {
            if (project?.id && (isSavingRef.current || isLoading)) {
                pendingSaveRef.current = true;
                pendingSaveSkipLoadingGuardRef.current =
                    pendingSaveSkipLoadingGuardRef.current || skipLoadingGuard;
            }
            console.log('⏸️ Save skipped:', { 
                isSaving: isSavingRef.current, 
                hasProjectId: !!project?.id, 
                isLoading,
                skipLoadingGuard
            });
            return;
        }

        // Use ref (updated immediately by handlers) or fallback to state
        // Ref is updated synchronously before state updates, so it has the latest data
        const payload = sectionsRef.current && Object.keys(sectionsRef.current).length > 0 
            ? sectionsRef.current 
            : sectionsByYear;
        const serialized = JSON.stringify(payload);

        // Never POST empty document collection to the server: API used to delete-all then no-op,
        // which wiped every row (e.g. race after tab switch or failed load + autosave).
        if (!isJsonOnlyTracker) {
            const hasRows =
                yearMapHasSections(payload) || (Array.isArray(payload) && payload.length > 0);
            if (!hasRows) {
                console.warn(
                    '⏸️ Save skipped: empty document sections — not sent (avoids accidental wipe)'
                );
                return;
            }
        }
        
        // Skip if data hasn't changed
        if (lastSavedDataRef.current === serialized) {
            console.log('⏸️ Save skipped: data unchanged');
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }

        console.log('💾 Saving to database...', { 
            hasData: Object.keys(payload).length > 0,
            yearKeys: Object.keys(payload),
            payloadSize: serialized.length
        });

        isSavingRef.current = true;
        
        try {
            let result;
            if (isJsonOnlyTracker) {
                // Monthly Data Review / Compliance Review: save to JSON field only (no DocumentSection table)
                const payloadKey = isComplianceReview ? 'complianceReviewSections' : 'monthlyDataReviewSections';
                if (window.DatabaseAPI?.updateProject) {
                    result = await window.DatabaseAPI.updateProject(project.id, { [payloadKey]: serialized });
                    console.log('✅ Saved', payloadKey, 'via DatabaseAPI:', result);
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

            // Keep parent project state in sync for JSON-only trackers (Monthly Data Review / Compliance Review)
            if (isJsonOnlyTracker && typeof window !== 'undefined') {
                if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                    const payloadKey = isComplianceReview ? 'complianceReviewSections' : 'monthlyDataReviewSections';
                    window.updateViewingProject({ ...project, [payloadKey]: serialized });
                }
                if (window.DatabaseAPI && window.DatabaseAPI._responseCache) {
                    const keysToDelete = [];
                    window.DatabaseAPI._responseCache.forEach((_, key) => {
                        if (key.includes(`/projects/${project.id}`) || key.includes(`projects/${project.id}`)) {
                            keysToDelete.push(key);
                        }
                    });
                    keysToDelete.forEach(k => window.DatabaseAPI._responseCache.delete(k));
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
            if (typeof window !== 'undefined' && window.showNotification) {
                window.showNotification('Failed to save changes. Please try again.', 'error');
            }
            // Reset saved data ref so it will retry on next change
            lastSavedDataRef.current = null;
        } finally {
            isSavingRef.current = false;
            if (pendingSaveRef.current && project?.id && (!isLoading || pendingSaveSkipLoadingGuardRef.current)) {
                const queuedSkipLoadingGuard = pendingSaveSkipLoadingGuardRef.current;
                pendingSaveRef.current = false;
                pendingSaveSkipLoadingGuardRef.current = false;
                void saveToDatabase({ skipLoadingGuard: queuedSkipLoadingGuard });
            }
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
            
            // Monthly Data Review & Compliance historically saved templates as document-collection.
            // List merges the dedicated type with legacy document-collection so existing templates stay visible.
            const templateListQuery = isMonthlyDataReview
                ? `types=${encodeURIComponent('monthly-data-review,document-collection')}`
                : isComplianceReview
                    ? `types=${encodeURIComponent('compliance-review,document-collection')}`
                    : `type=${encodeURIComponent('document-collection')}`;
            const response = await fetch(`/api/document-collection-templates?${templateListQuery}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
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
    
    const buildTemplateSectionsFromCurrent = () => {
        return (sections || []).map(section => {
            const ordered = getOrderedDocumentRows(section);
            return {
                name: section.name,
                description: section.description || '',
                documents: ordered.map(({ doc }) => ({
                    name: doc.name,
                    description: doc.description || '',
                    templateDocId: String(doc.id),
                    parentTemplateDocId:
                        doc.parentId != null && doc.parentId !== ''
                            ? String(doc.parentId)
                            : null
                }))
            };
        });
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
                        type: editingTemplate?.type || templateApiType,
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
                        type: templateApiType,
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

        const base = Date.now();
        let idCounter = 0;
        const nextId = () => base + idCounter++;

        // Create new sections from template; remap templateDocId → new id so parentId links survive apply
        const newSections = template.sections.map(section => {
            const docs = Array.isArray(section.documents) ? section.documents : [];
            const idMap = new Map();

            docs.forEach((doc, idx) => {
                const tid =
                    doc.templateDocId != null && String(doc.templateDocId).trim() !== ''
                        ? String(doc.templateDocId)
                        : `__legacy_${idx}`;
                if (!idMap.has(tid)) idMap.set(tid, nextId());
            });

            const newDocuments = docs.map((doc, idx) => {
                const tid =
                    doc.templateDocId != null && String(doc.templateDocId).trim() !== ''
                        ? String(doc.templateDocId)
                        : `__legacy_${idx}`;
                const newId = idMap.get(tid);
                const rawParent = doc.parentTemplateDocId;
                const hasParent =
                    rawParent != null &&
                    String(rawParent).trim() !== '' &&
                    idMap.has(String(rawParent));

                const out = {
                    id: newId,
                    name: doc.name,
                    description: doc.description || '',
                    collectionStatus: {},
                    comments: {},
                    notesByMonth: {},
                    emailRequestByMonth: {}
                };
                if (hasParent) out.parentId = idMap.get(String(rawParent));
                return out;
            });

            return {
                id: nextId(),
                name: section.name,
                description: section.description || '',
                documents: newDocuments
            };
        });

        // Merge with existing sections
        setSections(prev => [...prev, ...newSections]);
        
        setShowApplyTemplateModal(false);
        
        // Save will happen automatically via useEffect
    };
    
    const handleImportFromExcelClick = () => {
        if (complianceImportFileInputRef.current) complianceImportFileInputRef.current.click();
    };
    
    const handleComplianceImportFileChange = async (e) => {
        const file = e.target?.files?.[0];
        if (!file || !project?.id || !isComplianceReview) return;
        e.target.value = '';
        const ext = (file.name || '').toLowerCase();
        if (!ext.endsWith('.xlsx')) {
            alert('Please upload an Excel file (.xlsx).');
            return;
        }
        setIsImportingExcel(true);
        try {
            const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
            const formData = new FormData();
            formData.append('file', file);
            const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
            const res = await fetch(`${base}/api/projects/${project.id}/compliance-review-import`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || err?.message || `Import failed (${res.status})`);
            }
            const json = await res.json();
            const rawSections = (json?.data?.sections ?? json?.sections) || [];
            if (!Array.isArray(rawSections) || rawSections.length === 0) {
                alert('No sections found in the file. Ensure the Excel has rows like "File 1: ..." in column A and descriptions in column B.');
                return;
            }
            const newSections = rawSections.map(section => ({
                id: Date.now() + Math.random(),
                name: section.name,
                description: section.description || '',
                documents: Array.isArray(section.documents) ? section.documents.map(doc => ({
                    id: Date.now() + Math.random(),
                    name: doc.name,
                    description: doc.description || '',
                    collectionStatus: doc.collectionStatus || {},
                    comments: doc.comments || {},
                    notesByMonth: doc.notesByMonth || {},
                    emailRequestByMonth: doc.emailRequestByMonth || {}
                })) : []
            }));
            setSections(prev => [...prev, ...newSections]);
        } catch (err) {
            console.error('Compliance import error:', err);
            alert('Import failed: ' + (err.message || 'Unknown error'));
        } finally {
            setIsImportingExcel(false);
        }
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
        if (!isValidYear(year)) {
            console.warn('Invalid year provided:', year);
            return;
        }
        
        userSelectedYearRef.current = true;
        setSelectedYear(year);
        if (project?.id && typeof window !== 'undefined') {
            localStorage.setItem(`${YEAR_STORAGE_PREFIX}${project.id}`, String(year));
        }
    }, [project?.id, isValidYear]);

    const remapYearKey = (key, fromYear, toYear) => {
        if (!key) return null;
        const match = String(key).match(/^(\d{4})-(\d{2})$/);
        if (!match) return null;
        const keyYear = parseInt(match[1], 10);
        if (Number.isNaN(keyYear) || keyYear !== fromYear) return null;
        return `${toYear}-${match[2]}`;
    };

    const remapYearKeys = (dataMap, fromYear, toYear) => {
        if (!dataMap || typeof dataMap !== 'object') return {};
        const entries = Object.entries(dataMap);
        if (entries.length === 0) return {};
        const next = {};
        entries.forEach(([key, value]) => {
            const nextKey = remapYearKey(key, fromYear, toYear);
            if (nextKey) next[nextKey] = value;
        });
        return next;
    };

    const copyYearData = useCallback((sourceYear, targetYear) => {
        if (!isValidYear(sourceYear) || !isValidYear(targetYear)) {
            console.warn('Invalid source/target year:', sourceYear, targetYear);
            return;
        }
        if (sourceYear === targetYear) return;

        const latestSectionsByYear = sectionsRef.current && Object.keys(sectionsRef.current).length > 0
            ? sectionsRef.current
            : sectionsByYear;
        const sourceSections = latestSectionsByYear?.[String(sourceYear)];
        if (!Array.isArray(sourceSections) || sourceSections.length === 0) {
            console.warn('No sections to copy for year:', sourceYear);
            return;
        }

        const clonedSections = cloneSectionsArray(sourceSections).map(section => ({
            ...section,
            documents: (section.documents || []).map(doc => ({
                ...doc,
                collectionStatus: remapYearKeys(doc.collectionStatus, sourceYear, targetYear),
                comments: remapYearKeys(doc.comments, sourceYear, targetYear),
                notesByMonth: remapYearKeys(doc.notesByMonth, sourceYear, targetYear),
                emailRequestByMonth: remapYearKeys(doc.emailRequestByMonth, sourceYear, targetYear)
            }))
        }));

        const updated = {
            ...latestSectionsByYear,
            [String(targetYear)]: clonedSections
        };

        sectionsRef.current = updated;
        setSectionsByYear(updated);
        lastSavedDataRef.current = null;
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        saveToDatabase();

        userSelectedYearRef.current = true;
        setSelectedYear(targetYear);
        if (project?.id && typeof window !== 'undefined') {
            localStorage.setItem(`${YEAR_STORAGE_PREFIX}${project.id}`, String(targetYear));
        }
    }, [isValidYear, project?.id, sectionsByYear, setSelectedYear, setSectionsByYear]);
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

    // Get notes (free text) for a specific month in the selected year only
    const getNotesForYear = (notesByMonth, month, year = selectedYear) => {
        if (!notesByMonth || typeof notesByMonth !== 'object') return '';
        const monthKey = getMonthKey(month, year);
        const v = notesByMonth[monthKey];
        return typeof v === 'string' ? v : (v != null ? String(v) : '');
    };

    // Set notes for a specific month in the selected year only
    const setNotesForYear = (notesByMonth, month, text, year = selectedYear) => {
        const monthKey = getMonthKey(month, year);
        const next = { ...(notesByMonth && typeof notesByMonth === 'object' ? notesByMonth : {}) };
        if (text == null || String(text).trim() === '') {
            delete next[monthKey];
        } else {
            next[monthKey] = String(text).trim();
        }
        return next;
    };

    // Email request per document/month: saved recipients, subject, body, recipientName, schedule (for "Request documents via email")
    const getEmailRequestForYear = (doc, month, year = selectedYear) => {
        if (!doc) return {};
        const monthKey = getMonthKey(month, year);
        return doc.emailRequestByMonth?.[monthKey] || {};
    };

    // Save email request template for the given document + month only (selected year).
    // Other months keep their own stored recipients/subject/body (avoids wiping contacts when editing one cell).
    // Merges onto existing cell data so lastSentAt and any future fields are preserved unless overwritten.
    // Returns Promise so caller can await persistence.
    const saveEmailRequestForCell = (sectionId, documentId, month, data) => {
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 ? sectionsByYear : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        const monthKey = month != null ? getMonthKey(month, selectedYear) : null;
        if (!monthKey) {
            console.warn('saveEmailRequestForCell: invalid month, skipping save', { month });
            return Promise.resolve();
        }
        const byMonthTemplate = {
            recipients: data.recipients,
            cc: data.cc,
            subject: data.subject,
            body: data.body,
            recipientName: data.recipientName,
            sendPlainTextOnly: !!data.sendPlainTextOnly,
            schedule: data.schedule
        };
        const updated = currentYearSections.map(section => {
            if (String(section.id) !== String(sectionId)) return section;
            return {
                ...section,
                documents: (section.documents || []).map(doc => {
                    if (String(doc.id) !== String(documentId)) return doc;
                    const existingByMonth = doc.emailRequestByMonth || {};
                    const existing = existingByMonth[monthKey] || {};
                    const byMonth = {
                        ...existingByMonth,
                        [monthKey]: { ...existing, ...byMonthTemplate }
                    };
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
        return saveToDatabase({ skipParentUpdate: true }).then(() => {
            setTimeout(() => {
                bumpCellActivityIfPopupMatchesCell(sectionId, documentId, month);
            }, 450);
        });
    };

    // Copy the same email template to every month in the selected year for this document.
    // Replaces the source month/year in subject & body with each target month so periods stay correct.
    // Preserves existing lastSentAt per month (scheduled-send bookkeeping).
    const saveEmailRequestTemplateForYear = (sectionId, documentId, data, sourceMonthName) => {
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 ? sectionsByYear : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        const yearLabel = String(selectedYear);
        const fromPeriod =
            sourceMonthName && months.includes(sourceMonthName)
                ? `${sourceMonthName} ${yearLabel}`.trim()
                : null;
        const replacePeriod = (text, toMonthName) => {
            if (text == null || typeof text !== 'string') return text;
            const toPeriod = `${toMonthName} ${yearLabel}`.trim();
            if (!fromPeriod || fromPeriod === toPeriod) return text;
            return text.split(fromPeriod).join(toPeriod);
        };
        const byMonthTemplateBase = {
            recipients: data.recipients,
            cc: data.cc,
            subject: data.subject,
            body: data.body,
            recipientName: data.recipientName,
            sendPlainTextOnly: !!data.sendPlainTextOnly,
            schedule: data.schedule
        };
        const updated = currentYearSections.map((section) => {
            if (String(section.id) !== String(sectionId)) return section;
            return {
                ...section,
                documents: (section.documents || []).map((doc) => {
                    if (String(doc.id) !== String(documentId)) return doc;
                    const existingByMonth = doc.emailRequestByMonth || {};
                    const byMonth = { ...existingByMonth };
                    months.forEach((m) => {
                        const monthKey = getMonthKey(m, selectedYear);
                        if (!monthKey) return;
                        const existing = existingByMonth[monthKey] || {};
                        const subjectForMonth = replacePeriod(byMonthTemplateBase.subject, m);
                        const bodyForMonth = replacePeriod(byMonthTemplateBase.body, m);
                        byMonth[monthKey] = {
                            ...existing,
                            ...byMonthTemplateBase,
                            subject: subjectForMonth,
                            body: bodyForMonth
                        };
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
        return saveToDatabase({ skipParentUpdate: true }).then(() => {
            setTimeout(() => {
                bumpCellActivityIfPopupMatchesDoc(sectionId, documentId);
            }, 450);
        });
    };

    // ============================================================
    // STATUS OPTIONS
    // ============================================================
    
    // Document Collection Checklist: Requested, Not Collected, Ongoing, Collected, Unavailable, Available on Request, Not Required (pastel)
    // optionStyle: inline colors for <option> elements in dropdowns (browser support varies)
    const documentCollectionStatusOptions = [
        { value: 'requested', label: 'Requested', color: 'bg-sky-200 text-sky-800 font-semibold dark:bg-sky-900/70 dark:text-sky-200', cellColor: 'bg-sky-200 border-l-4 border-sky-400 shadow-sm dark:bg-sky-900/70 dark:border-sky-500', optionStyle: { backgroundColor: '#bae6fd', color: '#075985' } },
        { value: 'not-collected', label: 'Not Collected', color: 'bg-red-200 text-red-800 font-semibold dark:bg-red-900/60 dark:text-red-200', cellColor: 'bg-red-200 border-l-4 border-red-400 shadow-sm dark:bg-red-900/60 dark:border-red-500', optionStyle: { backgroundColor: '#fecaca', color: '#9f1239' } },
        { value: 'ongoing', label: 'Collection Ongoing', color: 'bg-amber-200 text-amber-800 font-semibold dark:bg-amber-900/60 dark:text-amber-200', cellColor: 'bg-amber-200 border-l-4 border-amber-400 shadow-sm dark:bg-amber-900/60 dark:border-amber-500', optionStyle: { backgroundColor: '#fde68a', color: '#92400e' } },
        { value: 'collected', label: 'Collected', color: 'bg-emerald-200 text-emerald-800 font-semibold dark:bg-emerald-900/60 dark:text-emerald-200', cellColor: 'bg-emerald-200 border-l-4 border-emerald-400 shadow-sm dark:bg-emerald-900/60 dark:border-emerald-500', optionStyle: { backgroundColor: '#a7f3d0', color: '#065f46' } },
        { value: 'unavailable', label: 'Unavailable', color: 'bg-slate-200 text-slate-700 font-semibold dark:bg-slate-700 dark:text-slate-200', cellColor: 'bg-slate-200 border-l-4 border-slate-400 shadow-sm dark:bg-slate-700 dark:border-slate-500', optionStyle: { backgroundColor: '#e2e8f0', color: '#334155' } },
        { value: 'available-on-request', label: 'Available on Request', color: 'bg-blue-200 text-blue-800 font-semibold dark:bg-blue-900/60 dark:text-blue-200', cellColor: 'bg-blue-200 border-l-4 border-blue-400 shadow-sm dark:bg-blue-900/60 dark:border-blue-500', optionStyle: { backgroundColor: '#dbeafe', color: '#1e40af' } },
        { value: 'not-required', label: 'Not Required', color: 'bg-gray-200 text-gray-800 font-semibold dark:bg-gray-700 dark:text-gray-200', cellColor: 'bg-gray-200 border-l-4 border-gray-400 shadow-sm dark:bg-gray-700 dark:border-gray-500', optionStyle: { backgroundColor: '#e5e7eb', color: '#1f2937' } }
    ];
    // Monthly Data Review only — stored value `done` kept for "Complete" (backward compatible)
    const monthlyDataReviewStatusOptions = [
        { value: 'not-done', label: 'Not Started', color: 'bg-gray-200 text-gray-800 font-semibold dark:bg-gray-600 dark:text-gray-100', cellColor: 'bg-gray-200 border-l-4 border-gray-400 shadow-sm dark:bg-gray-600 dark:border-gray-500', optionStyle: { backgroundColor: '#e5e7eb', color: '#1f2937' } },
        { value: 'started-minor-info', label: 'Started – Minor Notes / Info', color: 'bg-yellow-200 text-yellow-900 font-semibold dark:bg-yellow-900/50 dark:text-yellow-100', cellColor: 'bg-yellow-200 border-l-4 border-yellow-400 shadow-sm dark:bg-yellow-900/50 dark:border-yellow-500', optionStyle: { backgroundColor: '#fef08a', color: '#713f12' } },
        { value: 'started-incomplete-some', label: 'Started – Incomplete (Some Gaps)', color: 'bg-orange-200 text-orange-900 font-semibold dark:bg-orange-900/50 dark:text-orange-100', cellColor: 'bg-orange-200 border-l-4 border-orange-400 shadow-sm dark:bg-orange-900/50 dark:border-orange-500', optionStyle: { backgroundColor: '#fed7aa', color: '#9a3412' } },
        { value: 'started-incomplete-major', label: 'Started – Incomplete (Major Gaps)', color: 'bg-red-200 text-red-800 font-semibold dark:bg-red-900/60 dark:text-red-200', cellColor: 'bg-red-200 border-l-4 border-red-400 shadow-sm dark:bg-red-900/60 dark:border-red-500', optionStyle: { backgroundColor: '#fecaca', color: '#991b1b' } },
        { value: 'complete-issues-outstanding', label: 'Complete – Issues Outstanding', color: 'bg-red-200 text-red-800 font-semibold dark:bg-red-900/60 dark:text-red-200', cellColor: 'bg-red-200 border-l-4 border-red-500 shadow-sm dark:bg-red-900/60 dark:border-red-400', optionStyle: { backgroundColor: '#fecaca', color: '#991b1b' } },
        { value: 'done', label: 'Complete', color: 'bg-emerald-200 text-emerald-800 font-semibold dark:bg-emerald-900/60 dark:text-emerald-200', cellColor: 'bg-emerald-200 border-l-4 border-emerald-400 shadow-sm dark:bg-emerald-900/60 dark:border-emerald-500', optionStyle: { backgroundColor: '#a7f3d0', color: '#065f46' } }
    ];
    const resolveMonthlyDataReviewStatusKey = (status) => {
        if (!status) return status;
        const s = String(status).toLowerCase();
        if (s === 'in-progress') return 'started-minor-info';
        return status;
    };
    // Compliance Review statuses only
    const complianceReviewStatusOptions = [
        { value: 'no-reviewed', label: 'Not Reviewed', color: 'bg-gray-200 text-gray-800 font-semibold dark:bg-gray-700 dark:text-gray-200', cellColor: 'bg-gray-200 border-l-4 border-gray-400 shadow-sm dark:bg-gray-700 dark:border-gray-500', optionStyle: { backgroundColor: '#e5e7eb', color: '#1f2937' } },
        { value: 'reviewed-in-order', label: 'Reviewed - In order', color: 'bg-emerald-200 text-emerald-800 font-semibold dark:bg-emerald-900/60 dark:text-emerald-200', cellColor: 'bg-emerald-200 border-l-4 border-emerald-300 shadow-sm dark:bg-emerald-900/60 dark:border-emerald-500', optionStyle: { backgroundColor: '#a7f3d0', color: '#065f46' } },
        { value: 'reviewed-issue', label: 'Reviewed - Issue', color: 'bg-red-200 text-red-800 font-semibold dark:bg-red-900/60 dark:text-red-200', cellColor: 'bg-red-200 border-l-4 border-red-400 shadow-sm dark:bg-red-900/60 dark:border-red-500', optionStyle: { backgroundColor: '#fecaca', color: '#9f1239' } },
        { value: 'in-progress', label: 'In Progress', color: 'bg-amber-200 text-amber-800 font-semibold dark:bg-amber-900/60 dark:text-amber-200', cellColor: 'bg-amber-200 border-l-4 border-amber-300 shadow-sm dark:bg-amber-900/60 dark:border-amber-500', optionStyle: { backgroundColor: '#fde68a', color: '#92400e' } }
    ];
    const statusOptions = isComplianceReview
        ? complianceReviewStatusOptions
        : (isJsonOnlyTracker ? monthlyDataReviewStatusOptions : documentCollectionStatusOptions);

    // Keep old compliance values visible after rollout by mapping to new values.
    const normalizeComplianceStatusValue = (status) => {
        if (!isComplianceReview || !status) return status;
        const normalized = String(status).toLowerCase();
        if (normalized === 'not-done') return 'no-reviewed';
        if (normalized === 'done') return 'reviewed-in-order';
        return status;
    };

    const getStatusConfig = (status) => {
        if (!status || status === '' || status === 'Select Status') {
            return null; // Return null for empty/select status to show white background
        }
        const lookupKey = isMonthlyDataReview ? resolveMonthlyDataReviewStatusKey(status) : status;
        return statusOptions.find(opt => opt.value === lookupKey) || null;
    };
    
    // ============================================================
    // SECTION CRUD
    // ============================================================
    
    const handleAddSection = (event) => {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();
        setEditingSection(null);
        setShowSectionModal(true);
        // Fallback: if modal fails to render, allow quick-add via prompt
        if (typeof window !== 'undefined') {
            setTimeout(() => {
                const modalExists = !!document.querySelector('[data-section-modal="true"]');
                if (modalExists) return;
                const name = window.prompt('Section name');
                if (!name || !name.trim()) return;
                handleSaveSection({ name: name.trim(), description: '' });
            }, 200);
        }
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
        // Save immediately to avoid losing new sections on refresh/navigation
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        saveToDatabase({ skipParentUpdate: true });
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

        // Compute next year map synchronously (do not rely on setState/ref timing for the save payload)
        const stateForSave = sectionsRef.current || {};
        const yearSections = stateForSave[selectedYear] || [];
        const filteredYearSections = yearSections.filter(s => String(s.id) !== normalizedSectionId);
        const updatedSectionsByYear = {
            ...stateForSave,
            [selectedYear]: filteredYearSections
        };
        const serializedDeletedState = JSON.stringify(updatedSectionsByYear);

        sectionsRef.current = updatedSectionsByYear;
        lastSavedDataRef.current = serializedDeletedState;

        const snapshotKeyImmediate = getSnapshotKey(project.id);
        if (snapshotKeyImmediate && window.localStorage) {
            try {
                window.localStorage.setItem(snapshotKeyImmediate, serializedDeletedState);
                console.log('💾 Deletion snapshot saved to localStorage (sync)');
            } catch (storageError) {
                console.warn('⚠️ Failed to save snapshot to localStorage:', storageError);
            }
        }

        requestAnimationFrame(() => {
            setSectionsByYear(updatedSectionsByYear);

            isSavingRef.current = true;

            (async () => {
            try {
                if (isJsonOnlyTracker) {
                    const payloadKey = isComplianceReview ? 'complianceReviewSections' : 'monthlyDataReviewSections';
                    if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                        await window.DatabaseAPI.updateProject(project.id, {
                            [payloadKey]: serializedDeletedState
                        });
                    } else {
                        throw new Error('DatabaseAPI.updateProject not available');
                    }
                } else if (apiRef.current && typeof apiRef.current.saveDocumentSections === 'function') {
                    await apiRef.current.saveDocumentSections(project.id, updatedSectionsByYear, false);
                } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                    await window.DatabaseAPI.updateProject(project.id, {
                        documentSections: serializedDeletedState
                    });
                } else {
                    throw new Error('No available API for saving document sections');
                }

                lastSavedDataRef.current = serializedDeletedState;
                
                console.log('✅ Section deletion saved successfully');
                
                // Update localStorage snapshot to match deleted state
                const snapshotKey = getSnapshotKey(project.id);
                if (snapshotKey && window.localStorage) {
                    try {
                        window.localStorage.setItem(snapshotKey, serializedDeletedState);
                        console.log('💾 Deletion snapshot updated in localStorage after successful save');
                    } catch (storageError) {
                        console.warn('⚠️ Failed to update document collection snapshot in localStorage:', storageError);
                    }
                }

                if (isJsonOnlyTracker && typeof window !== 'undefined') {
                    if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                        const payloadKey = isComplianceReview ? 'complianceReviewSections' : 'monthlyDataReviewSections';
                        window.updateViewingProject({ ...project, [payloadKey]: serializedDeletedState });
                    }
                    if (window.DatabaseAPI && window.DatabaseAPI._responseCache) {
                        const keysToDelete = [];
                        window.DatabaseAPI._responseCache.forEach((_, key) => {
                            if (key.includes(`/projects/${project.id}`) || key.includes(`projects/${project.id}`)) {
                                keysToDelete.push(key);
                            }
                        });
                        keysToDelete.forEach(k => window.DatabaseAPI._responseCache.delete(k));
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
    
    // Ordered rows for display: each root then its children (for sub-document hierarchy)
    const getOrderedDocumentRows = (section) => {
        const docs = section.documents || [];
        const roots = docs.filter(d => !d.parentId);
        const result = [];
        roots.forEach(root => {
            result.push({ doc: root, isSubRow: false });
            docs.filter(d => d.parentId === root.id).forEach(child => {
                result.push({ doc: child, isSubRow: true });
            });
        });
        return result;
    };

    const hasChildDocuments = (section, doc) => {
        if (!section || !section.documents || !doc) return false;
        return section.documents.some(d => d.parentId === doc.id);
    };

    // For drag-and-drop: root rows move as a block with their children; sub-rows move alone.
    const getDragBlockRange = (section, docIndex) => {
        const ordered = getOrderedDocumentRows(section);
        if (docIndex < 0 || docIndex >= ordered.length) return { start: docIndex, end: docIndex };
        const row = ordered[docIndex];
        if (row.isSubRow) return { start: docIndex, end: docIndex };
        let end = docIndex;
        for (let i = docIndex + 1; i < ordered.length && ordered[i].isSubRow; i++) end = i;
        return { start: docIndex, end };
    };
    
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
    
    const handleAddSubDocument = (sectionId, parentDoc) => {
        const section = sections.find(s => String(s.id) === String(sectionId));
        if (!section) return;
        const ordered = getOrderedDocumentRows(section);
        const parentRowIndex = ordered.findIndex(r => r.doc.id === parentDoc.id);
        if (parentRowIndex === -1) return;
        const newDoc = {
            id: Date.now(),
            name: 'New sub-document',
            description: '',
            collectionStatus: {},
            comments: {},
            notesByMonth: {},
            assignedTo: [],
            parentId: parentDoc.id
        };
        const newOrdered = [...ordered];
        newOrdered.splice(parentRowIndex + 1, 0, { doc: newDoc, isSubRow: true });
        const newDocuments = newOrdered.map(r => r.doc);
        setSections(prev => prev.map(sec => String(sec.id) === String(sectionId) ? { ...sec, documents: newDocuments } : sec));
        setEditingSectionId(sectionId);
        setEditingDocument(newDoc);
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
                    // Update existing document (preserve parentId for sub-documents)
                    return {
                        ...section,
                        documents: section.documents.map(doc => 
                            doc.id === editingDocument.id 
                                ? { ...doc, ...documentData, parentId: doc.parentId }
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
                        notesByMonth: documentData.notesByMonth || {},
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

const ASSIGNEE_COLOR_PALETTE = [
    { bg: '#E0F2FE', text: '#075985', ring: '#7DD3FC' },
    { bg: '#DCFCE7', text: '#166534', ring: '#86EFAC' },
    { bg: '#FEE2E2', text: '#991B1B', ring: '#FCA5A5' },
    { bg: '#FEF3C7', text: '#92400E', ring: '#FCD34D' },
    { bg: '#EDE9FE', text: '#5B21B6', ring: '#C4B5FD' },
    { bg: '#FCE7F3', text: '#9D174D', ring: '#F9A8D4' },
    { bg: '#E2E8F0', text: '#0F172A', ring: '#CBD5F5' },
    { bg: '#CCFBF1', text: '#115E59', ring: '#5EEAD4' }
];

const hashString = (input) => {
    const str = String(input || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash;
};

const getAssigneeColorKey = (identifier, users) => {
    if (identifier == null || identifier === '') return 'unknown';
    const str = String(identifier).trim();
    const user = (users || []).find(u => {
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
    return user ? (user.id || user._id || user.email || user.name || user.fullName || str) : str;
};

const getAssigneeColor = (identifier, users) => {
    const key = getAssigneeColorKey(identifier, users);
    const idx = hashString(key) % ASSIGNEE_COLOR_PALETTE.length;
    return ASSIGNEE_COLOR_PALETTE[idx];
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
        // Force save after ref/state flush so assignment persists
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

        // Force persistence for document deletion (don't rely only on debounced autosave).
        // Some older rows can be rehydrated by background refresh if deletion isn't saved immediately.
        lastSavedDataRef.current = null;
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        setTimeout(() => {
            Promise.resolve(saveToDatabase({ skipParentUpdate: true }))
                .catch((err) => {
                    console.error('❌ Failed to persist document deletion:', err);
                })
                .finally(() => {
                    isDeletingRef.current = false;
                });
        }, 50);
        
        // Fallback in case save path is blocked by an unexpected early return.
        setTimeout(() => {
            isDeletingRef.current = false;
        }, 3000);
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

        if (!isJsonOnlyTracker && hoverCommentCellRef.current) {
            const k = parseCellKey(hoverCommentCellRef.current);
            const hit = cellsToUpdate.some(
                (c) =>
                    String(c.sectionId) === String(k.sectionId) &&
                    String(c.documentId) === String(k.documentId) &&
                    c.month === k.month
            );
            if (hit) {
                setTimeout(() => {
                    bumpCellActivityIfPopupMatchesCell(k.sectionId, k.documentId, k.month);
                }, 450);
            }
        }
        
        // Clear selection after applying status to multiple cells
        // Use setTimeout to ensure React has updated the UI first
        if (applyToSelected && currentSelectedCells.size > 0) {
            setTimeout(() => {
                setSelectedCells(new Set());
                selectedCellsRef.current = new Set();
            }, 100);
        }
    }, [selectedYear, isJsonOnlyTracker, sectionsByYear, bumpCellActivityIfPopupMatchesCell]);

    const handleUpdateNotes = useCallback((sectionId, documentId, month, text) => {
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0
            ? sectionsByYear
            : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        const updated = currentYearSections.map(section => {
            if (String(section.id) !== String(sectionId)) return section;
            return {
                ...section,
                documents: section.documents.map(doc => {
                    if (String(doc.id) !== String(documentId)) return doc;
                    const nextNotes = setNotesForYear(doc.notesByMonth, month, text, selectedYear);
                    return { ...doc, notesByMonth: nextNotes };
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
        setTimeout(() => {
            bumpCellActivityIfPopupMatchesCell(sectionId, documentId, month);
        }, 450);
    }, [selectedYear, sectionsByYear, bumpCellActivityIfPopupMatchesCell]);

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
                    
                    const linkedSection = currentYearSections.find((s) => String(s.id) === String(linkSectionId));
                    const linkedDoc = (linkedSection?.documents || []).find((d) => String(d.id) === String(linkDocumentId));
                    const contextTitle = `${trackerContextTitlePrefix} - ${project?.name || 'Project'}`;
                    // Deep-link using link* IDs (from cellKey when provided) so email link matches the open cell
                    const contextLink = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(linkSectionId)}&docDocumentId=${encodeURIComponent(linkDocumentId)}&docMonth=${encodeURIComponent(linkMonth)}&docYear=${encodeURIComponent(selectedYear)}&tab=${encodeURIComponent(trackerTabForDeepLink)}&commentId=${encodeURIComponent(newCommentId)}&focusInput=comment`;
                    const projectInfo = {
                        projectId: project?.id,
                        projectName: project?.name,
                        source: trackerNotifySource,
                        sectionId: linkSectionId,
                        sectionName: linkedSection?.name || priorSection?.name || '',
                        documentId: linkDocumentId,
                        documentName: linkedDoc?.name || priorDoc?.name || '',
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
                const linkedSection = currentYearSections.find((s) => String(s.id) === String(linkSectionId));
                const linkedDoc = (linkedSection?.documents || []).find((d) => String(d.id) === String(linkDocumentId));
                const contextTitle = `${trackerContextTitlePrefix} - ${project?.name || 'Project'}`;
                const contextLink = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(linkSectionId)}&docDocumentId=${encodeURIComponent(linkDocumentId)}&docMonth=${encodeURIComponent(linkMonth)}&docYear=${encodeURIComponent(selectedYear)}&tab=${encodeURIComponent(trackerTabForDeepLink)}&commentId=${encodeURIComponent(newCommentId)}&focusInput=comment`;
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
                            source: trackerNotifySource,
                            sectionId: linkSectionId,
                            sectionName: linkedSection?.name || priorSection?.name || '',
                            documentId: linkDocumentId,
                            documentName: linkedDoc?.name || priorDoc?.name || '',
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
        try {
            const cell = hoverCommentCellRef.current;
            if (cell && !isJsonOnlyTracker) {
                const k = parseCellKey(cell);
                if (String(k.documentId) === String(documentId) && k.month === month) {
                    setCellActivityBump((b) => b + 1);
                }
            }
        } catch (_) {}
    };
    
    const handleDeleteComment = async (sectionId, documentId, month, commentId) => {
        
        const currentUser = getCurrentUser();
        
        // Use current state (most up-to-date) or fallback to ref
        const latestSectionsByYear = sectionsByYear && Object.keys(sectionsByYear).length > 0 
            ? sectionsByYear 
            : (sectionsRef.current || {});
        const currentYearSections = latestSectionsByYear[selectedYear] || [];
        
        const section = currentYearSections.find(s => String(s.id) === String(sectionId));
        const doc = section?.documents.find(d => String(d.id) === String(documentId));
        const existingComments = getCommentsForYear(doc?.comments, month, selectedYear);
        const commentToDelete = Array.isArray(existingComments)
            ? existingComments.find((c) => String(c.id) === String(commentId))
            : null;
        
        if (!confirm('Delete this comment?')) return;

        if (commentToDelete && isEmailActivityComment(commentToDelete)) {
            if (!project?.id) {
                alert('Project not found');
                return;
            }
            const author = (commentToDelete.author || '').trim();
            const type = author === 'Sent reply (platform)' || author === 'Sent request (platform)' ? 'sent' : 'received';
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
            const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
            try {
                const url = `${base}/api/projects/${project?.id}/document-collection-email-activity?id=${encodeURIComponent(commentToDelete.id)}&type=${encodeURIComponent(type)}`;
                const res = await fetch(url, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ id: commentToDelete.id, type })
                });
                const json = await res.json().catch(() => ({}));
                const data = json.data != null ? json.data : json;
                if (!(res.ok && data.deleted)) {
                    alert(data.error || json.error || 'Failed to delete');
                    return;
                }
                setEmailActivity((prev) => ({
                    sent: prev.sent.filter((s) => String(s.id) !== String(commentToDelete.id)),
                    received: prev.received.filter((r) => String(r.id) !== String(commentToDelete.id))
                }));
                try {
                    const cell = hoverCommentCellRef.current;
                    if (cell && !isJsonOnlyTracker) {
                        const k = parseCellKey(cell);
                        if (String(k.documentId) === String(documentId) && k.month === month) {
                            setCellActivityBump((b) => b + 1);
                        }
                    }
                } catch (_) {}
            } catch (err) {
                alert(err.message || 'Failed to delete');
                return;
            }
        }
        
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
        try {
            const cell = hoverCommentCellRef.current;
            if (cell && !isJsonOnlyTracker) {
                const k = parseCellKey(cell);
                if (String(k.documentId) === String(documentId) && k.month === month) {
                    setCellActivityBump((b) => b + 1);
                }
            }
        } catch (_) {}
    };
    
    const getDocumentStatus = (doc, month) => {
        const status = getStatusForYear(doc.collectionStatus, month, selectedYear);
        return normalizeComplianceStatusValue(status);
    };
    
    const isEmailActivityComment = (comment) => {
        if (!comment) return false;
        const author = (comment.author || '').trim();
        if (author === 'Email from Client' || author === 'Sent reply (platform)' || author === 'Sent request (platform)') return true;
        const text = (comment.text || '').trim();
        return text.startsWith('Email from Client');
    };
    /** Outbound platform audit rows — not shown on the comment notification badge (client replies & user notes still badge). */
    const isPlatformOutboundAuditComment = (comment) => {
        if (!comment) return false;
        const author = (comment.author || '').trim();
        return author === 'Sent request (platform)' || author === 'Sent reply (platform)';
    };
    const getDocumentComments = (doc, month) => {
        const comments = getCommentsForYear(doc.comments, month, selectedYear);
        return Array.isArray(comments) ? comments : [];
    };

    const getDocumentNotes = (doc, month) => {
        return getNotesForYear(doc.notesByMonth, month, selectedYear);
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
        if (!drag || String(drag.sectionId) !== String(sectionId)) {
            setDragOverDocumentSectionId(null);
            setDragOverDocumentIndex(null);
            return;
        }
        setSections(prev => prev.map(section => {
            if (String(section.id) !== String(sectionId)) return section;
            const ordered = getOrderedDocumentRows(section);
            const docs = ordered.map(r => r.doc);
            const { start: dragStart, end: dragEnd } = getDragBlockRange(section, drag.docIndex);
            if (dropDocIndex >= dragStart && dropDocIndex <= dragEnd) return section;
            const blockLength = dragEnd - dragStart + 1;
            const removed = docs.splice(dragStart, blockLength);
            let insertIndex = dropDocIndex;
            if (dropDocIndex > dragEnd) insertIndex = dropDocIndex - blockLength;
            docs.splice(insertIndex, 0, ...removed);
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
            const exportFileTag = isMonthlyDataReview ? 'Monthly_Data_Review' : isComplianceReview ? 'Compliance_Review' : 'Document_Collection';
            const sheetTitle = `${trackerContextTitlePrefix} ${selectedYear}`.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
            
            months.forEach(month => {
                const monthYear = `${month.slice(0, 3)} '${String(selectedYear).slice(-2)}`;
                headerRow1.push(monthYear, '', '');
                headerRow2.push('Status', 'Comments', 'Notes');
            });
            
            excelData.push(headerRow1, headerRow2);
            
            sections.forEach(section => {
                const sectionRow = [section.name];
                for (let i = 0; i < months.length * 3; i++) sectionRow.push('');
                excelData.push(sectionRow);
                
                getOrderedDocumentRows(section).forEach(({ doc, isSubRow }) => {
                    const indent = isSubRow ? '    ' : '  ';
                    const row = [`${indent}${doc.name}${doc.description ? ' - ' + doc.description : ''}`];
                    
                    months.forEach(month => {
                        const rawStatus = getStatusForYear(doc.collectionStatus, month, selectedYear);
                        const exportKey = isMonthlyDataReview && rawStatus
                            ? resolveMonthlyDataReviewStatusKey(rawStatus)
                            : rawStatus;
                        const statusLabel = exportKey ? statusOptions.find(s => s.value === exportKey)?.label : '';
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
                        
                        row.push(getNotesForYear(doc.notesByMonth, month, selectedYear) || '');
                    });
                    
                    excelData.push(row);
                });
            });
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            
            const colWidths = [{ wch: 40 }];
            for (let i = 0; i < months.length; i++) {
                colWidths.push({ wch: 18 }, { wch: 50 }, { wch: 40 });
            }
            ws['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
            
            const filename = `${project.name}_${exportFileTag}_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
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
    
    const updateCommentPopupPosition = useCallback(() => {
        if (!hoverCommentCell) return;
        const commentButton = window.document.querySelector(`[data-comment-cell="${hoverCommentCell}"]`);
        if (!commentButton) return;

        const buttonRect = commentButton.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const popupWidth = 320; // w-80 = 320px
        const popupHeight = 300; // approximate max height
        const spacing = 8;

        const spaceBelow = viewportHeight - buttonRect.bottom;
        const spaceAbove = buttonRect.top;
        const positionAbove = spaceBelow < popupHeight + spacing && spaceAbove > spaceBelow;

        let popupTop;
        if (positionAbove) {
            popupTop = buttonRect.top - popupHeight - spacing;
        } else {
            popupTop = buttonRect.bottom + spacing;
        }

        const buttonCenterX = buttonRect.left + buttonRect.width / 2;
        let preferredLeft = buttonCenterX - popupWidth / 2;
        if (preferredLeft < 10) {
            preferredLeft = 10;
        } else if (preferredLeft + popupWidth > viewportWidth - 10) {
            preferredLeft = viewportWidth - popupWidth - 10;
        }

        setCommentPopupPosition((prev) => {
            const topR = Math.round(popupTop);
            const leftR = Math.round(preferredLeft);
            if (Math.round(prev.top) === topR && Math.round(prev.left) === leftR) return prev;
            return { top: popupTop, left: preferredLeft };
        });
    }, [hoverCommentCell]);

    // Smart positioning for comment popup (no auto-scroll, no window scroll listener)
    useEffect(() => {
        if (!hoverCommentCell) return;
        let raf1 = 0;
        let raf2 = 0;
        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(updateCommentPopupPosition);
        });
        window.addEventListener('resize', updateCommentPopupPosition);
        return () => {
            cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
            window.removeEventListener('resize', updateCommentPopupPosition);
        };
    }, [hoverCommentCell, updateCommentPopupPosition]);

    // After activity loads, height changes — re-measure so the panel does not drift / clip.
    useLayoutEffect(() => {
        if (!hoverCommentCell) return;
        if (cellActivityLoading) return;
        updateCommentPopupPosition();
    }, [hoverCommentCell, cellActivityLoading, updateCommentPopupPosition]);

    // Scroll activity list so newest entries (bottom; API sorts ascending) are in view — unless deep-link targets one comment.
    useLayoutEffect(() => {
        if (!hoverCommentCell) {
            lastActivityScrollSigRef.current = null;
            return;
        }
        if (getCommentIdFromLocation()) return;
        if (!isJsonOnlyTracker && cellActivityLoading) return;

        let sig;
        if (isJsonOnlyTracker) {
            const { sectionId, documentId, month: monthLabel } = parseCellKey(hoverCommentCell);
            const sec = sections.find((s) => String(s.id) === String(sectionId));
            const d = sec?.documents?.find((dd) => String(dd.id) === String(documentId));
            const list = d ? getDocumentComments(d, monthLabel) : [];
            const tl = Array.isArray(cellActivityTimeline) ? cellActivityTimeline.length : 0;
            if (!list.length && tl === 0) return;
            sig = `json:${hoverCommentCell}:${list.length}:${tl}`;
        } else {
            const timelineLen = Array.isArray(cellActivityTimeline) ? cellActivityTimeline.length : 0;
            if (timelineLen === 0) return;
            sig = `tbl:${hoverCommentCell}:${timelineLen}`;
        }

        if (lastActivityScrollSigRef.current === sig) return;
        lastActivityScrollSigRef.current = sig;

        const run = () => {
            const el = commentPopupContainerRef.current;
            if (!el) return;
            el.scrollTop = el.scrollHeight;
        };
        requestAnimationFrame(() => {
            requestAnimationFrame(run);
        });
    }, [hoverCommentCell, cellActivityLoading, cellActivityTimeline, isJsonOnlyTracker, sections]);

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
                            const popupWidth = 320;
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
            const hasAnyYearData = Object.keys(sectionsByYear || {}).some(
                (y) =>
                    isSectionsYearMapDataKey(y) &&
                    Array.isArray(sectionsByYear[y]) &&
                    sectionsByYear[y].length > 0
            );
            const canSearchByCommentId = deepCommentId && hasAnyYearData;
            if (!hasSectionsForCurrentYear && !canSearchByCommentId) {
                if (deepSectionId && isValidDocumentId && deepMonth) {
                    const yearsToSearch = Object.keys(sectionsByYear || {}).filter(isSectionsYearMapDataKey);
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
                    const yearsToSearch = Object.keys(sectionsByYear || {}).filter(isSectionsYearMapDataKey);
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
                    const yearsToSearch = Object.keys(sectionsByYear).filter(isSectionsYearMapDataKey);
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
                        const popupWidth = 320;
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
                            const popupWidth = 320;
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
    const sectionsByYearKeyCount = Object.keys(sectionsByYear || {}).filter(isSectionsYearMapDataKey).length;
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
    
    const renderStatusCell = (section, doc, month, options = {}) => {
        const { variant = 'table' } = options;
        const status = getDocumentStatus(doc, month);
        const statusConfig = status ? getStatusConfig(status) : null;
        const comments = getDocumentComments(doc, month);
        const hasComments = comments.length > 0;
        const monthKeyForEmail = !isJsonOnlyTracker ? getMonthKey(month, selectedYear) : null;
        const emailDraft =
            monthKeyForEmail && doc?.emailRequestByMonth && typeof doc.emailRequestByMonth === 'object'
                ? doc.emailRequestByMonth[monthKeyForEmail]
                : null;
        const hasSavedEmailDraft =
            !isJsonOnlyTracker &&
            emailDraft &&
            ((Array.isArray(emailDraft.recipients) && emailDraft.recipients.length > 0) ||
                (Array.isArray(emailDraft.cc) && emailDraft.cc.length > 0) ||
                (typeof emailDraft.subject === 'string' && emailDraft.subject.trim()) ||
                (typeof emailDraft.body === 'string' && emailDraft.body.trim()));
        const commentsForNotificationBadge = comments.filter((c) => !isPlatformOutboundAuditComment(c));
        const showActivityCommentBadge = commentsForNotificationBadge.length > 0;
        const activityCommentBadgeCount = commentsForNotificationBadge.length;
        const cellKey = buildCellKey(section.id, doc.id, month);
        const isPopupOpen = hoverCommentCell === cellKey;
        const isSelected = selectedCells.has(cellKey);
        const isEmailModalOpenForCell = emailModalContext && emailModalContext.section?.id === section.id && emailModalContext.doc?.id === doc.id && emailModalContext.month === month;
        // Always show comment/email actions (no hover gating).
        const showCellActions = true;
        
        const isWorkingMonth = isOneMonthArrears(selectedYear, months.indexOf(month));
        let cellBackgroundClass = statusConfig 
            ? statusConfig.cellColor 
            : (isWorkingMonth ? 'bg-sky-50' : '');
        
        // Add selection styling (with higher priority) - pastel
        if (isSelected) {
            cellBackgroundClass = 'bg-sky-200 border-2 border-sky-400 dark:bg-sky-800 dark:border-sky-500';
        }
        
const baseTextColorClass = statusConfig && statusConfig.color
            ? statusConfig.color.split(' ').filter(cls => cls.startsWith('text-') || cls.startsWith('dark:')).join(' ') || 'text-gray-900 dark:text-gray-100'
            : 'text-gray-400 dark:text-gray-400';
        
        const textColorClass = isSelected ? 'text-sky-900 dark:text-sky-100' : baseTextColorClass;
        
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
        
        const monthSeparatorClass = isJsonOnlyTracker ? 'border-l-4 border-gray-400' : 'border-l-2 border-gray-200';
        const isList = variant === 'list';
        const outerClassName = isList
            ? `px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-600 ${cellBackgroundClass} relative transition-all ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900' : ''}`
            : `px-3 py-1.5 text-xs ${monthSeparatorClass} ${cellBackgroundClass} relative transition-all ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:bg-opacity-90'}`;
        const innerWidthClass = isList ? 'w-full min-w-0' : 'relative w-full min-w-0';
        const OuterTag = isList ? 'div' : 'td';
        const outerProps = isList
            ? {
                'data-cell-key': cellKey,
                className: outerClassName,
                onClick: handleCellClick,
                onMouseEnter: () => setHoveredStatusCell(cellKey),
                onMouseLeave: () => setHoveredStatusCell(null),
                title: isSelected ? 'Selected (Ctrl/Cmd+Click to deselect)' : 'Ctrl/Cmd+Click to select multiple',
                role: 'group'
            }
            : {
                'data-cell-key': cellKey,
                tabIndex: 0,
                className: outerClassName,
                style: isJsonOnlyTracker
                    ? { minWidth: jsonTrackerStatusColPx, width: jsonTrackerStatusColPx }
                    : { minWidth: documentCollectionMonthColMinPx },
                onClick: handleCellClick,
                onMouseEnter: () => setHoveredStatusCell(cellKey),
                onMouseLeave: () => setHoveredStatusCell(null),
                onFocus: () => setHoveredStatusCell(cellKey),
                onBlur: (e) => {
                    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
                    setHoveredStatusCell(null);
                },
                title: isSelected ? 'Selected (Ctrl/Cmd+Click to deselect)' : 'Ctrl/Cmd+Click to select multiple',
                role: 'gridcell'
            };
        return (
            <OuterTag {...outerProps}>
                <div className={innerWidthClass}>
                    <select
                        value={isMonthlyDataReview ? (status ? resolveMonthlyDataReviewStatusKey(status) : '') : (status || '')}
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
                            const newStatus = e.target.value;
                            const prevComparable = isMonthlyDataReview
                                ? (status ? resolveMonthlyDataReviewStatusKey(status) : '')
                                : (status || '');
                            if (newStatus !== prevComparable) {
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
                        className={`w-full pl-2 pr-20 py-1.5 text-xs rounded-lg font-semibold border-0 cursor-pointer appearance-none bg-transparent ${textColorClass} hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-sky-400`}
                    >
                        <option value="">—</option>
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value} style={option.optionStyle || {}}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    {/* Right side: email (left) + comment (right) - always visible */}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
                        {showCellActions ? (
                            <>
                                {!isJsonOnlyTracker && (() => {
                                    const monthNum = months.indexOf(month) + 1;
                                    const docMonthKey = buildDocMonthKey(doc.id, monthNum);
                                    const receivedMeta = receivedMetaByCell[docMonthKey] || {};
                                    const receivedCount = receivedMeta.count || 0;
                                    const hasReceived = receivedCount > 0;
                                    const latestReceivedAt = receivedMeta.latestReceivedAt ? new Date(receivedMeta.latestReceivedAt).getTime() : null;
                                    const openedAt = openedNotificationByCell[docMonthKey]?.email ? new Date(openedNotificationByCell[docMonthKey].email).getTime() : null;
                                    const isEmailUnread = !!latestReceivedAt && (!openedAt || latestReceivedAt > openedAt);
                                    const emailBadgeClass = isEmailUnread ? 'bg-amber-200 text-amber-800' : 'bg-rose-200 text-rose-800';
                                    return (
                                        <button
                                            type="button"
                                            data-email-cell={cellKey}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                markNotificationOpened(doc.id, monthNum, 'email');
                                                setEmailModalContext({ section, doc, month });
                                            }}
                                            className="relative text-gray-500 hover:text-sky-600 transition-colors p-0.5 rounded shrink-0"
                                            title={hasReceived ? `${receivedCount} received email(s)` : 'Request documents via email'}
                                            aria-label={hasReceived ? `${receivedCount} received email(s)` : 'Request documents via email'}
                                        >
                                            <i className="fas fa-envelope text-base"></i>
                                            {hasReceived && (
                                                <span className={`absolute top-0 right-0 ${emailBadgeClass} text-[8px] rounded-full min-w-[0.75rem] h-3 px-0.5 flex items-center justify-center font-bold leading-none`}>
                                                    {receivedCount}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })()}
                                {(() => {
                                    const monthNum = months.indexOf(month) + 1;
                                    const docMonthKey = buildDocMonthKey(doc.id, monthNum);
                                    const openedAt = openedNotificationByCell[docMonthKey]?.comment ? new Date(openedNotificationByCell[docMonthKey].comment).getTime() : null;
                                    const latestCommentAt = Array.isArray(commentsForNotificationBadge)
                                        ? commentsForNotificationBadge.reduce((max, c) => {
                                            const t = c?.createdAt ? new Date(c.createdAt).getTime() : null;
                                            if (!t || isNaN(t)) return max;
                                            return max == null || t > max ? t : max;
                                        }, null)
                                        : null;
                                    const isCommentUnread = !!latestCommentAt && (!openedAt || latestCommentAt > openedAt);
                                    const commentBadgeClass = isCommentUnread ? 'bg-amber-200 text-amber-800' : 'bg-rose-200 text-rose-800';
                                    return (
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
                                    markNotificationOpened(doc.id, monthNum, 'comment');
                                    // Set initial position - smart positioning will update it
                                    setHoverCommentCell(cellKey);
                                    
                                    // Update URL with deep link when opening popup
                                    const { sectionId, documentId, month } = parseCellKey(cellKey);
                                    if (sectionId && documentId && month && project?.id) {
                                        const deepLinkUrl = `#/projects/${project.id}?docSectionId=${encodeURIComponent(sectionId)}&docDocumentId=${encodeURIComponent(documentId)}&docMonth=${encodeURIComponent(month)}&docYear=${encodeURIComponent(selectedYear)}&tab=${encodeURIComponent(trackerTabForDeepLink)}`;
                                        
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
                                            const popupWidth = 320;
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
                                    title={
                                        hasComments
                                            ? `${comments.length} comment(s)`
                                            : hasSavedEmailDraft
                                              ? 'Saved email draft — open for activity'
                                              : 'Activity & comments'
                                    }
                                    type="button"
                                >
                                    <i className="fas fa-comment text-base"></i>
                                    {showActivityCommentBadge && (
                                        <span className={`absolute -top-1 -right-1 ${commentBadgeClass} text-[9px] rounded-full min-w-[1rem] h-4 px-0.5 flex items-center justify-center font-bold`}>
                                            {activityCommentBadgeCount}
                                        </span>
                                    )}
                                </button>
                                    );
                                })()}
                            </>
                        ) : (() => {
                            const monthNum = months.indexOf(month) + 1;
                            const receivedMeta = receivedMetaByCell[buildDocMonthKey(doc.id, monthNum)] || {};
                            const receivedCount = receivedMeta.count || 0;
                            const hasActivity = hasComments || (!isJsonOnlyTracker && receivedCount > 0);
                            if (!hasActivity) return null;
                            const total = (hasComments ? comments.length : 0) + (!isJsonOnlyTracker ? receivedCount : 0);
                            return (
                                <span
                                    className="text-[10px] text-gray-400 tabular-nums"
                                    title="Hover for email & comments"
                                >
                                    {total}
                                </span>
                            );
                        })()}
                    </div>
                </div>
            </OuterTag>
        );
    };

    const renderNotesCell = (section, doc, month, options = {}) => {
        const { variant = 'table' } = options;
        const notes = getDocumentNotes(doc, month);
        const status = getDocumentStatus(doc, month);
        const statusConfig = status ? getStatusConfig(status) : null;
        const isWorkingMonth = isOneMonthArrears(selectedYear, months.indexOf(month));
        const cellBg = statusConfig?.cellColor || (isWorkingMonth ? 'bg-sky-50' : '');
        // Uncontrolled textarea: browser handles all key input (space, enter, etc.) natively.
        // We sync to state on change and save on blur. key resets the field when section/doc/month/year changes.
        const textarea = (
            <textarea
                key={`notes-${section.id}-${doc.id}-${month}-${selectedYear}`}
                defaultValue={notes}
                onChange={(e) => handleUpdateNotes(section.id, doc.id, month, e.target.value)}
                onBlur={() => {
                    lastSavedDataRef.current = null;
                    if (saveTimeoutRef.current) {
                        clearTimeout(saveTimeoutRef.current);
                        saveTimeoutRef.current = null;
                    }
                    saveToDatabase();
                }}
                placeholder="Notes..."
                rows={variant === 'list' ? 2 : 3}
                className="w-full min-w-0 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded resize-y focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 bg-transparent dark:bg-gray-800/50"
                aria-label={`Notes for ${doc.name || 'document'} in ${month} ${selectedYear}`}
            />
        );
        if (variant === 'list') {
            return (
                <div
                    className={`px-2 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-600 ${cellBg} align-top`}
                    role="group"
                >
                    {textarea}
                </div>
            );
        }
        return (
            <td
                className={`px-2 py-1.5 text-xs border-l-2 border-gray-300 ${cellBg} align-top`}
                role="gridcell"
                style={{ minWidth: jsonTrackerNotesColPx, width: jsonTrackerNotesColPx }}
            >
                {textarea}
            </td>
        );
    };

    /** Vertical list layout: one card per month with full-width status (+ notes for JSON trackers). */
    const renderListRowsForSection = (section) => {
        if (!section.documents || section.documents.length === 0) {
            return (
                <div className="px-4 py-10 text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">No documents in this section</p>
                    <button
                        type="button"
                        onClick={() => handleAddDocument(section.id)}
                        className="mt-3 px-4 py-2 bg-sky-200 dark:bg-sky-700 text-sky-800 dark:text-sky-100 rounded-lg hover:bg-sky-300 dark:hover:bg-sky-600 text-sm font-semibold inline-flex items-center gap-2"
                    >
                        <i className="fas fa-plus"></i>
                        <span>Add Document</span>
                    </button>
                </div>
            );
        }
        return getOrderedDocumentRows(section).map(({ doc, isSubRow }) => {
            const isMasterGreyedOut = !isSubRow && hasChildDocuments(section, doc);
            return (
                <div
                    key={doc.id}
                    className={`space-y-3 ${isSubRow ? 'ml-1 pl-3 border-l-2 border-sky-300/80 dark:border-sky-600' : ''}`}
                >
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{doc.name}</div>
                        {doc.description ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-4">{doc.description}</div>
                        ) : null}
                    </div>
                    <div className="space-y-3">
                        {months.map((month, monthIdx) => {
                            const focusMonth = isOneMonthArrears(selectedYear, monthIdx);
                            return (
                                <div
                                    key={`${doc.id}-${month}`}
                                    className={`rounded-xl p-3 border bg-white dark:bg-gray-800/90 ${
                                        focusMonth
                                            ? 'border-sky-300 dark:border-sky-600 ring-1 ring-sky-200/80 dark:ring-sky-700/80'
                                            : 'border-gray-200 dark:border-gray-600'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                            {month.slice(0, 3)} {selectedYear}
                                        </span>
                                        {focusMonth ? (
                                            <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wide">Focus</span>
                                        ) : null}
                                    </div>
                                    {isMasterGreyedOut ? (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 italic py-1">
                                            Status for this row is tracked on sub-documents below.
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {renderStatusCell(section, doc, month, { variant: 'list' })}
                                            {isJsonOnlyTracker ? renderNotesCell(section, doc, month, { variant: 'list' }) : null}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        });
    };
    
    // ============================================================
    // MODALS
    // ============================================================

    const handleMdrDriveIconMouseEnter = (monthIdx) => {
        if (!isMonthlyDataReview) return;
        clearDriveHoverTimer();
        driveHoverTimerRef.current = setTimeout(() => {
            driveHoverTimerRef.current = null;
            const cur = getMdrDriveUrl(sectionsByYear, selectedYear, monthIdx);
            setDriveLinkModal({ year: selectedYear, monthIndex: monthIdx, draftUrl: cur });
        }, 2000);
    };

    const handleMdrDriveIconMouseLeave = () => {
        clearDriveHoverTimer();
    };

    const handleMdrDriveIconClick = (e, monthIdx) => {
        if (!isMonthlyDataReview) return;
        e.preventDefault();
        e.stopPropagation();
        clearDriveHoverTimer();
        const url = getMdrDriveUrl(sectionsByYear, selectedYear, monthIdx);
        if (url) {
            window.open(normalizeDriveOpenUrl(url), '_blank', 'noopener,noreferrer');
        } else {
            setDriveLinkModal({ year: selectedYear, monthIndex: monthIdx, draftUrl: '' });
        }
    };

    const DriveLinkModal = () => {
        if (!driveLinkModal) return null;
        const { year, monthIndex, draftUrl = '' } = driveLinkModal;
        const monthLabel = months[monthIndex] || `Month ${monthIndex + 1}`;

        const handleSubmit = (e) => {
            e.preventDefault();
            applyMdrDriveUrl(year, monthIndex, draftUrl);
            setDriveLinkModal(null);
            // Immediate save: debounced autosave is cancelled when loadData sets isLoading, and
            // saveToDatabase otherwise skips while isLoading — without this, Drive links never persist.
            void saveToDatabase({ skipLoadingGuard: true });
        };

        const handleClear = () => {
            applyMdrDriveUrl(year, monthIndex, '');
            setDriveLinkModal(null);
            void saveToDatabase({ skipLoadingGuard: true });
        };

        return (
            <div
                className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-60 flex items-center justify-center z-[60] p-4"
                data-mdr-drive-modal="true"
                onClick={() => setDriveLinkModal(null)}
                role="presentation"
            >
                <div
                    className="modal-panel bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-600"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mdr-drive-modal-title"
                >
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                        <h2 id="mdr-drive-modal-title" className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <i className="fab fa-google-drive text-green-600 dark:text-green-400" aria-hidden="true" />
                            Google Drive folder
                        </h2>
                        <button
                            type="button"
                            onClick={() => setDriveLinkModal(null)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                            aria-label="Close"
                        >
                            <i className="fas fa-times text-sm" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                            {monthLabel} {year} — paste a Google Drive folder or file link for this month.
                        </p>
                        <div>
                            <label htmlFor="mdr-drive-url" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Link
                            </label>
                            <input
                                id="mdr-drive-url"
                                type="url"
                                inputMode="url"
                                autoComplete="off"
                                value={draftUrl}
                                onChange={(e) =>
                                    setDriveLinkModal((prev) =>
                                        prev ? { ...prev, draftUrl: e.target.value } : prev
                                    )
                                }
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-400"
                                placeholder="https://drive.google.com/drive/folders/…"
                            />
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <button
                                type="button"
                                onClick={handleClear}
                                className="px-3 py-1.5 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                            >
                                Remove link
                            </button>
                            <button
                                type="button"
                                onClick={() => setDriveLinkModal(null)}
                                className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-sky-200 dark:bg-sky-700 text-sky-900 dark:text-sky-100 rounded-lg hover:bg-sky-300 dark:hover:bg-sky-600"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };
    
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" data-section-modal="true">
                <div className="modal-panel bg-white rounded-lg shadow-xl w-full max-w-md">
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
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400"
                                placeholder="e.g., Financial Documents"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400"
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
                                className="px-3 py-1.5 text-xs bg-sky-200 text-sky-800 rounded-lg hover:bg-sky-300"
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
        const sectionName = ctx?.section?.name || '';
        const month = ctx?.month || '';
        const projectName = project?.name || 'Project';
        const currentPeriodText = `${month} ${selectedYear}`.trim();
        // When doc is a sub-document, include parent so email references main/parent and relevant child
        const parentDoc = ctx?.section?.documents?.find((d) => d.id === ctx?.doc?.parentId);
        const parentName = parentDoc?.name || null;
        const documentLabel = parentName ? `${parentName} – ${docName}` : docName;
        // Include section (location) in subject so reply matching can route to the correct section's document (e.g. Barberton vs Mafube)
        const defaultSubject = sectionName
            ? `Abco Document / Data request: ${projectName} – ${sectionName} – ${documentLabel} – ${currentPeriodText}`
            : `Abco Document / Data request: ${projectName} – ${documentLabel} – ${currentPeriodText}`;
        const defaultBody = `Dear Recipient Name,

We are following up regarding the documents below. This request is for our internal records and audit trail.

Requested details:
• Document / Data: ${documentLabel}
• Period: ${currentPeriodText}
• Project: ${projectName}${sectionName ? `\n• Section: ${sectionName}` : ''}

If any items are unavailable, please let us know so we can update our records accordingly.
Please send these at your earliest convenience. When replying, please keep the subject line unchanged so we can file your response correctly.

Kind regards,
Abcotronics`;

        const [contacts, setContacts] = useState([]);
        const [contactsCc, setContactsCc] = useState([]);
        const [newContact, setNewContact] = useState('');
        const [newContactCc, setNewContactCc] = useState('');
        const [subject, setSubject] = useState(defaultSubject);
        const [body, setBody] = useState(defaultBody);
        const [recipientName, setRecipientName] = useState('');
        const [saveNotice, setSaveNotice] = useState(null);
        const [justSaved, setJustSaved] = useState(false);
        const [lastSavedTemplate, setLastSavedTemplate] = useState(null);
        const [removeExternalLinks, setRemoveExternalLinks] = useState(true);
        const [sendPlainTextOnly, setSendPlainTextOnly] = useState(false);
        const [scheduleFrequency, setScheduleFrequency] = useState('none');
        const defaultStopWhenStatus = isComplianceReview
            ? 'reviewed-in-order'
            : (isJsonOnlyTracker ? 'done' : 'collected');
        const [scheduleStopStatus, setScheduleStopStatus] = useState(defaultStopWhenStatus);
        const [sending, setSending] = useState(false);
        const [savingTemplate, setSavingTemplate] = useState(false);
        const [applyingAllMonths, setApplyingAllMonths] = useState(false);
        const [result, setResult] = useState(null);
        const [emailActivity, setEmailActivity] = useState({ sent: [], received: [] });
        const [loadingActivity, setLoadingActivity] = useState(false);
        const [expandedSentId, setExpandedSentId] = useState(null);
        const [deletingActivityId, setDeletingActivityId] = useState(null);
        const [clearingSentActivity, setClearingSentActivity] = useState(false);
        // Reply to a received email: which item and form fields
        const [replyingToReceivedId, setReplyingToReceivedId] = useState(null);
        const [replyToEmail, setReplyToEmail] = useState('');
        const [replySubject, setReplySubject] = useState('');
        const [replyBody, setReplyBody] = useState('');
        const [replyCc, setReplyCc] = useState([]);
        const [replyNewCc, setReplyNewCc] = useState('');
        const [replyRequestNumber, setReplyRequestNumber] = useState(null);
        const [sendingReply, setSendingReply] = useState(false);
        const activityFetchIdRef = useRef(0);
        const saveNoticeTimeoutRef = useRef(null);
        const justSavedTimeoutRef = useRef(null);

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

        const getLatestEmailRequest = () => {
            if (!ctx?.section?.id || !ctx?.doc?.id || !ctx?.month) return {};
            const latestSectionsByYear = sectionsRef.current && Object.keys(sectionsRef.current).length > 0
                ? sectionsRef.current
                : sectionsByYear;
            const currentYearSections = latestSectionsByYear?.[selectedYear] || [];
            const sectionMatch = currentYearSections.find((s) => String(s.id) === String(ctx.section.id));
            const docMatch = (sectionMatch?.documents || []).find((d) => String(d.id) === String(ctx.doc.id));
            if (!docMatch) return {};
            const monthKey = getMonthKey(ctx.month, selectedYear);
            return docMatch.emailRequestByMonth?.[monthKey] || {};
        };

        const getPlainTextPreferenceKey = (sectionId, documentId) => {
            if (!project?.id || !sectionId || !documentId) return null;
            return `doc-email-plain-text:${project.id}:${sectionId}:${documentId}`;
        };

        const getPlainTextPreferenceFallback = (sectionId, documentId) => {
            try {
                const key = getPlainTextPreferenceKey(sectionId, documentId);
                if (!key || typeof window === 'undefined') return null;
                const raw = window.localStorage?.getItem?.(key);
                if (raw == null) return null;
                return raw === '1';
            } catch (_) {
                return null;
            }
        };

        const setPlainTextPreferenceFallback = (sectionId, documentId, value) => {
            try {
                const key = getPlainTextPreferenceKey(sectionId, documentId);
                if (!key || typeof window === 'undefined') return;
                window.localStorage?.setItem?.(key, value ? '1' : '0');
            } catch (_) {}
        };

        useEffect(() => {
            const s = getLatestEmailRequest();
            const initialTemplate = buildTemplateFromSaved(s);
            setContacts(initialTemplate.recipients);
            setContactsCc(initialTemplate.cc);
            setSubject(initialTemplate.subject || defaultSubject);
            setBody(initialTemplate.body || defaultBody);
            setRecipientName(initialTemplate.recipientName || '');
            setRemoveExternalLinks(true);
            const fallbackPlainText = getPlainTextPreferenceFallback(ctx?.section?.id, ctx?.doc?.id);
            const hasSavedPlainText = initialTemplate.sendPlainTextOnly != null;
            const plainTextValue = hasSavedPlainText
                ? !!initialTemplate.sendPlainTextOnly
                : (fallbackPlainText != null ? fallbackPlainText : false);
            setSendPlainTextOnly(plainTextValue);
            setScheduleFrequency(initialTemplate.schedule.frequency);
            const loadedStop = initialTemplate.schedule.stopWhenStatus;
            const loadedStopResolved = loadedStop && isMonthlyDataReview
                ? resolveMonthlyDataReviewStatusKey(loadedStop)
                : loadedStop;
            setScheduleStopStatus(loadedStopResolved && statusOptions.some(o => o.value === loadedStopResolved) ? loadedStopResolved : defaultStopWhenStatus);
            setNewContact('');
            setNewContactCc('');
            setResult(null);
            setSaveNotice(null);
            const templateWithPlainText = { ...initialTemplate, sendPlainTextOnly: plainTextValue };
            setLastSavedTemplate(templateWithPlainText);
            setPlainTextPreferenceFallback(ctx?.section?.id, ctx?.doc?.id, plainTextValue);
            // Only persist plain-text flag to the server when this month already has saved email data.
            // Otherwise we would write default/empty recipients and wipe contacts for other months (previously: broadcast save).
            if (!hasSavedPlainText && fallbackPlainText != null && ctx?.section?.id && ctx?.doc?.id && ctx?.month) {
                const hasPersistedEmailData =
                    (Array.isArray(s?.recipients) && s.recipients.length > 0) ||
                    (Array.isArray(s?.cc) && s.cc.length > 0) ||
                    (typeof s?.subject === 'string' && s.subject.trim()) ||
                    (typeof s?.body === 'string' && s.body.trim());
                if (hasPersistedEmailData) {
                    const nextTemplate = normalizeTemplate({ ...initialTemplate, sendPlainTextOnly: plainTextValue });
                    saveEmailRequestForCell(ctx.section.id, ctx.doc.id, ctx.month, nextTemplate).catch((err) => {
                        console.warn('Failed to persist plain text preference fallback:', err);
                    });
                }
            }
            if (saveNoticeTimeoutRef.current) {
                clearTimeout(saveNoticeTimeoutRef.current);
                saveNoticeTimeoutRef.current = null;
            }
            setReplyingToReceivedId(null);
            setReplyToEmail('');
            setReplySubject('');
            setReplyBody('');
            setReplyCc([]);
            setReplyNewCc('');
            setReplyRequestNumber(null);
        }, [ctx?.section?.id, ctx?.doc?.id, ctx?.month, selectedYear]);

        // Fetch email activity (sent/received) for this document and month; callable from useEffect and after send. Returns a promise.
        const fetchEmailActivity = useCallback((opts = {}) => {
            if (!ctx?.doc?.id || !ctx?.month || project?.id == null || selectedYear == null) {
                setEmailActivity({ sent: [], received: [] });
                return Promise.resolve();
            }
            const monthNum = months.indexOf(ctx.month) >= 0 ? months.indexOf(ctx.month) + 1 : null;
            if (monthNum == null) return Promise.resolve();
            const fetchId = ++activityFetchIdRef.current;
            setLoadingActivity(true);
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
            const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
            const q = new URLSearchParams({
                documentId: String(ctx.doc.id).trim(),
                month: String(monthNum),
                year: String(selectedYear),
                _: String(Date.now())
            });
            if (ctx?.doc?.name) q.set('documentName', String(ctx.doc.name).trim());
            if (ctx?.section?.id) q.set('sectionId', String(ctx.section.id).trim());
            if (opts.forceRefresh) q.set('refresh', '1');
            return fetch(`${base}/api/projects/${project.id}/document-collection-email-activity?${q}`, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers: { Accept: 'application/json', 'Cache-Control': 'no-store', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
            })
                .then((res) => {
                    const ok = res.ok;
                    return res.json().catch(() => ({})).then((json) => ({ ok, json }));
                })
                .then(({ ok, json }) => {
                    if (fetchId !== activityFetchIdRef.current) return;
                    if (!ok) {
                        setEmailActivity({ sent: [], received: [] });
                        return;
                    }
                    const data = json.data || json;
                    setEmailActivity({
                        sent: Array.isArray(data.sent) ? data.sent : [],
                        received: Array.isArray(data.received) ? data.received : []
                    });
                })
                .catch(() => { if (fetchId === activityFetchIdRef.current) setEmailActivity({ sent: [], received: [] }); })
                .finally(() => { if (fetchId === activityFetchIdRef.current) setLoadingActivity(false); });
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

        const handleDeleteEmailActivity = async (id, type) => {
            if (!project?.id || !id || !type) return;
            const label = type === 'sent' ? 'this sent email' : 'this received email';
            if (!confirm(`Remove ${label} from the list? This cannot be undone.`)) return;
            setDeletingActivityId(id);
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
            const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
            try {
                const url = `${base}/api/projects/${project.id}/document-collection-email-activity?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`;
                const res = await fetch(url, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ id, type })
                });
                const json = await res.json().catch(() => ({}));
                const data = json.data != null ? json.data : json;
                if (res.ok && data.deleted) {
                    if (type === 'sent') setExpandedSentId((prev) => (prev === id ? null : prev));
                    setEmailActivity((prev) => ({
                        sent: prev.sent.filter((s) => s.id !== id),
                        received: prev.received.filter((r) => r.id !== id)
                    }));
                } else {
                    alert(data.error || json.error || 'Failed to delete');
                }
            } catch (err) {
                alert(err.message || 'Failed to delete')
            } finally {
                setDeletingActivityId(null);
            }
        };

        const handleClearSentActivity = async () => {
            if (!project?.id || !ctx?.doc?.id || !ctx?.month || selectedYear == null) return;
            if (!confirm('Remove all sent emails for this document and month? This cannot be undone.')) return;
            const monthNum = months.indexOf(ctx.month) >= 0 ? months.indexOf(ctx.month) + 1 : null;
            if (!monthNum) return;
            setClearingSentActivity(true);
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
            const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
            try {
                const q = new URLSearchParams({
                    documentId: String(ctx.doc.id).trim(),
                    month: String(monthNum),
                    year: String(selectedYear),
                    clear: 'sent'
                });
                const url = `${base}/api/projects/${project.id}/document-collection-email-activity?${q}`;
                const res = await fetch(url, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    }
                });
                const json = await res.json().catch(() => ({}));
                const data = json.data ?? json;
                if (res.ok && data.cleared) {
                    setEmailActivity((prev) => ({ ...prev, sent: [] }));
                    setExpandedSentId(null);
                } else {
                    alert(data.error || json.error || 'Failed to clear sent activity');
                }
            } catch (err) {
                alert(err.message || 'Failed to clear sent activity');
            } finally {
                setClearingSentActivity(false);
            }
        };

        // Parse reply-to email from received item text (fallback if API didn't return replyToEmail)
        const getReplyToFromReceived = (r) => {
            if (r.replyToEmail && emailRe.test(r.replyToEmail)) return r.replyToEmail;
            const match = (r.text || '').trim().match(/^Email from Client\s*\(([^)]+)\)/);
            return match && match[1] && emailRe.test(match[1].trim()) ? match[1].trim() : null;
        };

        const getCleanReceivedBodyText = (r) => {
            const raw = (r && typeof r.text === 'string' ? r.text : '').replace(/\r\n/g, '\n');
            if (!raw) return '';
            let body = raw
                .replace(/^Email from Client\s*\([^)]+\)\s*/i, '')
                .replace(/^CC:\s*[^\n]*\n?/i, '')
                .replace(/\nAttachments:\s*[^\n]*$/i, '')
                .trim();
            const lines = body.split('\n');
            const out = [];
            for (const l of lines) {
                const line = l.trim();
                if (!line) {
                    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
                    continue;
                }
                if (/^on .+ wrote:$/i.test(line)) break;
                if (/^from:\s/i.test(line)) break;
                if (/^sent:\s/i.test(line)) break;
                if (/^to:\s/i.test(line)) break;
                if (/^subject:\s/i.test(line)) break;
                if (/^>+/.test(line)) continue;
                if (/^\[cid:[^\]]+\]$/i.test(line)) continue;
                out.push(line);
            }
            return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        };

        function normalizeEmailList(list) {
            if (!Array.isArray(list)) return [];
            const map = new Map();
            list.forEach((val) => {
                const t = (val || '').toString().trim();
                if (!t || !emailRe.test(t)) return;
                const key = t.toLowerCase();
                if (!map.has(key)) map.set(key, t);
            });
            return [...map.values()];
        }

        const openReply = (r) => {
            const toAddr = getReplyToFromReceived(r);
            if (!toAddr) {
                alert('Cannot reply: sender email could not be determined from this message.');
                return;
            }
            const s = getEmailRequestForYear(ctx?.doc, ctx?.month, selectedYear);
            const baseCc = [
                ...(Array.isArray(s.recipients) ? s.recipients : []),
                ...(Array.isArray(s.cc) ? s.cc : [])
            ];
            const sentList = Array.isArray(emailActivity.sent)
                ? [...emailActivity.sent].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                : [];
            const anchor =
                sentList.find((row) => row && row.requestNumber) ||
                sentList[sentList.length - 1] ||
                null;
            const rn =
                (anchor && anchor.requestNumber) ||
                (() => {
                    const sub = (anchor && anchor.subject) || '';
                    const m = String(sub).match(/\[Req\s+([A-Za-z0-9-]+)\]/i);
                    return m ? m[1].trim() : null;
                })();
            let outboundCc = [];
            if (
                anchor &&
                (Array.isArray(anchor.ccEmails) || Array.isArray(anchor.toEmails)) &&
                (anchor.ccEmails?.length > 0 || anchor.toEmails?.length > 0)
            ) {
                outboundCc = normalizeEmailList([
                    ...(Array.isArray(anchor.toEmails) ? anchor.toEmails : []),
                    ...(Array.isArray(anchor.ccEmails) ? anchor.ccEmails : [])
                ]).filter((e) => e.toLowerCase() !== toAddr.toLowerCase());
            } else {
                outboundCc = normalizeEmailList([...baseCc]).filter((e) => e.toLowerCase() !== toAddr.toLowerCase());
            }
            setReplyingToReceivedId(r.id);
            setReplyToEmail(toAddr);
            setReplySubject((defaultSubject || '').trim().toLowerCase().startsWith('re:') ? defaultSubject : `Re: ${(defaultSubject || '').trim()}`);
            setReplyBody('');
            setReplyCc(outboundCc);
            setReplyNewCc('');
            setReplyRequestNumber(rn || null);
        };

        const cancelReply = () => {
            setReplyingToReceivedId(null);
            setReplyToEmail('');
            setReplySubject('');
            setReplyBody('');
            setReplyCc([]);
            setReplyNewCc('');
            setReplyRequestNumber(null);
        };

        const addReplyCc = () => {
            const t = replyNewCc.trim();
            if (!t || !emailRe.test(t)) return;
            setReplyCc((prev) => normalizeEmailList([...prev, t]));
            setReplyNewCc('');
        };

        const removeReplyCc = (email) => {
            const key = (email || '').toString().trim().toLowerCase();
            setReplyCc((prev) => prev.filter((e) => e.toLowerCase() !== key));
        };

        const handleSendReply = async () => {
            if (!replyToEmail || !replySubject.trim() || !ctx?.doc?.id || !ctx?.month || project?.id == null || selectedYear == null) return;
            const monthNum = months.indexOf(ctx.month) >= 0 ? months.indexOf(ctx.month) + 1 : null;
            if (!monthNum) return;
            setSendingReply(true);
            setResult(null);
            try {
                const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
                const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
                const yearNum = parseInt(selectedYear, 10);
                const htmlPayload = buildStyledEmailHtml(replySubject.trim(), (replyBody || '').trim());
                const sendUrl = `${base}/api/projects/${project.id}/document-collection-send-email?documentId=${encodeURIComponent(String(ctx.doc.id))}&month=${Number(monthNum)}&year=${Number(yearNum)}`;
                const replyCcList = normalizeEmailList(replyCc).filter((e) => e.toLowerCase() !== replyToEmail.trim().toLowerCase());
                const res = await fetch(sendUrl, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-Document-Id': String(ctx.doc.id).trim(),
                        'X-Month': String(monthNum),
                        'X-Year': String(yearNum),
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        to: [replyToEmail.trim()],
                        ...(replyCcList.length > 0 ? { cc: replyCcList } : {}),
                        subject: replySubject.trim(),
                        html: htmlPayload,
                        text: (replyBody || '').trim(),
                        projectId: String(project.id).trim(),
                        documentId: String(ctx.doc.id).trim(),
                        month: Number(monthNum),
                        year: Number(yearNum),
                        ...(replyRequestNumber ? { requestNumber: String(replyRequestNumber).trim() } : {}),
                        ...(ctx?.section?.id ? { sectionId: String(ctx.section.id).trim() } : {})
                    })
                });
                const json = await res.json().catch(() => ({}));
                const data = json.data || json;
                const sentList = data.sent || json.sent || [];
                const failedList = data.failed || json.failed || [];
                const activityPersisted = data.activityPersisted !== false && json.activityPersisted !== false;
                const warning = data.warning || json.warning;
                if (!res.ok && res.status !== 503) {
                    setResult({ error: data.error || json.error || 'Failed to send reply' });
                    return;
                }
                if (sentList.length > 0) {
                    showEmailSentToast();
                    if (ctx?.section?.id != null && ctx?.doc?.id != null && ctx?.month) {
                        bumpCellActivityIfPopupMatchesCell(ctx.section.id, ctx.doc.id, ctx.month);
                    }
                    // Optimistic update so reply appears immediately and persists in UI even if refetch is slow or races
                    setEmailActivity((prev) => ({
                        ...prev,
                        sent: [...prev.sent, { id: 'sent-reply-' + Date.now(), subject: replySubject.trim(), bodyText: (replyBody || '').trim(), createdAt: new Date().toISOString() }]
                    }));
                    cancelReply();
                    await new Promise((r) => setTimeout(r, 300));
                    await fetchEmailActivity();
                    setTimeout(() => fetchEmailActivity(), 800);
                    if (!activityPersisted || warning) {
                        setTimeout(() => fetchEmailActivity(), 2000);
                        setTimeout(() => fetchEmailActivity(), 5000);
                    }
                }
                setResult({
                    sent: sentList,
                    failed: failedList,
                    ...((warning || (!activityPersisted && sentList.length > 0)) ? { warning: warning || 'Reply sent but it may not appear in the list. Try refreshing.' } : {})
                });
            } catch (err) {
                setResult({ error: err.message || 'Failed to send reply' });
            } finally {
                setSendingReply(false);
            }
        };

        function normalizeTemplate(tpl) {
            return {
                recipients: normalizeEmailList(tpl?.recipients || []),
                cc: normalizeEmailList(tpl?.cc || []),
                subject: (tpl?.subject || '').trim(),
                body: (tpl?.body || '').trim(),
                recipientName: (tpl?.recipientName || '').trim(),
                sendPlainTextOnly: !!(tpl?.sendPlainTextOnly || tpl?.send_plain_text_only),
                schedule: {
                    frequency: tpl?.schedule?.frequency === 'weekly' || tpl?.schedule?.frequency === 'monthly'
                        ? tpl.schedule.frequency
                        : 'none',
                    stopWhenStatus: (tpl?.schedule?.stopWhenStatus || defaultStopWhenStatus)
                }
            };
        }

        function buildTemplateFromSaved(saved) {
            const savedSubject = typeof saved?.subject === 'string' && saved.subject.trim() ? saved.subject : null;
            const savedBody = typeof saved?.body === 'string' && saved.body.trim() ? saved.body : null;
            const savedRecipientName = typeof saved?.recipientName === 'string'
                ? saved.recipientName
                : (typeof saved?.recipient_name === 'string' ? saved.recipient_name : '');
            return normalizeTemplate({
                recipients: Array.isArray(saved?.recipients) ? saved.recipients : [],
                cc: Array.isArray(saved?.cc) ? saved.cc : [],
                subject: savedSubject ? ensureAbcoSubject(withCurrentPeriod(savedSubject)) : defaultSubject,
                body: savedBody ? withoutSectionLine(withCurrentPeriod(savedBody)) : defaultBody,
                recipientName: savedRecipientName,
                sendPlainTextOnly: saved?.sendPlainTextOnly ?? saved?.send_plain_text_only,
                schedule: {
                    frequency: saved?.schedule?.frequency,
                    stopWhenStatus: saved?.schedule?.stopWhenStatus
                }
            });
        }

        function buildTemplateFromState(overrides = {}) {
            const nextPlainTextOnly = overrides.sendPlainTextOnly ?? sendPlainTextOnly;
            return normalizeTemplate({
                recipients: contacts,
                cc: contactsCc,
                subject: subject.trim() || defaultSubject,
                body: body.trim() || defaultBody,
                recipientName: recipientName.trim(),
                sendPlainTextOnly: nextPlainTextOnly,
                schedule: {
                    frequency: scheduleFrequency === 'none' ? 'none' : scheduleFrequency,
                    stopWhenStatus: scheduleStopStatus || defaultStopWhenStatus
                }
            });
        }

        const MIN_BODY_CHARS = 140;
        const URL_RE = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;
        const SHORTENER_HOSTS = new Set([
            'bit.ly',
            'tinyurl.com',
            't.co',
            'goo.gl',
            'ow.ly',
            'buff.ly',
            'is.gd',
            'cutt.ly'
        ]);

        const extractUrls = (text) => {
            if (!text || typeof text !== 'string') return [];
            const matches = text.match(URL_RE) || [];
            return matches.map((m) => m.replace(/[),.;]+$/g, ''));
        };

        const toUrl = (value) => {
            if (!value) return null;
            const raw = value.startsWith('http') ? value : `https://${value}`;
            try {
                return new URL(raw);
            } catch (_) {
                return null;
            }
        };

        const isSuspiciousUrl = (raw) => {
            const u = toUrl(raw);
            if (!u) return true;
            const host = (u.hostname || '').toLowerCase();
            if (!host) return true;
            if (SHORTENER_HOSTS.has(host)) return true;
            if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
            if (/[a-f0-9]{16,}/i.test(host)) return true;
            if (/[a-f0-9]{20,}/i.test(u.pathname || '')) return true;
            return false;
        };

        const applyGreeting = (text, name) => {
            if (!text || typeof text !== 'string') return text;
            const n = (name || '').trim();
            if (!n) return text;
            const lines = text.split('\n');
            const firstIdx = lines.findIndex((l) => l.trim().length > 0);
            if (firstIdx === -1) return text;
            const first = lines[firstIdx].trim();
            if (/^(hello|hi|dear)\b/i.test(first)) {
                lines[firstIdx] = `Dear ${n},`;
                return lines.join('\n');
            }
            return text;
        };

        const normalizeGreeting = (text, name) => {
            if (!text || typeof text !== 'string') return text;
            const lines = text.split('\n');
            const firstIdx = lines.findIndex((l) => l.trim().length > 0);
            if (firstIdx === -1) return text;
            const first = lines[firstIdx].trim();
            if (/^(hello|hi|dear)\b/i.test(first)) {
                const n = (name || '').trim();
                lines[firstIdx] = n ? `Dear ${n},` : 'Dear,';
                return lines.join('\n');
            }
            return text;
        };

        const sanitizeBodyText = (text, shouldRemoveLinks) => {
            const urls = extractUrls(text);
            const suspicious = urls.filter((u) => isSuspiciousUrl(u));
            if (!shouldRemoveLinks || urls.length === 0) {
                return { cleanedBody: text, removedUrls: [], suspiciousUrls: suspicious, allUrls: urls };
            }
            let cleanedBody = text;
            urls.forEach((u) => {
                const escaped = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                cleanedBody = cleanedBody.replace(new RegExp(escaped, 'g'), '').replace(/\(\s*\)/g, '');
            });
            cleanedBody = cleanedBody.replace(/\n{3,}/g, '\n\n').trim();
            return { cleanedBody, removedUrls: urls, suspiciousUrls: suspicious, allUrls: urls };
        };

        const showSaveNotice = (notice) => {
            setSaveNotice(notice);
            if (saveNoticeTimeoutRef.current) clearTimeout(saveNoticeTimeoutRef.current);
            saveNoticeTimeoutRef.current = setTimeout(() => setSaveNotice(null), 2500);
        };

        const isDefaultLikeTemplate = (template) => {
            if (!template || typeof template !== 'object') return true;
            const normalized = normalizeTemplate(template);
            const sameRecipients = (normalized.recipients || []).length === 0;
            const sameCc = (normalized.cc || []).length === 0;
            const sameRecipientName = !normalized.recipientName;
            const sameSubject = (normalized.subject || '').trim() === (defaultSubject || '').trim();
            const sameBody = (normalized.body || '').trim() === (defaultBody || '').trim();
            const samePlainText = !!normalized.sendPlainTextOnly === false;
            const sameSchedule = !normalized.schedule || normalized.schedule.frequency === 'none';
            return sameRecipients && sameCc && sameRecipientName && sameSubject && sameBody && samePlainText && sameSchedule;
        };

        const autoSaveTemplateIfChanged = async () => {
            if (!ctx?.section?.id || !ctx?.doc?.id || !ctx?.month) return;
            const current = buildTemplateFromState();
            const saved = lastSavedTemplate || buildTemplateFromSaved(getLatestEmailRequest());
            const hasInput = current.recipients.length > 0 || current.cc.length > 0 || current.subject || current.body;
            if (!hasInput) return;
            // Guard against accidental overwrite when modal opened before latest saved template finished loading.
            // In that case, "current" may only contain generated defaults and should not replace persisted data.
            if (isDefaultLikeTemplate(current) && !isDefaultLikeTemplate(saved)) return;
            if (JSON.stringify(current) === JSON.stringify(saved)) return;
            await saveEmailRequestForCell(ctx.section.id, ctx.doc.id, ctx.month, current);
        };

        const handleSaveTemplate = async () => {
            if (!ctx?.section?.id || !ctx?.doc?.id || !ctx?.month) return;
            setSavingTemplate(true);
            setResult(null);
            try {
                const normalized = buildTemplateFromState();
                await saveEmailRequestForCell(ctx.section.id, ctx.doc.id, ctx.month, normalized);
                // Keep the latest values on screen after save
                setContacts(normalized.recipients);
                setContactsCc(normalized.cc);
                setSubject(normalized.subject || defaultSubject);
                setBody(normalized.body || defaultBody);
                setRecipientName(normalized.recipientName || '');
                setSendPlainTextOnly(!!normalized.sendPlainTextOnly);
                setScheduleFrequency(normalized.schedule.frequency);
                const savedStop = normalized.schedule.stopWhenStatus;
                const savedStopResolved = savedStop && isMonthlyDataReview
                    ? resolveMonthlyDataReviewStatusKey(savedStop)
                    : savedStop;
                setScheduleStopStatus(savedStopResolved && statusOptions.some(o => o.value === savedStopResolved) ? savedStopResolved : defaultStopWhenStatus);
                setLastSavedTemplate(normalized);
                setResult({ saved: true, message: 'Saved changes', source: 'save' });
                showSaveNotice({ type: 'success', message: 'Saved changes' });
                setJustSaved(true);
                if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current);
                justSavedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2500);
                setTimeout(() => setResult(prev => (prev?.saved ? null : prev)), 2000);
            } catch (err) {
                console.error('Failed to save email template:', err);
                setResult({ error: 'Save failed. Please try again.', source: 'save' });
                showSaveNotice({ type: 'error', message: 'Save failed. Please try again.' });
            } finally {
                setSavingTemplate(false);
            }
        };

        const handleApplyToAllMonthsInYear = async () => {
            if (!ctx?.section?.id || !ctx?.doc?.id || !ctx?.month) return;
            const normalized = buildTemplateFromState();
            if ((normalized.recipients || []).length === 0) {
                alert('Add at least one recipient before applying to all months.');
                return;
            }
            const y = String(selectedYear);
            if (!confirm(
                `Copy this template to every month in ${y}? Recipients, CC, subject, body, and schedule will update for all 12 months for this document. Each month keeps its own last-sent time for scheduled reminders.`
            )) {
                return;
            }
            setApplyingAllMonths(true);
            setResult(null);
            try {
                await saveEmailRequestTemplateForYear(ctx.section.id, ctx.doc.id, normalized, ctx.month);
                setLastSavedTemplate(normalized);
                setResult({ saved: true, message: `Applied to all months in ${y}`, source: 'applyAll' });
                showSaveNotice({ type: 'success', message: `Applied to all months in ${y}` });
                setJustSaved(true);
                if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current);
                justSavedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2500);
                setTimeout(() => setResult((prev) => (prev?.source === 'applyAll' && prev?.saved ? null : prev)), 2500);
            } catch (err) {
                console.error('Failed to apply template to all months:', err);
                setResult({ error: 'Could not apply to all months. Please try again.', source: 'applyAll' });
                showSaveNotice({ type: 'error', message: 'Could not apply to all months.' });
            } finally {
                setApplyingAllMonths(false);
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
        <strong>Document / Data:</strong> ${escapeHtml(documentLabel)}<br>
        <strong>Period:</strong> ${escapeHtml(currentPeriodText)}<br>
        <strong>Project:</strong> ${escapeHtml(projectName)}${sectionName ? `<br><strong>Section:</strong> ${escapeHtml(sectionName)}` : ''}
      </div>
    </div>
    <div style="background: ${boxBg}; border: 1px solid ${boxBorder}; border-radius: 8px; padding: 16px;">
      <div style="font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: bold;">Message</div>
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">${bodyHtml}</div>
    </div>
  </div>
</div>`;
        };

        const sendEmailRequest = async ({ subjectLine, bodyText, skipGreeting }) => {
            if (contacts.length === 0) {
                alert('Please add at least one recipient.');
                return;
            }
            if (!subjectLine || !subjectLine.trim()) {
                alert('Please enter a subject.');
                return;
            }
            if (!bodyText || !bodyText.trim()) {
                alert('Please enter the email body.');
                return;
            }
            const trimmedBody = bodyText.trim();
            const bodyWithGreeting = skipGreeting ? trimmedBody : applyGreeting(trimmedBody, recipientName);
            const normalizedBody = skipGreeting ? bodyWithGreeting : normalizeGreeting(bodyWithGreeting, recipientName);
            const sanitized = sanitizeBodyText(normalizedBody, removeExternalLinks);
            if (sanitized.cleanedBody.trim().length < MIN_BODY_CHARS) {
                alert(`Please add more detail to the message (at least ${MIN_BODY_CHARS} characters). This improves deliverability.`);
                return;
            }
            setSending(true);
            setResult(null);
            try {
                await autoSaveTemplateIfChanged();
                const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
                const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
                const requester = getCurrentUser();
                const requesterEmail = requester?.email && emailRe.test(requester.email) ? requester.email : '';
                const htmlPayload = sendPlainTextOnly ? undefined : buildStyledEmailHtml(subjectLine.trim(), sanitized.cleanedBody.trim());
                const monthNum = ctx?.month && months.indexOf(ctx.month) >= 0 ? months.indexOf(ctx.month) + 1 : null;
                const yearNum = selectedYear != null && !isNaN(selectedYear) ? parseInt(selectedYear, 10) : null;
                const hasCellKeys = !!(ctx?.doc?.id && monthNum >= 1 && monthNum <= 12 && yearNum && project?.id);
                const hasCellContext = !!(ctx?.section?.id && ctx?.doc?.id && monthNum >= 1 && monthNum <= 12 && yearNum);
                // Always send cell keys in body and URL when we have doc + period so activity is saved (redundant if body is stripped)
                const includeCellInBody = !!(ctx?.doc?.id && monthNum >= 1 && monthNum <= 12 && yearNum && project?.id);
                const sendUrl = includeCellInBody
                    ? `${base}/api/projects/${project.id}/document-collection-send-email?documentId=${encodeURIComponent(String(ctx.doc.id))}&month=${Number(monthNum)}&year=${Number(yearNum)}`
                    : `${base}/api/projects/${project.id}/document-collection-send-email`;
                const res = await fetch(sendUrl, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        ...(includeCellInBody ? {
                            'X-Document-Id': String(ctx.doc.id).trim(),
                            'X-Month': String(monthNum),
                            'X-Year': String(yearNum)
                        } : {}),
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        to: contacts,
                        cc: contactsCc.length > 0 ? contactsCc : undefined,
                        subject: subjectLine.trim(),
                        ...(htmlPayload ? { html: htmlPayload } : {}),
                        text: sanitized.cleanedBody.trim(),
                        ...(requesterEmail ? { requesterEmail } : {}),
                        ...(includeCellInBody
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
                const deliveryWarning = sanitized.suspiciousUrls.length > 0
                    ? `Warning: ${sanitized.suspiciousUrls.length} URL(s) look risky for spam filters. Consider removing them.`
                    : null;
                setResult({
                    sent: sentList,
                    failed: failedList,
                    ...((data.warning || json.warning || (res.status === 503 ? (data.error || json.error) : null)) ? { warning: data.warning || json.warning || data.error || json.error || 'Activity could not be saved.' } : {}),
                    ...(deliveryWarning ? { warning: [data.warning || json.warning, deliveryWarning].filter(Boolean).join(' ') } : {})
                });
                if (sentList.length > 0) {
                    showEmailSentToast();
                    if (ctx?.section?.id != null && ctx?.doc?.id != null && ctx?.month) {
                        bumpCellActivityIfPopupMatchesCell(ctx.section.id, ctx.doc.id, ctx.month);
                    }
                    setEmailActivity((prev) => ({
                        ...prev,
                        sent: [...prev.sent, { id: 'sent-' + Date.now(), createdAt: new Date().toISOString(), deliveryStatus: 'sent' }]
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
                                const statusAfterSend = isComplianceReview
                                    ? 'no-reviewed'
                                    : (isJsonOnlyTracker ? 'not-done' : 'requested');
                                const updatedStatus = setStatusForYear(doc.collectionStatus || {}, ctx.month, statusAfterSend, selectedYear);
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

        const handleSend = async () => {
            await sendEmailRequest({ subjectLine: subject, bodyText: body, skipGreeting: false });
        };

        const handleResendFromActivity = async (sentItem) => {
            if (!sentItem) return;
            const activitySubject = typeof sentItem.subject === 'string' ? sentItem.subject.trim() : '';
            const activityBody = typeof sentItem.bodyText === 'string' ? sentItem.bodyText.trim() : '';
            const subjectLine = activitySubject || (subject || '').trim();
            const bodyText = activityBody || (body || '').trim();
            if (!subjectLine || !bodyText) {
                alert('Cannot resend: this email is missing a subject or body.');
                return;
            }
            if (!confirm('Resend this email to the current recipients list?')) return;
            setSubject(subjectLine);
            setBody(bodyText);
            await sendEmailRequest({ subjectLine, bodyText, skipGreeting: !!activityBody });
        };

        const hasSuccess = result && result.sent && result.sent.length > 0;
        const hasFailures = result && result.failed && result.failed.length > 0;
        const currentTemplate = buildTemplateFromState();
        const hasUnsavedChanges = lastSavedTemplate
            ? JSON.stringify(currentTemplate) !== JSON.stringify(lastSavedTemplate)
            : false;
        const bodyPreview = applyGreeting(body || '', recipientName);
        const bodyStats = sanitizeBodyText(bodyPreview, false);
        const bodyCharCount = (bodyPreview || '').trim().length;
        const urlCount = bodyStats.allUrls.length;
        const greetingPreview = recipientName.trim() ? `Dear ${recipientName.trim()},` : '';
        const firstBodyLine = (body || '').split('\n').find((line) => line.trim().length > 0) || '';
        const greetingApplies = /^(hello|hi|dear)\b/i.test(firstBodyLine.trim());

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="modal-panel bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-100">
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
                                onClick={async () => {
                                    try {
                                        await autoSaveTemplateIfChanged();
                                    } catch (err) {
                                        console.warn('Auto-save email template failed:', err);
                                    } finally {
                                        setEmailModalContext(null);
                                    }
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/20 hover:text-white transition-colors shrink-0"
                                aria-label="Close"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-gray-50/50">
                        {saveNotice && (
                            <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                                saveNotice.type === 'error'
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}>
                                <i className={`fas ${saveNotice.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mt-0.5`}></i>
                                <span>{saveNotice.message}</span>
                            </div>
                        )}
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

                        {/* Recipient name */}
                        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <i className="fas fa-user text-[#0369a1] text-sm"></i>
                                <label className="text-sm font-medium text-gray-800">Recipient name (optional)</label>
                            </div>
                            <input
                                type="text"
                                value={recipientName}
                                onChange={(e) => setRecipientName(e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0ea5e9] focus:border-[#0ea5e9] placeholder-gray-400 transition-shadow"
                                placeholder="e.g., Thabo"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                Applies when the message starts with “Hello”, “Hi”, or “Dear” (it will be converted to “Dear”).
                            </p>
                            {recipientName.trim() && (
                                <p className={`text-xs mt-2 ${greetingApplies ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {greetingApplies
                                        ? `Greeting preview: ${greetingPreview}`
                                        : `Greeting preview: ${greetingPreview} (will apply when the message starts with Hello/Hi/Dear, then convert to Dear)`}
                                </p>
                            )}
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
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                                <span>{bodyCharCount} characters {bodyCharCount < MIN_BODY_CHARS ? `(min ${MIN_BODY_CHARS})` : ''}</span>
                                <span>{urlCount} link{urlCount === 1 ? '' : 's'} detected</span>
                            </div>
                            {urlCount > 0 && (
                                <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600">
                                    <input
                                        type="checkbox"
                                        checked={removeExternalLinks}
                                        onChange={(e) => setRemoveExternalLinks(e.target.checked)}
                                        className="rounded border-gray-300 text-[#0ea5e9] focus:ring-[#0ea5e9]"
                                    />
                                    Remove external links before sending (recommended)
                                </label>
                            )}
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={sendPlainTextOnly}
                                    onChange={(e) => {
                                        const nextValue = e.target.checked;
                                        setSendPlainTextOnly(nextValue);
                                        setPlainTextPreferenceFallback(ctx?.section?.id, ctx?.doc?.id, nextValue);
                                        if (ctx?.section?.id && ctx?.doc?.id && ctx?.month) {
                                            const nextTemplate = buildTemplateFromState({ sendPlainTextOnly: nextValue });
                                            saveEmailRequestForCell(ctx.section.id, ctx.doc.id, ctx.month, nextTemplate).catch((err) => {
                                                console.warn('Failed to save plain text preference:', err);
                                            });
                                        }
                                    }}
                                    className="rounded border-gray-300 text-[#0ea5e9] focus:ring-[#0ea5e9]"
                                />
                                Send as plain text only (improves deliverability)
                            </label>
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
                                            <option key={opt.value} value={opt.value} style={opt.optionStyle || {}}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Email activity for this month: sent, received, attachments */}
                        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-inbox text-[#0369a1] text-sm"></i>
                                    <label className="text-sm font-medium text-gray-800">Email activity for this month</label>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleClearSentActivity}
                                        disabled={clearingSentActivity || loadingActivity || emailActivity.sent.length === 0}
                                        className="text-xs text-rose-600 hover:text-rose-700 disabled:opacity-50 flex items-center gap-1"
                                        title="Remove all sent emails for this document/month"
                                        aria-label="Clear sent email activity"
                                    >
                                        {clearingSentActivity ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash-alt"></i>}
                                        Clear sent
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => fetchEmailActivity({ forceRefresh: true })}
                                        disabled={loadingActivity}
                                        className="text-xs text-[#0369a1] hover:text-[#0284c7] disabled:opacity-50 flex items-center gap-1"
                                        title="Refresh to check for new replies"
                                        aria-label="Refresh email activity"
                                    >
                                        {loadingActivity ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
                                        Refresh
                                    </button>
                                </div>
                            </div>
                            {loadingActivity ? (
                                <p className="text-sm text-gray-500 flex items-center gap-2">
                                    <i className="fas fa-spinner fa-spin"></i> Loading…
                                </p>
                            ) : (emailActivity.sent.length === 0 && emailActivity.received.length === 0) ? (
                                <p className="text-sm text-gray-500">No emails sent or received yet for this document and month. Replies are processed automatically—click Refresh after replying.</p>
                            ) : (
                                <div className="space-y-4">
                                    {/* Single conversation thread: sent + received merged by date */}
                                    <ul className="space-y-3">
                                        {[...(emailActivity.sent || []).map((s) => ({ type: 'sent', ...s, _sortAt: new Date(s.createdAt).getTime() })), ...(emailActivity.received || []).map((r) => ({ type: 'received', ...r, _sortAt: new Date(r.createdAt).getTime() }))]
                                            .sort((a, b) => a._sortAt - b._sortAt)
                                            .map((item) => {
                                                if (item.type === 'sent') {
                                                    const s = item;
                                                    const isExpanded = expandedSentId === s.id;
                                                    let status = (s.deliveryStatus || 'sent').toString().toLowerCase();
                                                    if (status === 'sent' && s.deliveredAt) status = 'delivered';
                                                    if ((status === 'sent' || status === 'delivered') && s.bouncedAt) status = 'bounced';
                                                    const statusLabel = status === 'bounced'
                                                        ? 'Bounced'
                                                        : status === 'delivered'
                                                            ? 'Delivered'
                                                            : status === 'failed'
                                                                ? 'Failed'
                                                                : 'Sent';
                                                    const statusClass = status === 'bounced' || status === 'failed'
                                                        ? 'bg-rose-100 text-rose-700 border-rose-200'
                                                        : status === 'delivered'
                                                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                            : 'bg-slate-100 text-slate-600 border-slate-200';
                                                    return (
                                                        <li key={'sent-' + s.id} className="rounded-lg bg-sky-50 border border-sky-100 overflow-hidden">
                                                            <div className="px-3 py-1.5 border-b border-sky-100 bg-sky-100/50 flex items-center gap-2">
                                                                <i className="fas fa-paper-plane text-sky-600 text-xs shrink-0"></i>
                                                                <span className="text-xs font-medium text-sky-800">You</span>
                                                                <span className="text-xs text-gray-500">{formatDateTime(s.createdAt)}</span>
                                                                <span
                                                                    className={`text-[10px] px-2 py-0.5 rounded-full border ${statusClass}`}
                                                                    title={status === 'bounced' && s.bounceReason ? s.bounceReason : statusLabel}
                                                                >
                                                                    {statusLabel}
                                                                </span>
                                                                <span className="flex-1"></span>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleResendFromActivity(s); }}
                                                                    disabled={sending || deletingActivityId === s.id}
                                                                    className="shrink-0 px-2 py-1 rounded text-[11px] text-sky-700 hover:bg-sky-200/50 disabled:opacity-50"
                                                                    title="Resend to current recipients"
                                                                >
                                                                    <i className="fas fa-redo text-[10px] mr-1"></i>
                                                                    Resend
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteEmailActivity(s.id, 'sent'); }}
                                                                    disabled={deletingActivityId === s.id}
                                                                    className="shrink-0 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                                    title="Remove from list"
                                                                >
                                                                    {deletingActivityId === s.id ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-trash-alt text-xs"></i>}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExpandedSentId((prev) => (prev === s.id ? null : s.id))}
                                                                    className="shrink-0 p-1 rounded text-sky-600 hover:bg-sky-200/50"
                                                                >
                                                                    <i className={`fas fa-chevron-down text-xs ${isExpanded ? 'rotate-180' : ''}`} style={{ transition: 'transform 0.2s' }}></i>
                                                                </button>
                                                            </div>
                                                            <div className="px-3 py-2">
                                                                <p className="text-sm font-medium text-gray-800">{s.subject && s.subject.trim() ? s.subject : '—'}</p>
                                                                <div className="mt-1 text-[11px] text-gray-500">
                                                                    <span className="font-medium text-gray-600">Delivery:</span> {statusLabel}
                                                                    {status === 'bounced' && s.bounceReason ? ` — ${s.bounceReason}` : ''}
                                                                    {status === 'failed' && s.bouncedAt ? ` at ${formatDateTime(s.bouncedAt)}` : ''}
                                                                    {status === 'delivered' && s.deliveredAt ? ` at ${formatDateTime(s.deliveredAt)}` : ''}
                                                                </div>
                                                                {isExpanded && (
                                                                    <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words max-h-48 overflow-y-auto rounded border border-gray-100 p-2 bg-white/80">
                                                                        {s.bodyText && s.bodyText.trim() ? s.bodyText : '—'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </li>
                                                    );
                                                }
                                                const r = item;
                                                const senderEmail = getReplyToFromReceived(r);
                                                const fromLabel = senderEmail ? `From: ${senderEmail}` : 'From: Client';
                                                return (
                                                    <li key={'received-' + r.id} className="text-sm border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
                                                        <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center gap-2">
                                                            <i className="fas fa-inbox text-emerald-600 text-xs shrink-0"></i>
                                                            <span className="text-xs font-medium text-gray-700">{fromLabel}</span>
                                                            <span className="text-xs text-gray-500">{formatDateTime(r.createdAt)}</span>
                                                            <span className="flex-1"></span>
                                                            {getReplyToFromReceived(r) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openReply(r)}
                                                                    className="p-1.5 rounded text-gray-500 hover:text-sky-600 hover:bg-sky-50"
                                                                    title="Reply to this email"
                                                                >
                                                                    <i className="fas fa-reply text-xs"></i>
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteEmailActivity(r.id, 'received')}
                                                                disabled={deletingActivityId === r.id}
                                                                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                                title="Remove from list"
                                                            >
                                                                {deletingActivityId === r.id ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-trash-alt text-xs"></i>}
                                                            </button>
                                                        </div>
                                                        <div className="px-3 py-2 text-gray-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto text-sm">{getCleanReceivedBodyText(r) || '—'}</div>
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
                                                        {replyingToReceivedId === r.id && (
                                                            <div className="px-3 py-3 border-t border-gray-200 bg-white space-y-3">
                                                                <div className="text-xs font-medium text-gray-500">Reply to this message</div>
                                                                <div>
                                                                    <label className="block text-xs text-gray-500 mb-0.5">To</label>
                                                                    <input type="text" readOnly value={replyToEmail} className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-gray-50" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs text-gray-500 mb-0.5">CC</label>
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="email"
                                                                            value={replyNewCc}
                                                                            onChange={(e) => setReplyNewCc(e.target.value)}
                                                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReplyCc(); } }}
                                                                            placeholder="cc@example.com"
                                                                            className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={addReplyCc}
                                                                            className="px-2.5 py-1.5 text-xs font-medium bg-sky-200 text-sky-800 rounded hover:bg-sky-300"
                                                                        >
                                                                            Add
                                                                        </button>
                                                                    </div>
                                                                    {replyCc.length > 0 && (
                                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                                            {replyCc.map((email) => (
                                                                                <span
                                                                                    key={email}
                                                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700"
                                                                                >
                                                                                    <span className="truncate max-w-[180px]">{email}</span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => removeReplyCc(email)}
                                                                                        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-gray-200 text-gray-500"
                                                                                        aria-label={`Remove ${email}`}
                                                                                    >
                                                                                        <i className="fas fa-times text-[9px]"></i>
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs text-gray-500 mb-0.5">Subject</label>
                                                                    <input
                                                                        type="text"
                                                                        value={replySubject}
                                                                        onChange={(e) => setReplySubject(e.target.value)}
                                                                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs text-gray-500 mb-0.5">Message</label>
                                                                    <textarea
                                                                        value={replyBody}
                                                                        onChange={(e) => setReplyBody(e.target.value)}
                                                                        rows={4}
                                                                        placeholder="Type your reply..."
                                                                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded resize-y"
                                                                    />
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={cancelReply}
                                                                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleSendReply}
                                                                        disabled={sendingReply || !replyBody.trim()}
                                                                        className="px-3 py-1.5 text-xs bg-sky-200 text-sky-800 rounded-lg hover:bg-sky-300 disabled:opacity-50"
                                                                    >
                                                                        {sendingReply ? <i className="fas fa-spinner fa-spin mr-1"></i> : null}
                                                                        Send reply
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                    </ul>
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
                                <p className="text-sm text-emerald-700">{result.message || 'Information Saved'}</p>
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
                            onClick={async () => {
                                try {
                                    await autoSaveTemplateIfChanged();
                                } catch (err) {
                                    console.warn('Auto-save email template failed:', err);
                                } finally {
                                    setEmailModalContext(null);
                                }
                            }}
                            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveTemplate}
                            disabled={savingTemplate || applyingAllMonths || contacts.length === 0}
                            className="px-4 py-2.5 text-sm font-medium text-[#0369a1] bg-[#e0f2fe] hover:bg-[#bae6fd] rounded-xl transition-colors border border-[#7dd3fc]"
                        >
                            {savingTemplate ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>Saving…</> : <><i className="fas fa-save mr-1.5"></i>Save for this month</>}
                        </button>
                        <button
                            type="button"
                            onClick={handleApplyToAllMonthsInYear}
                            disabled={savingTemplate || applyingAllMonths || contacts.length === 0}
                            className="px-4 py-2.5 text-sm font-medium text-violet-800 bg-violet-100 hover:bg-violet-200 rounded-xl transition-colors border border-violet-300"
                            title="Copy recipients, message, and schedule to January through December for this year. Subject and body are adjusted per month."
                        >
                            {applyingAllMonths ? (
                                <><i className="fas fa-spinner fa-spin mr-1.5"></i>Applying…</>
                            ) : (
                                <><i className="fas fa-calendar-alt mr-1.5"></i>Apply to all months ({selectedYear})</>
                            )}
                        </button>
                        {!savingTemplate && !applyingAllMonths && (justSaved || (lastSavedTemplate && !hasUnsavedChanges)) && (
                            <span className="text-xs text-emerald-600 font-medium">Saved</span>
                        )}
                        {!savingTemplate && !applyingAllMonths && hasUnsavedChanges && (
                            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
                        )}
                        {result?.source === 'applyAll' && result?.saved && (
                            <span className="text-xs text-emerald-600 font-medium">{result.message}</span>
                        )}
                        {result?.source === 'applyAll' && result?.error && (
                            <span className="text-xs text-red-600 font-medium">{result.error}</span>
                        )}
                        {result?.source === 'save' && result?.saved && (
                            <span className="text-xs text-emerald-600 font-medium">Saved changes</span>
                        )}
                        {result?.source === 'save' && result?.error && (
                            <span className="text-xs text-red-600 font-medium">{result.error}</span>
                        )}
                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={sending || applyingAllMonths || contacts.length === 0}
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
                <div className="modal-panel bg-white rounded-lg shadow-xl w-full max-w-md">
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
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400"
                                placeholder="e.g., Bank Statements"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400"
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
                                className="px-3 py-1.5 text-xs bg-sky-200 text-sky-800 rounded-lg hover:bg-sky-300"
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
        const genTemplateDocId = () =>
            `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        /** Single-level sub-docs only: strip invalid parents (self-ref, parent after child, nested sub as parent). */
        const sanitizeTemplateDocuments = (docs) => {
            const list = (docs || []).map(d => ({ ...d }));
            const idToIndex = new Map(list.map((d, i) => [String(d.templateDocId), i]));
            return list.map(d => {
                const p = d.parentTemplateDocId;
                if (p == null || String(p).trim() === '') {
                    return { ...d, parentTemplateDocId: null };
                }
                const pi = idToIndex.get(String(p));
                const ci = idToIndex.get(String(d.templateDocId));
                if (pi === undefined || ci === undefined || pi >= ci) {
                    return { ...d, parentTemplateDocId: null };
                }
                const parent = list[pi];
                if (parent.parentTemplateDocId != null && String(parent.parentTemplateDocId).trim() !== '') {
                    return { ...d, parentTemplateDocId: null };
                }
                return { ...d, parentTemplateDocId: String(p) };
            });
        };

        const ensureTemplateDocIds = (sectionsIn) =>
            (sectionsIn || []).map(sec => ({
                ...sec,
                documents: sanitizeTemplateDocuments(
                    (sec.documents || []).map(d => ({
                        ...d,
                        templateDocId:
                            d.templateDocId != null && String(d.templateDocId).trim() !== ''
                                ? String(d.templateDocId)
                                : genTemplateDocId(),
                        parentTemplateDocId:
                            d.parentTemplateDocId != null && String(d.parentTemplateDocId).trim() !== ''
                                ? String(d.parentTemplateDocId)
                                : null
                    }))
                )
            }));

        const [formData, setFormData] = useState(() => {
            if (editingTemplate) {
                return {
                    name: editingTemplate.name || '',
                    description: editingTemplate.description || '',
                    sections: ensureTemplateDocIds(parseSections(editingTemplate.sections))
                };
            }
            if (prefilledTemplate) {
                return {
                    name: prefilledTemplate.name || '',
                    description: prefilledTemplate.description || '',
                    sections: ensureTemplateDocIds(parseSections(prefilledTemplate.sections))
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
                    let docs = [...(sec.documents || [])];
                    const [removed] = docs.splice(drag.docIdx, 1);
                    docs.splice(dropDocIdx, 0, removed);
                    docs = sanitizeTemplateDocuments(docs);
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
                    sections: ensureTemplateDocIds(parseSections(editingTemplate.sections))
                });
            } else if (prefilledTemplate) {
                setFormData({
                    name: prefilledTemplate.name || '',
                    description: prefilledTemplate.description || '',
                    sections: ensureTemplateDocIds(parseSections(prefilledTemplate.sections))
                });
            } else {
                setFormData({ name: '', description: '', sections: [] });
            }
        }, [editingTemplate, prefilledTemplate]);

        const indentTemplateDocument = (sectionIdx, docIdx) => {
            setFormData(prev => {
                const newSections = prev.sections.map((sec, i) => {
                    if (i !== sectionIdx) return sec;
                    const docs = [...(sec.documents || [])];
                    if (docIdx <= 0) return sec;
                    const prevDoc = docs[docIdx - 1];
                    if (!prevDoc?.templateDocId) return sec;
                    const prevIsRoot =
                        !prevDoc.parentTemplateDocId ||
                        String(prevDoc.parentTemplateDocId).trim() === '';
                    const cur = { ...docs[docIdx] };
                    // Under row above if it is top-level; otherwise same parent as row above (sibling sub-docs).
                    cur.parentTemplateDocId = prevIsRoot
                        ? String(prevDoc.templateDocId)
                        : String(prevDoc.parentTemplateDocId);
                    docs[docIdx] = cur;
                    return { ...sec, documents: sanitizeTemplateDocuments(docs) };
                });
                return { ...prev, sections: newSections };
            });
        };

        const outdentTemplateDocument = (sectionIdx, docIdx) => {
            setFormData(prev => {
                const newSections = prev.sections.map((sec, i) => {
                    if (i !== sectionIdx) return sec;
                    const docs = [...(sec.documents || [])];
                    const cur = docs[docIdx];
                    if (
                        !cur ||
                        cur.parentTemplateDocId == null ||
                        String(cur.parentTemplateDocId).trim() === ''
                    ) {
                        return sec;
                    }
                    docs[docIdx] = { ...cur, parentTemplateDocId: null };
                    return { ...sec, documents: sanitizeTemplateDocuments(docs) };
                });
                return { ...prev, sections: newSections };
            });
        };

        const removeTemplateDocument = (sectionIdx, docIdx) => {
            setFormData(prev => {
                const newSections = prev.sections.map((sec, i) => {
                    if (i !== sectionIdx) return sec;
                    let docs = [...(sec.documents || [])];
                    const removed = docs[docIdx];
                    const removedId = removed?.templateDocId;
                    docs = docs.filter((_, j) => j !== docIdx);
                    if (removedId) {
                        const rid = String(removedId);
                        docs = docs.map(d =>
                            String(d.parentTemplateDocId) === rid
                                ? { ...d, parentTemplateDocId: null }
                                : d
                        );
                    }
                    docs = sanitizeTemplateDocuments(docs);
                    return { ...sec, documents: docs };
                });
                return { ...prev, sections: newSections };
            });
        };
        
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
            const payload = {
                ...formData,
                type: editingTemplate ? (editingTemplate.type || templateApiType) : templateApiType,
                sections: (formData.sections || []).map(sec => ({
                    ...sec,
                    documents: sanitizeTemplateDocuments(
                        (sec.documents || []).map(d => ({
                            ...d,
                            templateDocId:
                                d.templateDocId != null && String(d.templateDocId).trim() !== ''
                                    ? String(d.templateDocId)
                                    : genTemplateDocId()
                        }))
                    )
                }))
            };
            saveTemplate(payload);
        };
        
        if (showTemplateList) {
            return (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="modal-panel bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Template Management</h2>
                            <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-xs text-gray-600">
                                    {isMonthlyDataReview
                                        ? 'Manage your monthly data review templates'
                                        : 'Manage your document collection templates'}
                                </p>
                                <button
                                    onClick={() => {
                                        setEditingTemplate(null);
                                        setShowTemplateList(false);
                                    }}
                                    className="px-3 py-1.5 bg-sky-200 text-sky-800 rounded-lg hover:bg-sky-300 text-xs font-medium"
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
                <div className="modal-panel bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
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
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400"
                                placeholder="e.g., Standard Monthly Checklist"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400"
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
                                    className="px-2 py-1 bg-sky-200 text-sky-800 rounded text-[10px] font-medium"
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
                                                    newSections[idx].documents.push({
                                                        name: '',
                                                        description: '',
                                                        templateDocId: genTemplateDocId(),
                                                        parentTemplateDocId: null
                                                    });
                                                    setFormData({...formData, sections: newSections});
                                                }}
                                                className="px-1.5 py-0.5 bg-gray-600 text-white rounded text-[9px] font-medium"
                                            >
                                                <i className="fas fa-plus mr-0.5"></i>
                                                Add
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-1 mt-1">
                                            {(section.documents || []).map((doc, docIdx) => {
                                                const isSub =
                                                    doc.parentTemplateDocId != null &&
                                                    String(doc.parentTemplateDocId).trim() !== '';
                                                const prevDoc =
                                                    docIdx > 0 ? (section.documents || [])[docIdx - 1] : null;
                                                const prevIsRoot =
                                                    prevDoc &&
                                                    (prevDoc.parentTemplateDocId == null ||
                                                        String(prevDoc.parentTemplateDocId).trim() === '');
                                                const prevHasParent =
                                                    prevDoc &&
                                                    prevDoc.parentTemplateDocId != null &&
                                                    String(prevDoc.parentTemplateDocId).trim() !== '';
                                                const canIndent =
                                                    docIdx > 0 &&
                                                    !!prevDoc?.templateDocId &&
                                                    (prevIsRoot || prevHasParent);
                                                return (
                                                <div
                                                    key={doc.templateDocId || docIdx}
                                                    draggable
                                                    onDragStart={(e) => handleTemplateDocDragStart(idx, docIdx, e)}
                                                    onDragEnd={handleTemplateDocDragEnd}
                                                    onDragOver={(e) => handleTemplateDocDragOver(e, idx, docIdx)}
                                                    onDragLeave={handleTemplateDocDragLeave}
                                                    onDrop={(e) => handleTemplateDocDrop(e, idx, docIdx)}
                                                    className={`flex items-center gap-1 bg-white p-1.5 rounded border transition-colors cursor-grab active:cursor-grabbing ${isSub ? 'ml-4 border-l-2 border-sky-200' : ''} ${dragOverTemplateDoc.sectionIdx === idx && dragOverTemplateDoc.docIdx === docIdx ? 'border-sky-300 ring-1 ring-sky-200 bg-sky-50' : 'border-gray-200'}`}
                                                >
                                                    <span className="inline-flex cursor-grab active:cursor-grabbing text-gray-400 flex-shrink-0" title="Drag to reorder">
                                                        <i className="fas fa-grip-vertical text-[9px]"></i>
                                                    </span>
                                                    <div className="inline-flex items-center gap-0.5 flex-shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => outdentTemplateDocument(idx, docIdx)}
                                                            disabled={!isSub}
                                                            title="Top-level document"
                                                            className="text-gray-500 hover:text-gray-800 disabled:opacity-25 disabled:pointer-events-none p-0.5 rounded hover:bg-gray-100"
                                                            aria-label="Make top-level document"
                                                        >
                                                            <i className="fas fa-outdent text-[9px]" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => indentTemplateDocument(idx, docIdx)}
                                                            disabled={!canIndent}
                                                            title="Sub-document: under row above, or same parent as row above if it is already indented"
                                                            className="text-gray-500 hover:text-gray-800 disabled:opacity-25 disabled:pointer-events-none p-0.5 rounded hover:bg-gray-100"
                                                            aria-label="Make sub-document of row above"
                                                        >
                                                            <i className="fas fa-indent text-[9px]" />
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={doc.name}
                                                        onChange={(e) => {
                                                            const newSections = [...formData.sections];
                                                            newSections[idx].documents[docIdx].name = e.target.value;
                                                            setFormData({...formData, sections: newSections});
                                                        }}
                                                        className="flex-1 min-w-0 px-1.5 py-0.5 text-[10px] border border-gray-300 rounded"
                                                        placeholder="Document name *"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeTemplateDocument(idx, docIdx)}
                                                        className="text-red-600 hover:text-red-800 p-0.5 flex-shrink-0"
                                                        aria-label="Remove document"
                                                    >
                                                        <i className="fas fa-times text-[9px]"></i>
                                                    </button>
                                                </div>
                                                );
                                            })}
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
                                className="px-3 py-1.5 text-xs bg-sky-200 text-sky-800 rounded-lg hover:bg-sky-300"
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
                <div className="modal-panel bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Apply Template</h2>
                        <button onClick={() => setShowApplyTemplateModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1">
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
                                    className="px-3 py-1.5 bg-sky-200 text-sky-800 rounded-lg hover:bg-sky-300 text-xs font-medium"
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
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400"
                                    >
                                        <option value="">—</option>
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
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400"
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
                                        className="px-3 py-1.5 text-xs bg-blue-200 text-blue-800 rounded-lg hover:bg-blue-300 disabled:opacity-50"
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
                    <i className="fas fa-spinner fa-spin text-3xl text-sky-600 dark:text-sky-400 mb-3"></i>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Loading document collection tracker...</p>
                    {loadingSlow && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Taking longer than usual — still loading. You can retry by refreshing the page.</p>
                    )}
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
                const activityTypeLabel = (t) => {
                    if (t === 'document_section_status_change') return 'Status';
                    if (t === 'document_section_notes_change') return 'Notes';
                    if (t === 'document_section_email_request_change') return 'Email template';
                    if (t === 'monthly_data_review_status_change') return 'Status';
                    if (t === 'monthly_data_review_notes_change') return 'Notes';
                    if (t === 'compliance_review_status_change') return 'Status';
                    if (t === 'compliance_review_notes_change') return 'Notes';
                    if (t === 'weekly_fms_status_change') return 'Status';
                    return 'Activity';
                };
                let activityRows = [];
                if (!isJsonOnlyTracker) {
                    activityRows = Array.isArray(cellActivityTimeline) ? cellActivityTimeline : [];
                } else {
                    const apiActivity = (Array.isArray(cellActivityTimeline) ? cellActivityTimeline : []).filter(
                        (r) => r && r.kind === 'activity'
                    );
                    let localComments = doc ? getDocumentComments(doc, month) : [];
                    let urlCommentId = null;
                    if (typeof window !== 'undefined' && localComments.length === 0) {
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
                    if (localComments.length === 0 && urlCommentId) {
                        const idStr = String(urlCommentId);
                        const idNum = parseInt(urlCommentId, 10);
                        const matchId = (c) => c && (String(c.id) === idStr || c.id === idNum || c.id === urlCommentId);
                        if (doc?.comments && typeof doc.comments === 'object') {
                            for (const key of Object.keys(doc.comments)) {
                                const arr = Array.isArray(doc.comments[key]) ? doc.comments[key] : [];
                                const found = arr.find(matchId);
                                if (found) {
                                    localComments = [found];
                                    break;
                                }
                            }
                        }
                        if (localComments.length === 0 && sectionsByYear && typeof sectionsByYear === 'object') {
                            for (const year of Object.keys(sectionsByYear).filter(isSectionsYearMapDataKey)) {
                                const secs = sectionsByYear[year] || [];
                                const sec = secs.find(s => String(s.id) === String(rawSectionId));
                                const d = sec?.documents?.find(dd => String(dd.id) === String(rawDocumentId));
                                if (!d?.comments || typeof d.comments !== 'object') continue;
                                for (const key of Object.keys(d.comments)) {
                                    const arr = Array.isArray(d.comments[key]) ? d.comments[key] : [];
                                    const found = arr.find(matchId);
                                    if (found) {
                                        localComments = [found];
                                        break;
                                    }
                                }
                                if (localComments.length > 0) break;
                            }
                        }
                    }
                    const commentRows = localComments
                        .filter((c) => {
                            const author = (c?.author || '').trim();
                            return author !== 'Sent request (platform)' && author !== 'Sent reply (platform)';
                        })
                        .map((c) => ({
                        id: `comment-${c.id}`,
                        kind: 'comment',
                        commentId: c.id,
                        text: c.text,
                        author: c.author,
                        authorId: c.authorId,
                        attachments: Array.isArray(c.attachments) ? c.attachments : [],
                        createdAt: c.createdAt || c.date,
                        updatedAt: c.updatedAt
                    }));
                    activityRows = [...apiActivity, ...commentRows].sort((x, y) => {
                        const tx = new Date(x.createdAt).getTime();
                        const ty = new Date(y.createdAt).getTime();
                        return tx - ty;
                    });
                }
                
                return (
                    <>
                        {/* Comment Popup */}
                        <div 
                            className="comment-popup fixed w-80 max-w-[90vw] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl p-3 z-[999] flex flex-col max-h-[min(85vh,520px)]"
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
                        <div className="mb-3 flex flex-col min-h-0 flex-1 overflow-hidden">
                            <div className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Activity</div>
                            {cellActivityLoading && activityRows.length === 0 ? (
                                <div className="py-4 min-h-[120px] flex items-center justify-center text-center text-[11px] text-gray-500 dark:text-gray-400">
                                    Loading activity…
                                </div>
                            ) : activityRows.length > 0 ? (
                                <div 
                                    key={`activity-container-${hoverCommentCell}`}
                                    ref={commentPopupContainerRef}
                                    className="comment-scroll-container mb-2 overflow-y-auto max-h-[min(45vh,280px)] flex-shrink min-h-0"
                                >
                                    <div className="space-y-2 pr-1">
                                        {activityRows.map((row, idx) => {
                                            if (row.kind === 'activity') {
                                                return (
                                                    <div
                                                        key={row.id || idx}
                                                        className="pb-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 bg-slate-50 dark:bg-slate-900/50 rounded p-1.5"
                                                    >
                                                        <div className="text-[9px] font-semibold text-sky-700 dark:text-sky-400 mb-0.5">{activityTypeLabel(row.activityType)}</div>
                                                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{row.description}</p>
                                                        <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                            <span className="font-medium truncate pr-1">{row.userName || 'System'}</span>
                                                            <span className="shrink-0">{row.createdAt ? formatDateTime(row.createdAt) : ''}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            if (row.kind === 'email_sent') {
                                                return (
                                                    <div
                                                        key={row.id || idx}
                                                        className="pb-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 bg-emerald-50/90 dark:bg-emerald-950/30 rounded p-1.5 relative group"
                                                    >
                                                        <div className="text-[9px] font-semibold text-emerald-800 dark:text-emerald-300 mb-0.5">Email sent</div>
                                                        <p className="text-xs text-gray-800 dark:text-gray-200 pr-6">{row.subject || '(no subject)'}</p>
                                                        {row.deliveryStatus ? (
                                                            <span className="text-[9px] text-gray-500 dark:text-gray-400">{row.deliveryStatus}</span>
                                                        ) : null}
                                                        <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                            <span />
                                                            <span>{row.createdAt ? formatDateTime(row.createdAt) : ''}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                if (!project?.id || !row.logId) return;
                                                                if (!confirm('Remove this sent email from activity?')) return;
                                                                setDeletingCellEmailLogId(row.logId);
                                                                const base = typeof window !== 'undefined' && window.location ? window.location.origin : '';
                                                                const token = (typeof window !== 'undefined' && (window.storage?.getToken?.() ?? localStorage.getItem('authToken') ?? localStorage.getItem('auth_token') ?? localStorage.getItem('abcotronics_token') ?? localStorage.getItem('token'))) || '';
                                                                try {
                                                                    const url = `${base}/api/projects/${project.id}/document-collection-email-activity?id=${encodeURIComponent(row.logId)}&type=sent`;
                                                                    const res = await fetch(url, {
                                                                        method: 'DELETE',
                                                                        credentials: 'include',
                                                                        headers: {
                                                                            Accept: 'application/json',
                                                                            'Content-Type': 'application/json',
                                                                            ...(token ? { Authorization: `Bearer ${token}` } : {})
                                                                        },
                                                                        body: JSON.stringify({ id: row.logId, type: 'sent' })
                                                                    });
                                                                    const json = await res.json().catch(() => ({}));
                                                                    const data = json.data != null ? json.data : json;
                                                                    if (res.ok && data.deleted) {
                                                                        setCellActivityBump((b) => b + 1);
                                                                    } else {
                                                                        alert(data.error || json.error || 'Failed to delete');
                                                                    }
                                                                } catch (err) {
                                                                    alert(err.message || 'Failed to delete');
                                                                } finally {
                                                                    setDeletingCellEmailLogId(null);
                                                                }
                                                            }}
                                                            disabled={deletingCellEmailLogId === row.logId}
                                                            className="absolute top-1 right-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                                            title="Remove sent email from list"
                                                        >
                                                            <i className="fas fa-trash text-[10px]" />
                                                        </button>
                                                    </div>
                                                );
                                            }
                                            const comment = row;
                                            const cid = comment.commentId;
                                            return (
                                        <div 
                                            key={comment.id || cid || idx} 
                                            data-comment-id={cid}
                                            id={cid ? `comment-${cid}` : undefined}
                                            className="pb-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 bg-gray-50 dark:bg-gray-900/40 rounded p-1.5 relative group cursor-pointer"
                                            onClick={(e) => {
                                                const ce = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
                                                if (ce?.closest?.('[data-comment-attachment]') || ce?.closest?.('[data-comment-attachment-area]')) {
                                                    e.stopPropagation();
                                                    return;
                                                }
                                                if (section && doc && cid) {
                                                    const deepLinkUrl = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(section.id)}&docDocumentId=${encodeURIComponent(doc.id)}&docMonth=${encodeURIComponent(month)}&docYear=${encodeURIComponent(selectedYear)}&tab=${encodeURIComponent(trackerTabForDeepLink)}&commentId=${encodeURIComponent(cid)}`;
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
                                                    const fullUrl = window.location.origin + window.location.pathname + deepLinkUrl;
                                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                                        navigator.clipboard.writeText(fullUrl).then(() => {
                                                            const button = window.document.querySelector(`[data-copy-link="${cid}"]`);
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
                                                className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap pr-12"
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
                                                <span>{(comment.createdAt || comment.date) ? (() => {
                                                    try {
                                                        const date = new Date(comment.createdAt || comment.date);
                                                        if (isNaN(date.getTime())) return 'Invalid Date';
                                                        return formatDateTime(comment.createdAt || comment.date);
                                                    } catch (e) {
                                                        return 'Invalid Date';
                                                    }
                                                })() : 'No date'}</span>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!section || !doc || !cid) return;
                                                    handleDeleteComment(section.id, doc.id, month, cid);
                                                }}
                                                className="absolute top-1 right-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                type="button"
                                                title="Delete comment"
                                            >
                                                <i className="fas fa-trash text-[10px]"></i>
                                            </button>
                                            <button
                                                data-copy-link={cid}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!section || !doc || !cid) return;
                                                    
                                                    const deepLinkUrl = `#/projects/${project?.id || ''}?docSectionId=${encodeURIComponent(section.id)}&docDocumentId=${encodeURIComponent(doc.id)}&docMonth=${encodeURIComponent(month)}&docYear=${encodeURIComponent(selectedYear)}&tab=${encodeURIComponent(trackerTabForDeepLink)}&commentId=${encodeURIComponent(cid)}`;
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
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="py-3 px-2 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 text-center">
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">No activity yet</p>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Changes and comments appear here</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-shrink-0">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Add Comment</span>
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
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-sky-400"
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
                                        className="mt-1.5 w-full px-2 py-1 bg-sky-200 text-sky-800 rounded text-[10px] font-medium hover:bg-sky-300 disabled:opacity-50"
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
            
            {/* Header - compact toolbar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 p-3 mb-4">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <button
                                onClick={onBack}
                                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors shrink-0"
                                aria-label="Back"
                            >
                                <i className="fas fa-arrow-left"></i>
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {isMonthlyDataReview ? 'Monthly Data Review' : isComplianceReview ? 'Compliance Review' : 'Document Collection Tracker'}
                                </h1>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {project?.name}
                                    {project?.client && ` • ${project.client}`}
                                    {!isJsonOnlyTracker && getFacilitiesLabel(project) && ` • ${getFacilitiesLabel(project)}`}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600">
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Year</label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const newYear = parseInt(e.target.value, 10);
                                        if (!isNaN(newYear)) handleYearChange(newYear);
                                    }}
                                    onBlur={(e) => {
                                        const newYear = parseInt(e.target.value, 10);
                                        if (!isNaN(newYear) && newYear !== selectedYear) handleYearChange(newYear);
                                    }}
                                    aria-label="Select year"
                                    data-testid="year-selector"
                                    className="text-xs font-medium text-gray-900 dark:text-gray-100 bg-transparent border-0 focus:ring-0 cursor-pointer py-0.5"
                                >
                                    {yearOptions.map(year => (
                                        <option key={year} value={year}>{year}{year === currentYear && ' (Current)'}</option>
                                    ))}
                                </select>
                            </div>
                            <div
                                className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600"
                                role="group"
                                aria-label="Tracker layout"
                            >
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 hidden sm:inline">View</span>
                                <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
                                    <button
                                        type="button"
                                        onClick={() => setTrackerLayoutMode('list')}
                                        className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                                            trackerLayoutMode === 'list'
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                        aria-pressed={trackerLayoutMode === 'list'}
                                        title="List — one month per row, full width"
                                    >
                                        <i className="fas fa-list-ul mr-1" aria-hidden="true" />
                                        List
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTrackerLayoutMode('table')}
                                        className={`px-2.5 py-1 text-xs font-semibold transition-colors border-l border-gray-300 dark:border-gray-600 ${
                                            trackerLayoutMode === 'table'
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                        aria-pressed={trackerLayoutMode === 'table'}
                                        title="Grid — full year table (scroll horizontally on small screens)"
                                    >
                                        <i className="fas fa-table mr-1" aria-hidden="true" />
                                        Grid
                                    </button>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleAddSection}
                                className="px-3 py-1.5 bg-sky-200 dark:bg-sky-700 text-sky-800 dark:text-sky-100 rounded-lg hover:bg-sky-300 dark:hover:bg-sky-600 text-xs font-semibold flex items-center gap-1.5"
                            >
                                <i className="fas fa-plus"></i><span>Add Section</span>
                            </button>
                            {isComplianceReview && (
                                <>
                                    <input
                                        type="file"
                                        ref={complianceImportFileInputRef}
                                        accept=".xlsx"
                                        className="hidden"
                                        onChange={handleComplianceImportFileChange}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleImportFromExcelClick}
                                        disabled={isImportingExcel}
                                        className="px-3 py-1.5 bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-100 rounded-lg hover:bg-amber-300 dark:hover:bg-amber-600 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                        title="Import sections from Compliance Monthly Assessment Excel (.xlsx)"
                                    >
                                        {isImportingExcel ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-import"></i>}
                                        <span>{isImportingExcel ? 'Importing…' : 'Import from Excel'}</span>
                                    </button>
                                </>
                            )}
                            <div className="relative" ref={templateDropdownRef}>
                                <button
                                    onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                    className="px-3 py-1.5 bg-blue-200 dark:bg-blue-700 text-blue-800 dark:text-blue-100 rounded-lg hover:bg-blue-300 dark:hover:bg-blue-600 text-xs font-semibold flex items-center gap-1.5"
                                >
                                    <i className="fas fa-layer-group"></i><span>Templates</span>
                                    <i className={`fas fa-chevron-${isTemplateDropdownOpen ? 'up' : 'down'} text-xs`}></i>
                                </button>
                                
                                {isTemplateDropdownOpen && (
                                    <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-50">
                                        <button
                                            onClick={() => {
                                                setShowApplyTemplateModal(true);
                                                setIsTemplateDropdownOpen(false);
                                            }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-primary-900/40 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2 transition-colors"
                                        >
                                            <i className="fas fa-magic text-primary-600 dark:text-primary-400"></i>
                                            <span>Apply Template</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowTemplateModal(true);
                                                setIsTemplateDropdownOpen(false);
                                            }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-2 transition-colors"
                                        >
                                            <i className="fas fa-layer-group text-blue-600 dark:text-blue-400"></i>
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
                                            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/40 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-2 transition-colors"
                                            title="Save current year as template"
                                        >
                                            <i className="fas fa-save text-amber-600 dark:text-amber-400"></i>
                                            <span>Save Template</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleExportToExcel}
                                disabled={isExporting || sections.length === 0}
                                className="px-3 py-1.5 bg-emerald-200 dark:bg-emerald-700 text-emerald-800 dark:text-emerald-100 rounded-lg hover:bg-emerald-300 dark:hover:bg-emerald-600 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                                {isExporting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-excel"></i>}
                                <span>{isExporting ? 'Exporting…' : 'Export'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Legend - collapsible to reduce clutter */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-600 mb-4 shadow-sm overflow-hidden bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
                <button
                    type="button"
                    onClick={() => setLegendCollapsed(!legendCollapsed)}
                                    className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-sky-50/80 dark:hover:bg-sky-900/30 transition-colors"
                    aria-expanded={!legendCollapsed}
                >
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Status legend</span>
                    <i className={`fas fa-chevron-${legendCollapsed ? 'down' : 'up'} text-gray-500 dark:text-gray-400 text-xs`}></i>
                </button>
                {!legendCollapsed && (
                    <div className="px-3 pb-3 pt-0 flex flex-wrap items-center gap-3">
                        {statusOptions.map((option, idx) => (
                            <React.Fragment key={option.value}>
                                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                    <div className={`w-3.5 h-3.5 rounded-full ${option.cellColor} ring-2 ring-white dark:ring-gray-700 shadow-sm`}></div>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{option.label}</span>
                                </div>
                                {idx < statusOptions.length - 1 && <i className="fas fa-arrow-right text-[10px] text-gray-400 dark:text-gray-500"></i>}
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Per-section tables with independent horizontal scroll */}
            <div ref={scrollSyncRootRef} className="space-y-3" data-scroll-sync-root>
                {sections.length === 0 ? (
                    (() => {
                        const yearsWithSections = Object.keys(sectionsByYear || {})
                            .filter((y) => isSectionsYearMapDataKey(y) && (sectionsByYear[y] || []).length > 0)
                            .map((y) => parseInt(y, 10))
                            .filter((y) => !Number.isNaN(y))
                            .sort((a, b) => b - a);
                        const hasDataInOtherYears = yearsWithSections.length > 0;
                        const bestYear = yearsWithSections[0];
                        return (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-sky-100 to-sky-200 dark:from-sky-900 dark:to-sky-800 rounded-full flex items-center justify-center">
                                <i className="fas fa-folder-open text-3xl text-sky-600 dark:text-sky-400"></i>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">No sections yet</p>
                                {hasDataInOtherYears ? (
                                    <>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">No sections for <strong>{selectedYear}</strong>. {isMonthlyDataReview ? 'Monthly Data Review' : isComplianceReview ? 'Compliance Review' : 'Document collection'} has data for {yearsWithSections.join(', ')}.</p>
                                        <p className="text-sm text-sky-600 dark:text-sky-400 mt-2">Change the <strong>Year</strong> dropdown above, or click below to view that year.</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Create your first section to start organizing documents, or apply a <strong>Template</strong> from the menu above.</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 max-w-md mx-auto">
                                            If this project used to have a full grid, the server may have no rows saved yet (new project, or data not migrated from an old export). In DevTools → Network, open <code className="bg-gray-100 dark:bg-gray-800 px-0.5 rounded">document-sections-v2</code>: a <strong>200</strong> body of <code className="bg-gray-100 dark:bg-gray-800 px-0.5 rounded">{'{}'}</code> or empty years means there is nothing in the database to show—not a display bug.
                                        </p>
                                    </>
                                )}
                                {!hasDataInOtherYears && (
                                <p className="text-xs text-amber-700 dark:text-amber-300 mt-3 p-2 bg-amber-50 dark:bg-amber-900/30 rounded border border-amber-200 dark:border-amber-700">
                                    <strong>Works in another browser but not here?</strong> Likely cache or an extension. Use <strong>Clear cache & reload</strong> below, or try Incognito/Private. Or F12 → Network and check <code className="bg-amber-100 dark:bg-amber-900/50 px-0.5">document-sections-v2</code>.
                                </p>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {hasDataInOtherYears && bestYear != null && bestYear !== selectedYear && (
                                    <button
                                        onClick={() => copyYearData(bestYear, selectedYear)}
                                        className="px-4 py-2 bg-emerald-200 dark:bg-emerald-700 text-emerald-800 dark:text-emerald-100 rounded-lg hover:bg-emerald-300 dark:hover:bg-emerald-600 text-sm font-semibold flex items-center gap-2"
                                    >
                                        <i className="fas fa-arrow-right"></i>
                                        <span>Copy {bestYear} → {selectedYear}</span>
                                    </button>
                                )}
                                {hasDataInOtherYears && bestYear != null && (
                                    <button
                                        onClick={() => handleYearChange(bestYear)}
                                        className="px-4 py-2 bg-sky-200 dark:bg-sky-700 text-sky-800 dark:text-sky-100 rounded-lg hover:bg-sky-300 dark:hover:bg-sky-600 text-sm font-semibold"
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
                                    className="px-4 py-2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 text-sm font-medium border border-amber-300 dark:border-amber-700"
                                >
                                    Clear cache & reload
                                </button>
                                <button
                                    onClick={() => { if (project?.id) loadData(); }}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium disabled:opacity-50"
                                >
                                    {isLoading ? 'Loading…' : 'Retry load'}
                                </button>
                                {!isJsonOnlyTracker && (
                                    <button
                                        type="button"
                                        onClick={handleRestoreFromBackup}
                                        className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-800 text-sm font-medium border border-emerald-300 dark:border-emerald-700"
                                        title="Restore from last backup saved in this browser (e.g. recover File 6 after a failed save)"
                                    >
                                        <i className="fas fa-undo mr-1"></i> Restore from browser backup
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleAddSection}
                                    className="px-6 py-3 bg-sky-200 dark:bg-sky-700 text-sky-800 dark:text-sky-100 rounded-lg hover:bg-sky-300 dark:hover:bg-sky-600 text-sm font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
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
                            className={`bg-white dark:bg-gray-800 rounded-xl border shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${dragOverIndex === sectionIndex ? 'ring-2 ring-sky-400 ring-offset-2 dark:ring-offset-gray-900 border-sky-300 dark:border-sky-500' : 'border-gray-200 dark:border-gray-600'}`}
                            draggable="true"
                            onDragStart={(e) => handleSectionDragStart(e, section, sectionIndex)}
                            onDragEnd={handleSectionDragEnd}
                            onDragOver={(e) => handleSectionDragOver(e, sectionIndex)}
                            onDragLeave={handleSectionDragLeave}
                            onDrop={(e) => handleSectionDrop(e, sectionIndex)}
                        >
                            {/* Section header */}
                            <div className="px-4 py-3 rounded-t-xl bg-gradient-to-r from-gray-50 to-white dark:from-gray-700 dark:to-gray-800 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between cursor-grab active:cursor-grabbing">
                                <div className="flex items-center gap-3 flex-1">
                                    <i className="fas fa-grip-vertical text-gray-400 dark:text-gray-500 text-sm"></i>
                                    <div className="flex-1">
                                        <div className="font-bold text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                            <span>#{sectionIndex + 1}</span>
                                            <span>{section.name}</span>
                                        </div>
                                        {section.description && (
                                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{section.description}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="relative" data-section-actions-dropdown>
                                    <button
                                        type="button"
                                        onClick={() => setSectionActionsOpenId(prev => prev === section.id ? null : section.id)}
                                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
                                        title="Section actions"
                                        aria-expanded={sectionActionsOpenId === section.id}
                                        aria-haspopup="true"
                                    >
                                        <i className="fas fa-ellipsis-v text-sm"></i>
                                        <span className="ml-1.5 text-xs font-medium">Actions</span>
                                    </button>
                                    {sectionActionsOpenId === section.id && (
                                        <div className="absolute right-0 mt-1 w-48 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-50">
                                            <button
                                                type="button"
                                                onClick={() => { handleAddDocument(section.id); setSectionActionsOpenId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/40 hover:text-sky-700 dark:hover:text-sky-300 flex items-center gap-2"
                                            >
                                                <i className="fas fa-plus text-sky-600 dark:text-sky-400"></i>
                                                <span>Add Document</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { handleEditSection(section); setSectionActionsOpenId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                            >
                                                <i className="fas fa-edit text-gray-500 dark:text-gray-400"></i>
                                                <span>Edit section</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { handleDeleteSection(section.id, e); setSectionActionsOpenId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"
                                            >
                                                <i className="fas fa-trash"></i>
                                                <span>Delete section</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {trackerLayoutMode === 'list' ? (
                                <div className="px-3 pb-4 pt-2 space-y-8 border-t border-gray-100 dark:border-gray-700 rounded-b-xl">
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                        <i className="fas fa-list-ul mr-1 opacity-70" aria-hidden="true" />
                                        List view — one card per month; use Grid for the full year table.
                                    </p>
                                    {renderListRowsForSection(section)}
                                </div>
                            ) : (
                                <>
                            {/* Horizontal scroll only: overflow-x:auto with overflow-y:visible computes to y=auto and breaks sticky thead in Chromium; clip keeps vertical stickiness to the viewport. */}
                                <div data-scroll-sync className="overflow-x-auto overflow-y-clip rounded-b-xl">
                                    <table className="min-w-full border-separate border-spacing-0 divide-y divide-gray-200 dark:divide-gray-600">
                                        <thead className="bg-gradient-to-b from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 relative">
                                        {isJsonOnlyTracker ? (
                                            <>
                                                <tr>
                                                    <th
                                                        rowSpan={2}
                                                        className="px-4 py-2 text-left text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider sticky left-0 top-0 z-[45] bg-gradient-to-b from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 border-r-2 border-gray-300 dark:border-gray-600 shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.06)]"
                                                        style={stickyFirstColStyle}
                                                    >
                                                        Document / Data
                                                    </th>
                                                    {months.map((month, idx) => (
                                                        <th
                                                            key={month}
                                                            colSpan={2}
                                                            data-month-header-index={idx}
                                                            className={`px-2 py-2 text-center text-xs font-bold uppercase tracking-wider border-l-4 border-b-2 border-gray-400 dark:border-gray-600 sticky top-0 z-[35] shadow-[0_1px_0_0_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] ${
                                                                isOneMonthArrears(selectedYear, idx)
                                                                    ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border-sky-400 dark:border-sky-500'
                                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                            }`}
                                                        >
                                                            <div className="relative flex items-center justify-center min-h-[2.75rem] px-0.5">
                                                                {isMonthlyDataReview ? (
                                                                    <button
                                                                        type="button"
                                                                        className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 p-0.5 rounded-md text-green-700 dark:text-green-400 hover:bg-white/70 dark:hover:bg-gray-900/40 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1 focus:ring-offset-sky-100 dark:focus:ring-offset-sky-900 ${
                                                                            getMdrDriveUrl(sectionsByYear, selectedYear, idx)
                                                                                ? 'opacity-100'
                                                                                : 'opacity-55'
                                                                        }`}
                                                                        onClick={(e) => handleMdrDriveIconClick(e, idx)}
                                                                        onMouseEnter={() => handleMdrDriveIconMouseEnter(idx)}
                                                                        onMouseLeave={handleMdrDriveIconMouseLeave}
                                                                        title="Hover 2 seconds to set folder link · Click to open saved link"
                                                                        aria-label={`Google Drive folder for ${month} ${selectedYear}`}
                                                                    >
                                                                        <i className="fab fa-google-drive text-base leading-none" aria-hidden="true" />
                                                                    </button>
                                                                ) : null}
                                                                <div
                                                                    className={`flex flex-col items-center gap-0.5 ${isMonthlyDataReview ? 'pl-5' : ''}`}
                                                                >
                                                                    <span>{month.slice(0, 3)}</span>
                                                                    <span className="text-[10px] font-normal">{String(selectedYear).slice(-2)}</span>
                                                                </div>
                                                            </div>
                                                        </th>
                                                    ))}
                                                    <th
                                                        rowSpan={2}
                                                        className="px-4 py-2 text-left text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider border-l-4 border-gray-400 dark:border-gray-600 bg-gradient-to-b from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 sticky top-0 z-[35] shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.06)]"
                                                    >
                                                        Actions
                                                    </th>
                                                </tr>
                                                <tr>
                                                    {months.map((month, idx) => (
                                                        <React.Fragment key={month}>
                                                            <th
                                                                className={`px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider border-l-4 border-t border-gray-400 dark:border-gray-600 sticky z-[34] shadow-[0_1px_0_0_rgba(0,0,0,0.06)] ${jsonTrackerHeaderRow2TopClass} ${
                                                                    isOneMonthArrears(selectedYear, idx)
                                                                        ? 'bg-sky-50 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border-sky-400 dark:border-sky-500'
                                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                                                }`}
                                                                style={{ minWidth: jsonTrackerStatusColPx, width: jsonTrackerStatusColPx }}
                                                            >
                                                                Status
                                                            </th>
                                                            <th
                                                                className={`px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider border-l-2 border-t border-gray-300 dark:border-gray-600 sticky z-[34] shadow-[0_1px_0_0_rgba(0,0,0,0.06)] ${jsonTrackerHeaderRow2TopClass} ${
                                                                    isOneMonthArrears(selectedYear, idx)
                                                                        ? 'bg-sky-50 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-600'
                                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                                                }`}
                                                                style={{ minWidth: jsonTrackerNotesColPx, width: jsonTrackerNotesColPx }}
                                                            >
                                                                Notes
                                                            </th>
                                                        </React.Fragment>
                                                    ))}
                                                </tr>
                                            </>
                                        ) : (
                                        <tr>
                                            <th
                                                className="px-4 py-2 text-left text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider sticky left-0 bg-gradient-to-b from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 z-20 border-r-2 border-gray-300 dark:border-gray-600"
                                                style={stickyFirstColStyle}
                                            >
                                                Document / Data
                                            </th>
                                            {months.map((month, idx) => (
                                                <th
                                                    key={month}
                                                    data-month-header-index={idx}
                                                    className={`px-3 py-2 text-center text-xs font-bold uppercase tracking-wider border-l-2 border-gray-200 dark:border-gray-600 ${
                                                        isOneMonthArrears(selectedYear, idx)
                                                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border-sky-300 dark:border-sky-600'
                                                            : 'text-gray-700 dark:text-gray-300'
                                                    }`}
                                                    style={{ minWidth: documentCollectionMonthColMinPx }}
                                                >
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span>{month.slice(0, 3)}</span>
                                                        <span className="text-[10px] font-normal">{String(selectedYear).slice(-2)}</span>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="px-4 py-2 text-left text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider border-l-2 border-gray-300 dark:border-gray-600">
                                                Actions
                                            </th>
                                        </tr>
                                        )}
                                    </thead>
                                    <tbody
                                        className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600"
                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    >
                                        {section.documents.length === 0 ? (
                                            <tr>
                                                <td colSpan={isJsonOnlyTracker ? 1 + months.length * 2 + 1 : 14} className="px-8 py-12 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                                                            <i className="fas fa-file-alt text-2xl text-gray-400 dark:text-gray-500"></i>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No documents in this section</p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Get started by adding your first document</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleAddDocument(section.id)}
                                                            className="px-4 py-2 bg-sky-200 dark:bg-sky-700 text-sky-800 dark:text-sky-100 rounded-lg hover:bg-sky-300 dark:hover:bg-sky-600 text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                                                        >
                                                            <i className="fas fa-plus"></i><span>Add Document</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            getOrderedDocumentRows(section).map(({ doc, isSubRow }, docIndex) => {
                                                const canDrag = true;
                                                const isMasterGreyedOut = !isSubRow && hasChildDocuments(section, doc);
                                                return (
                                                <tr
                                                    key={doc.id}
                                                    className={`transition-colors border-b border-gray-100 dark:border-gray-700 ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${dragOverDocumentSectionId === section.id && dragOverDocumentIndex === docIndex ? 'bg-sky-50 dark:bg-sky-900/30 ring-1 ring-sky-200 dark:ring-sky-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'} ${isSubRow ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''}`}
                                                    draggable={canDrag}
                                                    onDragStart={canDrag ? (e) => handleDocumentDragStart(section.id, docIndex, e) : undefined}
                                                    onDragEnd={handleDocumentDragEnd}
                                                    onDragOver={canDrag ? (e) => handleDocumentDragOver(e, section.id, docIndex) : undefined}
                                                    onDragLeave={handleDocumentDragLeave}
                                                    onDrop={canDrag ? (e) => handleDocumentDrop(e, section.id, docIndex) : undefined}
                                                >
                                                    <td
                                                        className={`px-4 py-2 sticky left-0 z-20 border-r-2 border-gray-300 dark:border-gray-600 ${isSubRow ? 'pl-10 bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800'}`}
                                                        style={stickyFirstColStyle}
                                                    >
                                                        <div className="w-full flex items-start gap-2">
                                                            <span className="inline-flex cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 mt-0.5" title={isSubRow ? 'Drag to reorder sub-document' : 'Drag to reorder'}>
                                                                <i className="fas fa-grip-vertical text-[10px]"></i>
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{doc.name}</div>
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
                                                                                    return date.toLocaleString('en-ZA', {
                                                                                        timeZone: 'Africa/Johannesburg',
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
                                                                    <div className="mt-1.5 text-xs text-gray-500 flex items-center gap-1 overflow-hidden">
                                                                        <span className="truncate flex-1 min-w-0">{truncated}</span>
                                                                        {isLong && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setExpandedDescriptionId(doc.id);
                                                                                }}
                                                                                className="text-sky-600 hover:text-sky-700 underline cursor-pointer flex-shrink-0"
                                                                            >
                                                                                ...more
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                            {/* Assign: compact icon + chips only; dropdown rendered fixed so not covered */}
                                                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                                {(() => {
                                                                    const assigned = normalizeAssignedTo(doc);
                                                                    const openAssign = (e) => {
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
                                                                    };
                                                                    if (assigned.length > 1) {
                                                                        return (
                                                                            <div className="relative group/assignees">
                                                                                <button
                                                                                    type="button"
                                                                                    title={`${assigned.length} assignees`}
                                                                                    onClick={openAssign}
                                                                                    className="flex items-center -space-x-1"
                                                                                    aria-label="Edit assignees"
                                                                                >
                                                                                    {assigned.slice(0, 4).map((uid, i) => {
                                                                                        const color = getAssigneeColor(uid, users);
                                                                                        return (
                                                                                            <span
                                                                                                key={`${doc.id}-multi-${i}-${uid}`}
                                                                                                className="w-5 h-5 rounded-full border"
                                                                                                style={{ backgroundColor: color.bg, borderColor: color.ring }}
                                                                                                aria-hidden="true"
                                                                                            ></span>
                                                                                        );
                                                                                    })}
                                                                                </button>
                                                                                <div className="absolute left-0 top-full mt-1 hidden group-hover/assignees:flex bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg px-2 py-1.5 gap-1.5 z-20">
                                                                                    {assigned.map((uid, i) => {
                                                                                        const color = getAssigneeColor(uid, users);
                                                                                        return (
                                                                                            <span key={`${doc.id}-full-${i}-${uid}`} className="inline-flex items-center gap-1 text-[10px] text-gray-700 dark:text-gray-300">
                                                                                                <span
                                                                                                    className="w-4 h-4 rounded-full border"
                                                                                                    style={{ backgroundColor: color.bg, borderColor: color.ring }}
                                                                                                    aria-hidden="true"
                                                                                                ></span>
                                                                                                <span className="max-w-[120px] truncate">{getAssigneeLabel(uid)}</span>
                                                                                            </span>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return (
                                                                        <>
                                                                            {assigned.map((uid, i) => (
                                                                                <span
                                                                                    key={`${doc.id}-${i}-${uid}`}
                                                                                    className="inline-flex items-center gap-0.5 group/avatar"
                                                                                >
                                                                                    <button
                                                                                        type="button"
                                                                                        title={getAssigneeLabel(uid)}
                                                                                        onClick={openAssign}
                                                                                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                                                                                        style={(() => {
                                                                                            const color = getAssigneeColor(uid, users);
                                                                                            return { backgroundColor: color.bg, color: color.text, border: `1px solid ${color.ring}` };
                                                                                        })()}
                                                                                        aria-label={`Edit assignees for ${getAssigneeLabel(uid)}`}
                                                                                    >
                                                                                        {getAssigneeInitials(uid)}
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const next = assigned.filter((_, j) => j !== i);
                                                                                            handleAssignmentChange(section.id, doc.id, next);
                                                                                        }}
                                                                                        className="opacity-0 group-hover/avatar:opacity-100 text-gray-500 hover:text-red-600 p-0.5 rounded"
                                                                                        aria-label={`Remove ${getAssigneeLabel(uid)}`}
                                                                                    >
                                                                                        <i className="fas fa-times text-[8px]"></i>
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                            {assigned.length === 0 && (
                                                                                <button
                                                                                    type="button"
                                                                                    title="Assign User"
                                                                                    onClick={openAssign}
                                                                                    className="inline-flex items-center justify-center w-6 h-6 text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded"
                                                                                    aria-label="Assign User"
                                                                                >
                                                                                    <i className="fas fa-user-plus text-xs"></i>
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                            </div>
                                                    </td>
                                                    {isMasterGreyedOut ? (
                                                        isJsonOnlyTracker ? (
                                                            months.map((month) => (
                                                                <React.Fragment key={`${doc.id}-${month}`}>
                                                                    <td
                                                                        className="px-3 py-1.5 text-xs border-l-4 border-gray-400 bg-gray-200"
                                                                        role="gridcell"
                                                                        style={{ minWidth: jsonTrackerStatusColPx, width: jsonTrackerStatusColPx }}
                                                                    />
                                                                    <td
                                                                        className="px-2 py-1.5 text-xs border-l-2 border-gray-300 bg-gray-200"
                                                                        role="gridcell"
                                                                        style={{ minWidth: jsonTrackerNotesColPx, width: jsonTrackerNotesColPx }}
                                                                    />
                                                                </React.Fragment>
                                                            ))
                                                        ) : (
                                                            months.map((month) => (
                                                                <td
                                                                    key={`${doc.id}-${month}`}
                                                                    className="px-3 py-1.5 text-xs border-l-2 border-gray-200 bg-gray-200"
                                                                    role="gridcell"
                                                                    style={{ minWidth: documentCollectionMonthColMinPx }}
                                                                />
                                                            ))
                                                        )
                                                    ) : (
                                                        isJsonOnlyTracker ? (
                                                            months.map((month) => (
                                                                <React.Fragment key={`${doc.id}-${month}`}>
                                                                    {renderStatusCell(section, doc, month)}
                                                                    {renderNotesCell(section, doc, month)}
                                                                </React.Fragment>
                                                            ))
                                                        ) : (
                                                            months.map((month) => (
                                                                <React.Fragment key={`${doc.id}-${month}`}>
                                                                    {renderStatusCell(section, doc, month)}
                                                                </React.Fragment>
                                                            ))
                                                        )
                                                    )}
                                                    <td className={`px-4 py-2 ${isJsonOnlyTracker ? 'border-l-4 border-gray-400' : 'border-l-2 border-gray-200'} ${isMasterGreyedOut ? 'bg-gray-200' : ''}`}>
                                                        <div className="flex items-center gap-2 justify-center">
                                                            {!doc.parentId && (
                                                                <button
                                                                    onClick={() => handleAddSubDocument(section.id, doc)}
                                                                    className="p-2 text-gray-600 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                                                                    title="Add sub-document"
                                                                >
                                                                    <i className="fas fa-layer-group text-sm"></i>
                                                                </button>
                                                            )}
                                                            <span className={isMasterGreyedOut ? 'opacity-60 pointer-events-none inline-flex items-center gap-2' : 'inline-flex items-center gap-2'}>
                                                                <button
                                                                    onClick={() => handleEditDocument(section, doc)}
                                                                    className="p-2 text-gray-600 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                                                                    title="Edit document"
                                                                    disabled={isMasterGreyedOut}
                                                                >
                                                                    <i className="fas fa-edit text-sm"></i>
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDeleteDocument(section.id, doc.id, e)}
                                                                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    type="button"
                                                                    title="Delete document"
                                                                    disabled={isMasterGreyedOut}
                                                                >
                                                                    <i className="fas fa-trash text-sm"></i>
                                                                </button>
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
            
            {/* Modals */}
            {driveLinkModal && <DriveLinkModal />}
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
                        <div className="modal-panel bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                                    className="px-3 py-1.5 text-xs bg-sky-200 text-sky-800 rounded-lg hover:bg-sky-300"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {/* Fixed-position assignment dropdown so it is not covered by table/columns */}
            {assignmentOpen && assignmentAnchorRect && (() => {
                const section = sections.find(s => String(s.id) === assignmentOpen.sectionId);
                const doc = section?.documents?.find(d => String(d.id) === assignmentOpen.docId);
                if (!section || !doc) return null;
                const current = normalizeAssignedTo(doc);
                const viewportHeight = window.innerHeight || 0;
                const viewportWidth = window.innerWidth || 0;
                const spaceBelow = Math.max(0, viewportHeight - assignmentAnchorRect.bottom);
                const spaceAbove = Math.max(0, assignmentAnchorRect.top);
                const openUpwards = spaceBelow < 200 && spaceAbove > spaceBelow;
                const maxHeight = Math.min(192, Math.max(120, (openUpwards ? spaceAbove : spaceBelow) - 8));
                const dropdownWidth = 220;
                const left = Math.min(
                    assignmentAnchorRect.left,
                    Math.max(8, viewportWidth - dropdownWidth - 8)
                );
                const dropdown = (
                    <div
                        ref={assignmentDropdownRef}
                        className="fixed min-w-[180px] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 z-[10000]"
                        style={{
                            left,
                            top: openUpwards ? Math.max(8, assignmentAnchorRect.top - maxHeight - 4) : assignmentAnchorRect.bottom + 4,
                            maxHeight
                        }}
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
                                    const color = getAssigneeColor(ident || label, users);
                                    return (
                                        <label key={ident || label} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
                                            <input
                                                type="checkbox"
                                                checked={!!isChecked}
                                                onChange={() => {
                                                    const next = isChecked
                                                        ? current.filter(c => String(c) !== String(ident) && getAssigneeLabel(c) !== label)
                                                        : [...current, ident].filter(Boolean);
                                                    handleAssignmentChange(section.id, doc.id, next);
                                                }}
                                                className="rounded border-gray-300 text-sky-600"
                                            />
                                            <span
                                                className="w-3.5 h-3.5 rounded-full shrink-0"
                                                style={{ backgroundColor: color.bg, border: `1px solid ${color.ring}` }}
                                                aria-hidden="true"
                                            ></span>
                                            <span className="truncate">{label}</span>
                                        </label>
                                    );
                                })
                        )}
                    </div>
                );
                if (window.ReactDOM && typeof ReactDOM.createPortal === 'function') {
                    return ReactDOM.createPortal(dropdown, document.body);
                }
                return dropdown;
            })()}
        </div>
    );
};

// Make available globally
window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
